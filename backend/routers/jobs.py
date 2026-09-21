# backend/routers/jobs.py
"""Scheduled job endpoints, called server-to-server by the GitHub Actions cron.

Guarded by the ``X-Job-Secret`` header (compared in constant time against the
``JOB_SECRET`` env var). Responses never include secret values, upstream response
bodies or headers; unexpected failures are logged by exception type name only.

A run that completes returns its counts: HTTP 200 when ``errors`` is empty, or HTTP
207 (partial success) when it isn't, so the cron step fails visibly. Only ``errors``
counts: the digest's ``warnings`` (news/quote fetch failures, where the email still
went out) and ``notes`` never cause a 207.

Routes (all POST, all with the same secret check and error mapping):
  /check-alerts?market=in|us&force=  price alerts (every 15 min in market hours)
  /daily-digest?market=in|us&force=  watchlist digest after the close
  /send-welcome                      welcome email to new users (every 30 min)

The LLM keys (GROQ_API_KEY / OPENROUTER_API_KEY) are optional: without them the
digest goes out without an AI summary and the response carries
``"notes": ["llm_unconfigured"]`` (informational, not an error), appended to any notes
the job itself returned (``time_budget``).
"""

import hmac
import logging
from datetime import datetime, timezone
from typing import Annotated, Awaitable, Callable, Literal

import httpx
from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from config import job_settings
from services.alert_job import run_check_alerts
from services.digest_job import TIME_BUDGET_SECONDS, run_daily_digest
from services.llm import LLMClient, providers_from_settings
from services.mailer import Mailer
from services.stock_service import stock_service
from services.supabase_admin import SupabaseAdmin, SupabaseAdminError
from services.welcome_job import run_send_welcome

logger = logging.getLogger(__name__)

router = APIRouter()

# setting key -> env var name reported when missing (names only, never values)
_REQUIRED = (
    ("supabase_url", "SUPABASE_URL"),
    ("service_role_key", "SUPABASE_SERVICE_ROLE_KEY"),
    ("brevo_api_key", "BREVO_API_KEY"),
    ("mail_from", "MAIL_FROM"),
)


def _make_client() -> httpx.AsyncClient:
    """One shared client per request (Supabase + Brevo + LLM). Replaced in tests."""
    return httpx.AsyncClient(timeout=20)


def _secret_ok(provided: str | None, expected: str) -> bool:
    return hmac.compare_digest((provided or "").encode("utf-8"), expected.encode("utf-8"))


def _authorize(x_job_secret: str | None) -> tuple[dict, JSONResponse | None]:
    """Load settings and check the secret and required config.

    Returns (settings, None) when the job may run, or (settings, error response):
    503 when JOB_SECRET is unset, 401 on a wrong secret, 503 listing missing config
    names (never values).
    """
    settings = job_settings()
    if not settings["job_secret"]:
        return settings, JSONResponse(status_code=503, content={"error": "jobs disabled"})
    if not _secret_ok(x_job_secret, settings["job_secret"]):
        return settings, JSONResponse(status_code=401, content={"error": "unauthorized"})
    missing = [env for key, env in _REQUIRED if not settings[key]]
    if missing:
        return settings, JSONResponse(
            status_code=503, content={"error": "jobs not configured", "missing": missing}
        )
    return settings, None


def _services(settings: dict, client: httpx.AsyncClient) -> tuple[SupabaseAdmin, Mailer]:
    admin = SupabaseAdmin(settings["supabase_url"], settings["service_role_key"], client)
    mailer = Mailer(
        settings["brevo_api_key"], settings["mail_from"], settings["mail_from_name"], client
    )
    return admin, mailer


async def _execute(name: str, run: Callable[[httpx.AsyncClient], Awaitable[dict]]):
    """Run a job with a fresh client and map the outcome to an HTTP response.

    502 on a Supabase error (status only), 500 on anything else (exception type
    logged, never the message), 207 when the result has errors, else the result.
    """
    try:
        async with _make_client() as client:
            result = await run(client)
    except SupabaseAdminError as exc:
        logger.warning("%s: supabase error (status %s)", name, exc.status)
        return JSONResponse(
            status_code=502, content={"error": "supabase error", "status": exc.status}
        )
    except Exception as exc:
        logger.error("%s failed: %s", name, type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "job failed"})
    if result.get("errors"):
        return JSONResponse(status_code=207, content=result)
    return result


@router.post("/check-alerts")
async def check_alerts(
    market: Annotated[Literal["in", "us"], Query()],
    force: Annotated[bool, Query()] = False,
    x_job_secret: Annotated[str | None, Header()] = None,
):
    settings, denied = _authorize(x_job_secret)
    if denied is not None:
        return denied

    async def run(client: httpx.AsyncClient) -> dict:
        admin, mailer = _services(settings, client)
        return await run_check_alerts(
            market,
            admin=admin,
            mailer=mailer,
            get_quotes=stock_service.get_batch_quotes,
            now_utc=datetime.now(timezone.utc),
            force=force,
            app_url=settings["app_url"],
        )

    return await _execute("check-alerts", run)


@router.post("/daily-digest")
async def daily_digest(
    market: Annotated[Literal["in", "us"], Query()],
    force: Annotated[bool, Query()] = False,
    x_job_secret: Annotated[str | None, Header()] = None,
):
    settings, denied = _authorize(x_job_secret)
    if denied is not None:
        return denied
    llm_configured = bool(settings["groq_api_key"] or settings["openrouter_api_key"])

    async def run(client: httpx.AsyncClient) -> dict:
        admin, mailer = _services(settings, client)
        # With no keys at all, summarize() returns None without any request.
        llm = LLMClient(providers_from_settings(settings), client, settings["llm_max_calls"])
        result = await run_daily_digest(
            market,
            admin=admin,
            mailer=mailer,
            llm=llm,
            get_quotes=stock_service.get_batch_quotes,
            get_news=stock_service.get_stock_news,
            now_utc=datetime.now(timezone.utc),
            force=force,
            app_url=settings["app_url"],
            time_budget_s=TIME_BUDGET_SECONDS,
        )
        if not llm_configured:
            result.setdefault("notes", []).append("llm_unconfigured")
        return result

    return await _execute("daily-digest", run)


@router.post("/send-welcome")
async def send_welcome(x_job_secret: Annotated[str | None, Header()] = None):
    settings, denied = _authorize(x_job_secret)
    if denied is not None:
        return denied

    async def run(client: httpx.AsyncClient) -> dict:
        admin, mailer = _services(settings, client)
        return await run_send_welcome(
            admin=admin,
            mailer=mailer,
            now_utc=datetime.now(timezone.utc),
            app_url=settings["app_url"],
        )

    return await _execute("send-welcome", run)
