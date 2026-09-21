"""Daily watchlist digest job: one email per opted-in user after a market closes.

All collaborators are injected so the job can be tested without network:
  admin      - SupabaseAdmin-like (async digest_recipients, watchlists,
               claim_digest -> claimed_at | None, finish_digest(..., claimed_at))
  mailer     - Mailer-like (async send(..., tag=) -> 'sent' | 'rate_limited' |
               'invalid' | 'auth_error' | 'failed')
  llm        - LLMClient-like (async summarize(messages) -> str | None, never raises;
               ``calls`` and ``budget_exhausted`` attributes)
  get_quotes - sync callable(list[str]) -> {symbol: quote}; run in a worker thread
               (the loop's default executor)
  get_news   - sync callable(str) -> [article]; run on NEWS_EXECUTOR, a dedicated pool
  now_utc    - the current time (timezone-aware UTC)
  clock      - monotonic seconds, for the time budget (``time.monotonic``)

Timing: ``digest_date`` is the market-local date (Asia/Kolkata for ``in``,
America/New_York for ``us``). Unless ``force`` is set, the run only proceeds on a
local weekday at least 30 minutes after the close (16:00 IST / 16:30 ET).

Re-running is safe: each (user, market, digest_date) is claimed through
``claim_digest`` (a unique row in ``digest_sends``) before the email is built, so a
second run, or an overlapping one, skips users already claimed or sent. A claim that
failed, or went stale, can be reclaimed by a later run on the same ``digest_date``.

Emails go out one user at a time. On the first Brevo 429 or auth error the job marks
that user's digest failed and stops; users not reached yet stay unclaimed. The same
happens when the time budget (``time_budget_s``, default 240 s) is spent: the user in
progress is finished, no new users are claimed, and the rest are counted as
``deferred`` with ``notes: ["time_budget"]``.

Retries: failed and unreached users are retried once, by the second cron about an
hour later on the same local date (see .github/workflows/digest.yml); a manual run
before local midnight retries too. After that, a new ``digest_date`` starts and they
simply get the next digest.

Result counts: every recipient with symbols ends up in exactly one of ``emailed``,
``failed``, ``invalid``, ``already_sent`` or ``deferred``.

``errors`` means an email was lost or its outcome wasn't recorded (the router returns
207 and the workflow goes red). ``warnings`` holds soft failures that still let the
email go out: ``news:<Type>`` and ``quotes:<Type>``.

Privacy: the LLM prompt carries only market data (symbols, day change, headlines);
never names, emails or ids. ``errors`` and ``warnings`` hold short codes or exception
type names only.
"""

from __future__ import annotations

import asyncio
import logging
import time as _time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from services.alert_job import SYMBOL_MAX, quote_key
from services.digest_content import (
    MAX_PROMPT_SYMBOLS,
    build_prompt,
    build_symbol_digest,
    render_digest_email,
    sanitize_summary,
)
from services.quotes import fetch_quotes

logger = logging.getLogger(__name__)

MARKET_TZ = {"in": ZoneInfo("Asia/Kolkata"), "us": ZoneInfo("America/New_York")}
MARKET_CLOSE = {"in": time(15, 30), "us": time(16, 0)}
AFTER_CLOSE_MINUTES = 30
MAX_SYMBOLS_PER_EMAIL = MAX_PROMPT_SYMBOLS  # 12
NEWS_CONCURRENCY = 5
NEWS_TIMEOUT_SECONDS = 15
TIME_BUDGET_SECONDS = 240  # well inside the workflow's 300 s curl --max-time
MAIL_TAG = "daily-digest"

# News fetches get their own pool so that hung yfinance calls can't starve the
# loop's default executor, which fetch_quotes (asyncio.to_thread) relies on. A call
# that times out keeps its thread busy until yfinance returns (threads can't be
# cancelled); while it does, it only holds one of these NEWS_CONCURRENCY workers,
# and later news calls queue behind it and time out in turn.
NEWS_EXECUTOR = ThreadPoolExecutor(max_workers=NEWS_CONCURRENCY,
                                   thread_name_prefix="digest-news")


def _local(market: str, now_utc: datetime) -> datetime:
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    return now_utc.astimezone(MARKET_TZ[market])


def digest_date_for(market: str, now_utc: datetime) -> str:
    """The market-local date (YYYY-MM-DD). Naive datetimes are taken as UTC."""
    return _local(market, now_utc).date().isoformat()


def is_after_close(market: str, now_utc: datetime) -> bool:
    """True on a market-local weekday at least 30 minutes after the close."""
    local = _local(market, now_utc)
    if local.weekday() >= 5:
        return False
    close = MARKET_CLOSE[market]
    ready = close.hour * 60 + close.minute + AFTER_CLOSE_MINUTES
    return local.hour * 60 + local.minute >= ready


def _user_symbols(market: str, items) -> list[tuple[str, str]]:
    """(quote key, name) for the first 12 unique symbols, in watchlist order."""
    seen: dict[str, str] = {}
    for it in items or []:
        if not isinstance(it, dict):
            continue
        raw = it.get("symbol")
        if raw is None or len(str(raw)) > SYMBOL_MAX:
            continue
        key = quote_key(market, raw)
        if not key or key in seen:
            continue
        seen[key] = it.get("name") or ""
        if len(seen) >= MAX_SYMBOLS_PER_EMAIL:
            break
    return list(seen.items())


async def _fetch_news(symbols: list[str], get_news: Callable, warnings: list[str]) -> dict:
    """News per symbol, at most NEWS_CONCURRENCY at once, NEWS_TIMEOUT_SECONDS each."""
    sem = asyncio.Semaphore(NEWS_CONCURRENCY)
    news: dict = {}
    loop = asyncio.get_running_loop()

    async def one(symbol: str) -> None:
        async with sem:
            try:
                # On timeout, wait_for stops waiting but the worker thread can't be
                # cancelled: it finishes in the background on NEWS_EXECUTOR and its
                # result is dropped. The semaphore slot is released as soon as we
                # stop waiting.
                result = await asyncio.wait_for(
                    loop.run_in_executor(NEWS_EXECUTOR, get_news, symbol),
                    NEWS_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.warning("digest job: news fetch timed out")
                warnings.append("news:TimeoutError")
                return
            except Exception as exc:  # one symbol's news must not abort the run
                logger.warning("digest job: news fetch failed: %s", type(exc).__name__)
                warnings.append(f"news:{type(exc).__name__}")
                return
        news[symbol] = result if isinstance(result, list) else []

    await asyncio.gather(*(one(s) for s in symbols))
    return news


async def _finish(admin, user_id: str, market: str, digest_date: str, status: str,
                  claimed_at: str, errors: list[str]) -> None:
    """Record the outcome, retrying once. A claim left behind goes stale after 30 min.

    ``claimed_at`` guards the update: if this run's claim went stale and another run
    reclaimed the row, the late finish matches nothing.
    """
    for attempt in (1, 2):
        try:
            await admin.finish_digest(user_id, market, digest_date, status, claimed_at)
            return
        except Exception as exc:
            logger.warning("digest job: finish_digest attempt %s failed: %s",
                           attempt, type(exc).__name__)
    errors.append("finish_digest")


async def run_daily_digest(
    market: str,
    *,
    admin,
    mailer,
    llm,
    get_quotes: Callable[[list[str]], dict],
    get_news: Callable[[str], list],
    now_utc: datetime,
    force: bool = False,
    app_url: str,
    time_budget_s: float = TIME_BUDGET_SECONDS,
    clock: Callable[[], float] = _time.monotonic,
) -> dict:
    if market not in MARKET_TZ:
        raise ValueError("market must be 'in' or 'us'")
    started = clock()
    digest_date = digest_date_for(market, now_utc)
    if not force and not is_after_close(market, now_utc):
        return {"market": market, "digest_date": digest_date, "skipped": "not_after_close"}

    errors: list[str] = []  # an email was lost or its outcome wasn't recorded
    warnings: list[str] = []  # soft failures; the email still went out
    notes: list[str] = []

    # 1. Recipients and their watchlists for this market.
    recipients = [r for r in await admin.digest_recipients(market)
                  if isinstance(r, dict) and r.get("id") and r.get("email")]
    lists = await admin.watchlists([r["id"] for r in recipients], market) if recipients else {}
    users = []  # (recipient, [(key, name)])
    empty = 0
    for r in recipients:
        symbols = _user_symbols(market, lists.get(r["id"]))
        if symbols:
            users.append((r, symbols))
        else:
            empty += 1

    # 2. Market data for every unique symbol shown in some email.
    unique = list(dict.fromkeys(key for _, symbols in users for key, _ in symbols))
    quotes: dict = {}
    if unique:
        quotes, quote_errors = await fetch_quotes(get_quotes, unique, label="digest job")
        warnings.extend(quote_errors)
    news = await _fetch_news(unique, get_news, warnings) if unique else {}

    # 3. One email per user, sequentially.
    emailed = already_sent = failed = invalid = ai_summaries = ai_fallbacks = 0
    deferred = 0
    rate_limited = False
    for index, (r, symbols) in enumerate(users):
        if clock() - started >= time_budget_s:
            # Stop claiming; the same-day retry cron picks up the rest.
            deferred = len(users) - index
            notes.append("time_budget")
            break
        user_id = r["id"]
        claimed_at = None
        finished = False
        try:
            claimed_at = await admin.claim_digest(user_id, market, digest_date)
            if not claimed_at:
                already_sent += 1
                continue

            digests = [build_symbol_digest(key, name, quotes.get(key), news.get(key, []))
                       for key, name in symbols]
            # Sanitized here so ai_summaries / ai_fallbacks count what the email really
            # shows (output that sanitizes to nothing is a fallback). render_digest_email
            # sanitizes again as defence in depth.
            summary = sanitize_summary(
                await llm.summarize(build_prompt(market, digests, digest_date))
            )
            if summary:
                ai_summaries += 1
            else:
                ai_fallbacks += 1

            subject, html, text = render_digest_email(
                r.get("display_name"), market, digest_date, digests, summary, app_url
            )
            status = await mailer.send(r["email"], r.get("display_name"), subject, html, text,
                                       tag=MAIL_TAG)

            if status == "sent":
                emailed += 1
                row_status = "sent"
            elif status == "invalid":
                invalid += 1  # permanent rejection (400): don't retry
                row_status = "skipped"
            else:
                row_status = "failed"  # reclaimable by the same-day retry
                failed += 1
                if status == "rate_limited":
                    rate_limited = True
                elif status == "auth_error":
                    errors.append("brevo_auth")
            finished = True
            await _finish(admin, user_id, market, digest_date, row_status, claimed_at, errors)
            if status in ("rate_limited", "auth_error"):
                # The remaining users stay unclaimed for the same-day retry.
                deferred = len(users) - index - 1
                break
        except Exception as exc:  # one bad user must not abort the run
            logger.warning("digest job: user processing failed: %s", type(exc).__name__)
            errors.append(type(exc).__name__)
            if not finished:
                failed += 1
            if claimed_at and not finished:
                await _finish(admin, user_id, market, digest_date, "failed", claimed_at, errors)

    result = {
        "market": market,
        "digest_date": digest_date,
        "recipients": len(recipients),
        "empty": empty,
        "emailed": emailed,
        "already_sent": already_sent,
        "failed": failed,
        "invalid": invalid,
        "rate_limited": rate_limited,
        "deferred": deferred,
        "ai_summaries": ai_summaries,
        "ai_fallbacks": ai_fallbacks,
        "llm_calls": getattr(llm, "calls", 0),
        "budget_exhausted": bool(getattr(llm, "budget_exhausted", False)),
        "symbols": len(unique),
        "errors": errors,
        "warnings": warnings,
    }
    if notes:
        result["notes"] = notes
    return result
