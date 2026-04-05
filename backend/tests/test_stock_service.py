# backend/tests/test_stock_service.py
import pytest
from unittest.mock import patch, MagicMock
from services.stock_service import StockService


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
            assert result["price"] == 2500.0
            assert result["name"] == "Reliance Industries"
            assert result["change"] == pytest.approx(20.0)
            assert result["change_percent"] == pytest.approx(20.0 / 2480.0 * 100, rel=1e-2)


class TestTickerValidation:
    def test_invalid_ticker_returns_none(self, service):
        with patch("yfinance.Ticker") as mock_ticker:
            mock_ticker.return_value.info = {}
            result = service.get_quote("INVALIDXYZ.NS")
            assert result is None
