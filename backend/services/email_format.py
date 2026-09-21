"""Formatting helpers shared by the transactional email renderers.

Used by ``mailer.render_alert_email`` (price alerts) and ``digest_content``
(daily digest). Values substituted into HTML must still go through ``html.escape``;
these helpers only format and normalise plain text.
"""

from __future__ import annotations

import math
import unicodedata
from functools import lru_cache
from pathlib import Path
from string import Template

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"

CURRENCY = {"in": "₹", "us": "$"}
SYMBOL_MAX = 32
NAME_MAX = 120  # company / symbol names
RECIPIENT_NAME_MAX = 100  # a person's display name (greetings, Brevo "to" name)


@lru_cache(maxsize=None)
def template(name: str) -> Template:
    return Template((TEMPLATE_DIR / name).read_text(encoding="utf-8"))


def num(value) -> float | None:
    """A finite float, or None (bools, NaN/inf and junk are rejected)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def fmt_amount(value, currency: str, *, always_decimals: bool) -> str:
    """₹2,500 / $180.50 (targets drop '.00'); prices always show 2 decimals."""
    n = num(value)
    if n is None:
        return "-"
    if not always_decimals and n == int(n):
        return f"{currency}{int(n):,}"
    return f"{currency}{n:,.2f}"


def fmt_pct(value) -> str:
    n = num(value)
    if n is None:
        return "-"
    return f"{n:g}%"


def single_line(value: str) -> str:
    """Collapse all whitespace (including newlines) to single spaces."""
    return " ".join(str(value).split())


def clean_text(value) -> str:
    """Single-line plain text with control and format characters removed.

    Whitespace control characters (``\\t\\n\\r\\v\\f``) become spaces; every other control
    character (Cc, e.g. NUL, BEL, ESC, DEL) is dropped, as are invisible format
    characters (Cf: zero-width, bidi overrides); whitespace is then collapsed.
    ``None`` becomes ''.
    """
    if value is None:
        return ""
    out = []
    for ch in str(value):
        cat = unicodedata.category(ch)
        if cat == "Cc":
            out.append(" " if ch in "\t\n\r\x0b\x0c" else "")
        elif cat == "Cf":
            continue
        else:
            out.append(ch)
    return single_line("".join(out))
