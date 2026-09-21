from datetime import datetime, timezone

import pytest

from services.alert_engine import evaluate, group_events_by_user, is_market_open


def alert(condition, target):
    return {"id": "a1", "user_id": "u1", "condition": condition, "target": target}


def quote(price=100.0, change_percent=0.0):
    return {"price": price, "change_percent": change_percent}


# ---- evaluate ---------------------------------------------------------------


@pytest.mark.parametrize(
    "price,expected",
    [(99.99, None), (100.0, 100.0), (100.01, 100.01)],
)
def test_above_boundary(price, expected):
    assert evaluate(alert("above", 100), quote(price=price)) == expected


@pytest.mark.parametrize(
    "price,expected",
    [(100.01, None), (100.0, 100.0), (99.99, 99.99)],
)
def test_below_boundary(price, expected):
    assert evaluate(alert("below", 100), quote(price=price)) == expected


@pytest.mark.parametrize("cp,fires", [(4.99, False), (5.0, True), (5.01, True)])
def test_pct_up_boundary(cp, fires):
    result = evaluate(alert("pct_up", 5), quote(price=250.0, change_percent=cp))
    assert result == (250.0 if fires else None)


@pytest.mark.parametrize("cp,fires", [(-2.99, False), (-3.0, True), (-3.01, True), (3.5, False)])
def test_pct_down_boundary(cp, fires):
    result = evaluate(alert("pct_down", 3), quote(price=180.0, change_percent=cp))
    assert result == (180.0 if fires else None)


def test_string_target_is_coerced():
    assert evaluate(alert("above", "2500.50"), quote(price=2500.5)) == 2500.5
    assert evaluate(alert("above", "2500.50"), quote(price=2500.49)) is None
    assert evaluate(alert("pct_down", "3"), quote(change_percent=-3)) == 100.0


def test_missing_quote_returns_none():
    assert evaluate(alert("above", 1), None) is None
    assert evaluate(alert("above", 1), {}) is None


@pytest.mark.parametrize("price", [0, 0.0, -5, None, "abc", float("nan"), True])
def test_non_positive_or_invalid_price_returns_none(price):
    assert evaluate(alert("below", 100), {"price": price, "change_percent": -10}) is None


def test_none_change_percent_returns_none():
    assert evaluate(alert("pct_up", 1), quote(change_percent=None)) is None
    assert evaluate(alert("pct_down", 1), {"price": 10.0}) is None


@pytest.mark.parametrize("target", [None, "abc", 0, -1])
def test_invalid_target_returns_none(target):
    assert evaluate(alert("above", target), quote(price=100.0)) is None


def test_unknown_condition_returns_none():
    assert evaluate(alert("sideways", 1), quote(price=100.0)) is None


def test_string_price_is_coerced():
    assert evaluate(alert("above", 10), {"price": "12.5", "change_percent": 0}) == 12.5


# ---- market hours -----------------------------------------------------------


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "now,expected",
    [
        (utc(2026, 9, 22, 3, 44), False),  # 09:14 IST
        (utc(2026, 9, 22, 3, 45), True),  # 09:15 IST
        (utc(2026, 9, 22, 10, 0), True),  # 15:30 IST
        (utc(2026, 9, 22, 10, 1), False),  # 15:31 IST
        (utc(2026, 9, 19, 6, 0), False),  # Saturday 11:30 IST
        (utc(2026, 9, 20, 6, 0), False),  # Sunday
    ],
)
def test_india_market_hours(now, expected):
    assert is_market_open("in", now) is expected


@pytest.mark.parametrize(
    "now,expected",
    [
        # 2026-03-09 is the Monday after US DST starts (EDT, UTC-4)
        (utc(2026, 3, 9, 13, 29), False),
        (utc(2026, 3, 9, 13, 30), True),
        (utc(2026, 3, 9, 13, 31), True),
        (utc(2026, 3, 9, 20, 0), True),  # 16:00 EDT
        (utc(2026, 3, 9, 20, 1), False),
        # 2026-01-05, standard time (EST, UTC-5)
        (utc(2026, 1, 5, 14, 29), False),
        (utc(2026, 1, 5, 14, 30), True),
        (utc(2026, 1, 5, 21, 0), True),
        (utc(2026, 1, 5, 21, 1), False),
        (utc(2026, 9, 19, 15, 0), False),  # Saturday
    ],
)
def test_us_market_hours(now, expected):
    assert is_market_open("us", now) is expected


def test_naive_datetime_is_treated_as_utc():
    assert is_market_open("in", datetime(2026, 9, 22, 3, 45)) is True


def test_unknown_market_is_closed():
    assert is_market_open("uk", utc(2026, 9, 22, 10, 0)) is False


# ---- grouping ---------------------------------------------------------------


def test_group_events_by_user_sorts_by_triggered_at():
    events = [
        {"id": "e3", "user_id": "u1", "triggered_at": "2026-09-22T05:30:00+00:00"},
        {"id": "e1", "user_id": "u2", "triggered_at": "2026-09-22T04:00:00+00:00"},
        {"id": "e2", "user_id": "u1", "triggered_at": "2026-09-22T04:15:00+00:00"},
    ]
    grouped = group_events_by_user(events)
    assert list(grouped) == ["u1", "u2"]
    assert [e["id"] for e in grouped["u1"]] == ["e2", "e3"]
    assert [e["id"] for e in grouped["u2"]] == ["e1"]


def test_group_events_by_user_empty():
    assert group_events_by_user([]) == {}


# ---- close grace ------------------------------------------------------------


@pytest.mark.parametrize(
    "now,grace,expected",
    [
        (utc(2026, 9, 22, 10, 1), 0, False),  # 15:31 IST, no grace
        (utc(2026, 9, 22, 10, 1), 10, True),  # 15:31 IST, within 10 min grace
        (utc(2026, 9, 22, 10, 10), 10, True),  # 15:40 IST, grace edge (inclusive)
        (utc(2026, 9, 22, 10, 11), 10, False),  # 15:41 IST, past grace
        (utc(2026, 9, 22, 3, 44), 10, False),  # 09:14 IST: grace never extends the open
        (utc(2026, 9, 19, 10, 5), 10, False),  # Saturday, grace doesn't open weekends
    ],
)
def test_india_close_grace(now, grace, expected):
    assert is_market_open("in", now, grace_minutes=grace) is expected


@pytest.mark.parametrize(
    "now,expected",
    [
        (utc(2026, 3, 9, 20, 10), True),  # 16:10 EDT
        (utc(2026, 3, 9, 20, 11), False),
        (utc(2026, 1, 5, 21, 10), True),  # 16:10 EST
        (utc(2026, 1, 5, 21, 11), False),
        (utc(2026, 3, 9, 13, 29), False),  # before open, still closed
    ],
)
def test_us_close_grace(now, expected):
    assert is_market_open("us", now, grace_minutes=10) is expected


def test_default_grace_is_zero():
    assert is_market_open("in", utc(2026, 9, 22, 10, 1)) is False
