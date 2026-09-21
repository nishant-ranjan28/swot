import logging

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
