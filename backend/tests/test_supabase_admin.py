import json
from datetime import datetime, timedelta, timezone

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


# ---- digest -----------------------------------------------------------------

DIGEST_DATE = "2026-09-22"
# NOW is 05:00Z, so the 30-minute stale cutoff is 04:30Z
NOW_ISO = NOW.isoformat()
DIGEST_STALE = "2026-09-22T04:30:00+00:00"
CLAIMED = "2026-09-22T04:55:00.123456+00:00"


@pytest.mark.asyncio
async def test_digest_recipients_request_shape():
    rows = [{"id": USER1, "email": "a@example.com", "display_name": "A"}]
    admin, rec = make_admin(json_response(200, rows))
    assert await admin.digest_recipients("us") == rows
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/rest/v1/profiles"
    assert req.url.params["daily_digest"] == "eq.true"
    assert req.url.params["digest_market"] == "eq.us"
    assert req.url.params["email"] == "not.is.null"
    assert req.url.params["select"] == "id,email,display_name"
    assert req.url.params["order"] == "id.asc"
    assert req.url.params["limit"] == "1000"
    assert req.url.params["offset"] == "0"
    assert req.headers["apikey"] == KEY


@pytest.mark.asyncio
async def test_digest_recipients_paginates():
    admin, rec = make_admin(paged_responder(2100))
    rows = await admin.digest_recipients("in")
    assert len(rows) == 2100
    assert [r.url.params["offset"] for r in rec.requests] == ["0", "1000", "2000"]


@pytest.mark.asyncio
async def test_digest_recipients_rejects_unknown_market():
    admin, rec = make_admin(json_response(200, []))
    with pytest.raises(ValueError):
        await admin.digest_recipients("IN")
    assert rec.requests == []


@pytest.mark.asyncio
async def test_watchlists_request_shape_and_grouping():
    rows = [
        {"user_id": USER1, "symbol": "TCS.NS", "name": "TCS"},
        {"user_id": UUID2, "symbol": "INFY.NS", "name": "Infosys"},
        {"user_id": USER1, "symbol": "RELIANCE.NS", "name": None},
    ]
    admin, rec = make_admin(json_response(200, rows))
    result = await admin.watchlists([USER1, "bad)", UUID2, UUID1, USER1], "in")
    assert result == {
        USER1: [{"symbol": "TCS.NS", "name": "TCS"}, {"symbol": "RELIANCE.NS", "name": None}],
        UUID2: [{"symbol": "INFY.NS", "name": "Infosys"}],
    }
    assert UUID1 not in result  # no rows -> absent
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/rest/v1/watchlist_items"
    assert req.url.params["user_id"] == f"in.({USER1},{UUID2},{UUID1})"
    assert req.url.params["market"] == "eq.in"
    assert req.url.params["select"] == "user_id,symbol,name"
    assert req.url.params["order"].startswith("added_at.asc")


@pytest.mark.asyncio
async def test_watchlists_chunked_100_ids_per_request():
    ids = [uuid_n(i) for i in range(250)]

    def responder(request):
        chunk = request.url.params["user_id"][len("in.("):-1].split(",")
        return httpx.Response(200, json=[{"user_id": i, "symbol": "X", "name": None} for i in chunk])

    admin, rec = make_admin(responder)
    result = await admin.watchlists(ids, "us")
    assert list(result) == ids
    sizes = [len(r.url.params["user_id"][len("in.("):-1].split(",")) for r in rec.requests]
    assert sizes == [100, 100, 50]
    assert all(r.url.params["market"] == "eq.us" for r in rec.requests)


@pytest.mark.asyncio
async def test_watchlists_pages_within_a_chunk():
    total = 1200

    def responder(request):
        offset = int(request.url.params["offset"])
        limit = int(request.url.params["limit"])
        rows = [{"user_id": USER1, "symbol": f"S{i}", "name": None}
                for i in range(offset, min(offset + limit, total))]
        return httpx.Response(200, json=rows)

    admin, rec = make_admin(responder)
    result = await admin.watchlists([USER1], "in")
    assert [r["symbol"] for r in result[USER1]] == [f"S{i}" for i in range(total)]
    assert [r.url.params["offset"] for r in rec.requests] == ["0", "1000"]


@pytest.mark.asyncio
async def test_watchlists_no_valid_ids_makes_no_request():
    admin, rec = make_admin(json_response(200, []))
    assert await admin.watchlists(["nope"], "in") == {}
    assert rec.requests == []


@pytest.mark.asyncio
async def test_watchlists_rejects_unknown_market():
    admin, rec = make_admin(json_response(200, []))
    with pytest.raises(ValueError):
        await admin.watchlists([USER1], "uk")
    assert rec.requests == []


@pytest.mark.asyncio
async def test_claim_digest_insert_claims():
    row = {"id": UUID1}
    admin, rec = make_admin(json_response(201, [row]))
    assert await admin.claim_digest(USER1, "in", DIGEST_DATE) == NOW_ISO
    (req,) = rec.requests
    assert req.method == "POST"
    assert req.url.path == "/rest/v1/digest_sends"
    assert req.url.params["on_conflict"] == "user_id,market,digest_date"
    assert req.headers["prefer"] == "return=representation,resolution=ignore-duplicates"
    assert body_of(req) == {"user_id": USER1, "market": "in", "digest_date": DIGEST_DATE,
                            "claimed_at": NOW_ISO}
    assert req.headers["apikey"] == KEY


@pytest.mark.asyncio
async def test_claim_digest_duplicate_reclaims_stale_or_failed_row():
    def responder(request):
        if request.method == "POST":
            return httpx.Response(201, json=[])  # duplicate, ignored
        return httpx.Response(200, json=[{"id": UUID1}])

    admin, rec = make_admin(responder)
    assert await admin.claim_digest(USER1, "us", DIGEST_DATE) == NOW_ISO
    post, patch = rec.requests
    assert post.method == "POST"
    assert patch.method == "PATCH"
    assert patch.url.path == "/rest/v1/digest_sends"
    assert patch.url.params["user_id"] == f"eq.{USER1}"
    assert patch.url.params["market"] == "eq.us"
    assert patch.url.params["digest_date"] == f"eq.{DIGEST_DATE}"
    assert patch.url.params["or"] == (
        f'(status.eq.failed,and(status.eq.claimed,claimed_at.lt."{DIGEST_STALE}"))'
    )
    assert patch.headers["prefer"] == "return=representation"
    assert body_of(patch) == {"status": "claimed", "claimed_at": NOW_ISO}
    assert "+00:00" not in str(patch.url)


@pytest.mark.asyncio
async def test_claim_digest_held_by_fresh_claim_returns_false():
    admin, rec = make_admin(json_response(200, []))
    assert await admin.claim_digest(USER1, "in", DIGEST_DATE) is None
    assert [r.method for r in rec.requests] == ["POST", "PATCH"]


@pytest.mark.asyncio
async def test_claim_digest_stale_window_is_parameterised():
    admin, rec = make_admin(json_response(200, []))
    await admin.claim_digest(USER1, "in", DIGEST_DATE, stale_minutes=10)
    patch = rec.requests[1]
    assert '"2026-09-22T04:50:00+00:00"' in patch.url.params["or"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "args",
    [
        ("bad,user_id.neq.0", "in", DIGEST_DATE),
        (USER1, "IN", DIGEST_DATE),
        (USER1, "in&x=1", DIGEST_DATE),
        (USER1, "in", "2026-9-22"),
        (USER1, "in", "2026-09-22)"),
        (USER1, "in", "2026-09-22\n"),
        (USER1, "in", None),
    ],
)
async def test_claim_digest_and_finish_digest_validate_before_request(args):
    admin, rec = make_admin(json_response(200, [{"id": UUID1}]))
    with pytest.raises(ValueError):
        await admin.claim_digest(*args)
    with pytest.raises(ValueError):
        await admin.finish_digest(*args, "sent", NOW_ISO)
    assert rec.requests == []


@pytest.mark.asyncio
async def test_finish_digest_sent_sets_sent_at():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.finish_digest(USER1, "in", DIGEST_DATE, "sent", CLAIMED)
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/digest_sends"
    assert req.url.params["user_id"] == f"eq.{USER1}"
    assert req.url.params["market"] == "eq.in"
    assert req.url.params["digest_date"] == f"eq.{DIGEST_DATE}"
    # top-level filter: unquoted, httpx URL-encodes it ('+' -> %2B)
    assert req.url.params["claimed_at"] == f"eq.{CLAIMED}"
    assert "%2B00%3A00" in str(req.url) or "%2B00:00" in str(req.url)
    assert body_of(req) == {"status": "sent", "sent_at": NOW_ISO}


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["failed", "skipped", "claimed"])
async def test_finish_digest_other_status_has_no_sent_at(status):
    admin, rec = make_admin(lambda r: httpx.Response(204))
    await admin.finish_digest(USER1, "us", DIGEST_DATE, status, CLAIMED)
    (req,) = rec.requests
    assert body_of(req) == {"status": status}


@pytest.mark.asyncio
async def test_finish_digest_rejects_unknown_status():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    with pytest.raises(ValueError):
        await admin.finish_digest(USER1, "us", DIGEST_DATE, "done", CLAIMED)
    assert rec.requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize("claimed", [None, "", "yesterday", "2026-09-22T05:00:00+00:00)", 123])
async def test_finish_digest_rejects_bad_claimed_at_before_request(claimed):
    admin, rec = make_admin(lambda r: httpx.Response(204))
    with pytest.raises(ValueError):
        await admin.finish_digest(USER1, "in", DIGEST_DATE, "sent", claimed)
    assert rec.requests == []


class DigestTable:
    """Tiny in-memory digest_sends that applies the PostgREST filters we send."""

    def __init__(self):
        self.rows: list[dict] = []

    def _match(self, row, params):
        for col in ("user_id", "market", "digest_date", "claimed_at"):
            if col in params and params[col] != f"eq.{row[col]}":
                return False
        if "or" in params:
            stale = params["or"].split('claimed_at.lt."', 1)[1].split('"', 1)[0]
            ok = row["status"] == "failed" or (
                row["status"] == "claimed"
                and datetime.fromisoformat(row["claimed_at"]) < datetime.fromisoformat(stale)
            )
            if not ok:
                return False
        return True

    def __call__(self, request):
        params = dict(request.url.params)
        body = body_of(request)
        if request.method == "POST":
            key = (body["user_id"], body["market"], body["digest_date"])
            if any((r["user_id"], r["market"], r["digest_date"]) == key for r in self.rows):
                return httpx.Response(201, json=[])
            row = {"status": "claimed", "sent_at": None, **body}
            self.rows.append(row)
            return httpx.Response(201, json=[row])
        if request.method == "PATCH":
            hit = [r for r in self.rows if self._match(r, params)]
            for r in hit:
                r.update(body)
            return httpx.Response(200, json=hit)
        return httpx.Response(405)


@pytest.mark.asyncio
async def test_late_finish_from_a_stale_run_cannot_overwrite_a_reclaim():
    table = DigestTable()
    t0 = NOW
    t1 = NOW + timedelta(minutes=31)  # A's claim is stale by now
    client = httpx.AsyncClient(transport=httpx.MockTransport(table))
    run_a = SupabaseAdmin(URL, KEY, client, clock=lambda: t0)
    run_b = SupabaseAdmin(URL, KEY, client, clock=lambda: t1)

    claim_a = await run_a.claim_digest(USER1, "in", DIGEST_DATE)
    assert claim_a == t0.isoformat()
    claim_b = await run_b.claim_digest(USER1, "in", DIGEST_DATE)  # reclaims the stale row
    assert claim_b == t1.isoformat()
    (row,) = table.rows
    assert row["claimed_at"] == claim_b

    # Run A finally finishes (e.g. its send failed): nothing may change.
    before = dict(row)
    await run_a.finish_digest(USER1, "in", DIGEST_DATE, "failed", claim_a)
    assert row == before

    # Run B's own finish still lands.
    await run_b.finish_digest(USER1, "in", DIGEST_DATE, "sent", claim_b)
    assert row["status"] == "sent"


# ---- welcome ----------------------------------------------------------------

SINCE = "2026-09-15T05:00:00+00:00"


@pytest.mark.asyncio
async def test_welcome_candidates_request_shape():
    rows = [{"id": USER1, "email": "a@example.com", "display_name": None}]
    admin, rec = make_admin(json_response(200, rows))
    assert await admin.welcome_candidates(SINCE) == rows
    (req,) = rec.requests
    assert req.method == "GET"
    assert req.url.path == "/rest/v1/profiles"
    assert req.url.params["welcome_sent_at"] == "is.null"
    assert req.url.params["email"] == "not.is.null"
    assert req.url.params["created_at"] == f"gte.{SINCE}"
    assert req.url.params["select"] == "id,email,display_name"
    assert req.url.params["order"] == "id.asc"
    assert "+00:00" not in str(req.url)


@pytest.mark.asyncio
async def test_welcome_candidates_paginates():
    admin, rec = make_admin(paged_responder(1001))
    assert len(await admin.welcome_candidates(SINCE)) == 1001
    assert [r.url.params["offset"] for r in rec.requests] == ["0", "1000"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "since",
    [None, "", "last week", "2026-09-15&welcome_sent_at=not.is.null",
     "2026-09-15T05:00:00+00:00,id.neq.0", 20260915],
)
async def test_welcome_candidates_rejects_bad_since_before_request(since):
    admin, rec = make_admin(json_response(200, []))
    with pytest.raises(ValueError):
        await admin.welcome_candidates(since)
    assert rec.requests == []


@pytest.mark.asyncio
async def test_claim_welcome_returns_row():
    row = {"id": USER1, "email": "a@example.com", "display_name": "A",
           "welcome_sent_at": NOW_ISO}
    admin, rec = make_admin(json_response(200, [row]))
    assert await admin.claim_welcome(USER1, NOW_ISO) == row
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/profiles"
    assert req.url.params["id"] == f"eq.{USER1}"
    assert req.url.params["welcome_sent_at"] == "is.null"
    assert req.headers["prefer"] == "return=representation"
    assert body_of(req) == {"welcome_sent_at": NOW_ISO}


@pytest.mark.asyncio
async def test_claim_welcome_already_claimed_returns_none():
    admin, _ = make_admin(json_response(200, []))
    assert await admin.claim_welcome(USER1, NOW_ISO) is None


@pytest.mark.asyncio
async def test_claim_welcome_invalid_user_raises_before_request():
    admin, rec = make_admin(json_response(200, []))
    with pytest.raises(ValueError):
        await admin.claim_welcome("x,id.neq.0", NOW_ISO)
    assert rec.requests == []


@pytest.mark.asyncio
async def test_release_welcome_guards_on_exact_claimed_timestamp():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    claimed = "2026-09-22T05:00:00.123456+00:00"
    await admin.release_welcome(USER1, claimed)
    (req,) = rec.requests
    assert req.method == "PATCH"
    assert req.url.path == "/rest/v1/profiles"
    assert req.url.params["id"] == f"eq.{USER1}"
    # quoted inside a logic tree so PostgREST strips the quotes and '.' ':' '+' aren't syntax
    assert req.url.params["and"] == f'(welcome_sent_at.eq."{claimed}")'
    assert "welcome_sent_at" not in req.url.params
    assert body_of(req) == {"welcome_sent_at": None}
    assert "+00:00" not in str(req.url)


@pytest.mark.asyncio
@pytest.mark.parametrize("claimed", ['2026"', "a\\b", ""])
async def test_release_welcome_rejects_bad_timestamp(claimed):
    admin, rec = make_admin(lambda r: httpx.Response(204))
    with pytest.raises(ValueError):
        await admin.release_welcome(USER1, claimed)
    assert rec.requests == []


@pytest.mark.asyncio
async def test_release_welcome_invalid_user_raises_before_request():
    admin, rec = make_admin(lambda r: httpx.Response(204))
    with pytest.raises(ValueError):
        await admin.release_welcome("nope", NOW_ISO)
    assert rec.requests == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "call",
    [
        lambda a: a.digest_recipients("in"),
        lambda a: a.watchlists([USER1], "in"),
        lambda a: a.claim_digest(USER1, "in", DIGEST_DATE),
        lambda a: a.finish_digest(USER1, "in", DIGEST_DATE, "sent", NOW_ISO),
        lambda a: a.welcome_candidates(SINCE),
        lambda a: a.claim_welcome(USER1, NOW_ISO),
        lambda a: a.release_welcome(USER1, NOW_ISO),
    ],
)
async def test_new_methods_map_errors_without_leaking_key(call):
    admin, _ = make_admin(json_response(403, {"message": f"denied {KEY}"}))
    with pytest.raises(SupabaseAdminError) as exc:
        await call(admin)
    assert exc.value.status == 403
    assert KEY not in str(exc.value)
    assert KEY not in repr(exc.value)
