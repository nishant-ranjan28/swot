"""Chunked quote fetching shared by the scheduled jobs (price alerts, daily digest).

``get_quotes`` is a sync callable (``stock_service.get_batch_quotes``) run in a worker
thread, one chunk at a time. A failing chunk doesn't abort the rest: it adds
``quotes:<ExceptionType>`` to the returned errors and is logged by exception type
only (never the message, which may echo an upstream body).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Callable

logger = logging.getLogger(__name__)

QUOTE_CHUNK = 20


async def fetch_quotes(
    get_quotes: Callable[[list[str]], dict],
    symbols: list[str],
    *,
    chunk: int = QUOTE_CHUNK,
    label: str = "quotes",
) -> tuple[dict, list[str]]:
    """Return ``({symbol: quote}, errors)``; ``label`` prefixes the log line."""
    quotes: dict = {}
    errors: list[str] = []
    for i in range(0, len(symbols), chunk):
        part = symbols[i:i + chunk]
        try:
            result = await asyncio.to_thread(get_quotes, part)
        except Exception as exc:  # one bad chunk must not abort the run
            logger.warning("%s: quote fetch failed: %s", label, type(exc).__name__)
            errors.append(f"quotes:{type(exc).__name__}")
            continue
        if isinstance(result, dict):
            quotes.update(result)
    return quotes, errors
