"""Pure price-alert evaluation and market-hours logic (no I/O).

Semantics (targets are positive):
  above    -> price >= target
  below    -> price <= target
  pct_up   -> change_percent >= target
  pct_down -> change_percent <= -target

Market holidays are not modelled: on a holiday the market reads as "open" during
normal hours, but prices don't move, so no new alerts fire (an alert that was
already satisfied at the previous close could still fire on the first run).
"""

from __future__ import annotations

import math
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

_HOURS = {
    "in": (ZoneInfo("Asia/Kolkata"), time(9, 15), time(15, 30)),
    "us": (ZoneInfo("America/New_York"), time(9, 30), time(16, 0)),
}


def _num(value) -> float | None:
    """Coerce a number or numeric string to a finite float; else None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def evaluate(alert: dict, quote: dict | None) -> float | None:
    """Return the trigger price if the alert fires, else None."""
    if not quote:
        return None
    price = _num(quote.get("price"))
    if price is None or price <= 0:
        return None
    target = _num(alert.get("target"))
    if target is None or target <= 0:
        return None

    condition = alert.get("condition")
    if condition == "above":
        fired = price >= target
    elif condition == "below":
        fired = price <= target
    elif condition in ("pct_up", "pct_down"):
        cp = _num(quote.get("change_percent"))
        if cp is None:
            return None
        fired = cp >= target if condition == "pct_up" else cp <= -target
    else:
        return None
    return price if fired else None


def is_market_open(market: str, now_utc: datetime, grace_minutes: int = 0) -> bool:
    """Mon-Fri regular session, both ends inclusive. Naive datetimes are taken as UTC.

    ``grace_minutes`` extends the close only (never the open, never weekends), so a
    cron run that starts a few minutes late still evaluates the closing price.
    """
    hours = _HOURS.get(market)
    if hours is None:
        return False
    tz, open_t, close_t = hours
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    local = now_utc.astimezone(tz)
    if local.weekday() >= 5:
        return False
    minutes = local.hour * 60 + local.minute
    open_m = open_t.hour * 60 + open_t.minute
    close_m = close_t.hour * 60 + close_t.minute + max(0, int(grace_minutes))
    return open_m <= minutes <= close_m


def group_events_by_user(events) -> dict[str, list[dict]]:
    """Group events by user_id; each list is sorted by triggered_at (oldest first)."""
    grouped: dict[str, list[dict]] = {}
    for event in events:
        grouped.setdefault(event.get("user_id"), []).append(event)
    for items in grouped.values():
        items.sort(key=lambda e: str(e.get("triggered_at") or ""))
    return grouped
