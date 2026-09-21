import logging
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

import routers.jobs as jobs
from main import app
from services.supabase_admin import SupabaseAdminError

SECRET = "<job-secret-placeholder>"
SERVICE_KEY = "<service-role-key>"
BREVO_KEY = "<brevo-api-key>"
URL = "/api/jobs/check-alerts"

ENV = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": SERVICE_KEY,
    "BREVO_API_KEY": BREVO_KEY,
    "MAIL_FROM": "alerts@example.com",
    "JOB_SECRET": SECRET,
    "APP_URL": "https://app.example.com",
}


@pytest.fixture
def client(monkeypatch):
    def no_network(request):
        raise AssertionError(f"unexpected network call to {request.url.host}")

    monkeypatch.setattr(
        jobs, "_make_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(no_network)),
    )
    return TestClient(app)


@pytest.fixture
def env(monkeypatch):
    for k in list(ENV) + ["MAIL_FROM_NAME"]:
        monkeypatch.delenv(k, raising=False)
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    return monkeypatch


@pytest.fixture
def fake_job(monkeypatch):
    calls = []

    async def fake(market, **kwargs):
        calls.append({"market": market, **kwargs})
        return {"market": market, "checked": 0, "symbols": 0, "triggered": 0, "emailed": 0,
                "suppressed": 0, "failed": 0, "expired": 0, "rate_limited": False,
                "errors": []}

    monkeypatch.setattr(jobs, "run_check_alerts", fake)
    return calls


def assert_no_secrets(resp):
    for value in (SECRET, SERVICE_KEY, BREVO_KEY):
        assert value not in resp.text
        assert all(value not in v for v in resp.headers.values())


def test_503_when_job_secret_unset(client, env, fake_job):
    env.delenv("JOB_SECRET")
    resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 503
    assert resp.json() == {"error": "jobs disabled"}
    assert fake_job == []


@pytest.mark.parametrize(
    "headers",
    [{}, {"X-Job-Secret": "wrong"}, {"X-Job-Secret": "ü-nonascii".encode("utf-8")}],
)
def test_401_with_missing_or_wrong_secret(client, env, fake_job, headers):
    resp = client.post(URL, params={"market": "in"}, headers=headers)
    assert resp.status_code == 401
    assert resp.json() == {"error": "unauthorized"}
    assert fake_job == []
    assert_no_secrets(resp)


def test_503_lists_missing_config_names_only(client, env, fake_job):
    env.delenv("SUPABASE_SERVICE_ROLE_KEY")
    env.delenv("MAIL_FROM")
    resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 503
    assert resp.json() == {"error": "jobs not configured",
                           "missing": ["SUPABASE_SERVICE_ROLE_KEY", "MAIL_FROM"]}
    assert fake_job == []
    assert_no_secrets(resp)


@pytest.mark.parametrize("force_param,expected", [(None, False), ("true", True), ("1", True),
                                                  ("false", False)])
def test_200_passes_market_and_force_through(client, env, fake_job, force_param, expected):
    params = {"market": "us"}
    if force_param is not None:
        params["force"] = force_param
    resp = client.post(URL, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    assert resp.json()["market"] == "us"
    (call,) = fake_job
    assert call["market"] == "us"
    assert call["force"] is expected
    assert call["app_url"] == "https://app.example.com"
    assert call["now_utc"].tzinfo is not None
    assert callable(call["get_quotes"])
    assert call["admin"] is not None and call["mailer"] is not None
    assert_no_secrets(resp)


def test_partial_errors_return_207_with_counts(client, env, monkeypatch):
    counts = {"market": "in", "checked": 3, "symbols": 3, "triggered": 1, "emailed": 1,
              "suppressed": 0, "failed": 0, "invalid": 0, "expired": 0,
              "rate_limited": False, "errors": ["mark_emailed"]}

    async def partial(market, **kwargs):
        return counts

    monkeypatch.setattr(jobs, "run_check_alerts", partial)
    resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 207
    assert resp.json() == counts
    assert_no_secrets(resp)


def test_invalid_market_is_rejected(client, env, fake_job):
    resp = client.post(URL, params={"market": "uk"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 422
    assert fake_job == []


def test_get_is_not_allowed(client, env, fake_job):
    resp = client.get(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 405


def test_supabase_error_maps_to_502(client, env, monkeypatch):
    async def boom(market, **kwargs):
        raise SupabaseAdminError(401)

    monkeypatch.setattr(jobs, "run_check_alerts", boom)
    resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 502
    assert resp.json() == {"error": "supabase error", "status": 401}
    assert_no_secrets(resp)


def test_unexpected_error_is_500_without_details(client, env, monkeypatch, caplog):
    async def boom(market, **kwargs):
        raise RuntimeError("something broke")

    monkeypatch.setattr(jobs, "run_check_alerts", boom)
    with caplog.at_level(logging.INFO):
        resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 500
    assert resp.json() == {"error": "job failed"}
    assert "something broke" not in resp.text
    assert "RuntimeError" in caplog.text
    assert "something broke" not in caplog.text  # exception type only, never the message
    for value in (SECRET, SERVICE_KEY, BREVO_KEY):
        assert value not in caplog.text
    assert_no_secrets(resp)


def test_end_to_end_with_mock_transport(client, env, monkeypatch):
    """Real run_check_alerts wired through the router; Supabase served by MockTransport."""
    seen = []

    def handler(request):
        seen.append(request)
        assert request.url.host == "example.supabase.co"
        assert request.headers["apikey"] == SERVICE_KEY
        return httpx.Response(200, json=[])

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    resp = client.post(URL, params={"market": "in", "force": "true"},
                       headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    assert resp.json() == {"market": "in", "checked": 0, "symbols": 0, "triggered": 0,
                           "emailed": 0, "suppressed": 0, "failed": 0, "invalid": 0,
                           "expired": 0, "rate_limited": False, "errors": []}
    assert [(r.method, r.url.path) for r in seen] == [
        ("GET", "/rest/v1/price_alerts"),
        ("PATCH", "/rest/v1/alert_events"),
        ("GET", "/rest/v1/alert_events"),
    ]
    assert_no_secrets(resp)


def test_upstream_status_maps_to_502_without_body(client, env, monkeypatch):
    def handler(request):
        return httpx.Response(401, json={"message": "Invalid API key", "hint": SERVICE_KEY})

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    resp = client.post(URL, params={"market": "in", "force": "true"},
                       headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 502
    assert resp.json() == {"error": "supabase error", "status": 401}
    assert "Invalid API key" not in resp.text
    assert_no_secrets(resp)


def test_end_to_end_closed_market_claims_sends_and_marks(client, env, monkeypatch):
    """Weekend run, real SupabaseAdmin + Mailer: no alert evaluation, but the pending
    event is claimed, emailed via Brevo and marked emailed."""
    from datetime import datetime, timezone

    user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    event_id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    event = {"id": event_id, "user_id": user, "price": 2612.4,
             "triggered_at": "2026-09-19T05:00:00+00:00",
             "alert": {"symbol": "RELIANCE.NS", "name": "Reliance", "market": "in",
                       "condition": "above", "target": 2500}}
    seen = []

    def handler(request):
        seen.append((request.method, request.url.host, request.url.path))
        if request.url.host == "api.brevo.com":
            return httpx.Response(201, json={"messageId": "<m>"})
        path, method = request.url.path, request.method
        if path == "/rest/v1/alert_events" and method == "GET":
            return httpx.Response(200, json=[event])
        if path == "/rest/v1/profiles":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U", "email_alerts": True}])
        if path == "/rest/v1/alert_events" and "claimed_at" in (request.content or b"").decode():
            return httpx.Response(200, json=[{"id": event_id}])
        if path == "/rest/v1/alert_events" and method == "PATCH":
            return httpx.Response(200, json=[]) if "triggered_at" in str(request.url) \
                else httpx.Response(204)
        raise AssertionError(f"unexpected {method} {path}")

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )

    class Saturday(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 9, 19, 6, 0, tzinfo=timezone.utc)

    monkeypatch.setattr(jobs, "datetime", Saturday)
    resp = client.post(URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["skipped_evaluation"] == "market_closed"
    assert body["emailed"] == 1 and body["errors"] == []
    assert [s for s in seen if s[2] == "/rest/v1/price_alerts"] == []
    assert seen[-3:] == [
        ("PATCH", "example.supabase.co", "/rest/v1/alert_events"),  # claim
        ("POST", "api.brevo.com", "/v3/smtp/email"),
        ("PATCH", "example.supabase.co", "/rest/v1/alert_events"),  # mark emailed
    ]
    assert_no_secrets(resp)


# ---- daily digest + welcome ---------------------------------------------------------

DIGEST_URL = "/api/jobs/daily-digest"
WELCOME_URL = "/api/jobs/send-welcome"
GROQ_KEY = "<groq-api-key>"
OPENROUTER_KEY = "<openrouter-api-key>"
LLM_VARS = ("GROQ_API_KEY", "OPENROUTER_API_KEY", "LLM_MODEL_GROQ", "LLM_MODEL_OPENROUTER",
            "LLM_MAX_CALLS_PER_RUN")
ALL_SECRETS = (SECRET, SERVICE_KEY, BREVO_KEY, GROQ_KEY, OPENROUTER_KEY)


def assert_no_llm_or_job_secrets(resp):
    for value in ALL_SECRETS:
        assert value not in resp.text
        assert all(value not in v for v in resp.headers.values())


@pytest.fixture
def denv(env):
    for k in LLM_VARS:
        env.delenv(k, raising=False)
    return env


DIGEST_COUNTS = {"market": "in", "digest_date": "2026-09-22", "recipients": 1, "empty": 0,
                 "emailed": 1, "already_sent": 0, "failed": 0, "invalid": 0,
                 "rate_limited": False, "deferred": 0, "ai_summaries": 1, "ai_fallbacks": 0,
                 "llm_calls": 1, "budget_exhausted": False, "symbols": 1, "errors": [],
                 "warnings": []}
WELCOME_COUNTS = {"candidates": 1, "emailed": 1, "skipped": 0, "failed": 0, "invalid": 0,
                  "rate_limited": False, "errors": []}


@pytest.fixture
def fake_digest(monkeypatch):
    calls = []

    async def fake(market, **kwargs):
        calls.append({"market": market, **kwargs})
        return {**DIGEST_COUNTS, "market": market}

    monkeypatch.setattr(jobs, "run_daily_digest", fake)
    return calls


@pytest.fixture
def fake_welcome(monkeypatch):
    calls = []

    async def fake(**kwargs):
        calls.append(kwargs)
        return dict(WELCOME_COUNTS)

    monkeypatch.setattr(jobs, "run_send_welcome", fake)
    return calls


JOB_ROUTES = [(DIGEST_URL, {"market": "in"}), (WELCOME_URL, {})]


@pytest.mark.parametrize("url,params", JOB_ROUTES)
def test_new_jobs_503_when_job_secret_unset(client, denv, fake_digest, fake_welcome, url,
                                            params):
    denv.delenv("JOB_SECRET")
    resp = client.post(url, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 503
    assert resp.json() == {"error": "jobs disabled"}
    assert fake_digest == [] and fake_welcome == []


@pytest.mark.parametrize("url,params", JOB_ROUTES)
@pytest.mark.parametrize("headers", [{}, {"X-Job-Secret": "wrong"}])
def test_new_jobs_401_with_missing_or_wrong_secret(client, denv, fake_digest, fake_welcome,
                                                   url, params, headers):
    resp = client.post(url, params=params, headers=headers)
    assert resp.status_code == 401
    assert resp.json() == {"error": "unauthorized"}
    assert fake_digest == [] and fake_welcome == []
    assert_no_llm_or_job_secrets(resp)


@pytest.mark.parametrize("url,params", JOB_ROUTES)
def test_new_jobs_503_lists_missing_config_but_not_llm_keys(client, denv, fake_digest,
                                                            fake_welcome, url, params):
    denv.delenv("BREVO_API_KEY")
    denv.delenv("SUPABASE_URL")
    resp = client.post(url, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 503
    assert resp.json() == {"error": "jobs not configured",
                           "missing": ["SUPABASE_URL", "BREVO_API_KEY"]}
    assert fake_digest == [] and fake_welcome == []


@pytest.mark.parametrize("url", [DIGEST_URL, WELCOME_URL])
def test_new_jobs_get_is_not_allowed(client, denv, url):
    resp = client.get(url, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 405


def test_digest_invalid_or_missing_market_is_rejected(client, denv, fake_digest):
    for params in ({"market": "uk"}, {}):
        resp = client.post(DIGEST_URL, params=params, headers={"X-Job-Secret": SECRET})
        assert resp.status_code == 422
    assert fake_digest == []


@pytest.mark.parametrize("force_param,expected", [(None, False), ("true", True), ("1", True),
                                                  ("0", False)])
def test_digest_200_passes_market_force_and_llm(client, denv, fake_digest, force_param,
                                                expected):
    denv.setenv("GROQ_API_KEY", GROQ_KEY)
    denv.setenv("LLM_MAX_CALLS_PER_RUN", "7")
    params = {"market": "us"}
    if force_param is not None:
        params["force"] = force_param
    resp = client.post(DIGEST_URL, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    body = resp.json()
    assert body["market"] == "us" and "notes" not in body
    (call,) = fake_digest
    assert call["market"] == "us" and call["force"] is expected
    assert call["app_url"] == "https://app.example.com"
    assert call["now_utc"].tzinfo is not None
    assert callable(call["get_quotes"]) and callable(call["get_news"])
    assert call["admin"] is not None and call["mailer"] is not None
    assert call["llm"]._max_calls == 7
    assert call["time_budget_s"] == 240
    assert [p.name for p in call["llm"]._providers] == ["groq", "openrouter"]
    assert_no_llm_or_job_secrets(resp)


def test_digest_without_llm_keys_still_runs_with_note(client, denv, fake_digest):
    resp = client.post(DIGEST_URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    assert resp.json() == {**DIGEST_COUNTS, "notes": ["llm_unconfigured"]}
    assert len(fake_digest) == 1


def test_digest_with_only_openrouter_key_has_no_note(client, denv, fake_digest):
    denv.setenv("OPENROUTER_API_KEY", OPENROUTER_KEY)
    resp = client.post(DIGEST_URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200 and "notes" not in resp.json()
    assert_no_llm_or_job_secrets(resp)


def test_digest_partial_errors_return_207_with_note(client, denv, monkeypatch):
    counts = {**DIGEST_COUNTS, "errors": ["brevo_auth"], "warnings": ["news:TimeoutError"]}

    async def partial(market, **kwargs):
        return dict(counts)

    monkeypatch.setattr(jobs, "run_daily_digest", partial)
    resp = client.post(DIGEST_URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 207
    assert resp.json() == {**counts, "notes": ["llm_unconfigured"]}


def test_digest_warnings_alone_still_return_200(client, denv, monkeypatch):
    denv.setenv("GROQ_API_KEY", GROQ_KEY)
    counts = {**DIGEST_COUNTS, "warnings": ["news:TimeoutError", "quotes:ConnectionError"]}

    async def soft(market, **kwargs):
        return dict(counts)

    monkeypatch.setattr(jobs, "run_daily_digest", soft)
    resp = client.post(DIGEST_URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    assert resp.json() == counts


def test_digest_job_notes_are_kept_alongside_llm_unconfigured(client, denv, monkeypatch):
    counts = {**DIGEST_COUNTS, "deferred": 3, "notes": ["time_budget"]}

    async def budget(market, **kwargs):
        return {**counts, "notes": list(counts["notes"])}

    monkeypatch.setattr(jobs, "run_daily_digest", budget)
    resp = client.post(DIGEST_URL, params={"market": "in"}, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200  # deferring is not an error
    assert resp.json() == {**counts, "notes": ["time_budget", "llm_unconfigured"]}


def test_welcome_200_and_207(client, denv, fake_welcome, monkeypatch):
    resp = client.post(WELCOME_URL, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200
    assert resp.json() == WELCOME_COUNTS
    (call,) = fake_welcome
    assert set(call) == {"admin", "mailer", "now_utc", "app_url"}
    assert call["now_utc"].tzinfo is not None

    async def partial(**kwargs):
        return {**WELCOME_COUNTS, "errors": ["brevo_auth"]}

    monkeypatch.setattr(jobs, "run_send_welcome", partial)
    resp = client.post(WELCOME_URL, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 207
    assert resp.json()["errors"] == ["brevo_auth"]


@pytest.mark.parametrize("url,params,name", [(DIGEST_URL, {"market": "in"}, "run_daily_digest"),
                                             (WELCOME_URL, {}, "run_send_welcome")])
def test_new_jobs_supabase_error_maps_to_502(client, denv, monkeypatch, url, params, name):
    async def boom(*args, **kwargs):
        raise SupabaseAdminError(0)

    monkeypatch.setattr(jobs, name, boom)
    resp = client.post(url, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 502
    assert resp.json() == {"error": "supabase error", "status": 0}


@pytest.mark.parametrize("url,params,name", [(DIGEST_URL, {"market": "in"}, "run_daily_digest"),
                                             (WELCOME_URL, {}, "run_send_welcome")])
def test_new_jobs_unexpected_error_is_500_without_details(client, denv, monkeypatch, caplog,
                                                          url, params, name):
    denv.setenv("GROQ_API_KEY", GROQ_KEY)

    async def boom(*args, **kwargs):
        raise RuntimeError(f"something broke {GROQ_KEY}")

    monkeypatch.setattr(jobs, name, boom)
    with caplog.at_level(logging.INFO):
        resp = client.post(url, params=params, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 500
    assert resp.json() == {"error": "job failed"}
    assert "RuntimeError" in caplog.text and "something broke" not in caplog.text
    for value in ALL_SECRETS:
        assert value not in caplog.text
    assert_no_llm_or_job_secrets(resp)


def _mock_services(monkeypatch, *, quotes, news):
    monkeypatch.setattr(jobs.stock_service, "get_batch_quotes", lambda symbols: {
        s: quotes[s] for s in symbols if s in quotes})
    monkeypatch.setattr(jobs.stock_service, "get_stock_news", lambda symbol: news.get(symbol, []))


class _Tuesday(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 9, 22, 11, 30, tzinfo=timezone.utc)  # 17:00 IST


def test_digest_end_to_end_with_groq(client, denv, monkeypatch, caplog):
    """Real run_daily_digest + SupabaseAdmin + Mailer + LLMClient over MockTransport."""
    import json as _json

    denv.setenv("GROQ_API_KEY", GROQ_KEY)
    user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    seen = []
    brevo_bodies = []

    def handler(request):
        seen.append((request.method, request.url.host, request.url.path))
        host, path, method = request.url.host, request.url.path, request.method
        if host == "api.groq.com":
            assert request.headers["authorization"] == f"Bearer {GROQ_KEY}"
            assert "u@example.com" not in request.content.decode()
            return httpx.Response(200, json={"choices": [{"message": {
                "content": "Reliance closed higher on steady buying."}}]})
        if host == "api.brevo.com":
            brevo_bodies.append(_json.loads(request.content))
            return httpx.Response(201, json={"messageId": "<m>"})
        if path == "/rest/v1/profiles":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U"}])
        if path == "/rest/v1/watchlist_items":
            return httpx.Response(200, json=[{"user_id": user, "symbol": "RELIANCE",
                                              "name": "Reliance"}])
        if path == "/rest/v1/digest_sends" and method == "POST":
            return httpx.Response(201, json=[{"user_id": user}])
        if path == "/rest/v1/digest_sends" and method == "PATCH":
            return httpx.Response(204)
        raise AssertionError(f"unexpected {method} {host}{path}")

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(jobs, "datetime", _Tuesday)
    _mock_services(monkeypatch,
                   quotes={"RELIANCE.NS": {"price": 2600.0, "change": 26.0,
                                           "change_percent": 1.0}},
                   news={"RELIANCE.NS": [{"title": "Reliance rallies",
                                          "url": "https://n.example/r", "source": "Wire",
                                          "sentiment_label": "Bullish"}]})
    with caplog.at_level(logging.DEBUG):
        resp = client.post(DIGEST_URL, params={"market": "in"},
                           headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["emailed"] == 1 and body["ai_summaries"] == 1 and body["llm_calls"] == 1
    assert body["digest_date"] == "2026-09-22" and "notes" not in body
    assert [s[1:] for s in seen[-3:]] == [
        ("api.groq.com", "/openai/v1/chat/completions"),
        ("api.brevo.com", "/v3/smtp/email"),
        ("example.supabase.co", "/rest/v1/digest_sends"),  # finish: sent
    ]
    (mail,) = brevo_bodies
    assert mail["headers"] == {"X-Mailin-Tag": "daily-digest"}
    assert "Reliance closed higher on steady buying." in mail["htmlContent"]
    for value in ALL_SECRETS + ("u@example.com",):
        assert value not in caplog.text
    assert_no_llm_or_job_secrets(resp)


def test_digest_end_to_end_without_llm_keys_makes_no_llm_calls(client, denv, monkeypatch):
    user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    hosts = []

    def handler(request):
        hosts.append(request.url.host)
        path, method = request.url.path, request.method
        if request.url.host == "api.brevo.com":
            return httpx.Response(201, json={})
        if path == "/rest/v1/profiles":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U"}])
        if path == "/rest/v1/watchlist_items":
            return httpx.Response(200, json=[{"user_id": user, "symbol": "TCS", "name": "TCS"}])
        if path == "/rest/v1/digest_sends":
            return httpx.Response(201, json=[{"user_id": user}]) if method == "POST" \
                else httpx.Response(204)
        raise AssertionError(f"unexpected {method} {path}")

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    _mock_services(monkeypatch, quotes={}, news={})
    resp = client.post(DIGEST_URL, params={"market": "in", "force": "1"},
                       headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["notes"] == ["llm_unconfigured"]
    assert body["emailed"] == 1 and body["ai_fallbacks"] == 1 and body["llm_calls"] == 0
    assert "api.groq.com" not in hosts and "openrouter.ai" not in hosts


def test_welcome_end_to_end_claims_and_sends(client, denv, monkeypatch):
    import json as _json

    user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    seen = []
    mails = []

    def handler(request):
        seen.append((request.method, request.url.host, request.url.path))
        if request.url.host == "api.brevo.com":
            mails.append(_json.loads(request.content))
            return httpx.Response(201, json={})
        if request.url.path == "/rest/v1/profiles" and request.method == "GET":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U"}])
        if request.url.path == "/rest/v1/profiles" and request.method == "PATCH":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U",
                                              "welcome_sent_at": "2026-09-22T11:30:00+00:00"}])
        raise AssertionError("unexpected request")

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    resp = client.post(WELCOME_URL, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 200, resp.text
    assert resp.json() == WELCOME_COUNTS
    assert [s[0] + " " + s[2] for s in seen] == [
        "GET /rest/v1/profiles", "PATCH /rest/v1/profiles", "POST /v3/smtp/email"]
    (mail,) = mails
    assert mail["headers"] == {"X-Mailin-Tag": "welcome"}
    assert mail["subject"] == "Welcome to StockPulse 👋"
    assert_no_llm_or_job_secrets(resp)


def test_welcome_release_failure_is_a_207_and_the_claim_stays(client, denv, monkeypatch):
    """A failed send whose release also fails leaves welcome_sent_at set (the user is
    never retried automatically), so the run must surface it: 207 + release_welcome."""
    user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    patches = []

    def handler(request):
        if request.url.host == "api.brevo.com":
            return httpx.Response(500, json={})  # retryable failure -> release
        if request.url.path == "/rest/v1/profiles" and request.method == "GET":
            return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                              "display_name": "U"}])
        if request.url.path == "/rest/v1/profiles" and request.method == "PATCH":
            patches.append(request)
            if len(patches) == 1:  # the claim
                return httpx.Response(200, json=[{"id": user, "email": "u@example.com",
                                                  "display_name": "U",
                                                  "welcome_sent_at": "2026-09-22T11:30:00+00:00"}])
            return httpx.Response(503, json={"message": "down"})  # the release
        raise AssertionError("unexpected request")

    monkeypatch.setattr(
        jobs, "_make_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    resp = client.post(WELCOME_URL, headers={"X-Job-Secret": SECRET})
    assert resp.status_code == 207, resp.text
    body = resp.json()
    assert body["errors"] == ["release_welcome"]
    assert body["failed"] == 1 and body["emailed"] == 0
    assert len(patches) == 2  # claim, then the failed release attempt
