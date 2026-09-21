from datetime import datetime, timedelta, timezone

import pytest

from services.welcome_job import render_welcome_email, run_send_welcome

APP_URL = "https://app.example.com"
NOW = datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)


def uid(n: int) -> str:
    return f"dddddddd-dddd-4ddd-8ddd-{n:012d}"


U1, U2, U3 = uid(1), uid(2), uid(3)


class FakeAdmin:
    def __init__(self, profiles):
        # id -> {"email", "display_name", "welcome_sent_at"}
        self.rows = {p["id"]: dict(p) for p in profiles}
        self.calls: list = []
        self.since = None
        self.stolen: set = set()  # ids another run claims just before we do
        self.fail_claim_for: set = set()

    async def welcome_candidates(self, since_iso):
        self.calls.append("welcome_candidates")
        self.since = since_iso
        return [{"id": i, "email": r["email"], "display_name": r["display_name"]}
                for i, r in self.rows.items() if r.get("welcome_sent_at") is None]

    async def claim_welcome(self, user_id, now_iso):
        self.calls.append(("claim_welcome", user_id))
        if user_id in self.fail_claim_for:
            raise RuntimeError("boom")
        row = self.rows[user_id]
        if user_id in self.stolen:
            row["welcome_sent_at"] = "2026-09-22T09:59:00+00:00"
        if row.get("welcome_sent_at") is not None:
            return None
        row["welcome_sent_at"] = now_iso
        return {"id": user_id, "email": row["email"], "display_name": row["display_name"],
                "welcome_sent_at": now_iso}

    async def release_welcome(self, user_id, claimed_iso):
        self.calls.append(("release_welcome", user_id, claimed_iso))
        row = self.rows[user_id]
        if row.get("welcome_sent_at") == claimed_iso:
            row["welcome_sent_at"] = None

    def sent_at(self, user_id):
        return self.rows[user_id].get("welcome_sent_at")


class FakeMailer:
    def __init__(self, results=None):
        self.results = results or {}
        self.sent: list = []

    async def send(self, to_email, to_name, subject, html, text, tag="price-alert"):
        self.sent.append({"to": to_email, "name": to_name, "subject": subject,
                          "html": html, "text": text, "tag": tag})
        queue = self.results.get(to_email)
        return queue.pop(0) if queue else "sent"


def profile(user_id, email, name="Asha"):
    return {"id": user_id, "email": email, "display_name": name, "welcome_sent_at": None}


async def run(admin, mailer):
    return await run_send_welcome(admin=admin, mailer=mailer, now_utc=NOW, app_url=APP_URL)


@pytest.mark.asyncio
async def test_claim_send_success_path_and_result_shape():
    admin = FakeAdmin([profile(U1, "u1@example.com", "Asha"),
                       profile(U2, "u2@example.com", "Ravi")])
    mailer = FakeMailer()
    result = await run(admin, mailer)
    assert result == {"candidates": 2, "emailed": 2, "skipped": 0, "failed": 0,
                      "invalid": 0, "rate_limited": False, "errors": []}
    assert [m["to"] for m in mailer.sent] == ["u1@example.com", "u2@example.com"]
    assert all(m["tag"] == "welcome" for m in mailer.sent)
    assert mailer.sent[0]["name"] == "Asha"
    assert "Hi Asha," in mailer.sent[0]["text"]
    assert admin.sent_at(U1) == NOW.isoformat()
    assert not any(c[0] == "release_welcome" for c in admin.calls if isinstance(c, tuple))


@pytest.mark.asyncio
async def test_candidates_window_is_seven_days():
    admin = FakeAdmin([])
    result = await run(admin, FakeMailer())
    assert admin.since == (NOW - timedelta(days=7)).isoformat()
    assert result["candidates"] == 0


@pytest.mark.asyncio
async def test_second_run_sends_nothing():
    admin = FakeAdmin([profile(U1, "u1@example.com")])
    mailer = FakeMailer()
    await run(admin, mailer)
    result = await run(admin, mailer)
    assert result["candidates"] == 0 and len(mailer.sent) == 1


@pytest.mark.asyncio
async def test_failed_send_releases_the_claim():
    admin = FakeAdmin([profile(U1, "u1@example.com"), profile(U2, "u2@example.com")])
    mailer = FakeMailer({"u1@example.com": ["failed"]})
    result = await run(admin, mailer)
    assert result["failed"] == 1 and result["emailed"] == 1 and result["errors"] == []
    assert ("release_welcome", U1, NOW.isoformat()) in admin.calls
    assert admin.sent_at(U1) is None  # retried next run
    assert admin.sent_at(U2) == NOW.isoformat()


@pytest.mark.asyncio
async def test_concurrent_claim_skips_the_user():
    admin = FakeAdmin([profile(U1, "u1@example.com"), profile(U2, "u2@example.com")])
    admin.stolen = {U1}
    mailer = FakeMailer()
    result = await run(admin, mailer)
    assert result["skipped"] == 1 and result["emailed"] == 1
    assert [m["to"] for m in mailer.sent] == ["u2@example.com"]
    assert not any(c[0] == "release_welcome" for c in admin.calls if isinstance(c, tuple))


@pytest.mark.asyncio
async def test_rate_limit_releases_and_stops_the_run():
    admin = FakeAdmin([profile(U1, "u1@example.com"), profile(U2, "u2@example.com"),
                       profile(U3, "u3@example.com")])
    mailer = FakeMailer({"u2@example.com": ["rate_limited"]})
    result = await run(admin, mailer)
    assert result["rate_limited"] is True and result["emailed"] == 1
    assert result["errors"] == []
    assert [m["to"] for m in mailer.sent] == ["u1@example.com", "u2@example.com"]
    assert admin.sent_at(U2) is None  # released
    assert ("claim_welcome", U3) not in admin.calls  # never reached


@pytest.mark.asyncio
async def test_auth_error_releases_and_stops_with_error():
    admin = FakeAdmin([profile(U1, "u1@example.com"), profile(U2, "u2@example.com")])
    mailer = FakeMailer({"u1@example.com": ["auth_error"]})
    result = await run(admin, mailer)
    assert result["errors"] == ["brevo_auth"] and result["emailed"] == 0
    assert admin.sent_at(U1) is None
    assert ("claim_welcome", U2) not in admin.calls


@pytest.mark.asyncio
async def test_invalid_recipient_keeps_the_claim():
    admin = FakeAdmin([profile(U1, "bad@example.com")])
    mailer = FakeMailer({"bad@example.com": ["invalid"]})
    result = await run(admin, mailer)
    assert result["invalid"] == 1 and result["errors"] == []
    assert admin.sent_at(U1) == NOW.isoformat()  # not retried
    assert not any(c[0] == "release_welcome" for c in admin.calls if isinstance(c, tuple))


@pytest.mark.asyncio
async def test_exception_for_one_user_does_not_block_others():
    admin = FakeAdmin([profile(U1, "u1@example.com"), profile(U2, "u2@example.com")])
    admin.fail_claim_for = {U1}
    mailer = FakeMailer()
    result = await run(admin, mailer)
    assert result["errors"] == ["RuntimeError"] and result["emailed"] == 1
    assert not any(c[0] == "release_welcome" for c in admin.calls if isinstance(c, tuple))


@pytest.mark.asyncio
async def test_exception_after_claim_releases_it():
    class ExplodingMailer(FakeMailer):
        async def send(self, *args, **kwargs):
            raise RuntimeError("boom")

    admin = FakeAdmin([profile(U1, "u1@example.com")])
    result = await run(admin, ExplodingMailer())
    assert result["errors"] == ["RuntimeError"]
    assert admin.sent_at(U1) is None


@pytest.mark.asyncio
async def test_release_failure_is_reported():
    admin = FakeAdmin([profile(U1, "u1@example.com")])

    async def broken_release(user_id, claimed_iso):
        raise RuntimeError("boom")

    admin.release_welcome = broken_release
    result = await run(admin, FakeMailer({"u1@example.com": ["failed"]}))
    assert result["failed"] == 1 and result["errors"] == ["release_welcome"]


# ---- rendering --------------------------------------------------------------


def test_render_subject_links_and_footer():
    subject, html, text = render_welcome_email("Asha", APP_URL)
    assert subject == "Welcome to StockPulse 👋"
    for path in ("/watchlist", "/alerts", "/settings"):
        assert f'href="{APP_URL}{path}"' in html
        assert f"{APP_URL}{path}" in text
    for label in ("Build your watchlist", "Set price alerts", "Choose your daily digest"):
        assert label in html and label in text
    footer = "You're receiving this because you created a StockPulse account."
    assert footer in text
    assert "You&#x27;re receiving this because you created a StockPulse account." in html
    assert "Hi Asha," in html and "Hi Asha," in text


def test_render_escapes_display_name_and_app_url():
    subject, html, text = render_welcome_email('<b>Eve</b>"\n<script>', 'https://x.example/"><i>')
    assert "<b>Eve</b>" not in html and "<script>" not in html and "<i>" not in html
    assert "&lt;b&gt;Eve&lt;/b&gt;" in html
    assert "\n" not in subject
    assert "Hi <b>Eve</b>\" <script>," in text  # plain text is not escaped, but single line


def test_render_without_name_uses_generic_greeting():
    _, html, text = render_welcome_email(None, APP_URL)
    assert "Hi there," in html and "Hi there," in text
    _, html, text = render_welcome_email("   ", APP_URL)
    assert "Hi there," in text


def test_render_welcome_greeting_name_is_capped():
    from services.email_format import RECIPIENT_NAME_MAX

    long_name = "B" * (RECIPIENT_NAME_MAX + 50)
    _, html, text = render_welcome_email(long_name, APP_URL)
    assert f"Hi {'B' * RECIPIENT_NAME_MAX}," in text
    assert "B" * (RECIPIENT_NAME_MAX + 1) not in text
    assert "B" * (RECIPIENT_NAME_MAX + 1) not in html


def test_mailer_and_welcome_share_the_recipient_name_cap():
    from services import email_format, mailer

    assert mailer.RECIPIENT_NAME_MAX == email_format.RECIPIENT_NAME_MAX == 100


@pytest.mark.asyncio
async def test_release_failure_leaves_the_user_claimed_and_is_reported():
    admin = FakeAdmin([profile(U1, "u1@example.com")])

    async def broken_release(user_id, claimed_iso):
        raise RuntimeError("boom")

    admin.release_welcome = broken_release
    result = await run(admin, FakeMailer({"u1@example.com": ["failed"]}))
    assert result["errors"] == ["release_welcome"]  # non-empty errors -> HTTP 207
    assert admin.sent_at(U1) == NOW.isoformat()  # stuck: needs the manual fix in the docs


@pytest.mark.asyncio
async def test_release_failure_after_exception_reports_both():
    class ExplodingMailer(FakeMailer):
        async def send(self, *args, **kwargs):
            raise RuntimeError("boom")

    admin = FakeAdmin([profile(U1, "u1@example.com")])

    async def broken_release(user_id, claimed_iso):
        raise ConnectionError("down")

    admin.release_welcome = broken_release
    result = await run(admin, ExplodingMailer())
    assert result["errors"] == ["RuntimeError", "release_welcome"]


def test_docs_describe_the_manual_fix_for_a_stuck_welcome_claim():
    from pathlib import Path

    doc = (Path(__file__).resolve().parents[2] / "docs" / "setup" / "digest.md").read_text()
    assert "update profiles set welcome_sent_at = null where id =" in doc
