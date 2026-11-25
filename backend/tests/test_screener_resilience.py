"""The screener must reject Yahoo error pages as crumbs and avoid .info fanout."""
from unittest.mock import Mock

import httpx
import pytest

from services.stock_service import StockService
from utils.cache import cache_manager


@pytest.fixture(autouse=True)
def clean_cache():
    cache_manager._caches.clear()
    yield
    cache_manager._caches.clear()


@pytest.fixture
def service(monkeypatch):
    service = StockService()
    monkeypatch.setattr(service, "SCREENER_STOCKS", ["RELIANCE.NS"])
    monkeypatch.setattr(service, "POPULAR_STOCKS", {"us": ["AAPL"]})
    def chart(symbol):
        return {"regularMarketPrice": 150, "previousClose": 148,
                "shortName": symbol, "currency": "USD" if symbol == "AAPL" else "INR"}
    monkeypatch.setattr(service, "_get_chart_quote", chart)
    monkeypatch.setattr(service, "_get_ticker_info", Mock(side_effect=AssertionError("no authenticated per-stock fanout")))
    return service


def install_transport(monkeypatch, handler):
    client = httpx.AsyncClient
    monkeypatch.setattr("services.stock_service.httpx.AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.asyncio
async def test_blocked_crumb_uses_chart_prices_and_backs_off(monkeypatch, service):
    requests = []
    def handler(request):
        requests.append(request)
        if request.url.path.endswith("getcrumb"):
            return httpx.Response(429, text="Too Many Requests\r\n<html>blocked</html>")
        assert request.method == "GET", "must not POST an error page as a crumb"
        return httpx.Response(200)
    install_transport(monkeypatch, handler)
    for _ in range(2):
        data = await service.screener_query({"market": "us"})
        assert data["stocks"][0]["symbol"] == "AAPL"
        assert data["stocks"][0]["price"] == 150
        assert data.get("warning")
    # Both screener entry points share the provider cooldown.
    assert await service.get_screener_symbols() == ["RELIANCE.NS"]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_filtered_fallback_does_not_claim_unfiltered_matches(monkeypatch, service):
    install_transport(monkeypatch, lambda request: httpx.Response(403))
    data = await service.screener_query({"market": "in", "pe_range": "<10"})
    assert data["stocks"] == []
    assert "filter" in data["warning"].lower()


@pytest.mark.asyncio
@pytest.mark.parametrize("symbols_only", [False, True])
async def test_crumb_is_passed_as_encoded_params(monkeypatch, service, symbols_only):
    posts = []
    def handler(request):
        if request.url.path.endswith("getcrumb"):
            return httpx.Response(200, text="token+/=&")
        if request.method == "POST":
            posts.append(request)
            assert request.url.params["crumb"] == "token+/=&"
            assert list(request.url.params.keys()) == ["crumb"]
            return httpx.Response(200, json={"finance": {"result": [{"total": 1, "quotes": [{
                "symbol": "RELIANCE.NS", "regularMarketPrice": 150,
            }]}], "error": None}})
        return httpx.Response(200)
    install_transport(monkeypatch, handler)
    if symbols_only:
        assert await service.get_screener_symbols() == ["RELIANCE.NS"]
    else:
        data = await service.screener_query({"market": "in"})
        assert data["total"] == 1
        assert not data.get("warning")
    assert len(posts) == 1


@pytest.mark.asyncio
async def test_success_status_with_multiline_crumb_is_rejected(monkeypatch, service):
    requests = []
    def handler(request):
        requests.append(request)
        assert request.method == "GET"
        return httpx.Response(200, text="<html>error\r\npage</html>")
    install_transport(monkeypatch, handler)
    data = await service.screener_query({})
    assert data["stocks"][0]["symbol"] == "RELIANCE.NS"
    assert data.get("warning")
