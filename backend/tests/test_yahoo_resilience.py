"""Exercise real quote/overview paths while Yahoo quote authentication is unavailable."""
import json
from unittest.mock import Mock, PropertyMock, patch

import httpx
import pytest

from services.stock_service import StockService
from utils.cache import cache_manager


@pytest.fixture(autouse=True)
def clean_caches():
    cache_manager._caches.clear()
    yield
    cache_manager._caches.clear()


@pytest.fixture
def chart():
    return {"chart": {"error": None, "result": [{
        "meta": {"regularMarketPrice": 150.0, "currency": "USD",
                 "shortName": "Apple Inc.", "regularMarketVolume": 1000,
                 "regularMarketDayHigh": 152.0, "regularMarketDayLow": 149.0,
                 "fiftyTwoWeekHigh": 200.0, "fiftyTwoWeekLow": 100.0},
        "indicators": {"quote": [{"close": [146.0, 148.0, 150.0],
                                    "open": [145.0, 147.0, 149.0]}]},
    }]}}


def chart_response(payload):
    return httpx.Response(200, content=json.dumps(payload), request=httpx.Request("GET", "https://query1.finance.yahoo.com/"))


def test_batch_prices_work_without_quote_auth_and_are_cached(chart):
    with patch("services.stock_service.httpx.get", return_value=chart_response(chart)) as get, \
         patch("services.stock_service.YQTicker", side_effect=AssertionError("quote auth unavailable")), \
         patch("services.stock_service.yf.Ticker", side_effect=AssertionError("quote auth unavailable")):
        service = StockService()
        for _ in range(2):
            result = service.get_batch_quotes(["AAPL"])
            assert result["AAPL"]["price"] == 150
            assert result["AAPL"]["currency"] == "USD"
            assert result["AAPL"]["change_percent"] == pytest.approx(1.35)
        assert get.call_count == 1


def test_overview_returns_available_fields_and_backs_off_failed_info(chart):
    ticker = Mock()
    info = PropertyMock(side_effect=RuntimeError("Invalid Crumb"))
    type(ticker).info = info
    with patch("services.stock_service.httpx.get", return_value=chart_response(chart)), \
         patch("services.stock_service.yf.Ticker", return_value=ticker):
        service = StockService()
        for _ in range(2):
            result = service.get_overview("AAPL")
            assert result is not None
            assert result["name"] == "Apple Inc."
            assert result["sector"] is None  # don't invent missing fundamentals
            cache_manager.clear("overview")
        assert info.call_count == 1


def test_failed_chart_uses_existing_quote_fallback():
    with patch("services.stock_service.httpx.get", side_effect=httpx.ConnectError("offline")), \
         patch("services.stock_service.yf.Ticker") as ticker:
        ticker.return_value.info = {"regularMarketPrice": 150, "previousClose": 148, "currency": "USD"}
        assert StockService().get_quote("AAPL")["price"] == 150


@pytest.mark.parametrize("payload", [
    {"chart": {"result": None, "error": {"code": "Not Found"}}},
    {"chart": {"result": []}},
    {},
    {"chart": {"result": [{"meta": {"regularMarketPrice": float("nan")}}]}},
])
def test_invalid_chart_does_not_become_a_quote(payload):
    with patch("services.stock_service.httpx.get", return_value=chart_response(payload)):
        assert StockService()._get_chart_quote("INVALID") is None


def test_only_missing_chart_symbols_use_legacy_provider(chart):
    def get(url, **kwargs):
        if url.endswith("/AAPL"):
            return chart_response(chart)
        raise httpx.ConnectError("chart unavailable")

    with patch("services.stock_service.httpx.get", side_effect=get), \
         patch("services.stock_service.YQTicker") as legacy:
        legacy.return_value.price = {"MSFT": {
            "regularMarketPrice": 200, "regularMarketPreviousClose": 198,
            "currency": "USD",
        }}
        result = StockService().get_batch_quotes(["AAPL", "MSFT"])
        assert result["AAPL"]["price"] == 150
        assert result["MSFT"]["price"] == 200
        legacy.assert_called_once_with(["MSFT"])
