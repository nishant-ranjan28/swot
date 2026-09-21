"""Price-alert check job: evaluate active alerts, record triggers, email users.

All collaborators are injected so the job can be tested without network:
  admin      - SupabaseAdmin-like (async active_alerts, record_triggers, expire_events,
               pending_events, profiles, claim_events, release_events, mark_emailed)
  mailer     - Mailer-like (async send -> 'sent' | 'rate_limited' | 'invalid' |
               'auth_error' | 'failed')
  get_quotes - sync callable(list[str]) -> {symbol: quote}; run in a worker thread
  now_utc    - the current time (timezone-aware UTC)

Phases: (1) evaluate alerts and fire them (only while the market is open, or with
``force``); (2) expire old unsent events and load the pending ones (all markets);
(3) email each user. Phases 2 and 3 run even when the market is closed, so retries
left pending after the close still go out on the next cron run.

Re-running, or two runs overlapping, is safe:
  - ``record_triggers`` fires each alert atomically (``fire_alert`` SQL function), so
    an alert records at most one event;
  - before sending, the job claims the user's events (``claim_events``) and sends
    only the rows it claimed. A claim older than ``CLAIM_TTL`` is stale and can be
    taken over (the run that held it crashed or timed out).

Emails go out one user at a time (sequentially) so Brevo rate limiting stays simple
and deterministic: on the first 429 (or 401/403) the job stops sending for this run,
releases the claim, and the remaining events stay pending for the next run.

Result counts: ``emailed``, ``suppressed``, ``failed`` and ``invalid`` count users
(one email each), ``triggered`` and ``expired`` count events. ``errors`` holds short
codes or exception type names only; no messages, ids or secrets. The router returns
HTTP 207 when ``errors`` is non-empty.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Callable

from services.alert_engine import evaluate, group_events_by_user, is_market_open
from services.mailer import render_alert_email
from services.quotes import QUOTE_CHUNK, fetch_quotes

logger = logging.getLogger(__name__)

CLOSE_GRACE_MINUTES = 20  # GitHub cron runs are often late (10-20 minutes is common)
RETRY_WINDOW = timedelta(hours=24)
CLAIM_TTL = timedelta(minutes=10)  # a claim older than this is stale and can be retaken
SYMBOL_MAX = 32


def quote_key(market: str, symbol) -> str:
    """Normalize a symbol the way the frontend does (``normalizeAlertSymbol``).

    Trim and uppercase; for the ``in`` market add ``.NS`` unless the symbol already
    ends in ``.NS``/``.BO`` or is an index (``^NSEI``).
    """
    s = str(symbol or "").strip().upper()
    if not s or market != "in" or s.startswith("^") or s.endswith((".NS", ".BO")):
        return s
    return f"{s}.NS"


async def _evaluate(market: str, admin, get_quotes: Callable, errors: list[str]):
    """Phase 1. Returns (alerts checked, unique symbols quoted, events recorded)."""
    alerts = await admin.active_alerts(market)
    keyed = []  # (alert, quote key)
    for alert in alerts:
        raw = alert.get("symbol")
        if not raw:
            continue
        if len(str(raw)) > SYMBOL_MAX:
            errors.append("bad_symbol")
            continue
        keyed.append((alert, quote_key(market, raw)))
    symbols = list(dict.fromkeys(key for _, key in keyed))
    quotes: dict = {}
    if symbols:
        quotes, quote_errors = await fetch_quotes(get_quotes, symbols, chunk=QUOTE_CHUNK,
                                                  label="alert job")
        errors.extend(quote_errors)

    triggers = []
    for alert, key in keyed:
        price = evaluate(alert, quotes.get(key))
        if price is not None:
            triggers.append({"alert_id": alert["id"], "user_id": alert["user_id"], "price": price})
    events = await admin.record_triggers(triggers) if triggers else []
    return alerts, symbols, events


async def _mark_emailed(admin, event_ids: list[str]) -> bool:
    """Mark events emailed, retrying once. Returns False if both attempts fail."""
    for attempt in (1, 2):
        try:
            await admin.mark_emailed(event_ids)
            return True
        except Exception as exc:
            logger.warning("alert job: mark_emailed attempt %s failed: %s",
                           attempt, type(exc).__name__)
    return False


async def _release(admin, event_ids: list[str], errors: list[str]) -> None:
    """Release a claim so the next run retries at once; if this fails the claim just
    goes stale after CLAIM_TTL."""
    try:
        await admin.release_events(event_ids)
    except Exception as exc:
        logger.warning("alert job: release failed: %s", type(exc).__name__)
        errors.append("release_events")


async def run_check_alerts(
    market: str,
    *,
    admin,
    mailer,
    get_quotes: Callable[[list[str]], dict],
    now_utc: datetime,
    force: bool = False,
    app_url: str,
) -> dict:
    errors: list[str] = []
    market_open = force or is_market_open(market, now_utc, grace_minutes=CLOSE_GRACE_MINUTES)

    # 1. Evaluate active alerts against live quotes (market hours only).
    alerts: list = []
    symbols: list = []
    events: list = []
    if market_open:
        alerts, symbols, events = await _evaluate(market, admin, get_quotes, errors)

    # 2. Expire stale unsent events, then load everything still pending (all markets).
    cutoff = (now_utc - RETRY_WINDOW).isoformat()
    expired = await admin.expire_events(cutoff)
    pending = await admin.pending_events(cutoff)
    by_user = group_events_by_user(pending)
    profiles = await admin.profiles(list(by_user)) if by_user else {}

    # 3. One email per user, sequentially, sending only events this run claimed.
    now_iso = now_utc.isoformat()
    stale_before = (now_utc - CLAIM_TTL).isoformat()
    emailed = suppressed = failed = invalid = 0
    rate_limited = False
    stop_sending = False  # set on 429 or a Brevo auth error
    for user_id, user_events in by_user.items():
        try:
            prof = profiles.get(user_id) or {}
            if not prof.get("email_alerts") or not prof.get("email"):
                if await _mark_emailed(admin, [e["id"] for e in user_events]):
                    suppressed += 1
                else:
                    errors.append("mark_emailed")
                continue
            if stop_sending:
                continue  # leave pending for the next run

            claimed = await admin.claim_events(
                user_id, [e["id"] for e in user_events], now_iso, stale_before
            )
            claimed_ids = {row.get("id") for row in claimed or []}
            to_send = [e for e in user_events if e["id"] in claimed_ids]
            if not to_send:
                continue  # another run owns (or already sent) these events
            send_ids = [e["id"] for e in to_send]

            try:
                subject, html, text = render_alert_email(prof.get("display_name"), to_send,
                                                         app_url)
                status = await mailer.send(prof["email"], prof.get("display_name"), subject,
                                           html, text)
            except Exception:
                await _release(admin, send_ids, errors)
                raise

            if status in ("sent", "invalid"):
                if status == "sent":
                    emailed += 1
                else:
                    invalid += 1  # permanent rejection (400): don't retry
                if not await _mark_emailed(admin, send_ids):
                    # Keep the claim: the events won't be re-sent until it goes stale.
                    errors.append("mark_emailed")
            elif status in ("rate_limited", "auth_error"):
                stop_sending = True
                if status == "rate_limited":
                    rate_limited = True
                else:
                    errors.append("brevo_auth")
                await _release(admin, send_ids, errors)
            else:
                failed += 1
                await _release(admin, send_ids, errors)
        except Exception as exc:  # one bad user must not abort the run
            logger.warning("alert job: user processing failed: %s", type(exc).__name__)
            errors.append(type(exc).__name__)

    result = {"market": market}
    if not market_open:
        result["skipped_evaluation"] = "market_closed"
    result.update({
        "checked": len(alerts),
        "symbols": len(symbols),
        "triggered": len(events),
        "emailed": emailed,
        "suppressed": suppressed,
        "failed": failed,
        "invalid": invalid,
        "expired": expired,
        "rate_limited": rate_limited,
        "errors": errors,
    })
    return result
