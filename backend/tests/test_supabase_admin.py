import json
from datetime import datetime, timezone

import httpx
import pytest

from config import job_settings
from services.supabase_admin import SupabaseAdmin, SupabaseAdminError

URL = "https://example.supabase.co"
KEY = "<service-role-key>"
NOW = datetime(2026, 9, 22, 5, 0, tzinfo=timezone.utc)
UUID1 = "11111111-1111-4111-8111-111111111111"
UUID2 = "22222222-2222-4222-8222-222222222222"
USER1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class Recorder:
    """MockTransport handler that records requests and replies from a queue/callable."""

    def __init__(self, responder):
        self.requests: list[httpx.Request] = []
        self.responder = responder

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.responder(request)


def make_admin(responder):
    rec = Recorder(responder)
    client = httpx.AsyncClient(transport=httpx.MockTransport(rec))
    admin = SupabaseAdmin(URL, KEY, client, clock=lambda: NOW)
    return admin, rec


def json_response(status, body):
    return lambda request: httpx.Response(status, json=body)


def body_of(request):
    return json.loads(request.content) if request.content else None


# ---- config -----------------------------------------------------------------


def test_job_settings_reads_env_lazily(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", KEY)
    monkeypatch.delenv("MAIL_FROM_NAME", raising=False)
    monkeypatch.delenv("APP_URL", raising=False)
    monkeypatch.delenv("JOB_SECRET", raising=False)
    s = job_settings()
    assert s["supabase_url"] == "https://x.supabase.co"
    assert s["service_role_key"] == KEY
    assert s["mail_from_name"] == "StockPulse"
    assert s["app_url"] == "https://swot.iamnishant.in"
    assert s["job_secret"] == ""


def test_job_settings_strips_app_url_slash(monkeypatch):
    monkeypatch.setenv("APP_URL", "http://localhost:3000/")
    assert job_settings()["app_url"] == "http://localhost:3000"


# ---- requests ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_alerts_request_shape():
    rows = [{"id": UUID1, "symbol": "RELIANCE.NS"}]
    admin, rec = make_admin(json_response(200, rows))
    assert await admin.active_alerts("in") == rows
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/rest/v1/price_alerts"
    assert req.url.params["market"] == "eq.in"
    assert req.url.params["active"] == "eq.true"
    assert req.url.params["select"] == "id,user_id,market,symbol,name,condition,target"
    assert req.url.params["order"] == "id.asc"
    assert req.url.params["limit"] == "1000"
    assert req.url.params["offset"] == "0"
    assert req.headers["apikey"] == KEY
    assert req.headers["authorization"] == f"Bearer {KEY}"


@pytest.mark.asyncio
async def test_active_alerts_rejects_unknown_market():
    admin, rec = make_admin(json_response(200, []))
    with pytest.raises(ValueError):
        await admin.active_alerts("in&active=eq.false")
    assert rec.requests == []


@pytest.mark.asyncio
async def test_record_triggers_calls_fire_alert_rpc():
    event = {"id": "e1", "alert_id": UUID1, "user_id": USER1, "price": 2600.5}
    admin, rec = make_admin(json_response(200, event))
    events = await admin.record_triggers([{"alert_id": UUID1, "user_id": USER1, "price": 2600.5}])
    assert events == [event]
    (req,) = rec.requests
    assert req.method == "POST"
    assert req.url.path == "/rest/v1/rpc/fire_alert"
    assert body_of(req) == {"p_alert_id": UUID1, "p_price": 2600.5}
    assert req.headers["apikey"] == KEY


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        None,  # empty body
        [],
        {},
        # a composite-returning function that returns NULL comes back as an all-null row
        {"id": None, "alert_id": None, "user_id": None, "price": None,
         "triggered_at": None, "emailed": None, "claimed_at": None},
        [{"id": None, "alert_id": None}],
    ],
)
async def test_record_triggers_skips_already_fired(body):
    def responder(request):
        if body is None:
            return httpx.Response(200)
        return httpx.Response(200, json=body)

    admin, rec = make_admin(responder)
    events = await admin.record_triggers([{"alert_id": UUID1, "user_id": USER1, "price": 10}])
    assert events == []
    assert [(r.method, r.url.path) for r in rec.requests] == [("POST", "/rest/v1/rpc/fire_alert")]


@pytest.mark.asyncio
async def test_record_triggers_one_rpc_per_trigger_and_list_response():
    def responder(request):
        alert_id = body_of(request)["p_alert_id"]
        return httpx.Response(200, json=[{"id": f"e-{alert_id[:4]}", "alert_id": alert_id}])

    admin, rec = make_admin(responder)
    events = await admin.record_triggers([
        {"alert_id": UUID1, "user_id": USER1, "price": 1},
        {"alert_id": UUID2, "user_id": USER1, "price": 2},
    ])
    assert [e["alert_id"] for e in events] == [UUID1, UUID2]
    assert [body_of(r)["p_price"] for r in rec.requests] == [1, 2]


@pytest.mark.asyncio
async def test_record_triggers_skips_invalid_alert_id():
    admin, rec = make_admin(json_response(200, []))
    events = await admin.record_triggers([{"alert_id": "x,id.neq.0", "user_id": USER1, "price": 1}])
    assert events == []
    assert rec.requests == []


@pytest.mark.asyncio
async def test_pending_events_request_shape():
    admin, rec = make_admin(json_response(200, []))
    since = "2026-09-21T05:00:00+00:00"
    assert await admin.pending_events(since) == []
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/rest/v1/alert_events"
    assert req.url.params["emailed"] == "eq.false"
    assert req.url.params["triggered_at"] == f"gte.{since}"
    assert req.url.params["select"] == (
        "id,user_id,price,triggered_at,alert:price_alerts(symbol,name,market,condition,target)"
    )
    assert req.url.params["order"] == "id.asc"
    assert req.url.params["limit"] == "1000"
    assert req.url.params["offset"] == "0"
    # '+' in the offset must be percent-encoded, not sent raw (it would decode as a space)
    assert "%2B00%3A00" in str(req.url) or "%2B00:00" in str(req.url)


def paged_responder(total, page=1000):
    """Serve ``total`` rows, honouring limit/offset like PostgREST."""

    def responder(request):
        offset = int(request.url.params["offset"])
        limit = int(request.url.params["limit"])
        assert limit == page
        rows = [{"id": f"row-{i:05d}"} for i in range(offset, min(offset + limit, total))]
        return httpx.Response(200, json=rows)

    return responder


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["active_alerts", "pending_events"])
async def test_paged_reads_follow_offset_until_short_page(method):
    admin, rec = make_admin(paged_responder(1500))
    arg = "in" if method == "active_alerts" else "2026-09-21T05:00:00+00:00"
    rows = await getattr(admin, method)(arg)
    assert len(rows) == 1500
    assert [r["id"] for r in rows] == [f"row-{i:05d}" for i in range(1500)]
    assert [r.url.params["offset"] for r in rec.requests] == ["0", "1000"]
    assert all(r.url.params["order"] == "id.asc" for r in rec.requests)
    assert all(r.url.params["limit"] == "1000" for r in rec.requests)


@pytest.mark.asyncio
async def test_paged_read_exact_multiple_needs_one_extra_empty_page():
    admin, rec = make_admin(paged_responder(1000))
    assert len(await admin.active_alerts("us")) == 1000
    assert [r.url.params["offset"] for r in rec.requests] == ["0", "1000"]


@pytest.mark.asyncio
async def test_expire_events_returns_count():
    admin, rec = make_admin(json_response(200, [{"id": "e1"}, {"id": "e2"}]))
    before = "2026-09-21T05:00:00+00:00"
    assert await admin.expire_events(before) == 2
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.params["emailed"] == "eq.false"
    assert req.url.params["triggered_at"] == f"lt.{before}"
    assert req.headers["prefer"] == "return=representation"
    assert body_of(req) == {"emailed": True}


@pytest.mark.asyncio
async def test_profiles_maps_by_id_and_drops_invalid_ids():
    rows = [{"id": USER1, "email": "a@example.com", "display_name": "A", "email_alerts": True}]
    admin, rec = make_admin(json_response(200, rows))
    result = await admin.profiles([USER1, "bogus)", USER1.upper()])
    assert result == {USER1: {"email": "a@example.com", "display_name": "A", "email_alerts": True}}
    (req,) = rec.requests
    assert req.url.path == "/rest/v1/profiles"
    assert req.url.params["id"] == f"in.({USER1},{USER1.upper()})"
    assert req.url.params["select"] == "id,email,display_name,email_alerts"


@pytest.mark.asyncio
async def test_profiles_with_no_valid_ids_makes_no_request():
    admin, rec = make_admin(json_response(200, []))
    assert await admin.profiles(["nope", ""]) == {}
    assert rec.requests == []


def uuid_n(n: int) -> str:
    return f"cccccccc-cccc-4ccc-8ccc-{n:012d}"


@pytest.mark.asyncio
async def test_profiles_are_chunked_100_ids_per_request():
    ids = [uuid_n(i) for i in range(150)]

    def responder(request):
        chunk = request.url.params["id"][len("in.("):-1].split(",")
        return httpx.Response(200, json=[
            {"id": i, "email": f"{i[-3:]}@example.com", "display_name": None, "email_alerts": True}
            for i in chunk
        ])

    admin, rec = make_admin(responder)
    result = await admin.profiles(ids)
    assert set(result) == set(ids)
    sizes = [len(r.url.params["id"][len("in.("):-1].split(",")) for r in rec.requests]
    assert sizes == [100, 50]
    assert rec.requests[0].url.params["id"] == f"in.({','.join(ids[:100])})"
    assert rec.requests[1].url.params["id"] == f"in.({','.join(ids[100:])})"


# ---- claims -----------------------------------------------------------------

CLAIM_NOW = "2026-09-22T05:00:00+00:00"
STALE_BEFORE = "2026-09-22T04:50:00+00:00"


@pytest.mark.asyncio
async def test_claim_events_request_shape_and_returns_claimed_rows():
    admin, rec = make_admin(json_response(200, [{"id": UUID1}]))
    claimed = await admin.claim_events(USER1, [UUID1, "bad)", UUID2], CLAIM_NOW, STALE_BEFORE)
    assert claimed == [{"id": UUID1}]
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/alert_events"
    assert req.url.params["id"] == f"in.({UUID1},{UUID2})"
    assert req.url.params["user_id"] == f"eq.{USER1}"
    assert req.url.params["emailed"] == "eq.false"
    # PostgREST logic tree; the timestamp is double-quoted so ':' '.' '+' can't be misparsed
    assert req.url.params["or"] == f'(claimed_at.is.null,claimed_at.lt."{STALE_BEFORE}")'
    assert req.headers["prefer"] == "return=representation"
    assert body_of(req) == {"claimed_at": CLAIM_NOW}
    # '+' must be percent-encoded on the wire
    assert "+00:00" not in str(req.url)


@pytest.mark.asyncio
async def test_claim_events_nothing_claimed_returns_empty_list():
    admin, _ = make_admin(json_response(200, []))
    assert await admin.claim_events(USER1, [UUID1], CLAIM_NOW, STALE_BEFORE) == []


@pytest.mark.asyncio
async def test_claim_events_invalid_user_or_no_ids_makes_no_request():
    admin, rec = make_admin(json_response(200, [{"id": UUID1}]))
    assert await admin.claim_events("x,user_id.neq.0", [UUID1], CLAIM_NOW, STALE_BEFORE) == []
    assert await admin.claim_events(USER1, ["nope"], CLAIM_NOW, STALE_BEFORE) == []
    assert rec.requests == []


@pytest.mark.asyncio
async def test_release_events_clears_claimed_at():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.release_events([UUID1, "bad", UUID2])
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/alert_events"
    assert req.url.params["id"] == f"in.({UUID1},{UUID2})"
    assert body_of(req) == {"claimed_at": None}


@pytest.mark.asyncio
async def test_release_events_empty_is_noop():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.release_events(["bad"])
    assert rec.requests == []


@pytest.mark.asyncio
async def test_mark_emailed_request_shape():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.mark_emailed([UUID1, "not-a-uuid", UUID2])
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/alert_events"
    assert req.url.params["id"] == f"in.({UUID1},{UUID2})"
    assert body_of(req) == {"emailed": True}


@pytest.mark.asyncio
async def test_mark_emailed_empty_is_noop():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.mark_emailed(["bad"])
    assert rec.requests == []


# ---- errors -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_2xx_raises_with_status_and_no_secret():
    # upstream body that echoes the key must not leak into the error
    admin, _ = make_admin(json_response(401, {"message": f"bad key {KEY}"}))
    with pytest.raises(SupabaseAdminError) as exc:
        await admin.active_alerts("us")
    assert exc.value.status == 401
    assert "401" in str(exc.value)
    assert KEY not in str(exc.value)
    assert KEY not in repr(exc.value)


@pytest.mark.asyncio
async def test_transport_error_raises_supabase_admin_error():
    def boom(request):
        raise httpx.ConnectError("connection refused", request=request)

    admin, _ = make_admin(boom)
    with pytest.raises(SupabaseAdminError) as exc:
        await admin.pending_events("2026-09-21T00:00:00+00:00")
    assert exc.value.status == 0
    assert KEY not in str(exc.value)


@pytest.mark.asyncio
async def test_record_triggers_rpc_error_raises():
    admin, _ = make_admin(lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(SupabaseAdminError) as exc:
        await admin.record_triggers([{"alert_id": UUID1, "user_id": USER1, "price": 1}])
    assert exc.value.status == 500
