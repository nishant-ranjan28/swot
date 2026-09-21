from datetime import datetime, timedelta, timezone

import pytest

from services.alert_job import run_check_alerts

APP_URL = "https://app.example.com"
# Tue 2026-09-22 11:30 IST: IN market open, US closed.
IN_OPEN = datetime(2026, 9, 22, 6, 0, tzinfo=timezone.utc)
# Sat 2026-09-19: both closed.
WEEKEND = datetime(2026, 9, 19, 6, 0, tzinfo=timezone.utc)


def uid(n: int, prefix: str = "a") -> str:
    return f"{prefix * 8}-{prefix * 4}-4{prefix * 3}-8{prefix * 3}-{n:012d}"


class FakeAdmin:
    """In-memory stand-in for SupabaseAdmin with the same semantics."""

    def __init__(self, alerts=(), profiles=None, events=()):
        self.alerts = [dict(a) for a in alerts]
        self.events = [dict(e) for e in events]
        self.profile_rows = profiles or {}
        self.now = IN_OPEN
        self.calls: list[str] = []
        self.fail_mark_times: dict[str, int] = {}  # user_id -> mark_emailed failures left
        self.fail_claim_for: set[str] = set()
        self.hooks: dict = {}  # method name -> async callable, run once before the method
        self._seq = 0

    async def _hook(self, name):
        hook = self.hooks.pop(name, None)
        if hook is not None:
            await hook()

    async def active_alerts(self, market):
        await self._hook("active_alerts")
        self.calls.append("active_alerts")
        return [dict(a) for a in self.alerts if a["market"] == market and a["active"]]

    async def record_triggers(self, triggers):
        self.calls.append("record_triggers")
        inserted = []
        for t in triggers:
            alert = next((a for a in self.alerts if a["id"] == t["alert_id"]), None)
            if alert is None or not alert["active"]:
                continue
            alert["active"] = False
            self._seq += 1
            event = {
                "id": uid(self._seq, "e"),
                "alert_id": alert["id"],
                "user_id": t["user_id"],
                "price": t["price"],
                "triggered_at": self.now.isoformat(),
                "emailed": False,
                "claimed_at": None,
            }
            self.events.append(event)
            inserted.append(dict(event))
        return inserted

    def _embed(self, event):
        alert = next((a for a in self.alerts if a["id"] == event.get("alert_id")), None)
        embedded = None
        if alert:
            embedded = {k: alert[k] for k in ("symbol", "name", "market", "condition", "target")}
        return {**event, "alert": embedded}

    async def pending_events(self, since_iso):
        await self._hook("pending_events")
        self.calls.append("pending_events")
        since = datetime.fromisoformat(since_iso)
        return [
            self._embed(e)
            for e in self.events
            if not e["emailed"] and datetime.fromisoformat(e["triggered_at"]) >= since
        ]

    async def expire_events(self, before_iso):
        self.calls.append("expire_events")
        before = datetime.fromisoformat(before_iso)
        n = 0
        for e in self.events:
            if not e["emailed"] and datetime.fromisoformat(e["triggered_at"]) < before:
                e["emailed"] = True
                n += 1
        return n

    async def profiles(self, user_ids):
        await self._hook("profiles")
        self.calls.append("profiles")
        return {u: self.profile_rows[u] for u in user_ids if u in self.profile_rows}

    async def claim_events(self, user_id, event_ids, now_iso, stale_before_iso):
        await self._hook("claim_events")
        self.calls.append("claim_events")
        if user_id in self.fail_claim_for:
            raise RuntimeError("boom")
        ids = set(event_ids)
        stale_before = datetime.fromisoformat(stale_before_iso)
        claimed = []
        for e in self.events:
            if e["id"] not in ids or e["user_id"] != user_id or e["emailed"]:
                continue
            held = e.get("claimed_at")
            if held is None or datetime.fromisoformat(held) < stale_before:
                e["claimed_at"] = now_iso
                claimed.append({"id": e["id"]})
        return claimed

    async def release_events(self, event_ids):
        self.calls.append("release_events")
        ids = set(event_ids)
        for e in self.events:
            if e["id"] in ids:
                e["claimed_at"] = None

    async def mark_emailed(self, event_ids):
        self.calls.append("mark_emailed")
        ids = set(event_ids)
        for e in self.events:
            if e["id"] in ids:
                left = self.fail_mark_times.get(e["user_id"], 0)
                if left:
                    self.fail_mark_times[e["user_id"]] = left - 1
                    raise RuntimeError("boom")
                e["emailed"] = True

    def claimed_ids(self):
        return {e["id"] for e in self.events if e.get("claimed_at") and not e["emailed"]}

    def pending_ids(self):
        return {e["id"] for e in self.events if not e["emailed"]}


class FakeMailer:
    def __init__(self, results=None):
        self.results = results or {}  # email -> list of results (popped in order)
        self.sent: list[dict] = []

    async def send(self, to_email, to_name, subject, html, text):
        self.sent.append({"to": to_email, "name": to_name, "subject": subject,
                          "html": html, "text": text})
        queue = self.results.get(to_email)
        return queue.pop(0) if queue else "sent"


class FakeQuotes:
    def __init__(self, quotes):
        self.quotes = quotes
        self.chunks: list[list[str]] = []

    def __call__(self, symbols):
        self.chunks.append(list(symbols))
        return {s: self.quotes[s] for s in symbols if s in self.quotes}


def make_alert(n, user, symbol, condition, target, market="in", active=True):
    return {"id": uid(n), "user_id": user, "market": market, "symbol": symbol,
            "name": f"{symbol} Ltd", "condition": condition, "target": target,
            "active": active}


def profile(email, name="Asha", email_alerts=True):
    return {"email": email, "display_name": name, "email_alerts": email_alerts}


U1, U2, U3 = uid(1, "b"), uid(2, "b"), uid(3, "b")


async def run(admin, mailer, quotes, now=IN_OPEN, market="in", force=False):
    admin.now = now
    return await run_check_alerts(market, admin=admin, mailer=mailer, get_quotes=quotes,
                                  now_utc=now, force=force, app_url=APP_URL)


# ---- market hours -----------------------------------------------------------


@pytest.mark.asyncio
async def test_closed_market_skips_evaluation_but_still_sends_pending():
    pending = {"id": uid(70, "e"), "alert_id": uid(1), "user_id": U1, "price": 10.0,
               "triggered_at": (WEEKEND - timedelta(hours=2)).isoformat(), "emailed": False,
               "claimed_at": None}
    admin = FakeAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 1, active=False),
                              make_alert(2, U1, "BBB.NS", "above", 1)],
                      events=[pending], profiles={U1: profile("u1@example.com")})
    mailer, quotes = FakeMailer(), FakeQuotes({"BBB.NS": {"price": 10.0}})
    result = await run(admin, mailer, quotes, now=WEEKEND)
    assert result == {
        "market": "in", "skipped_evaluation": "market_closed", "checked": 0, "symbols": 0,
        "triggered": 0, "emailed": 1, "suppressed": 0, "failed": 0, "invalid": 0,
        "expired": 0, "rate_limited": False, "errors": [],
    }
    assert quotes.chunks == []
    assert "active_alerts" not in admin.calls and "record_triggers" not in admin.calls
    assert admin.calls[:2] == ["expire_events", "pending_events"]
    assert len(mailer.sent) == 1 and "AAA.NS" in mailer.sent[0]["text"]
    assert admin.alerts[1]["active"] is True  # BBB not evaluated
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_closed_market_with_nothing_pending():
    admin, mailer, quotes = FakeAdmin(), FakeMailer(), FakeQuotes({})
    result = await run(admin, mailer, quotes, now=WEEKEND)
    assert result["skipped_evaluation"] == "market_closed"
    assert result["emailed"] == 0 and result["errors"] == []
    assert quotes.chunks == [] and mailer.sent == []


@pytest.mark.asyncio
async def test_force_bypasses_market_hours():
    admin = FakeAdmin(alerts=[make_alert(1, U1, "RELIANCE.NS", "above", 1)],
                      profiles={U1: profile("u1@example.com")})
    quotes = FakeQuotes({"RELIANCE.NS": {"price": 2500.0, "change_percent": 1.0}})
    result = await run(admin, FakeMailer(), quotes, now=WEEKEND, force=True)
    assert result["triggered"] == 1 and result["emailed"] == 1


@pytest.mark.asyncio
async def test_post_close_run_within_grace_still_evaluates():
    admin = FakeAdmin()
    # 15:48 IST (18 min after close) is within the 20 min grace.
    result = await run(admin, FakeMailer(), FakeQuotes({}),
                       now=datetime(2026, 9, 22, 10, 18, tzinfo=timezone.utc))
    assert "skipped_evaluation" not in result
    assert "active_alerts" in admin.calls
    # 15:51 IST is past the grace.
    admin.calls.clear()
    result = await run(admin, FakeMailer(), FakeQuotes({}),
                       now=datetime(2026, 9, 22, 10, 21, tzinfo=timezone.utc))
    assert result["skipped_evaluation"] == "market_closed"
    assert "active_alerts" not in admin.calls


# ---- evaluation + recording -------------------------------------------------


@pytest.mark.asyncio
async def test_each_condition_fires_and_result_shape():
    alerts = [
        make_alert(1, U1, "AAA.NS", "above", 100),
        make_alert(2, U1, "BBB.NS", "below", 50),
        make_alert(3, U1, "CCC.NS", "pct_up", 5),
        make_alert(4, U1, "DDD.NS", "pct_down", 3),
        make_alert(5, U1, "EEE.NS", "above", 1000),  # not reached
        make_alert(6, U1, "FFF.NS", "above", 1),  # no quote
        make_alert(7, U1, "AAPL", "above", 1, market="us"),  # other market
    ]
    quotes = FakeQuotes({
        "AAA.NS": {"price": 100.0, "change_percent": 0.0},
        "BBB.NS": {"price": 49.5, "change_percent": 0.0},
        "CCC.NS": {"price": 10.0, "change_percent": 5.2},
        "DDD.NS": {"price": 10.0, "change_percent": -3.0},
        "EEE.NS": {"price": 999.0, "change_percent": 0.0},
    })
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com")})
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result == {
        "market": "in", "checked": 6, "symbols": 6, "triggered": 4, "emailed": 1,
        "suppressed": 0, "failed": 0, "invalid": 0, "expired": 0, "rate_limited": False,
        "errors": [],
    }
    fired = {a["symbol"] for a in admin.alerts if not a["active"]}
    assert fired == {"AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"}
    assert {e["price"] for e in admin.events} == {100.0, 49.5, 10.0}
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_second_run_is_idempotent():
    admin = FakeAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 100)],
                      profiles={U1: profile("u1@example.com")})
    quotes = FakeQuotes({"AAA.NS": {"price": 150.0, "change_percent": 0.0}})
    mailer = FakeMailer()
    first = await run(admin, mailer, quotes)
    second = await run(admin, mailer, quotes)
    assert first["triggered"] == 1
    assert second["triggered"] == 0 and second["checked"] == 0 and second["emailed"] == 0
    assert len(admin.events) == 1 and len(mailer.sent) == 1


@pytest.mark.asyncio
async def test_record_triggers_skip_is_respected():
    """If a concurrent run already deactivated the alert, nothing is counted."""

    class RacingAdmin(FakeAdmin):
        async def record_triggers(self, triggers):
            for a in self.alerts:
                a["active"] = False  # someone else got there first
            return await super().record_triggers(triggers)

    admin = RacingAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 100)],
                        profiles={U1: profile("u1@example.com")})
    quotes = FakeQuotes({"AAA.NS": {"price": 150.0, "change_percent": 0.0}})
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result["triggered"] == 0 and mailer.sent == []


@pytest.mark.asyncio
async def test_quotes_are_fetched_in_chunks_of_20_with_unique_symbols():
    alerts = [make_alert(i, U1, f"S{i:02d}.NS", "above", 1000) for i in range(45)]
    alerts.append(make_alert(99, U2, "S00.NS", "below", 1))  # duplicate symbol
    quotes = FakeQuotes({})
    result = await run(FakeAdmin(alerts=alerts), FakeMailer(), quotes)
    assert [len(c) for c in quotes.chunks] == [20, 20, 5]
    assert sorted(s for c in quotes.chunks for s in c) == sorted(f"S{i:02d}.NS" for i in range(45))
    assert result["symbols"] == 45 and result["checked"] == 46


@pytest.mark.asyncio
async def test_quote_chunk_failure_is_recorded_and_other_chunks_still_evaluate():
    alerts = [make_alert(i, U1, f"S{i:02d}.NS", "above", 1) for i in range(25)]

    def quotes(symbols):
        if "S00.NS" in symbols:
            raise ConnectionError("upstream down")
        return {s: {"price": 5.0, "change_percent": 0.0} for s in symbols}

    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com")})
    result = await run(admin, FakeMailer(), quotes)
    assert result["triggered"] == 5
    assert result["errors"] == ["quotes:ConnectionError"]


# ---- emailing ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_email_per_user_with_multiple_events():
    alerts = [
        make_alert(1, U1, "AAA.NS", "above", 1),
        make_alert(2, U1, "BBB.NS", "above", 1),
        make_alert(3, U2, "CCC.NS", "above", 1),
    ]
    quotes = FakeQuotes({s: {"price": 10.0, "change_percent": 0.0}
                         for s in ("AAA.NS", "BBB.NS", "CCC.NS")})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com", "Asha"),
                                               U2: profile("u2@example.com", "Ben")})
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result["emailed"] == 2
    by_to = {m["to"]: m for m in mailer.sent}
    assert set(by_to) == {"u1@example.com", "u2@example.com"}
    assert by_to["u1@example.com"]["subject"] == "🔔 2 price alerts triggered"
    assert "AAA.NS" in by_to["u1@example.com"]["text"] and "BBB.NS" in by_to["u1@example.com"]["text"]
    assert by_to["u1@example.com"]["name"] == "Asha"
    assert f"{APP_URL}/alerts" in by_to["u2@example.com"]["html"]


@pytest.mark.asyncio
async def test_email_alerts_off_is_suppressed_and_marked():
    alerts = [make_alert(1, U1, "AAA.NS", "above", 1), make_alert(2, U2, "BBB.NS", "above", 1)]
    quotes = FakeQuotes({"AAA.NS": {"price": 10.0}, "BBB.NS": {"price": 10.0}})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com", email_alerts=False)})
    # U2 has no profile row -> no email address -> suppressed too
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result["suppressed"] == 2 and result["emailed"] == 0
    assert mailer.sent == []
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_rate_limit_stops_later_users_and_leaves_them_pending():
    alerts = [make_alert(i, u, f"S{i}.NS", "above", 1) for i, u in enumerate((U1, U2, U3), 1)]
    quotes = FakeQuotes({f"S{i}.NS": {"price": 10.0} for i in (1, 2, 3)})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com"),
                                               U2: profile("u2@example.com"),
                                               U3: profile("u3@example.com")})
    mailer = FakeMailer(results={"u1@example.com": ["rate_limited"]})
    result = await run(admin, mailer, quotes)
    assert result["rate_limited"] is True
    assert result["emailed"] == 0
    assert len(mailer.sent) == 1  # nothing sent after the 429
    assert len(admin.pending_ids()) == 3

    # next run retries everyone
    result = await run(admin, mailer, quotes)
    assert result["triggered"] == 0 and result["emailed"] == 3
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_failed_send_stays_pending_and_is_retried_next_run():
    alerts = [make_alert(1, U1, "AAA.NS", "above", 1), make_alert(2, U2, "BBB.NS", "above", 1)]
    quotes = FakeQuotes({"AAA.NS": {"price": 10.0}, "BBB.NS": {"price": 10.0}})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com"),
                                               U2: profile("u2@example.com")})
    mailer = FakeMailer(results={"u1@example.com": ["failed"]})
    result = await run(admin, mailer, quotes)
    assert result["failed"] == 1 and result["emailed"] == 1 and result["rate_limited"] is False
    assert len(admin.pending_ids()) == 1

    later = IN_OPEN + timedelta(minutes=15)
    result = await run(admin, mailer, quotes, now=later)
    assert result["emailed"] == 1 and result["failed"] == 0
    assert mailer.sent[-1]["to"] == "u1@example.com"
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_us_run_retries_pending_in_events():
    old = {"id": uid(50, "e"), "alert_id": uid(1), "user_id": U1, "price": 10.0,
           "triggered_at": (IN_OPEN - timedelta(hours=1)).isoformat(), "emailed": False,
           "claimed_at": None}
    admin = FakeAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 1, active=False)],
                      events=[old], profiles={U1: profile("u1@example.com")})
    mailer = FakeMailer()
    result = await run(admin, mailer, FakeQuotes({}), market="us", force=True)
    assert result["market"] == "us" and result["emailed"] == 1
    assert "AAA.NS" in mailer.sent[0]["text"]


@pytest.mark.asyncio
async def test_events_older_than_24h_expire_without_email():
    stale = {"id": uid(60, "e"), "alert_id": uid(1), "user_id": U1, "price": 10.0,
             "triggered_at": (IN_OPEN - timedelta(hours=25)).isoformat(), "emailed": False,
             "claimed_at": None}
    fresh = {"id": uid(61, "e"), "alert_id": uid(1), "user_id": U1, "price": 11.0,
             "triggered_at": (IN_OPEN - timedelta(hours=23)).isoformat(), "emailed": False,
             "claimed_at": None}
    admin = FakeAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 1, active=False)],
                      events=[stale, fresh], profiles={U1: profile("u1@example.com")})
    mailer = FakeMailer()
    result = await run(admin, mailer, FakeQuotes({}))
    assert result["expired"] == 1 and result["emailed"] == 1
    assert len(mailer.sent) == 1 and "11.00" in mailer.sent[0]["text"]
    assert admin.calls.index("expire_events") < admin.calls.index("pending_events")


@pytest.mark.asyncio
async def test_exception_for_one_user_does_not_block_others():
    alerts = [make_alert(1, U1, "AAA.NS", "above", 1), make_alert(2, U2, "BBB.NS", "above", 1)]
    quotes = FakeQuotes({"AAA.NS": {"price": 10.0}, "BBB.NS": {"price": 10.0}})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com"),
                                               U2: profile("u2@example.com")})
    admin.fail_claim_for = {U1}
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result["errors"] == ["RuntimeError"]
    assert result["emailed"] == 1
    assert {m["to"] for m in mailer.sent} == {"u2@example.com"}
    pending = {e["user_id"] for e in admin.events if not e["emailed"]}
    assert pending == {U1}


@pytest.mark.asyncio
async def test_emails_are_sent_sequentially():
    import asyncio

    alerts = [make_alert(i, u, f"S{i}.NS", "above", 1) for i, u in enumerate((U1, U2, U3), 1)]
    quotes = FakeQuotes({f"S{i}.NS": {"price": 10.0} for i in (1, 2, 3)})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com"),
                                               U2: profile("u2@example.com"),
                                               U3: profile("u3@example.com")})

    class SlowMailer(FakeMailer):
        in_flight = 0
        max_in_flight = 0

        async def send(self, *args, **kwargs):
            SlowMailer.in_flight += 1
            SlowMailer.max_in_flight = max(SlowMailer.max_in_flight, SlowMailer.in_flight)
            await asyncio.sleep(0)
            try:
                return await super().send(*args, **kwargs)
            finally:
                SlowMailer.in_flight -= 1

    mailer = SlowMailer()
    result = await run(admin, mailer, quotes)
    assert result["emailed"] == 3 and SlowMailer.max_in_flight == 1


# ---- claims: no duplicate emails -------------------------------------------


def three_users_admin():
    alerts = [make_alert(i, u, f"S{i}.NS", "above", 1) for i, u in enumerate((U1, U2, U3), 1)]
    quotes = FakeQuotes({f"S{i}.NS": {"price": 10.0} for i in (1, 2, 3)})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com"),
                                               U2: profile("u2@example.com"),
                                               U3: profile("u3@example.com")})
    return admin, quotes


@pytest.mark.asyncio
async def test_overlapping_run_during_a_send_sends_one_email_per_user():
    """Run B executes entirely while run A is mid-send to the first user."""
    admin, quotes = three_users_admin()
    results = {}

    class InterleavingMailer(FakeMailer):
        started = False

        async def send(self, *args, **kwargs):
            if not self.started:
                self.started = True
                results["b"] = await run(admin, mailer, quotes)
            return await super().send(*args, **kwargs)

    mailer = InterleavingMailer()
    results["a"] = await run(admin, mailer, quotes)
    sent_to = sorted(m["to"] for m in mailer.sent)
    assert sent_to == ["u1@example.com", "u2@example.com", "u3@example.com"]
    assert results["a"]["emailed"] + results["b"]["emailed"] == 3
    assert results["a"]["triggered"] + results["b"]["triggered"] == 3
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_overlapping_run_between_pending_read_and_claim_sends_nothing_twice():
    """Run B executes entirely after run A read the pending events but before it claims."""
    admin, quotes = three_users_admin()
    mailer = FakeMailer()
    results = {}

    async def run_b():
        results["b"] = await run(admin, mailer, quotes)

    admin.hooks["profiles"] = run_b  # fires on run A's profiles() call
    results["a"] = await run(admin, mailer, quotes)
    assert sorted(m["to"] for m in mailer.sent) == [
        "u1@example.com", "u2@example.com", "u3@example.com"]
    assert results["b"]["emailed"] == 3
    assert results["a"]["emailed"] == 0 and results["a"]["errors"] == []


@pytest.mark.asyncio
async def test_concurrent_runs_with_gather_send_one_email_per_user():
    import asyncio

    admin, quotes = three_users_admin()

    class YieldingMailer(FakeMailer):
        async def send(self, *args, **kwargs):
            await asyncio.sleep(0)
            return await super().send(*args, **kwargs)

    mailer = YieldingMailer()
    a, b = await asyncio.gather(run(admin, mailer, quotes), run(admin, mailer, quotes))
    assert sorted(m["to"] for m in mailer.sent) == [
        "u1@example.com", "u2@example.com", "u3@example.com"]
    assert a["emailed"] + b["emailed"] == 3


def claimed_event(n, user, claimed_minutes_ago, now=IN_OPEN):
    return {"id": uid(n, "e"), "alert_id": uid(1), "user_id": user, "price": 10.0,
            "triggered_at": (now - timedelta(hours=1)).isoformat(), "emailed": False,
            "claimed_at": (now - timedelta(minutes=claimed_minutes_ago)).isoformat()}


@pytest.mark.asyncio
async def test_stale_claim_is_reclaimed_and_fresh_claim_is_left_alone():
    admin = FakeAdmin(alerts=[make_alert(1, U1, "AAA.NS", "above", 1, active=False)],
                      events=[claimed_event(80, U1, 11), claimed_event(81, U2, 5)],
                      profiles={U1: profile("u1@example.com"), U2: profile("u2@example.com")})
    mailer = FakeMailer()
    result = await run(admin, mailer, FakeQuotes({}))
    assert [m["to"] for m in mailer.sent] == ["u1@example.com"]
    assert result["emailed"] == 1 and result["errors"] == []
    assert admin.pending_ids() == {uid(81, "e")}


@pytest.mark.asyncio
async def test_failed_send_releases_the_claim():
    admin, quotes = three_users_admin()
    mailer = FakeMailer(results={"u2@example.com": ["failed"]})
    result = await run(admin, mailer, quotes)
    assert result["failed"] == 1 and result["emailed"] == 2
    assert "release_events" in admin.calls
    assert admin.claimed_ids() == set()  # released, so the next run retries at once
    assert len(admin.pending_ids()) == 1


@pytest.mark.asyncio
async def test_rate_limit_releases_the_claim():
    admin, quotes = three_users_admin()
    mailer = FakeMailer(results={"u1@example.com": ["rate_limited"]})
    result = await run(admin, mailer, quotes)
    assert result["rate_limited"] is True
    assert admin.claimed_ids() == set()
    assert admin.calls.count("claim_events") == 1  # later users are never claimed


# ---- mark_emailed failure after a successful send ---------------------------


@pytest.mark.asyncio
async def test_mark_emailed_is_retried_once():
    admin, quotes = three_users_admin()
    admin.fail_mark_times = {U1: 1}
    result = await run(admin, FakeMailer(), quotes)
    assert result["errors"] == [] and result["emailed"] == 3
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_mark_emailed_failing_twice_keeps_claim_and_reports_error():
    admin, quotes = three_users_admin()
    admin.fail_mark_times = {U1: 2}
    mailer = FakeMailer()
    result = await run(admin, mailer, quotes)
    assert result["errors"] == ["mark_emailed"]
    assert result["emailed"] == 3  # the email did go out
    u1_events = {e["id"] for e in admin.events if e["user_id"] == U1}
    assert admin.pending_ids() == u1_events
    assert admin.claimed_ids() == u1_events  # still claimed, not released
    assert "release_events" not in admin.calls

    # a run 5 minutes later must not re-send (the claim is still fresh)
    result = await run(admin, mailer, quotes, now=IN_OPEN + timedelta(minutes=5))
    assert result["emailed"] == 0
    assert len(mailer.sent) == 3


# ---- permanent Brevo errors -------------------------------------------------


@pytest.mark.asyncio
async def test_invalid_send_is_marked_done_and_counted():
    admin, quotes = three_users_admin()
    mailer = FakeMailer(results={"u2@example.com": ["invalid"]})
    result = await run(admin, mailer, quotes)
    assert result["invalid"] == 1 and result["emailed"] == 2 and result["failed"] == 0
    assert result["errors"] == []
    assert admin.pending_ids() == set()


@pytest.mark.asyncio
async def test_auth_error_stops_sending_and_releases():
    admin, quotes = three_users_admin()
    mailer = FakeMailer(results={"u1@example.com": ["auth_error"]})
    result = await run(admin, mailer, quotes)
    assert result["errors"] == ["brevo_auth"]
    assert result["emailed"] == 0
    assert len(mailer.sent) == 1
    assert admin.claimed_ids() == set()
    assert len(admin.pending_ids()) == 3


# ---- symbols ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_overlong_symbol_is_skipped_and_reported():
    long_symbol = "X" * 33
    alerts = [make_alert(1, U1, long_symbol, "above", 1), make_alert(2, U1, "AAA.NS", "above", 1)]
    quotes = FakeQuotes({long_symbol: {"price": 10.0}, "AAA.NS": {"price": 10.0}})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com")})
    result = await run(admin, FakeMailer(), quotes)
    assert result["errors"] == ["bad_symbol"]
    assert result["triggered"] == 1 and result["symbols"] == 1
    assert quotes.chunks == [["AAA.NS"]]


@pytest.mark.asyncio
async def test_symbols_are_normalized_for_quote_lookup():
    alerts = [
        make_alert(1, U1, "reliance", "above", 1),  # bare lowercase IN symbol
        make_alert(2, U1, "tcs.bo", "above", 1),
        make_alert(3, U1, "^nsei", "above", 1),
        make_alert(4, U1, "RELIANCE.NS", "below", 99999),  # same key as #1
    ]
    quotes = FakeQuotes({"RELIANCE.NS": {"price": 10.0}, "TCS.BO": {"price": 10.0},
                         "^NSEI": {"price": 10.0}})
    admin = FakeAdmin(alerts=alerts, profiles={U1: profile("u1@example.com")})
    result = await run(admin, FakeMailer(), quotes)
    assert quotes.chunks == [["RELIANCE.NS", "TCS.BO", "^NSEI"]]
    assert result["symbols"] == 3 and result["triggered"] == 4


@pytest.mark.asyncio
async def test_us_symbols_are_uppercased_without_suffix():
    admin = FakeAdmin(alerts=[make_alert(1, U1, "aapl", "above", 1, market="us")],
                      profiles={U1: profile("u1@example.com")})
    quotes = FakeQuotes({"AAPL": {"price": 10.0}})
    now_us = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc)  # 11:00 ET
    result = await run(admin, FakeMailer(), quotes, now=now_us, market="us")
    assert quotes.chunks == [["AAPL"]] and result["triggered"] == 1
