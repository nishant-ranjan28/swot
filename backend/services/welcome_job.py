"""Welcome email job: one email to each new user shortly after sign-up.

Run by a cron every 30 minutes. Candidates are profiles created in the last 7 days
with an email and ``welcome_sent_at`` still null. Each one is claimed atomically
(``claim_welcome`` stamps ``welcome_sent_at`` only while it is null) before the email
is sent, so overlapping runs never double-send; a candidate another run claimed first
is skipped.

  sent          -> keep the claim (done)
  invalid       -> keep the claim: Brevo rejected the address (400), don't retry
  failed        -> release the claim so the next run retries
  rate_limited  -> release, stop the run (the rest are retried next run)
  auth_error    -> release, stop the run, report ``brevo_auth``

``release_welcome`` filters on the exact timestamp this run claimed with, so it never
clears another run's claim. If the release itself fails, the user keeps
``welcome_sent_at`` and is never retried automatically. That edge case is accepted but
made visible: ``release_welcome`` goes into ``errors``, so the run returns 207 and the
workflow fails (manual fix in docs/setup/digest.md). ``errors`` holds short codes or exception type names only;
emails and names are never logged.
"""

from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta

from services.email_format import RECIPIENT_NAME_MAX, clean_text, single_line, template

logger = logging.getLogger(__name__)

CANDIDATE_WINDOW = timedelta(days=7)
MAIL_TAG = "welcome"
SUBJECT = "Welcome to StockPulse 👋"
FOOTER = "You're receiving this because you created a StockPulse account."


def render_welcome_email(display_name, app_url) -> tuple[str, str, str]:
    """Render (subject, html, text) for the welcome email."""
    name = clean_text(display_name or "")[:RECIPIENT_NAME_MAX]
    greeting = f"Hi {name}," if name else "Hi there,"
    heading = "Welcome to StockPulse"
    intro = "Thanks for signing up. Here are three things to set up first:"
    base = str(app_url or "").rstrip("/")
    urls = {
        "watchlist_url": f"{base}/watchlist",
        "alerts_url": f"{base}/alerts",
        "settings_url": f"{base}/settings",
    }
    esc = html.escape
    html_body = template("welcome.html").substitute(
        title=esc(heading),
        heading=esc(heading),
        greeting=esc(greeting),
        intro=esc(intro),
        footer=esc(FOOTER),
        **{k: esc(v) for k, v in urls.items()},
    )
    text_body = template("welcome.txt").substitute(
        heading=heading, greeting=greeting, intro=intro, footer=FOOTER, **urls
    )
    return single_line(SUBJECT), html_body, text_body


async def _release(admin, user_id: str, claimed_iso: str, errors: list[str]) -> None:
    try:
        await admin.release_welcome(user_id, claimed_iso)
    except Exception as exc:
        logger.warning("welcome job: release failed: %s", type(exc).__name__)
        errors.append("release_welcome")


async def run_send_welcome(*, admin, mailer, now_utc: datetime, app_url: str) -> dict:
    errors: list[str] = []
    since = (now_utc - CANDIDATE_WINDOW).isoformat()
    candidates = [c for c in await admin.welcome_candidates(since)
                  if isinstance(c, dict) and c.get("id") and c.get("email")]
    now_iso = now_utc.isoformat()

    emailed = skipped = failed = invalid = 0
    rate_limited = False
    for cand in candidates:
        user_id = cand["id"]
        claimed = done = False
        try:
            row = await admin.claim_welcome(user_id, now_iso)
            if row is None:
                skipped += 1  # another run claimed it first, or it was already sent
                continue
            claimed = True
            email = row.get("email") or cand["email"]
            name = row.get("display_name") if "display_name" in row else cand.get("display_name")

            subject, html_body, text_body = render_welcome_email(name, app_url)
            status = await mailer.send(email, name, subject, html_body, text_body, tag=MAIL_TAG)
            done = True
            if status == "sent":
                emailed += 1
            elif status == "invalid":
                invalid += 1  # keep the claim: permanent rejection, don't retry
            else:
                await _release(admin, user_id, now_iso, errors)
                if status == "rate_limited":
                    rate_limited = True
                    break
                if status == "auth_error":
                    errors.append("brevo_auth")
                    break
                failed += 1
        except Exception as exc:  # one bad user must not abort the run
            logger.warning("welcome job: user processing failed: %s", type(exc).__name__)
            errors.append(type(exc).__name__)
            if claimed and not done:
                await _release(admin, user_id, now_iso, errors)

    return {
        "candidates": len(candidates),
        "emailed": emailed,
        "skipped": skipped,
        "failed": failed,
        "invalid": invalid,
        "rate_limited": rate_limited,
        "errors": errors,
    }
