"""Minimal OpenAI-compatible chat client with a provider fallback chain.

Used for the daily digest's AI summary: Groq first, then OpenRouter. ``summarize``
never raises; it returns the completion text or ``None`` when every provider fails
or the per-run call budget is spent (the digest then goes out without a summary).

The budget counts every HTTP attempt across all providers. ``budget_exhausted``
becomes True only when a provider with a key is skipped because the budget is spent
(never when no keys are set). A 401/403 disables that
provider for the rest of the run (bad key); 429, 5xx, other non-200 statuses,
timeouts, transport errors, non-JSON bodies and empty content just move on to the
next provider.

Logging records only the provider name, HTTP status and exception type. API keys,
prompts and completions are never logged, and ``repr`` never shows a key. The
completion is untrusted: callers must sanitize it (``digest_content.sanitize_summary``)
and escape it before templating.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT_SECONDS = 20.0
TEMPERATURE = 0.3
# Reasoning models (e.g. gpt-oss) spend part of the cap on hidden reasoning; the
# summary itself is still capped by sanitize_summary, so a roomy cap costs nothing.
MAX_TOKENS = 1024

# Groq only accepts reasoning params on reasoning models; gpt-oss is the default.
GROQ_REASONING_PREFIXES = ("openai/gpt-oss",)


class LLMProvider:
    def __init__(self, name: str, base_url: str, api_key: str, model: str,
                 extra_headers: dict | None = None, extra_body: dict | None = None):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or ""
        self.model = model
        self.extra_headers = dict(extra_headers or {})
        # Provider-specific request fields (e.g. reasoning controls).
        self.extra_body = dict(extra_body or {})

    def __repr__(self) -> str:  # never show the key
        return f"LLMProvider(name={self.name!r}, model={self.model!r}, key_set={bool(self.api_key)})"

    __str__ = __repr__


def providers_from_settings(settings: dict) -> list[LLMProvider]:
    """Groq then OpenRouter, from ``config.job_settings()``. Keyless ones are skipped later.

    OpenRouter's optional attribution headers: ``HTTP-Referer`` is sent only when
    ``app_url`` is set (an empty referer is just noise), ``X-Title`` always.
    """
    app_url = str(settings.get("app_url") or "").strip()
    openrouter_headers = {"X-Title": "StockPulse"}
    if app_url:
        openrouter_headers = {"HTTP-Referer": app_url, **openrouter_headers}
    groq_model = settings.get("llm_model_groq") or ""
    # Keep reasoning short and out of the response so the cap goes to the answer.
    groq_body = ({"reasoning_effort": "low", "include_reasoning": False}
                 if groq_model.startswith(GROQ_REASONING_PREFIXES) else {})
    # OpenRouter's unified reasoning control; non-reasoning models ignore it.
    openrouter_body = {"reasoning": {"effort": "low", "exclude": True}}
    return [
        LLMProvider("groq", GROQ_BASE_URL, settings.get("groq_api_key") or "",
                    groq_model, extra_body=groq_body),
        LLMProvider("openrouter", OPENROUTER_BASE_URL, settings.get("openrouter_api_key") or "",
                    settings.get("llm_model_openrouter") or "",
                    openrouter_headers, extra_body=openrouter_body),
    ]


def _content(resp: httpx.Response) -> str | None:
    """``choices[0].message.content`` stripped, or None if missing/empty/not JSON."""
    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except Exception:  # non-JSON, wrong shape, empty choices
        return None
    if not isinstance(content, str):
        return None
    content = content.strip()
    return content or None


class LLMClient:
    def __init__(self, providers: list[LLMProvider], client: httpx.AsyncClient, max_calls: int):
        self._providers = list(providers)
        self._client = client
        self._max_calls = max(0, int(max_calls))
        self._disabled: set[int] = set()
        self.calls = 0
        self.budget_exhausted = False

    def __repr__(self) -> str:  # never show keys
        names = [p.name for p in self._providers]
        return f"LLMClient(providers={names!r}, calls={self.calls}, max_calls={self._max_calls})"

    __str__ = __repr__

    async def summarize(self, messages: list[dict]) -> str | None:
        """Return the first provider's completion text, or None. Never raises."""
        try:
            return await self._summarize(messages)
        except Exception as exc:  # belt and braces: never raise
            logger.warning("llm: unexpected error: %s", type(exc).__name__)
            return None

    async def _summarize(self, messages: list[dict]) -> str | None:
        for index, provider in enumerate(self._providers):
            if index in self._disabled or not provider.api_key:
                continue
            if self.calls >= self._max_calls:
                # Only set when a provider that has a key had to be skipped: with no
                # keys at all, nothing was lost to the budget.
                self.budget_exhausted = True
                return None
            self.calls += 1
            try:
                resp = await self._client.post(
                    f"{provider.base_url}/chat/completions",
                    json={
                        **provider.extra_body,
                        "model": provider.model,
                        "messages": messages,
                        "temperature": TEMPERATURE,
                        "max_tokens": MAX_TOKENS,
                    },
                    headers={
                        **provider.extra_headers,
                        "Authorization": f"Bearer {provider.api_key}",
                        "Content-Type": "application/json",
                    },
                    timeout=TIMEOUT_SECONDS,
                )
            except Exception as exc:  # timeouts, transport errors, anything
                logger.warning("llm %s error: %s", provider.name, type(exc).__name__)
                continue
            status = resp.status_code
            if status in (401, 403):
                logger.warning("llm %s unauthorised: status %s (disabled for this run)",
                               provider.name, status)
                self._disabled.add(index)
                continue
            if status != 200:
                logger.warning("llm %s failed: status %s", provider.name, status)
                continue
            content = _content(resp)
            if content is None:
                logger.warning("llm %s returned no usable content", provider.name)
                continue
            return content
        return None
