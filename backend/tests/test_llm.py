import json
import logging

import httpx
import pytest

from config import job_settings
from services.llm import (
    GROQ_BASE_URL,
    OPENROUTER_BASE_URL,
    LLMClient,
    LLMProvider,
    providers_from_settings,
)

GROQ_KEY = "<groq-api-key>"
OR_KEY = "<openrouter-api-key>"
APP_URL = "https://app.example.com"
MESSAGES = [
    {"role": "system", "content": "SYSTEM-PROMPT-SECRET-ISH"},
    {"role": "user", "content": "USER-PROMPT-HEADLINES"},
]


def groq(key=GROQ_KEY):
    return LLMProvider("groq", GROQ_BASE_URL, key, "groq-model")


def openrouter(key=OR_KEY):
    return LLMProvider(
        "openrouter", OPENROUTER_BASE_URL, key, "or-model",
        {"HTTP-Referer": APP_URL, "X-Title": "StockPulse"},
    )


def ok(content="A calm day for markets."):
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def make(responder, providers=None, max_calls=60):
    requests = []

    def handler(request):
        requests.append(request)
        return responder(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    llm = LLMClient(providers if providers is not None else [groq(), openrouter()], client, max_calls)
    return llm, requests


def by_host(groq_resp, or_resp):
    def responder(request):
        if request.url.host == "api.groq.com":
            return groq_resp(request) if callable(groq_resp) else groq_resp
        return or_resp(request) if callable(or_resp) else or_resp
    return responder


# ---- happy path / request shape ----------------------------------------------


@pytest.mark.asyncio
async def test_groq_success_request_shape():
    llm, requests = make(lambda r: ok("  Markets rose.  "))
    assert await llm.summarize(MESSAGES) == "Markets rose."
    (req,) = requests
    assert req.method == "POST"
    assert str(req.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert req.headers["authorization"] == f"Bearer {GROQ_KEY}"
    assert req.headers["content-type"] == "application/json"
    assert "x-title" not in req.headers
    assert json.loads(req.content) == {
        "model": "groq-model",
        "messages": MESSAGES,
        "temperature": 0.3,
        "max_tokens": 1024,
    }
    assert req.extensions["timeout"]["read"] == 20
    assert llm.calls == 1
    assert llm.budget_exhausted is False


@pytest.mark.asyncio
async def test_groq_429_falls_back_to_openrouter_with_headers():
    llm, requests = make(by_host(httpx.Response(429), ok("From OpenRouter.")))
    assert await llm.summarize(MESSAGES) == "From OpenRouter."
    assert [r.url.host for r in requests] == ["api.groq.com", "openrouter.ai"]
    req = requests[1]
    assert str(req.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert req.headers["authorization"] == f"Bearer {OR_KEY}"
    assert req.headers["http-referer"] == APP_URL
    assert req.headers["x-title"] == "StockPulse"
    assert json.loads(req.content)["model"] == "or-model"
    assert llm.calls == 2


@pytest.mark.parametrize("groq_resp", [
    httpx.Response(500),
    httpx.Response(503),
    httpx.Response(400),
    httpx.Response(200, text="<html>not json</html>"),
    httpx.Response(200, json={"choices": []}),
    httpx.Response(200, json={"choices": [{"message": {"content": "   "}}]}),
    httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
    httpx.Response(200, json={"choices": [{"message": {}}]}),
    httpx.Response(200, json={"choices": "nope"}),
    httpx.Response(200, json=["not", "a", "dict"]),
])
@pytest.mark.asyncio
async def test_bad_responses_move_to_next_provider(groq_resp):
    llm, requests = make(by_host(groq_resp, ok("fallback")))
    assert await llm.summarize(MESSAGES) == "fallback"
    assert len(requests) == 2


@pytest.mark.parametrize("exc", [httpx.ReadTimeout, httpx.ConnectError, RuntimeError])
@pytest.mark.asyncio
async def test_transport_errors_move_to_next_provider(exc):
    def groq_resp(request):
        raise exc("boom", request=request) if exc is not RuntimeError else exc("boom")

    llm, requests = make(by_host(groq_resp, ok("fallback")))
    assert await llm.summarize(MESSAGES) == "fallback"
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_both_fail_returns_none():
    llm, requests = make(lambda r: httpx.Response(502))
    assert await llm.summarize(MESSAGES) is None
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_no_providers_returns_none():
    llm, requests = make(lambda r: ok(), providers=[])
    assert await llm.summarize(MESSAGES) is None
    assert requests == []


@pytest.mark.asyncio
async def test_provider_without_key_is_skipped():
    llm, requests = make(lambda r: ok("or"), providers=[groq(key=""), openrouter()])
    assert await llm.summarize(MESSAGES) == "or"
    assert [r.url.host for r in requests] == ["openrouter.ai"]
    assert llm.calls == 1


@pytest.mark.parametrize("status", [401, 403])
@pytest.mark.asyncio
async def test_auth_error_disables_provider_for_the_run(status):
    llm, requests = make(by_host(httpx.Response(status), ok("or")))
    assert await llm.summarize(MESSAGES) == "or"
    assert await llm.summarize(MESSAGES) == "or"
    assert [r.url.host for r in requests] == ["api.groq.com", "openrouter.ai", "openrouter.ai"]


@pytest.mark.asyncio
async def test_429_does_not_disable_provider():
    llm, requests = make(by_host(httpx.Response(429), ok("or")))
    await llm.summarize(MESSAGES)
    await llm.summarize(MESSAGES)
    assert [r.url.host for r in requests] == ["api.groq.com", "openrouter.ai"] * 2


# ---- budget -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_budget_spent_returns_none_without_requests():
    llm, requests = make(lambda r: ok(), max_calls=2)
    assert await llm.summarize(MESSAGES) == "A calm day for markets."
    assert await llm.summarize(MESSAGES) == "A calm day for markets."
    assert llm.budget_exhausted is False
    assert await llm.summarize(MESSAGES) is None
    assert len(requests) == 2
    assert llm.calls == 2
    assert llm.budget_exhausted is True


@pytest.mark.asyncio
async def test_budget_counts_every_attempt_across_providers():
    # groq fails (1 call), budget of 1 is spent, openrouter is not tried
    llm, requests = make(by_host(httpx.Response(500), ok("or")), max_calls=1)
    assert await llm.summarize(MESSAGES) is None
    assert [r.url.host for r in requests] == ["api.groq.com"]
    assert llm.calls == 1
    assert llm.budget_exhausted is True


@pytest.mark.asyncio
async def test_zero_budget_makes_no_requests():
    llm, requests = make(lambda r: ok(), max_calls=0)
    assert await llm.summarize(MESSAGES) is None
    assert requests == []
    assert llm.budget_exhausted is True


@pytest.mark.parametrize("providers", [[], [groq(key=""), openrouter(key="")]])
@pytest.mark.parametrize("max_calls", [0, 1])
@pytest.mark.asyncio
async def test_no_keys_is_never_budget_exhausted(providers, max_calls):
    llm, requests = make(lambda r: ok(), providers=providers, max_calls=max_calls)
    assert await llm.summarize(MESSAGES) is None
    assert await llm.summarize(MESSAGES) is None
    assert requests == [] and llm.calls == 0
    assert llm.budget_exhausted is False


@pytest.mark.asyncio
async def test_budget_exhausted_only_once_a_keyed_provider_is_skipped():
    # the only provider fails and spends the budget, but nothing was skipped yet
    llm, requests = make(lambda r: httpx.Response(500), providers=[groq()], max_calls=1)
    assert await llm.summarize(MESSAGES) is None
    assert llm.calls == 1 and llm.budget_exhausted is False
    # the next call has to skip groq because of the budget
    assert await llm.summarize(MESSAGES) is None
    assert len(requests) == 1 and llm.budget_exhausted is True


# ---- secrecy ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_logs_hold_no_keys_prompts_or_completions(caplog):
    def groq_resp(request):
        raise httpx.ConnectError(f"failed {GROQ_KEY}", request=request)

    def or_resp(request):
        return httpx.Response(500, text=f"echo {OR_KEY} USER-PROMPT-HEADLINES")

    llm, _ = make(by_host(groq_resp, or_resp))
    with caplog.at_level(logging.DEBUG):
        assert await llm.summarize(MESSAGES) is None
    text = caplog.text
    assert "groq" in text and "openrouter" in text
    assert "ConnectError" in text and "500" in text
    for secret in (GROQ_KEY, OR_KEY, "USER-PROMPT-HEADLINES", "SYSTEM-PROMPT-SECRET-ISH"):
        assert secret not in text
    for record in caplog.records:
        assert GROQ_KEY not in str(record.args) and OR_KEY not in str(record.args)


@pytest.mark.asyncio
async def test_success_does_not_log_completion(caplog):
    llm, _ = make(lambda r: ok("COMPLETION-TEXT"))
    with caplog.at_level(logging.DEBUG):
        await llm.summarize(MESSAGES)
    assert "COMPLETION-TEXT" not in caplog.text
    assert "USER-PROMPT-HEADLINES" not in caplog.text


def test_repr_hides_keys():
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: ok()))
    llm = LLMClient([groq(), openrouter()], client, 5)
    for obj in (groq(), openrouter(), llm):
        assert GROQ_KEY not in repr(obj) and GROQ_KEY not in str(obj)
        assert OR_KEY not in repr(obj) and OR_KEY not in str(obj)


# ---- settings -----------------------------------------------------------------


def test_job_settings_llm_defaults(monkeypatch):
    for var in ("GROQ_API_KEY", "OPENROUTER_API_KEY", "LLM_MODEL_GROQ",
                "LLM_MODEL_OPENROUTER", "LLM_MAX_CALLS_PER_RUN"):
        monkeypatch.delenv(var, raising=False)
    s = job_settings()
    assert s["groq_api_key"] == ""
    assert s["openrouter_api_key"] == ""
    assert s["llm_model_groq"] == "openai/gpt-oss-120b"
    assert s["llm_model_openrouter"] == "google/gemma-4-31b-it:free"
    assert s["llm_max_calls"] == 60


def test_job_settings_llm_from_env(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", GROQ_KEY)
    monkeypatch.setenv("OPENROUTER_API_KEY", OR_KEY)
    monkeypatch.setenv("LLM_MODEL_GROQ", "g-model")
    monkeypatch.setenv("LLM_MODEL_OPENROUTER", "o-model:free")
    monkeypatch.setenv("LLM_MAX_CALLS_PER_RUN", "7")
    s = job_settings()
    assert (s["groq_api_key"], s["openrouter_api_key"]) == (GROQ_KEY, OR_KEY)
    assert (s["llm_model_groq"], s["llm_model_openrouter"]) == ("g-model", "o-model:free")
    assert s["llm_max_calls"] == 7


@pytest.mark.parametrize("raw", ["abc", "-3", ""])
def test_job_settings_bad_max_calls_falls_back(monkeypatch, raw):
    monkeypatch.setenv("LLM_MAX_CALLS_PER_RUN", raw)
    assert job_settings()["llm_max_calls"] == 60


def test_providers_from_settings():
    settings = {
        "groq_api_key": GROQ_KEY,
        "openrouter_api_key": OR_KEY,
        "llm_model_groq": "g",
        "llm_model_openrouter": "o",
        "app_url": APP_URL,
    }
    g, o = providers_from_settings(settings)
    assert (g.name, g.base_url, g.api_key, g.model, g.extra_headers) == (
        "groq", "https://api.groq.com/openai/v1", GROQ_KEY, "g", {})
    assert (o.name, o.base_url, o.api_key, o.model) == (
        "openrouter", "https://openrouter.ai/api/v1", OR_KEY, "o")
    assert o.extra_headers == {"HTTP-Referer": APP_URL, "X-Title": "StockPulse"}


@pytest.mark.parametrize("app_url", ["", None, "   "])
def test_providers_from_settings_omits_referer_without_app_url(app_url):
    settings = {"groq_api_key": GROQ_KEY, "openrouter_api_key": OR_KEY,
                "llm_model_groq": "g", "llm_model_openrouter": "o", "app_url": app_url}
    _, o = providers_from_settings(settings)
    assert o.extra_headers == {"X-Title": "StockPulse"}


@pytest.mark.asyncio
async def test_empty_app_url_sends_no_referer_header():
    settings = {"openrouter_api_key": OR_KEY, "llm_model_openrouter": "o", "app_url": ""}
    seen = []

    def responder(request):
        seen.append(request)
        return ok()

    client = httpx.AsyncClient(transport=httpx.MockTransport(responder))
    llm = LLMClient(providers_from_settings(settings), client, max_calls=5)
    assert await llm.summarize(MESSAGES) == "A calm day for markets."
    (req,) = seen
    assert "http-referer" not in req.headers
    assert req.headers["x-title"] == "StockPulse"


# ---- reasoning models ----------------------------------------------------------


def _body_for(provider, responder=None):
    llm, requests = make(responder or (lambda r: ok()), providers=[provider])
    return llm, requests


@pytest.mark.asyncio
async def test_groq_gpt_oss_turns_reasoning_down_and_hides_it():
    # gpt-oss is a reasoning model: reasoning tokens count against the cap, so ask for
    # low effort and leave the reasoning text out of the response.
    (gp, _) = providers_from_settings({"groq_api_key": GROQ_KEY, "openrouter_api_key": "",
                                       "llm_model_groq": "openai/gpt-oss-120b",
                                       "llm_model_openrouter": "o", "app_url": ""})
    llm, requests = _body_for(gp)
    await llm.summarize(MESSAGES)
    body = json.loads(requests[0].content)
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["reasoning_effort"] == "low"
    assert body["include_reasoning"] is False
    assert body["max_tokens"] == 1024


@pytest.mark.asyncio
async def test_groq_non_reasoning_model_gets_no_reasoning_params():
    # Groq rejects reasoning params on models that don't reason.
    (gp, _) = providers_from_settings({"groq_api_key": GROQ_KEY, "openrouter_api_key": "",
                                       "llm_model_groq": "llama-3.1-8b-instant",
                                       "llm_model_openrouter": "o", "app_url": ""})
    llm, requests = _body_for(gp)
    await llm.summarize(MESSAGES)
    body = json.loads(requests[0].content)
    assert "reasoning_effort" not in body and "include_reasoning" not in body


@pytest.mark.asyncio
async def test_openrouter_always_sends_unified_reasoning_control():
    # OpenRouter's unified `reasoning` object is ignored by non-reasoning models.
    (_, orp) = providers_from_settings({"groq_api_key": "", "openrouter_api_key": OR_KEY,
                                        "llm_model_groq": "g", "llm_model_openrouter": "o",
                                        "app_url": "https://x.example"})
    llm, requests = _body_for(orp)
    await llm.summarize(MESSAGES)
    body = json.loads(requests[0].content)
    assert body["reasoning"] == {"effort": "low", "exclude": True}


@pytest.mark.asyncio
async def test_reasoning_only_response_moves_to_next_provider():
    # If a reasoning model spends the budget thinking and returns empty content,
    # that's a failed attempt: fall through to the next provider.
    def responder(req):
        if "groq" in str(req.url):
            return httpx.Response(200, json={"choices": [{"message": {"content": "", "reasoning": "thinking..."}}]})
        return ok("From OpenRouter.")
    g = LLMProvider("groq", GROQ_BASE_URL, GROQ_KEY, "openai/gpt-oss-120b")
    o = LLMProvider("openrouter", OPENROUTER_BASE_URL, OR_KEY, "o")
    llm, _ = make(responder, providers=[g, o])
    assert await llm.summarize(MESSAGES) == "From OpenRouter."
