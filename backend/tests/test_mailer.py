import json
import logging

import httpx
import pytest

from services.mailer import BREVO_URL, Mailer, render_alert_email

API_KEY = "<brevo-api-key>"
APP_URL = "https://app.example.com"


def make_mailer(responder):
    requests = []

    def handler(request):
        requests.append(request)
        return responder(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return Mailer(API_KEY, "alerts@example.com", "StockPulse", client), requests


# ---- Mailer.send ------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_201_is_sent_and_body_shape():
    mailer, requests = make_mailer(lambda r: httpx.Response(201, json={"messageId": "<x>"}))
    result = await mailer.send("user@example.com", "Asha", "Subject 🔔", "<p>hi</p>", "hi")
    assert result == "sent"
    (req,) = requests
    assert req.method == "POST"
    assert str(req.url) == BREVO_URL == "https://api.brevo.com/v3/smtp/email"
    assert req.headers["api-key"] == API_KEY
    assert req.headers["accept"] == "application/json"
    assert req.headers["content-type"] == "application/json"
    assert json.loads(req.content) == {
        "sender": {"email": "alerts@example.com", "name": "StockPulse"},
        "to": [{"email": "user@example.com", "name": "Asha"}],
        "subject": "Subject 🔔",
        "htmlContent": "<p>hi</p>",
        "textContent": "hi",
        "headers": {"X-Mailin-Tag": "price-alert"},
    }


@pytest.mark.asyncio
async def test_send_202_is_sent():
    mailer, _ = make_mailer(lambda r: httpx.Response(202))
    assert await mailer.send("u@example.com", "U", "s", "h", "t") == "sent"


@pytest.mark.asyncio
async def test_send_429_is_rate_limited():
    mailer, _ = make_mailer(lambda r: httpx.Response(429))
    assert await mailer.send("u@example.com", "U", "s", "h", "t") == "rate_limited"


@pytest.mark.asyncio
async def test_send_500_is_failed_and_logs_only_status(caplog):
    mailer, _ = make_mailer(lambda r: httpx.Response(500, text=f"echo {API_KEY} u@example.com"))
    with caplog.at_level(logging.DEBUG):
        assert await mailer.send("u@example.com", "U", "s", "h", "t") == "failed"
    assert "500" in caplog.text
    assert API_KEY not in caplog.text
    assert "u@example.com" not in caplog.text


@pytest.mark.asyncio
async def test_send_200_is_failed():
    # Brevo returns 201 on success; anything else is treated as a failure
    mailer, _ = make_mailer(lambda r: httpx.Response(200))
    assert await mailer.send("u@example.com", "U", "s", "h", "t") == "failed"


@pytest.mark.asyncio
async def test_send_transport_error_is_failed_never_raises():
    def boom(request):
        raise httpx.ConnectTimeout("timed out", request=request)

    mailer, _ = make_mailer(boom)
    assert await mailer.send("u@example.com", "U", "s", "h", "t") == "failed"


@pytest.mark.asyncio
async def test_send_without_name_omits_recipient_name():
    mailer, requests = make_mailer(lambda r: httpx.Response(201))
    assert await mailer.send("u@example.com", None, "s", "h", "t") == "sent"
    assert json.loads(requests[0].content)["to"] == [{"email": "u@example.com"}]


@pytest.mark.asyncio
@pytest.mark.parametrize("tag", ["daily-digest", "welcome"])
async def test_send_custom_tag_sets_mailin_header(tag):
    mailer, requests = make_mailer(lambda r: httpx.Response(201))
    assert await mailer.send("u@example.com", "U", "s", "h", "t", tag=tag) == "sent"
    assert json.loads(requests[0].content)["headers"] == {"X-Mailin-Tag": tag}


# ---- render_alert_email -----------------------------------------------------


def event(symbol="RELIANCE.NS", name="Reliance Industries", market="in", condition="above",
          target=2500, price=2612.4, triggered_at="2026-09-22T05:00:00+00:00", id="e1"):
    return {
        "id": id,
        "user_id": "u1",
        "price": price,
        "triggered_at": triggered_at,
        "alert": {"symbol": symbol, "name": name, "market": market,
                  "condition": condition, "target": target},
    }


def test_single_event_subject_and_content():
    subject, html, text = render_alert_email("Asha", [event()], APP_URL)
    assert subject == "🔔 RELIANCE.NS hit your price above alert"
    assert "rose above ₹2,500" in html
    assert "₹2,612.40" in html
    assert "Asha" in html
    assert "rose above ₹2,500" in text
    assert "₹2,612.40" in text


def test_plural_subject():
    events = [event(id="e1"), event(id="e2", symbol="AAPL", market="us", condition="below",
                                    target=180, price=179.5)]
    subject, html, text = render_alert_email("Asha", events, APP_URL)
    assert subject == "🔔 2 price alerts triggered"
    assert "RELIANCE.NS" in html and "AAPL" in html


def test_currency_by_market_and_condition_text():
    events = [
        event(id="e1", symbol="AAPL", market="us", condition="below", target=180, price="179.5"),
        event(id="e2", symbol="TCS.NS", market="in", condition="pct_up", target="5", price=4100),
        event(id="e3", symbol="MSFT", market="us", condition="pct_down", target=3, price=400.25),
    ]
    _, html, text = render_alert_email("Asha", events, APP_URL)
    for body in (html, text):
        assert "fell below $180" in body
        assert "$179.50" in body
        assert "up 5% today" in body
        assert "₹4,100.00" in body
        assert "down 3% today" in body
        assert "$400.25" in body
    assert "₹180" not in html
    assert "$4,100.00" not in html


def test_fractional_target_formatting():
    _, html, _ = render_alert_email("A", [event(target="2500.5", condition="below",
                                                    price=2400)], APP_URL)
    assert "fell below ₹2,500.50" in html


def test_html_escapes_every_value():
    evil = event(symbol="<script>alert(1)</script>", name='"><img src=x onerror=alert(1)>')
    subject, html, text = render_alert_email("<b>Mallory</b>", [evil], APP_URL)
    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<img" not in html
    assert "<b>Mallory</b>" not in html
    assert "&lt;b&gt;Mallory&lt;/b&gt;" in html


def test_subject_has_no_line_breaks():
    subject, _, _ = render_alert_email("A", [event(symbol="EVIL\r\nBcc: x@example.com")], APP_URL)
    assert "\r" not in subject and "\n" not in subject


def test_links_present_in_html_and_text():
    _, html, text = render_alert_email("Asha", [event()], APP_URL)
    assert f'href="{APP_URL}/alerts"' in html
    assert f"{APP_URL}/settings" in html
    assert f"{APP_URL}/alerts" in text
    assert f"{APP_URL}/settings" in text
    assert "You're receiving this because email alerts are on" in text
    assert "You&#x27;re receiving this because email alerts are on" in html or \
        "You're receiving this because email alerts are on" in html


def test_missing_display_name_uses_generic_greeting():
    _, html, text = render_alert_email(None, [event()], APP_URL)
    assert "Hi there" in html
    assert "Hi there" in text


# ---- review fixes -----------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status,expected", [(400, "invalid"), (401, "auth_error"),
                                             (403, "auth_error"), (404, "failed"),
                                             (503, "failed")])
async def test_send_permanent_error_statuses(status, expected):
    mailer, _ = make_mailer(lambda r: httpx.Response(status, text=f"echo {API_KEY}"))
    assert await mailer.send("u@example.com", "U", "s", "h", "t") == expected


@pytest.mark.asyncio
async def test_send_recipient_name_is_single_line_and_bounded():
    mailer, requests = make_mailer(lambda r: httpx.Response(201))
    name = "Asha\r\nBcc: evil@example.com\n" + "x" * 300
    assert await mailer.send("u@example.com", name, "s", "h", "t") == "sent"
    (recipient,) = json.loads(requests[0].content)["to"]
    assert "\r" not in recipient["name"] and "\n" not in recipient["name"]
    assert recipient["name"].startswith("Asha Bcc: evil@example.com x")
    assert len(recipient["name"]) == 100


@pytest.mark.asyncio
async def test_send_whitespace_only_name_is_omitted():
    mailer, requests = make_mailer(lambda r: httpx.Response(201))
    assert await mailer.send("u@example.com", " \r\n ", "s", "h", "t") == "sent"
    assert json.loads(requests[0].content)["to"] == [{"email": "u@example.com"}]


def test_symbol_and_name_are_truncated_in_rendering():
    long_symbol = "S" * 40
    long_name = "N" * 200
    subject, html, text = render_alert_email("A", [event(symbol=long_symbol, name=long_name)],
                                             APP_URL)
    for body in (subject, html, text):
        assert "S" * 32 in body
        assert "S" * 33 not in body
    for body in (html, text):
        assert "N" * 120 in body
        assert "N" * 121 not in body
