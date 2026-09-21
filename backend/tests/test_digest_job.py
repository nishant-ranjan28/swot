import asyncio
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest

from services.digest_job import digest_date_for, is_after_close, run_daily_digest

APP_URL = "https://app.example.com"
# Tue 2026-09-22 17:00 IST (11:30 UTC): after the IN close; US still open.
IN_AFTER = datetime(2026, 9, 22, 11, 30, tzinfo=timezone.utc)
# Tue 2026-09-22 17:30 EDT (21:30 UTC): after the US close.
US_AFTER = datetime(2026, 9, 22, 21, 30, tzinfo=timezone.utc)
# Sat 2026-09-19: weekend.
WEEKEND = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)


def uid(n: int, prefix: str = "b") -> str:
    return f"{prefix * 8}-{prefix * 4}-4{prefix * 3}-8{prefix * 3}-{n:012d}"


U1, U2, U3 = uid(1), uid(2), uid(3)


class FakeAdmin:
    """In-memory stand-in for SupabaseAdmin's digest methods."""

    def __init__(self, recipients=(), watchlists=None, rows=None):
        self.recipient_rows = [dict(r) for r in recipients]
        self.watchlist_rows = watchlists or {}
        # (user_id, market, date) -> {"status", "stale"}
        self.rows: dict = dict(rows or {})
        self.calls: list = []
        self.fail_claim_for: set = set()
        self.fail_finish_times = 0
        self.claim_seq = 0
        self.finish_claims: list = []

    async def digest_recipients(self, market):
        self.calls.append(("digest_recipients", market))
        return [dict(r) for r in self.recipient_rows]

    async def watchlists(self, user_ids, market):
        self.calls.append(("watchlists", tuple(user_ids), market))
        return {u: [dict(i) for i in self.watchlist_rows[u]]
                for u in user_ids if u in self.watchlist_rows}

    async def claim_digest(self, user_id, market, digest_date):
        self.calls.append(("claim_digest", user_id, market, digest_date))
        if user_id in self.fail_claim_for:
            raise RuntimeError("boom")
        key = (user_id, market, digest_date)
        row = self.rows.get(key)
        if row is None or row["status"] == "failed" or (
            row["status"] == "claimed" and row["stale"]
        ):
            self.claim_seq += 1
            claimed_at = f"2026-09-22T11:30:00.{self.claim_seq:06d}+00:00"
            self.rows[key] = {"status": "claimed", "stale": False, "claimed_at": claimed_at}
            return claimed_at
        return None

    async def finish_digest(self, user_id, market, digest_date, status, claimed_at):
        self.calls.append(("finish_digest", user_id, status))
        self.finish_claims.append(claimed_at)
        if self.fail_finish_times:
            self.fail_finish_times -= 1
            raise RuntimeError("boom")
        row = self.rows[(user_id, market, digest_date)]
        if row.get("claimed_at") == claimed_at:  # the real filter: claimed_at=eq.<ts>
            row["status"] = status

    def status(self, user_id, market="in", digest_date="2026-09-22"):
        row = self.rows.get((user_id, market, digest_date))
        return row and row["status"]


class FakeMailer:
    def __init__(self, results=None):
        self.results = results or {}  # email -> list of statuses, popped in order
        self.sent: list = []

    async def send(self, to_email, to_name, subject, html, text, tag="price-alert"):
        self.sent.append({"to": to_email, "name": to_name, "subject": subject,
                          "html": html, "text": text, "tag": tag})
        queue = self.results.get(to_email)
        return queue.pop(0) if queue else "sent"


class FakeLLM:
    def __init__(self, replies=None, max_calls=60):
        self.replies = list(replies) if replies is not None else None
        self.max_calls = max_calls
        self.calls = 0
        self.budget_exhausted = False
        self.prompts: list = []

    async def summarize(self, messages):
        if self.calls >= self.max_calls:
            self.budget_exhausted = True
            return None
        self.calls += 1
        self.prompts.append(messages)
        if self.replies is None:
            return "Stocks were mixed today."
        return self.replies.pop(0) if self.replies else None


class FakeQuotes:
    def __init__(self, quotes=None):
        self.quotes = quotes or {}
        self.chunks: list = []

    def __call__(self, symbols):
        self.chunks.append(list(symbols))
        return {s: self.quotes[s] for s in symbols if s in self.quotes}


class FakeNews:
    def __init__(self, news=None, delay=0.0, fail=(), hang=()):
        self.news = news or {}
        self.delay = delay
        self.fail = set(fail)
        self.hang = set(hang)
        self.calls: list = []
        self.active = 0
        self.peak = 0
        self._lock = threading.Lock()
        self.release = threading.Event()

    def __call__(self, symbol):
        with self._lock:
            self.calls.append(symbol)
            self.active += 1
            self.peak = max(self.peak, self.active)
        try:
            if symbol in self.hang:
                self.release.wait(5)
            if self.delay:
                time.sleep(self.delay)
            if symbol in self.fail:
                raise ValueError("news down")
            return list(self.news.get(symbol, []))
        finally:
            with self._lock:
                self.active -= 1


def recipient(user_id, email, name="Asha"):
    return {"id": user_id, "email": email, "display_name": name}


def item(symbol, name=None):
    return {"symbol": symbol, "name": name or f"{symbol} Ltd"}


def quote(price, change, pct):
    return {"price": price, "change": change, "change_percent": pct}


class FakeClock:
    """Monotonic clock the test moves by hand."""

    def __init__(self, t=0.0):
        self.t = t

    def __call__(self):
        return self.t


class ClockMailer(FakeMailer):
    """Each send takes ``step`` seconds on the fake clock."""

    def __init__(self, clock, step, results=None):
        super().__init__(results)
        self.clock = clock
        self.step = step

    async def send(self, *args, **kwargs):
        self.clock.t += self.step
        return await super().send(*args, **kwargs)


async def run(admin, *, mailer=None, llm=None, quotes=None, news=None, now=IN_AFTER,
              market="in", force=False, **extra):
    return await run_daily_digest(
        market, admin=admin, mailer=mailer or FakeMailer(), llm=llm or FakeLLM(),
        get_quotes=quotes or FakeQuotes(), get_news=news or FakeNews(), now_utc=now,
        force=force, app_url=APP_URL, **extra,
    )


def assert_counts_add_up(result):
    attempted = (result["emailed"] + result["failed"] + result["invalid"]
                 + result["already_sent"] + result["deferred"])
    assert attempted == result["recipients"] - result["empty"]


# ---- timing -----------------------------------------------------------------


@pytest.mark.parametrize("now,expected_date,after", [
    # IN, around IST midnight (UTC+5:30)
    (datetime(2026, 9, 22, 10, 29, tzinfo=timezone.utc), "2026-09-22", False),  # 15:59 IST
    (datetime(2026, 9, 22, 10, 30, tzinfo=timezone.utc), "2026-09-22", True),   # 16:00 IST
    (datetime(2026, 9, 22, 18, 29, tzinfo=timezone.utc), "2026-09-22", True),   # 23:59 IST Tue
    (datetime(2026, 9, 22, 18, 31, tzinfo=timezone.utc), "2026-09-23", False),  # 00:01 IST Wed
    (datetime(2026, 9, 18, 18, 29, tzinfo=timezone.utc), "2026-09-18", True),   # 23:59 IST Fri
    (datetime(2026, 9, 18, 18, 31, tzinfo=timezone.utc), "2026-09-19", False),  # 00:01 IST Sat
    (datetime(2026, 9, 19, 11, 30, tzinfo=timezone.utc), "2026-09-19", False),  # Sat 17:00 IST
])
def test_in_timing_and_date(now, expected_date, after):
    assert digest_date_for("in", now) == expected_date
    assert is_after_close("in", now) is after


@pytest.mark.parametrize("now,expected_date,after", [
    # US, around ET midnight (EDT = UTC-4 in September)
    (datetime(2026, 9, 22, 20, 29, tzinfo=timezone.utc), "2026-09-22", False),  # 16:29 EDT
    (datetime(2026, 9, 22, 20, 30, tzinfo=timezone.utc), "2026-09-22", True),   # 16:30 EDT
    (datetime(2026, 9, 23, 3, 59, tzinfo=timezone.utc), "2026-09-22", True),    # 23:59 EDT Tue
    (datetime(2026, 9, 23, 4, 1, tzinfo=timezone.utc), "2026-09-23", False),    # 00:01 EDT Wed
    # the UTC date is already Saturday, but it's still Friday evening in New York
    (datetime(2026, 9, 19, 2, 0, tzinfo=timezone.utc), "2026-09-18", True),     # 22:00 EDT Fri
    (datetime(2026, 9, 19, 4, 30, tzinfo=timezone.utc), "2026-09-19", False),   # 00:30 EDT Sat
])
def test_us_timing_and_date(now, expected_date, after):
    assert digest_date_for("us", now) == expected_date
    assert is_after_close("us", now) is after


@pytest.mark.parametrize("now,expected_date,after", [
    # DST ends Sun 2026-11-01. Fri 30 Oct is EDT (UTC-4), Mon 2 Nov is EST (UTC-5).
    (datetime(2026, 10, 30, 20, 30, tzinfo=timezone.utc), "2026-10-30", True),  # 16:30 EDT
    (datetime(2026, 11, 2, 20, 30, tzinfo=timezone.utc), "2026-11-02", False),  # 15:30 EST
    (datetime(2026, 11, 2, 21, 29, tzinfo=timezone.utc), "2026-11-02", False),  # 16:29 EST
    (datetime(2026, 11, 2, 21, 30, tzinfo=timezone.utc), "2026-11-02", True),   # 16:30 EST
    (datetime(2026, 11, 3, 4, 59, tzinfo=timezone.utc), "2026-11-02", True),    # 23:59 EST
    (datetime(2026, 11, 3, 5, 1, tzinfo=timezone.utc), "2026-11-03", False),    # 00:01 EST
    # DST starts Sun 2026-03-08. Fri 6 Mar is EST, Mon 9 Mar is EDT.
    (datetime(2026, 3, 6, 20, 30, tzinfo=timezone.utc), "2026-03-06", False),   # 15:30 EST
    (datetime(2026, 3, 9, 20, 30, tzinfo=timezone.utc), "2026-03-09", True),    # 16:30 EDT
    (datetime(2026, 3, 10, 3, 59, tzinfo=timezone.utc), "2026-03-09", True),    # 23:59 EDT
    (datetime(2026, 3, 10, 4, 1, tzinfo=timezone.utc), "2026-03-10", False),    # 00:01 EDT
])
def test_us_dst_boundary(now, expected_date, after):
    assert digest_date_for("us", now) == expected_date
    assert is_after_close("us", now) is after


def test_both_crons_count_as_after_close_in_both_dst_states():
    # IN cron 0 11 * * 1-5 -> 16:30 IST; US cron 30 21 * * 1-5 -> 17:30 EDT / 16:30 EST
    assert is_after_close("in", datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc))
    assert is_after_close("us", datetime(2026, 9, 22, 21, 30, tzinfo=timezone.utc))
    assert is_after_close("us", datetime(2026, 12, 1, 21, 30, tzinfo=timezone.utc))


@pytest.mark.parametrize("market,first,retry", [
    # IN: 0 11 / 0 12 UTC -> 16:30 / 17:30 IST
    ("in", datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc),
     datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)),
    # US summer: 30 21 / 30 22 UTC -> 17:30 / 18:30 EDT
    ("us", datetime(2026, 9, 22, 21, 30, tzinfo=timezone.utc),
     datetime(2026, 9, 22, 22, 30, tzinfo=timezone.utc)),
    # US winter: 16:30 / 17:30 EST
    ("us", datetime(2026, 12, 1, 21, 30, tzinfo=timezone.utc),
     datetime(2026, 12, 1, 22, 30, tzinfo=timezone.utc)),
])
def test_retry_cron_is_after_close_on_the_same_local_date(market, first, retry):
    assert is_after_close(market, first) and is_after_close(market, retry)
    assert digest_date_for(market, first) == digest_date_for(market, retry)


def test_naive_datetime_is_taken_as_utc():
    assert digest_date_for("in", datetime(2026, 9, 22, 18, 31)) == "2026-09-23"


@pytest.mark.asyncio
async def test_not_after_close_is_skipped_without_touching_anything():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer, llm = FakeMailer(), FakeLLM()
    result = await run(admin, mailer=mailer, llm=llm, now=WEEKEND)
    assert result == {"market": "in", "digest_date": "2026-09-19",
                      "skipped": "not_after_close"}
    assert admin.calls == [] and mailer.sent == [] and llm.calls == 0


@pytest.mark.asyncio
async def test_force_bypasses_timing_and_uses_market_local_date():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, now=WEEKEND, force=True)
    assert "skipped" not in result
    assert result["digest_date"] == "2026-09-19"
    assert result["emailed"] == 1 and len(mailer.sent) == 1
    assert admin.status(U1, digest_date="2026-09-19") == "sent"


# ---- happy path + result shape ---------------------------------------------------


@pytest.mark.asyncio
async def test_one_email_per_user_and_result_shape():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com", "Asha"),
                    recipient(U2, "u2@example.com", "Ravi"),
                    recipient(U3, "u3@example.com", "Mo")],
        watchlists={U1: [item("RELIANCE"), item("TCS.NS")], U2: [item("INFY")]},
    )
    quotes = FakeQuotes({"RELIANCE.NS": quote(2600, 26, 1.0), "TCS.NS": quote(4000, -40, -1.0),
                         "INFY.NS": quote(1500, 15, 1.0)})
    news = FakeNews({"RELIANCE.NS": [{"title": "Reliance rallies",
                                      "url": "https://news.example.com/r",
                                      "source": "Wire", "sentiment_label": "Bullish"}]})
    mailer, llm = FakeMailer(), FakeLLM()
    result = await run(admin, mailer=mailer, llm=llm, quotes=quotes, news=news)
    assert result == {
        "market": "in", "digest_date": "2026-09-22", "recipients": 3, "empty": 1,
        "emailed": 2, "already_sent": 0, "failed": 0, "invalid": 0, "rate_limited": False,
        "deferred": 0, "ai_summaries": 2, "ai_fallbacks": 0, "llm_calls": 2,
        "budget_exhausted": False, "symbols": 3, "errors": [], "warnings": [],
    }
    assert [m["to"] for m in mailer.sent] == ["u1@example.com", "u2@example.com"]
    assert all(m["tag"] == "daily-digest" for m in mailer.sent)
    first = mailer.sent[0]
    assert first["name"] == "Asha"
    assert "1 up, 1 down" in first["subject"]
    assert "Reliance rallies" in first["html"] and "RELIANCE.NS" in first["text"]
    assert "Stocks were mixed today." in first["html"]
    assert admin.status(U1) == "sent" and admin.status(U2) == "sent"
    assert admin.status(U3) is None  # empty watchlist: never claimed


@pytest.mark.asyncio
async def test_prompt_uses_digest_date_and_has_no_user_info():
    admin = FakeAdmin(recipients=[recipient(U1, "secret.person@example.com", "Secret Name")],
                      watchlists={U1: [item("TCS")]})
    llm = FakeLLM()
    await run(admin, llm=llm)
    (messages,) = llm.prompts
    blob = str(messages)
    assert "22 Sep 2026" in blob and "TCS.NS" in blob
    for leaked in ("secret.person@example.com", "Secret Name", U1):
        assert leaked not in blob


@pytest.mark.asyncio
async def test_empty_watchlists_are_counted_and_nothing_fetched():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com"),
                                  recipient(U2, "u2@example.com")],
                      watchlists={U2: [{"symbol": "  ", "name": "blank"}]})
    quotes, news, mailer = FakeQuotes(), FakeNews(), FakeMailer()
    result = await run(admin, mailer=mailer, quotes=quotes, news=news)
    assert result["recipients"] == 2 and result["empty"] == 2
    assert result["emailed"] == 0 and result["symbols"] == 0
    assert quotes.chunks == [] and news.calls == [] and mailer.sent == []


@pytest.mark.asyncio
async def test_no_recipients():
    admin = FakeAdmin()
    result = await run(admin)
    assert result["recipients"] == 0 and result["errors"] == []
    assert ("watchlists", (), "in") not in admin.calls


# ---- idempotency ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_already_claimed_user_is_skipped():
    key = (U1, "in", "2026-09-22")
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com"),
                                  recipient(U2, "u2@example.com")],
                      watchlists={U1: [item("TCS")], U2: [item("TCS")]},
                      rows={key: {"status": "sent", "stale": False}})
    mailer, llm = FakeMailer(), FakeLLM()
    result = await run(admin, mailer=mailer, llm=llm)
    assert result["already_sent"] == 1 and result["emailed"] == 1
    assert [m["to"] for m in mailer.sent] == ["u2@example.com"]
    assert llm.calls == 1  # no LLM call for the skipped user


@pytest.mark.asyncio
async def test_fresh_claim_by_another_run_is_skipped():
    key = (U1, "in", "2026-09-22")
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]},
                      rows={key: {"status": "claimed", "stale": False}})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer)
    assert result["already_sent"] == 1 and mailer.sent == []


@pytest.mark.asyncio
@pytest.mark.parametrize("row", [{"status": "claimed", "stale": True},
                                 {"status": "failed", "stale": False}])
async def test_stale_or_failed_claim_is_reclaimed(row):
    key = (U1, "in", "2026-09-22")
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]}, rows={key: dict(row)})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer)
    assert result["emailed"] == 1 and result["already_sent"] == 0
    assert len(mailer.sent) == 1 and admin.status(U1) == "sent"


@pytest.mark.asyncio
async def test_second_run_same_day_sends_nothing():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    await run(admin, mailer=mailer)
    result = await run(admin, mailer=mailer)
    assert result["emailed"] == 0 and result["already_sent"] == 1
    assert len(mailer.sent) == 1


# ---- mailer statuses -------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status,counter,row_status", [
    ("sent", "emailed", "sent"),
    ("failed", "failed", "failed"),
    ("invalid", "invalid", "skipped"),
])
async def test_mailer_status_mapping(status, counter, row_status):
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    result = await run(admin, mailer=FakeMailer({"u1@example.com": [status]}))
    assert result[counter] == 1
    for other in {"emailed", "failed", "invalid"} - {counter}:
        assert result[other] == 0
    assert result["errors"] == [] and result["rate_limited"] is False
    assert admin.status(U1) == row_status


@pytest.mark.asyncio
async def test_rate_limit_stops_the_run_and_leaves_the_rest_unclaimed():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com"),
                    recipient(U3, "u3@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")], U3: [item("TCS")]},
    )
    mailer = FakeMailer({"u2@example.com": ["rate_limited"]})
    result = await run(admin, mailer=mailer)
    assert result["rate_limited"] is True
    # U2's send was lost (row failed, retried later); U3 was never attempted
    assert result["emailed"] == 1 and result["failed"] == 1 and result["deferred"] == 1
    assert result["errors"] == [] and "notes" not in result
    assert_counts_add_up(result)
    assert [m["to"] for m in mailer.sent] == ["u1@example.com", "u2@example.com"]
    assert admin.status(U1) == "sent"
    assert admin.status(U2) == "failed"  # reclaimable by the next run
    assert admin.status(U3) is None  # never claimed
    # the next run picks up U2 and U3
    mailer2 = FakeMailer()
    result = await run(admin, mailer=mailer2)
    assert [m["to"] for m in mailer2.sent] == ["u2@example.com", "u3@example.com"]
    assert result["already_sent"] == 1


@pytest.mark.asyncio
async def test_same_day_retry_run_picks_up_failed_and_unreached_users():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com"),
                    recipient(U3, "u3@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")], U3: [item("TCS")]},
    )
    first = await run(admin, mailer=FakeMailer({"u1@example.com": ["failed"],
                                                "u2@example.com": ["rate_limited"]}))
    assert first["failed"] == 2 and first["deferred"] == 1 and first["rate_limited"] is True
    assert admin.status(U1) == admin.status(U2) == "failed" and admin.status(U3) is None
    # the retry cron, an hour later on the same local date
    mailer = FakeMailer()
    retry = await run(admin, mailer=mailer,
                      now=datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc))
    assert retry["digest_date"] == first["digest_date"]
    assert [m["to"] for m in mailer.sent] == ["u1@example.com", "u2@example.com",
                                             "u3@example.com"]
    assert retry["emailed"] == 3 and retry["already_sent"] == 0
    # a third run that day sends nothing
    third = await run(admin, mailer=FakeMailer())
    assert third["already_sent"] == 3 and third["emailed"] == 0


@pytest.mark.asyncio
async def test_brevo_auth_error_stops_the_run_with_error():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")]},
    )
    mailer = FakeMailer({"u1@example.com": ["auth_error"]})
    result = await run(admin, mailer=mailer)
    assert result["errors"] == ["brevo_auth"]
    assert result["rate_limited"] is False and result["emailed"] == 0
    assert result["failed"] == 1 and result["deferred"] == 1
    assert_counts_add_up(result)
    assert len(mailer.sent) == 1
    assert admin.status(U1) == "failed" and admin.status(U2) is None


# ---- LLM ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_none_means_no_summary_and_a_fallback():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, llm=FakeLLM(replies=[]))
    assert result["ai_summaries"] == 0 and result["ai_fallbacks"] == 1
    assert result["emailed"] == 1 and result["errors"] == []
    assert "AI summary" not in mailer.sent[0]["html"]
    assert "AI summary" not in mailer.sent[0]["text"]


@pytest.mark.asyncio
async def test_llm_output_that_sanitizes_to_nothing_is_a_fallback():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, llm=FakeLLM(replies=["  ** ## "]))
    assert result["ai_summaries"] == 0 and result["ai_fallbacks"] == 1
    assert "AI summary" not in mailer.sent[0]["html"]


@pytest.mark.asyncio
async def test_llm_output_is_sanitized_and_escaped():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer,
                       llm=FakeLLM(replies=["**TCS** fell. <script>alert(1)</script> Done"]))
    html = mailer.sent[0]["html"]
    assert "<script>" not in html and "**" not in html
    assert "TCS fell. Done" in html
    assert result["ai_summaries"] == 1 and result["ai_fallbacks"] == 0


@pytest.mark.asyncio
async def test_llm_output_with_a_bare_domain_is_dropped_as_a_fallback():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer,
                       llm=FakeLLM(replies=["**TCS** fell. See evil.com"]))
    html = mailer.sent[0]["html"]
    assert "evil.com" not in html and "AI summary" not in html
    assert result["emailed"] == 1
    assert result["ai_summaries"] == 0 and result["ai_fallbacks"] == 1


@pytest.mark.asyncio
async def test_budget_exhausted_later_users_get_no_summary():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com"),
                    recipient(U3, "u3@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("INFY")], U3: [item("WIPRO")]},
    )
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, llm=FakeLLM(max_calls=1))
    assert result["emailed"] == 3
    assert result["ai_summaries"] == 1 and result["ai_fallbacks"] == 2
    assert result["llm_calls"] == 1 and result["budget_exhausted"] is True
    assert "AI summary" in mailer.sent[0]["html"]
    assert all("AI summary" not in m["html"] for m in mailer.sent[1:])


# ---- market data ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_symbols_are_normalized_and_deduped_across_users():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com")],
        watchlists={U1: [item("reliance"), item("TCS.NS"), item("RELIANCE.NS")],
                    U2: [item(" RELIANCE "), item("^NSEI"), item("INFY.BO")]},
    )
    quotes = FakeQuotes({"RELIANCE.NS": quote(2600, 26, 1.0)})
    news = FakeNews()
    mailer, llm = FakeMailer(), FakeLLM()
    result = await run(admin, mailer=mailer, llm=llm, quotes=quotes, news=news)
    assert result["symbols"] == 4
    assert quotes.chunks == [["RELIANCE.NS", "TCS.NS", "^NSEI", "INFY.BO"]]
    assert sorted(news.calls) == sorted(["RELIANCE.NS", "TCS.NS", "^NSEI", "INFY.BO"])
    # U1's duplicate RELIANCE entries appear once in their email
    assert mailer.sent[0]["text"].count("- RELIANCE.NS") == 1
    assert "2,600.00" in mailer.sent[0]["text"]


@pytest.mark.asyncio
async def test_us_symbols_are_not_suffixed():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("aapl")]})
    quotes, news, mailer = FakeQuotes({"AAPL": quote(180, 1, 0.5)}), FakeNews(), FakeMailer()
    result = await run(admin, mailer=mailer, quotes=quotes, news=news, market="us",
                       now=US_AFTER)
    assert result["emailed"] == 1
    assert quotes.chunks == [["AAPL"]] and news.calls == ["AAPL"]
    assert "$180.00" in mailer.sent[0]["text"]


@pytest.mark.asyncio
async def test_quotes_are_fetched_in_chunks_of_20():
    users = [uid(n, "c") for n in range(4)]
    admin = FakeAdmin(
        recipients=[recipient(u, f"c{n}@example.com") for n, u in enumerate(users)],
        watchlists={u: [item(f"S{n}{i:02d}") for i in range(12)] for n, u in enumerate(users)},
    )
    quotes = FakeQuotes()
    result = await run(admin, quotes=quotes)
    assert [len(c) for c in quotes.chunks] == [20, 20, 8]
    assert result["symbols"] == 48


@pytest.mark.asyncio
async def test_email_covers_at_most_12_symbols_in_watchlist_order():
    symbols = [f"S{i:02d}" for i in range(15)]
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item(s) for s in symbols]})
    mailer, news = FakeMailer(), FakeNews()
    result = await run(admin, mailer=mailer, news=news)
    # only the symbols that appear in an email are fetched
    assert result["symbols"] == 12 and len(news.calls) == 12
    text = mailer.sent[0]["text"]
    assert "S00.NS" in text and "S11.NS" in text
    assert "S12.NS" not in text
    assert text.index("S00.NS") < text.index("S05.NS") < text.index("S11.NS")


@pytest.mark.asyncio
async def test_news_concurrency_is_capped_at_5():
    symbols = [f"S{i:02d}" for i in range(12)]
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item(s) for s in symbols]})
    news = FakeNews(delay=0.05)
    result = await run(admin, news=news)
    assert len(news.calls) == 12
    assert news.peak == 5
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_news_failure_is_recorded_and_the_email_still_goes_out():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS"), item("INFY")]})
    news = FakeNews({"INFY.NS": [{"title": "Infosys wins deal", "url": "https://x.example/i"}]},
                    fail={"TCS.NS"})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, news=news)
    assert result["warnings"] == ["news:ValueError"]
    assert result["errors"] == []
    assert result["emailed"] == 1
    assert "Infosys wins deal" in mailer.sent[0]["html"]


@pytest.mark.asyncio
async def test_news_timeout_is_recorded(monkeypatch):
    import services.digest_job as digest_job

    monkeypatch.setattr(digest_job, "NEWS_TIMEOUT_SECONDS", 0.05)
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS"), item("INFY")]})
    news = FakeNews(hang={"TCS.NS"})
    mailer = FakeMailer()
    try:
        result = await run(admin, mailer=mailer, news=news)
    finally:
        news.release.set()  # let the abandoned worker thread finish
    assert result["warnings"] == ["news:TimeoutError"]
    assert result["errors"] == []
    assert result["emailed"] == 1


@pytest.mark.asyncio
async def test_quote_chunk_failure_is_recorded():
    def broken_quotes(symbols):
        raise ConnectionError("down")

    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, quotes=broken_quotes)
    assert result["warnings"] == ["quotes:ConnectionError"]
    assert result["errors"] == []
    assert result["emailed"] == 1  # sent without prices
    assert "TCS.NS" in mailer.sent[0]["text"]


@pytest.mark.asyncio
async def test_finish_digest_gets_the_claimed_at_from_claim_digest():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")]},
    )
    result = await run(admin)
    assert result["emailed"] == 2
    assert admin.finish_claims == [
        admin.rows[(U1, "in", "2026-09-22")]["claimed_at"],
        admin.rows[(U2, "in", "2026-09-22")]["claimed_at"],
    ]
    assert len(set(admin.finish_claims)) == 2
    assert admin.status(U1) == admin.status(U2) == "sent"


@pytest.mark.asyncio
async def test_exception_after_claim_finishes_with_the_claimed_at():
    class ExplodingMailer(FakeMailer):
        async def send(self, *args, **kwargs):
            raise RuntimeError("boom")

    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    await run(admin, mailer=ExplodingMailer())
    assert admin.finish_claims == [admin.rows[(U1, "in", "2026-09-22")]["claimed_at"]]


# ---- isolation ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_users_exception_does_not_block_others():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")]},
    )
    admin.fail_claim_for = {U1}
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer)
    assert result["errors"] == ["RuntimeError"]
    assert result["emailed"] == 1 and result["failed"] == 1
    assert_counts_add_up(result)
    assert [m["to"] for m in mailer.sent] == ["u2@example.com"]
    # the claim never happened, so it isn't marked failed
    assert ("finish_digest", U1, "failed") not in admin.calls


@pytest.mark.asyncio
async def test_exception_after_claim_marks_the_digest_failed():
    class ExplodingMailer(FakeMailer):
        async def send(self, *args, **kwargs):
            raise RuntimeError("boom")

    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    result = await run(admin, mailer=ExplodingMailer())
    assert result["errors"] == ["RuntimeError"]
    assert result["failed"] == 1 and result["emailed"] == 0
    assert admin.status(U1) == "failed"


@pytest.mark.asyncio
async def test_finish_failure_is_retried_once():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    admin.fail_finish_times = 1
    result = await run(admin)
    assert result["emailed"] == 1 and result["errors"] == []
    assert admin.status(U1) == "sent"


@pytest.mark.asyncio
async def test_finish_failing_twice_is_reported_but_counts_the_send():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    admin.fail_finish_times = 2
    result = await run(admin)
    assert result["emailed"] == 1
    assert result["errors"] == ["finish_digest"]


# ---- counts ------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_counts_add_up_across_mixed_outcomes():
    users = [uid(n, "d") for n in range(8)]
    emails = [f"d{n}@example.com" for n in range(8)]
    admin = FakeAdmin(
        recipients=[recipient(u, e) for u, e in zip(users, emails)],
        # users[7] has an empty watchlist
        watchlists={u: [item("TCS")] for u in users[:7]},
        rows={(users[0], "in", "2026-09-22"): {"status": "sent", "stale": False}},
    )
    admin.fail_claim_for = {users[4]}  # raises
    mailer = FakeMailer({emails[2]: ["invalid"], emails[3]: ["failed"],
                         emails[5]: ["rate_limited"]})
    result = await run(admin, mailer=mailer)
    assert result["recipients"] == 8 and result["empty"] == 1
    assert result["already_sent"] == 1  # users[0]
    assert result["emailed"] == 1       # users[1]
    assert result["invalid"] == 1       # users[2]
    assert result["failed"] == 3        # users[3] failed, users[4] raised, users[5] 429
    assert result["deferred"] == 1      # users[6], never attempted
    assert result["errors"] == ["RuntimeError"] and result["rate_limited"] is True
    assert_counts_add_up(result)


# ---- time budget -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_time_budget_stops_claiming_and_defers_the_rest():
    users = [uid(n, "e") for n in range(5)]
    admin = FakeAdmin(
        recipients=[recipient(u, f"e{n}@example.com") for n, u in enumerate(users)],
        watchlists={u: [item("TCS")] for u in users},
    )
    clock = FakeClock(1000.0)
    mailer = ClockMailer(clock, step=100)
    result = await run(admin, mailer=mailer, clock=clock, time_budget_s=240)
    # checks at t=0, 100, 200 pass; at 300 the budget is spent
    assert result["emailed"] == 3 and result["deferred"] == 2
    assert result["notes"] == ["time_budget"]
    assert result["errors"] == []
    assert [m["to"] for m in mailer.sent] == ["e0@example.com", "e1@example.com",
                                             "e2@example.com"]
    assert [c for c in admin.calls if c[0] == "claim_digest"] == [
        ("claim_digest", u, "in", "2026-09-22") for u in users[:3]]
    assert admin.status(users[3]) is None and admin.status(users[4]) is None
    assert_counts_add_up(result)
    # the same-day retry run picks up the deferred users
    mailer2 = FakeMailer()
    result2 = await run(admin, mailer=mailer2, clock=FakeClock(), time_budget_s=240)
    assert [m["to"] for m in mailer2.sent] == ["e3@example.com", "e4@example.com"]
    assert result2["deferred"] == 0 and "notes" not in result2


@pytest.mark.asyncio
async def test_time_budget_finishes_the_user_in_progress():
    admin = FakeAdmin(
        recipients=[recipient(U1, "u1@example.com"), recipient(U2, "u2@example.com")],
        watchlists={U1: [item("TCS")], U2: [item("TCS")]},
    )
    clock = FakeClock()
    # U1's send alone blows through the budget, but U1 is still finished
    mailer = ClockMailer(clock, step=500)
    result = await run(admin, mailer=mailer, clock=clock, time_budget_s=240)
    assert result["emailed"] == 1 and result["deferred"] == 1
    assert admin.status(U1) == "sent" and admin.status(U2) is None
    assert result["notes"] == ["time_budget"]


@pytest.mark.asyncio
async def test_time_budget_counts_market_data_fetching():
    class SlowQuotes(FakeQuotes):
        def __call__(self, symbols):
            clock.t += 300
            return super().__call__(symbols)

    clock = FakeClock()
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    mailer = FakeMailer()
    result = await run(admin, mailer=mailer, quotes=SlowQuotes(), clock=clock,
                       time_budget_s=240)
    assert mailer.sent == [] and result["deferred"] == 1
    assert result["notes"] == ["time_budget"]
    assert admin.calls[-1][0] != "claim_digest"


@pytest.mark.asyncio
async def test_default_time_budget_is_240_seconds():
    import inspect

    import services.digest_job as digest_job

    sig = inspect.signature(run_daily_digest)
    assert sig.parameters["time_budget_s"].default == digest_job.TIME_BUDGET_SECONDS == 240


@pytest.mark.asyncio
async def test_within_budget_has_no_notes_and_zero_deferred():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    result = await run(admin, clock=FakeClock())
    assert result["deferred"] == 0 and "notes" not in result


# ---- news executor ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hung_news_calls_do_not_starve_the_default_executor(monkeypatch):
    """Timed-out news threads live in their own pool, so get_quotes still runs."""
    import services.digest_job as digest_job

    monkeypatch.setattr(digest_job, "NEWS_TIMEOUT_SECONDS", 0.05)
    loop = asyncio.get_running_loop()
    from concurrent.futures import ThreadPoolExecutor

    tiny = ThreadPoolExecutor(max_workers=1)
    loop.set_default_executor(tiny)
    symbols = [f"S{i:02d}" for i in range(6)]
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item(s) for s in symbols]})
    news = FakeNews(hang={f"{s}.NS" for s in symbols})
    names: list = []

    def quotes(syms):
        names.append(threading.current_thread().name)
        return {}

    try:
        result = await asyncio.wait_for(run(admin, news=news, quotes=quotes), 3)
        # a second run while the first run's news threads are still hung
        result2 = await asyncio.wait_for(run(FakeAdmin(
            recipients=[recipient(U2, "u2@example.com")], watchlists={U2: [item("X")]}),
            news=FakeNews(), quotes=quotes), 3)
    finally:
        news.release.set()
        tiny.shutdown(wait=False)
    assert result["emailed"] == 1 and result2["emailed"] == 1
    assert all(not n.startswith("digest-news") for n in names)


def test_news_executor_is_dedicated():
    import services.digest_job as digest_job

    ex = digest_job.NEWS_EXECUTOR
    assert ex._max_workers == digest_job.NEWS_CONCURRENCY
    assert ex._thread_name_prefix == "digest-news"


@pytest.mark.asyncio
async def test_news_runs_on_the_news_executor():
    admin = FakeAdmin(recipients=[recipient(U1, "u1@example.com")],
                      watchlists={U1: [item("TCS")]})
    names: list = []

    def news(symbol):
        names.append(threading.current_thread().name)
        return []

    await run(admin, news=news)
    assert names and all(n.startswith("digest-news") for n in names)
