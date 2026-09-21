# backend/routers/jobs.py
"""Scheduled job endpoints, called server-to-server by the GitHub Actions cron.

Guarded by the ``X-Job-Secret`` header (compared in constant time against the
``JOB_SECRET`` env var). Responses never include secret values, upstream response
bodies or headers; unexpected failures are logged by exception type name only.

A run that completes returns its counts: HTTP 200 when ``errors`` is empty, or HTTP
207 (partial success) when it isn't, so the cron step fails visibly.
"""

import hmac
import logging
from datetime import datetime, timezone
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from config import job_settings
from services.alert_job import run_check_alerts
from services.mailer import Mailer
from services.stock_service import stock_service
from services.supabase_admin import SupabaseAdmin, SupabaseAdminError

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
    """One shared client per request (Supabase + Brevo). Replaced in tests."""
    return httpx.AsyncClient(timeout=20)


def _secret_ok(provided: str | None, expected: str) -> bool:
    return hmac.compare_digest((provided or "").encode("utf-8"), expected.encode("utf-8"))


@router.post("/check-alerts")
async def check_alerts(
    market: Annotated[Literal["in", "us"], Query()],
    force: Annotated[bool, Query()] = False,
    x_job_secret: Annotated[str | None, Header()] = None,
):
    settings = job_settings()
    if not settings["job_secret"]:
        return JSONResponse(status_code=503, content={"error": "jobs disabled"})
    if not _secret_ok(x_job_secret, settings["job_secret"]):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    missing = [env for key, env in _REQUIRED if not settings[key]]
    if missing:
        return JSONResponse(
            status_code=503, content={"error": "jobs not configured", "missing": missing}
        )

    try:
        async with _make_client() as client:
            admin = SupabaseAdmin(settings["supabase_url"], settings["service_role_key"], client)
            mailer = Mailer(
                settings["brevo_api_key"], settings["mail_from"], settings["mail_from_name"], client
            )
            result = await run_check_alerts(
                market,
                admin=admin,
                mailer=mailer,
                get_quotes=stock_service.get_batch_quotes,
                now_utc=datetime.now(timezone.utc),
                force=force,
                app_url=settings["app_url"],
            )
    except SupabaseAdminError as exc:
        logger.warning("check-alerts: supabase error (status %s)", exc.status)
        return JSONResponse(
            status_code=502, content={"error": "supabase error", "status": exc.status}
        )
    except Exception as exc:
        logger.error("check-alerts failed: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "job failed"})
    if result.get("errors"):
        return JSONResponse(status_code=207, content=result)
    return result
