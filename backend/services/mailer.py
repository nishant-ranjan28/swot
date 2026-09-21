"""Brevo transactional mailer and price-alert email rendering.

``Mailer.send`` never raises and logs only the HTTP status (no key, no recipient,
no response body). Templates use ``string.Template``; every value substituted into
the HTML is escaped with ``html.escape``.
"""

from __future__ import annotations

import html
import logging
import math
from functools import lru_cache
from pathlib import Path
from string import Template

import httpx

logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"

CURRENCY = {"in": "₹", "us": "$"}
SYMBOL_MAX = 32
NAME_MAX = 120
RECIPIENT_NAME_MAX = 100

CONDITION_LABEL = {
    "above": "price above",
    "below": "price below",
    "pct_up": "daily gain",
    "pct_down": "daily drop",
}


class Mailer:
    def __init__(self, api_key: str, sender_email: str, sender_name: str,
                 client: httpx.AsyncClient):
        self._api_key = api_key
        self._sender = {"email": sender_email, "name": sender_name}
        self._client = client

    def __repr__(self) -> str:  # never show the key
        return f"Mailer(sender={self._sender['email']!r})"

    async def send(self, to_email: str, to_name: str | None, subject: str,
                   html: str, text: str) -> str:
        """Send one email. Never raises.

        Returns 'sent' | 'rate_limited' (429) | 'invalid' (400: permanent, don't retry)
        | 'auth_error' (401/403: bad key or unauthorised sender) | 'failed' (retryable).
        """
        recipient = {"email": to_email}
        name = _single_line(to_name or "")[:RECIPIENT_NAME_MAX]
        if name:
            recipient["name"] = name
        payload = {
            "sender": self._sender,
            "to": [recipient],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
            "headers": {"X-Mailin-Tag": "price-alert"},
        }
        headers = {
            "api-key": self._api_key,
            "accept": "application/json",
            "content-type": "application/json",
        }
        try:
            resp = await self._client.post(BREVO_URL, json=payload, headers=headers)
        except Exception as exc:  # network errors, timeouts, anything: never raise
            logger.warning("brevo send error: %s", type(exc).__name__)
            return "failed"
        status = resp.status_code
        if status in (201, 202):
            return "sent"
        if status == 429:
            logger.warning("brevo send rate limited: status %s", status)
            return "rate_limited"
        if status == 400:
            logger.warning("brevo send rejected: status %s", status)
            return "invalid"
        if status in (401, 403):
            logger.warning("brevo send unauthorised: status %s", status)
            return "auth_error"
        logger.warning("brevo send failed: status %s", status)
        return "failed"


# ---- rendering --------------------------------------------------------------


@lru_cache(maxsize=None)
def _template(name: str) -> Template:
    return Template((TEMPLATE_DIR / name).read_text(encoding="utf-8"))


def _num(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _fmt_amount(value, currency: str, *, always_decimals: bool) -> str:
    """₹2,500 / $180.50 (targets drop '.00'); prices always show 2 decimals."""
    n = _num(value)
    if n is None:
        return "-"
    if not always_decimals and n == int(n):
        return f"{currency}{int(n):,}"
    return f"{currency}{n:,.2f}"


def _fmt_pct(value) -> str:
    n = _num(value)
    if n is None:
        return "-"
    return f"{n:g}%"


def _condition_text(condition: str, target, currency: str) -> str:
    if condition == "above":
        return f"rose above {_fmt_amount(target, currency, always_decimals=False)}"
    if condition == "below":
        return f"fell below {_fmt_amount(target, currency, always_decimals=False)}"
    if condition == "pct_up":
        return f"up {_fmt_pct(target)} today"
    if condition == "pct_down":
        return f"down {_fmt_pct(target)} today"
    return str(condition or "")


def _single_line(value: str) -> str:
    return " ".join(str(value).split())


def _describe(event: dict) -> dict:
    alert = event.get("alert") or {}
    market = alert.get("market")
    currency = CURRENCY.get(market, "")
    return {
        "symbol": str(alert.get("symbol") or "")[:SYMBOL_MAX],
        "name": str(alert.get("name") or "")[:NAME_MAX],
        "condition": alert.get("condition"),
        "condition_text": _condition_text(alert.get("condition"), alert.get("target"), currency),
        "price": _fmt_amount(event.get("price"), currency, always_decimals=True),
    }


_HTML_ROW = Template(
    '              <tr>\n'
    '                <td style="padding:10px 8px 10px 0;border-bottom:1px solid #f3f4f6;'
    'vertical-align:top;"><strong>$symbol</strong>'
    '<div style="font-size:12px;color:#6b7280;">$name</div></td>\n'
    '                <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;'
    'vertical-align:top;">$condition_text</td>\n'
    '                <td align="right" style="padding:10px 0 10px 8px;border-bottom:1px solid '
    '#f3f4f6;vertical-align:top;white-space:nowrap;">$price</td>\n'
    '              </tr>'
)


def render_alert_email(display_name, events, app_url) -> tuple[str, str, str]:
    """Render (subject, html, text) for one user's triggered alerts."""
    items = [_describe(e) for e in events]
    n = len(items)
    if n == 1:
        label = CONDITION_LABEL.get(items[0]["condition"], "price")
        subject = f"🔔 {items[0]['symbol']} hit your {label} alert"
        heading = f"{items[0]['symbol']} hit your {label} alert"
        intro = "One of your price alerts just triggered:"
    else:
        subject = f"🔔 {n} price alerts triggered"
        heading = f"{n} price alerts triggered"
        intro = f"{n} of your price alerts just triggered:"
    subject = _single_line(subject)

    name = _single_line(display_name or "")
    greeting = f"Hi {name}," if name else "Hi there,"
    base = str(app_url or "").rstrip("/")
    alerts_url = f"{base}/alerts"
    settings_url = f"{base}/settings"

    esc = html.escape
    html_rows = "\n".join(
        _HTML_ROW.substitute({k: esc(v) for k, v in item.items() if k != "condition"})
        for item in items
    )
    html_body = _template("alert.html").substitute(
        title=esc(heading),
        heading=esc(heading),
        greeting=esc(greeting),
        intro=esc(intro),
        rows=html_rows,  # built from escaped values above
        alerts_url=esc(alerts_url),
        settings_url=esc(settings_url),
    )

    text_rows = "\n".join(
        f"- {item['symbol']}"
        + (f" ({_single_line(item['name'])})" if item["name"] else "")
        + f": {item['condition_text']} - now {item['price']}"
        for item in items
    )
    text_body = _template("alert.txt").substitute(
        heading=heading,
        greeting=greeting,
        intro=intro,
        rows=text_rows,
        alerts_url=alerts_url,
        settings_url=settings_url,
    )
    return subject, html_body, text_body
