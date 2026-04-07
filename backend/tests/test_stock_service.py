# backend/tests/test_stock_service.py
import pytest
from unittest.mock import patch, MagicMock
from services.stock_service import StockService
from utils.cache import cache_manager


@pytest.fixture
def service():
    return StockService()


class TestResolveSymbol:
    def test_symbol_with_suffix_unchanged(self, service):
        assert service.resolve_indian_symbol("RELIANCE.NS") == "RELIANCE.NS"

    def test_symbol_with_bo_suffix_unchanged(self, service):
        assert service.resolve_indian_symbol("RELIANCE.BO") == "RELIANCE.BO"

    def test_bare_symbol_gets_ns_suffix(self, service):
        with patch("yfinance.Ticker") as mock_ticker:
            mock_info = {"regularMarketPrice": 2500.0}
            mock_ticker.return_value.info = mock_info
            result = service.resolve_indian_symbol("RELIANCE")
            assert result == "RELIANCE.NS"

    def test_bare_symbol_falls_back_to_bo(self, service):
        with patch("yfinance.Ticker") as mock_ticker:
            def side_effect(symbol):
                mock = MagicMock()
                if symbol == "RELIANCE.NS":
                    mock.info = {}
                else:
                    mock.info = {"regularMarketPrice": 2500.0}
                return mock
            mock_ticker.side_effect = side_effect
            result = service.resolve_indian_symbol("RELIANCE")
            assert result == "RELIANCE.BO"


class TestGetQuote:
    def test_get_quote_returns_data(self, service):
        with patch("yfinance.Ticker") as mock_ticker:
            mock_ticker.return_value.info = {
                "symbol": "RELIANCE.NS",
                "shortName": "Reliance Industries",
                "regularMarketPrice": 2500.0,
                "previousClose": 2480.0,
                "volume": 1000000,
                "marketCap": 1500000000000,
                "dayHigh": 2520.0,
                "dayLow": 2475.0,
                "open": 2490.0,
                "currency": "INR",
            }
            result = service.get_quote("RELIANCE.NS")
            assert result["price"] == pytest.approx(2500.0)
            assert result["name"] == "Reliance Industries"
            assert result["change"] == pytest.approx(20.0)
            assert result["change_percent"] == pytest.approx(20.0 / 2480.0 * 100, rel=1e-2)


class TestBatchQuotesFallback:
    def test_yahooquery_success_no_fallback(self, service):
        """When yahooquery returns data, yfinance fallback should not be called."""
        mock_price_data = {
            "AAPL": {
                "regularMarketPrice": 150.0,
                "regularMarketPreviousClose": 148.0,
                "shortName": "Apple Inc.",
                "regularMarketVolume": 1000000,
                "marketCap": 2500000000000,
                "currency": "USD",
            }
        }
        with patch("services.stock_service.YQTicker") as mock_yq:
            mock_yq.return_value.price = mock_price_data
            cache_manager.clear("batch_quote")
            result = service.get_batch_quotes(["AAPL"])
            assert "AAPL" in result
            assert result["AAPL"]["price"] == pytest.approx(150.0)
            assert result["AAPL"]["name"] == "Apple Inc."

    def test_yahooquery_empty_triggers_fallback(self, service):
        """When yahooquery returns empty, should fall back to yfinance."""
        with patch("services.stock_service.YQTicker") as mock_yq, \
             patch("yfinance.Ticker") as mock_yf:
            mock_yq.return_value.price = {}
            mock_yf.return_value.info = {
                "regularMarketPrice": 150.0,
                "previousClose": 148.0,
                "shortName": "Apple Inc.",
                "volume": 1000000,
                "marketCap": 2500000000000,
                "currency": "USD",
            }
            cache_manager.clear("batch_quote")
            result = service.get_batch_quotes(["AAPL"])
            assert "AAPL" in result
            assert result["AAPL"]["price"] == pytest.approx(150.0)

    def test_yahooquery_exception_triggers_fallback(self, service):
        """When yahooquery raises an exception, should fall back to yfinance."""
        with patch("services.stock_service.YQTicker") as mock_yq, \
             patch("yfinance.Ticker") as mock_yf:
            mock_yq.side_effect = Exception("yahooquery connection error")
            mock_yf.return_value.info = {
                "regularMarketPrice": 2500.0,
                "previousClose": 2480.0,
                "shortName": "Reliance",
                "currency": "INR",
            }
            cache_manager.clear("batch_quote")
            result = service.get_batch_quotes(["RELIANCE.NS"])
            assert "RELIANCE.NS" in result
            assert result["RELIANCE.NS"]["price"] == pytest.approx(2500.0)

    def test_empty_results_not_cached(self, service):
        """Empty results should not be cached."""
        with patch("services.stock_service.YQTicker") as mock_yq, \
             patch("yfinance.Ticker") as mock_yf:
            mock_yq.return_value.price = {}
            mock_yf.return_value.info = {}  # yfinance also returns nothing
            cache_manager.clear("batch_quote")
            result = service.get_batch_quotes(["INVALID"])
            assert result == {}
            # Verify nothing was cached
            cached = cache_manager.get("batch_quote", "batch_INVALID")
            assert cached is None

    def test_nonempty_results_calls_cache_set(self, service):
        """Non-empty results should trigger cache_manager.set."""
        mock_price_data = {
            "AAPL": {
                "regularMarketPrice": 150.0,
                "regularMarketPreviousClose": 148.0,
                "shortName": "Apple Inc.",
                "currency": "USD",
            }
        }
        with patch("services.stock_service.YQTicker") as mock_yq, \
             patch("services.stock_service.cache_manager") as mock_cache:
            mock_cache.get.return_value = None  # no cache hit
            mock_yq.return_value.price = mock_price_data
            service.get_batch_quotes(["AAPL"])
            mock_cache.set.assert_called_once()
            args = mock_cache.set.call_args
            assert args[0][0] == "batch_quote"  # category
            assert "AAPL" in args[0][2]  # results dict contains AAPL


class TestTickerValidation:
    def test_invalid_ticker_returns_none(self, service):
        with patch("yfinance.Ticker") as mock_ticker:
            mock_ticker.return_value.info = {}
            result = service.get_quote("INVALIDXYZ.NS")
            assert result is None
