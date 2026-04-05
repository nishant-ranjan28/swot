# yfinance Backend + Frontend Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a FastAPI + yfinance Python backend and tabbed stock detail UI to transform the SWOT Analysis app into a comprehensive stock research platform.

**Architecture:** FastAPI backend serves stock data via yfinance with in-memory TTL caching. React frontend adds a `/stock/:symbol` detail page with 6 tabbed sections (Overview, Financials, Dividends, Analysts, Holders, Earnings). Existing dashboard widgets (SWOT, QVT, Checklist, TradingView) stay unchanged. Backend handles Yahoo Finance search server-side, eliminating the fragile `allorigins.win` CORS proxy.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, yfinance (>=0.2.36), cachetools, slowapi | React 19, react-router-dom 7, axios, Tailwind CSS

---

## Phase 1: Backend Foundation

### Task 1: Backend Project Setup

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/config.py`
- Create: `backend/main.py`
- Create: `backend/routers/__init__.py`
- Create: `backend/services/__init__.py`
- Create: `backend/utils/__init__.py`
- Create: `backend/models/__init__.py`

**Step 1: Create requirements.txt**

```txt
fastapi>=0.111.0
uvicorn>=0.30.0
yfinance>=0.2.36
cachetools>=5.3.3
slowapi>=0.1.9
httpx>=0.27.0
pydantic>=2.7.0
pytest>=8.2.0
pytest-asyncio>=0.23.0
```

**Step 2: Create config.py**

```python
from datetime import time, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

# Market hours (IST)
MARKET_OPEN = time(9, 15)
MARKET_CLOSE = time(15, 30)

# Cache TTLs (seconds)
CACHE_TTL = {
    "search": 300,           # 5 minutes
    "quote": 60,             # 1 minute
    "quote_off_hours": 900,  # 15 minutes
    "overview": 3600,        # 1 hour
    "history": 3600,         # 1 hour
    "financials": 86400,     # 24 hours
    "statements": 86400,
    "dividends": 86400,
    "analysts": 86400,
    "holders": 86400,
    "earnings": 86400,
}

# Cache max sizes
CACHE_MAX_SIZE = {
    "search": 200,
    "ticker": 100,
    "data": 500,
}

# CORS
CORS_ORIGINS = [
    "http://localhost:3000",
]

# Rate limiting
SEARCH_RATE_LIMIT = "30/minute"
```

**Step 3: Create main.py**

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import CORS_ORIGINS

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="SWOT Stock API", version="1.0.0")

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": "Rate limit exceeded", "code": "RATE_LIMITED"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Import and include routers after app is created
from routers.stocks import router as stocks_router

app.include_router(stocks_router, prefix="/api/stocks")
```

**Step 4: Create empty `__init__.py` files**

Create empty files at:
- `backend/routers/__init__.py`
- `backend/services/__init__.py`
- `backend/utils/__init__.py`
- `backend/models/__init__.py`

**Step 5: Verify setup**

```bash
cd backend
pip3 install -r requirements.txt
```

Expected: All packages install successfully.

**Step 6: Commit**

```bash
git add backend/
git commit -m "feat: scaffold FastAPI backend with config, main app, and project structure"
```

---

### Task 2: Cache Utility

**Files:**
- Create: `backend/utils/cache.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_cache.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_cache.py
import time
from utils.cache import CacheManager


def test_cache_set_and_get():
    cache = CacheManager()
    cache.set("search", "test_key", {"data": "value"})
    result = cache.get("search", "test_key")
    assert result == {"data": "value"}


def test_cache_miss_returns_none():
    cache = CacheManager()
    result = cache.get("search", "nonexistent")
    assert result is None


def test_cache_respects_ttl():
    cache = CacheManager()
    # Use a very short TTL override for testing
    cache.set("search", "expire_key", {"data": "old"}, ttl=1)
    time.sleep(1.5)
    result = cache.get("search", "expire_key")
    assert result is None


def test_cache_clear_category():
    cache = CacheManager()
    cache.set("search", "key1", "val1")
    cache.set("search", "key2", "val2")
    cache.clear("search")
    assert cache.get("search", "key1") is None
    assert cache.get("search", "key2") is None
```

**Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_cache.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'utils.cache'`

**Step 3: Write minimal implementation**

```python
# backend/utils/cache.py
from cachetools import TTLCache
from config import CACHE_TTL, CACHE_MAX_SIZE


class CacheManager:
    def __init__(self):
        self._caches = {}

    def _get_or_create_cache(self, category: str, ttl: int | None = None) -> TTLCache:
        cache_key = f"{category}_{ttl}" if ttl else category
        if cache_key not in self._caches:
            resolved_ttl = ttl or CACHE_TTL.get(category, 300)
            max_size = CACHE_MAX_SIZE.get(category, CACHE_MAX_SIZE.get("data", 500))
            self._caches[cache_key] = TTLCache(maxsize=max_size, ttl=resolved_ttl)
        return self._caches[cache_key]

    def get(self, category: str, key: str):
        cache = self._get_or_create_cache(category)
        return cache.get(key)

    def set(self, category: str, key: str, value, ttl: int | None = None):
        cache = self._get_or_create_cache(category, ttl)
        cache[key] = value

    def clear(self, category: str):
        keys_to_remove = [k for k in self._caches if k == category or k.startswith(f"{category}_")]
        for k in keys_to_remove:
            self._caches[k].clear()


# Singleton instance
cache_manager = CacheManager()
```

**Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_cache.py -v
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add backend/utils/cache.py backend/tests/
git commit -m "feat: add CacheManager with TTL-based caching per category"
```

---

### Task 3: Pydantic Response Models

**Files:**
- Create: `backend/models/schemas.py`

**Step 1: Write schemas**

```python
# backend/models/schemas.py
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    code: str


class SearchResult(BaseModel):
    name: str
    symbol: str
    exchange: str | None = None
    type: str | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult]


class QuoteData(BaseModel):
    symbol: str
    name: str | None = None
    price: float | None = None
    previous_close: float | None = None
    change: float | None = None
    change_percent: float | None = None
    volume: int | None = None
    market_cap: int | None = None
    day_high: float | None = None
    day_low: float | None = None
    open: float | None = None
    currency: str = "INR"


class OverviewData(BaseModel):
    symbol: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    website: str | None = None
    description: str | None = None
    market_cap: int | None = None
    enterprise_value: int | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    fifty_day_average: float | None = None
    two_hundred_day_average: float | None = None
    employees: int | None = None
    currency: str = "INR"


class FinancialsData(BaseModel):
    symbol: str
    pe_ratio: float | None = None
    forward_pe: float | None = None
    eps: float | None = None
    forward_eps: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    debt_to_equity: float | None = None
    return_on_equity: float | None = None
    return_on_assets: float | None = None
    profit_margin: float | None = None
    operating_margin: float | None = None
    gross_margin: float | None = None
    revenue: int | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    book_value: float | None = None
    dividend_yield: float | None = None


class HistoryPoint(BaseModel):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None


class HistoryResponse(BaseModel):
    symbol: str
    data: list[HistoryPoint]


class DividendEntry(BaseModel):
    date: str
    amount: float


class SplitEntry(BaseModel):
    date: str
    ratio: str


class DividendsData(BaseModel):
    symbol: str
    dividend_yield: float | None = None
    dividend_rate: float | None = None
    ex_dividend_date: str | None = None
    payout_ratio: float | None = None
    five_year_avg_yield: float | None = None
    history: list[DividendEntry]
    splits: list[SplitEntry]


class AnalystRating(BaseModel):
    period: str
    strong_buy: int = 0
    buy: int = 0
    hold: int = 0
    sell: int = 0
    strong_sell: int = 0


class AnalystsData(BaseModel):
    symbol: str
    target_mean_price: float | None = None
    target_high_price: float | None = None
    target_low_price: float | None = None
    target_median_price: float | None = None
    recommendation: str | None = None
    number_of_analysts: int | None = None
    ratings: list[AnalystRating]


class HolderEntry(BaseModel):
    name: str
    shares: int | None = None
    date_reported: str | None = None
    percent_held: float | None = None
    value: int | None = None


class HoldersData(BaseModel):
    symbol: str
    institutional: list[HolderEntry]
    mutual_fund: list[HolderEntry]


class EarningsEntry(BaseModel):
    date: str
    actual: float | None = None
    estimate: float | None = None
    surprise: float | None = None
    surprise_percent: float | None = None


class EarningsData(BaseModel):
    symbol: str
    earnings_date: str | None = None
    history: list[EarningsEntry]


class SummaryData(BaseModel):
    quote: QuoteData
    overview: OverviewData
    financials: FinancialsData
```

**Step 2: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: add Pydantic response models for all stock API endpoints"
```

---

### Task 4: Stock Service (yfinance Wrapper)

**Files:**
- Create: `backend/services/stock_service.py`
- Create: `backend/tests/test_stock_service.py`

**Step 1: Write the failing test**

```python
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
```

**Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_stock_service.py -v
```

Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write the implementation**

```python
# backend/services/stock_service.py
import yfinance as yf
import httpx
from datetime import datetime
from utils.cache import cache_manager
from config import CACHE_TTL, IST, MARKET_OPEN, MARKET_CLOSE


class StockService:
    """Wrapper around yfinance with caching and Indian stock support."""

    def _is_market_open(self) -> bool:
        now = datetime.now(IST).time()
        weekday = datetime.now(IST).weekday()
        return weekday < 5 and MARKET_OPEN <= now <= MARKET_CLOSE

    def _get_quote_ttl(self) -> int:
        if self._is_market_open():
            return CACHE_TTL["quote"]
        return CACHE_TTL["quote_off_hours"]

    def _get_ticker_info(self, symbol: str) -> dict | None:
        """Get ticker info with caching. Returns None for invalid tickers."""
        cached = cache_manager.get("ticker_info", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            # yfinance returns empty dict or dict without price for invalid tickers
            if not info or "regularMarketPrice" not in info:
                return None
            cache_manager.set("ticker_info", symbol, info, ttl=60)
            return info
        except Exception:
            return None

    def resolve_indian_symbol(self, symbol: str) -> str:
        """Ensure symbol has .NS or .BO suffix. Try .NS first, fallback to .BO."""
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            return symbol

        # Try NSE first
        ns_symbol = f"{symbol}.NS"
        info = self._get_ticker_info(ns_symbol)
        if info:
            return ns_symbol

        # Fallback to BSE
        bo_symbol = f"{symbol}.BO"
        info = self._get_ticker_info(bo_symbol)
        if info:
            return bo_symbol

        # Return .NS as default (will fail validation later)
        return ns_symbol

    async def search(self, query: str) -> list[dict] | None:
        """Search stocks using Yahoo Finance search API (not yfinance)."""
        cache_key = query.lower().strip()
        cached = cache_manager.get("search", cache_key)
        if cached is not None:
            return cached

        try:
            url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&region=IN&quotesCount=10"
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=10.0)
                data = response.json()

            quotes = data.get("quotes", [])
            results = []
            for q in quotes:
                symbol = q.get("symbol", "")
                if symbol.endswith(".NS") or symbol.endswith(".BO"):
                    results.append({
                        "name": q.get("shortname", q.get("longname", "")),
                        "symbol": symbol,
                        "exchange": q.get("exchange", ""),
                        "type": q.get("quoteType", ""),
                    })

            cache_manager.set("search", cache_key, results)
            return results
        except Exception:
            return None

    def get_quote(self, symbol: str) -> dict | None:
        """Get live quote data."""
        cached = cache_manager.get("quote", symbol)
        if cached is not None:
            return cached

        info = self._get_ticker_info(symbol)
        if not info:
            return None

        price = info.get("regularMarketPrice", 0)
        prev_close = info.get("previousClose", 0)
        change = round(price - prev_close, 2) if price and prev_close else None
        change_pct = round((change / prev_close) * 100, 2) if change and prev_close else None

        result = {
            "symbol": symbol,
            "name": info.get("shortName"),
            "price": price,
            "previous_close": prev_close,
            "change": change,
            "change_percent": change_pct,
            "volume": info.get("volume"),
            "market_cap": info.get("marketCap"),
            "day_high": info.get("dayHigh"),
            "day_low": info.get("dayLow"),
            "open": info.get("open"),
            "currency": info.get("currency", "INR"),
        }

        cache_manager.set("quote", symbol, result, ttl=self._get_quote_ttl())
        return result

    def get_overview(self, symbol: str) -> dict | None:
        """Get company overview data."""
        cached = cache_manager.get("overview", symbol)
        if cached is not None:
            return cached

        info = self._get_ticker_info(symbol)
        if not info:
            return None

        result = {
            "symbol": symbol,
            "name": info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "website": info.get("website"),
            "description": info.get("longBusinessSummary"),
            "market_cap": info.get("marketCap"),
            "enterprise_value": info.get("enterpriseValue"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            "fifty_day_average": info.get("fiftyDayAverage"),
            "two_hundred_day_average": info.get("twoHundredDayAverage"),
            "employees": info.get("fullTimeEmployees"),
            "currency": info.get("currency", "INR"),
        }

        cache_manager.set("overview", symbol, result)
        return result

    def get_financials(self, symbol: str) -> dict | None:
        """Get key financial ratios."""
        cached = cache_manager.get("financials", symbol)
        if cached is not None:
            return cached

        info = self._get_ticker_info(symbol)
        if not info:
            return None

        result = {
            "symbol": symbol,
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "eps": info.get("trailingEps"),
            "forward_eps": info.get("forwardEps"),
            "peg_ratio": info.get("pegRatio"),
            "price_to_book": info.get("priceToBook"),
            "debt_to_equity": info.get("debtToEquity"),
            "return_on_equity": info.get("returnOnEquity"),
            "return_on_assets": info.get("returnOnAssets"),
            "profit_margin": info.get("profitMargins"),
            "operating_margin": info.get("operatingMargins"),
            "gross_margin": info.get("grossMargins"),
            "revenue": info.get("totalRevenue"),
            "revenue_growth": info.get("revenueGrowth"),
            "earnings_growth": info.get("earningsGrowth"),
            "book_value": info.get("bookValue"),
            "dividend_yield": info.get("dividendYield"),
        }

        cache_manager.set("financials", symbol, result)
        return result

    def get_history(self, symbol: str, range: str = "1y") -> dict | None:
        """Get historical OHLCV data."""
        cache_key = f"{symbol}_{range}"
        cached = cache_manager.get("history", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=range)
            if df.empty:
                return None

            data = []
            for date, row in df.iterrows():
                data.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "open": round(row.get("Open", 0), 2),
                    "high": round(row.get("High", 0), 2),
                    "low": round(row.get("Low", 0), 2),
                    "close": round(row.get("Close", 0), 2),
                    "volume": int(row.get("Volume", 0)),
                })

            result = {"symbol": symbol, "data": data}
            cache_manager.set("history", cache_key, result)
            return result
        except Exception:
            return None

    def get_statements(self, symbol: str) -> dict | None:
        """Get financial statements (income, balance sheet, cash flow)."""
        cached = cache_manager.get("statements", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)

            def df_to_dict(df):
                if df is None or df.empty:
                    return []
                result = []
                for col in df.columns:
                    entry = {"date": col.strftime("%Y-%m-%d")}
                    for idx, val in df[col].items():
                        entry[str(idx)] = None if val != val else val  # NaN check
                    result.append(entry)
                return result

            result = {
                "symbol": symbol,
                "income_statement": df_to_dict(ticker.financials),
                "balance_sheet": df_to_dict(ticker.balance_sheet),
                "cash_flow": df_to_dict(ticker.cashflow),
            }

            cache_manager.set("statements", symbol, result)
            return result
        except Exception:
            return None

    def get_dividends(self, symbol: str) -> dict | None:
        """Get dividend history and stock splits."""
        cached = cache_manager.get("dividends", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = self._get_ticker_info(symbol)
            if not info:
                return None

            dividends = ticker.dividends
            splits = ticker.splits

            history = []
            if dividends is not None and not dividends.empty:
                for date, amount in dividends.items():
                    history.append({
                        "date": date.strftime("%Y-%m-%d"),
                        "amount": round(float(amount), 2),
                    })

            split_list = []
            if splits is not None and not splits.empty:
                for date, ratio in splits.items():
                    split_list.append({
                        "date": date.strftime("%Y-%m-%d"),
                        "ratio": str(ratio),
                    })

            ex_div_date = info.get("exDividendDate")
            if ex_div_date:
                from datetime import datetime as dt
                ex_div_date = dt.fromtimestamp(ex_div_date).strftime("%Y-%m-%d") if isinstance(ex_div_date, (int, float)) else str(ex_div_date)

            result = {
                "symbol": symbol,
                "dividend_yield": info.get("dividendYield"),
                "dividend_rate": info.get("dividendRate"),
                "ex_dividend_date": ex_div_date,
                "payout_ratio": info.get("payoutRatio"),
                "five_year_avg_yield": info.get("fiveYearAvgDividendYield"),
                "history": history,
                "splits": split_list,
            }

            cache_manager.set("dividends", symbol, result)
            return result
        except Exception:
            return None

    def get_analysts(self, symbol: str) -> dict | None:
        """Get analyst recommendations and target prices."""
        cached = cache_manager.get("analysts", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = self._get_ticker_info(symbol)
            if not info:
                return None

            recommendations = ticker.recommendations
            ratings = []
            if recommendations is not None and not recommendations.empty:
                for _, row in recommendations.tail(4).iterrows():
                    ratings.append({
                        "period": str(row.get("period", "")),
                        "strong_buy": int(row.get("strongBuy", 0)),
                        "buy": int(row.get("buy", 0)),
                        "hold": int(row.get("hold", 0)),
                        "sell": int(row.get("sell", 0)),
                        "strong_sell": int(row.get("strongSell", 0)),
                    })

            result = {
                "symbol": symbol,
                "target_mean_price": info.get("targetMeanPrice"),
                "target_high_price": info.get("targetHighPrice"),
                "target_low_price": info.get("targetLowPrice"),
                "target_median_price": info.get("targetMedianPrice"),
                "recommendation": info.get("recommendationKey"),
                "number_of_analysts": info.get("numberOfAnalystOpinions"),
                "ratings": ratings,
            }

            cache_manager.set("analysts", symbol, result)
            return result
        except Exception:
            return None

    def get_holders(self, symbol: str) -> dict | None:
        """Get institutional and mutual fund holders."""
        cached = cache_manager.get("holders", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)

            def parse_holders(df):
                if df is None or df.empty:
                    return []
                holders = []
                for _, row in df.iterrows():
                    holders.append({
                        "name": str(row.get("Holder", "")),
                        "shares": int(row.get("Shares", 0)) if row.get("Shares") else None,
                        "date_reported": row.get("Date Reported").strftime("%Y-%m-%d") if row.get("Date Reported") is not None else None,
                        "percent_held": round(float(row.get("% Out", 0)), 4) if row.get("% Out") else None,
                        "value": int(row.get("Value", 0)) if row.get("Value") else None,
                    })
                return holders

            result = {
                "symbol": symbol,
                "institutional": parse_holders(ticker.institutional_holders),
                "mutual_fund": parse_holders(ticker.mutualfund_holders),
            }

            cache_manager.set("holders", symbol, result)
            return result
        except Exception:
            return None

    def get_earnings(self, symbol: str) -> dict | None:
        """Get earnings history and upcoming dates."""
        cached = cache_manager.get("earnings", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = self._get_ticker_info(symbol)
            if not info:
                return None

            earnings_dates = info.get("earningsTimestamp")
            if earnings_dates:
                from datetime import datetime as dt
                earnings_dates = dt.fromtimestamp(earnings_dates).strftime("%Y-%m-%d") if isinstance(earnings_dates, (int, float)) else str(earnings_dates)

            earnings_hist = ticker.earnings_history
            history = []
            if earnings_hist is not None and not earnings_hist.empty:
                for _, row in earnings_hist.iterrows():
                    history.append({
                        "date": str(row.get("Quarter", "")),
                        "actual": row.get("Reported EPS"),
                        "estimate": row.get("EPS Estimate"),
                        "surprise": row.get("Surprise(%)"),
                        "surprise_percent": row.get("Surprise(%)"),
                    })

            result = {
                "symbol": symbol,
                "earnings_date": earnings_dates,
                "history": history,
            }

            cache_manager.set("earnings", symbol, result)
            return result
        except Exception:
            return None

    def get_summary(self, symbol: str) -> dict | None:
        """Composite: quote + overview + financials in one call (reuses cached ticker.info)."""
        quote = self.get_quote(symbol)
        if not quote:
            return None

        overview = self.get_overview(symbol)
        financials = self.get_financials(symbol)

        return {
            "quote": quote,
            "overview": overview,
            "financials": financials,
        }


# Singleton
stock_service = StockService()
```

**Step 4: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_stock_service.py -v
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add backend/services/stock_service.py backend/tests/test_stock_service.py
git commit -m "feat: add StockService with yfinance wrapper, Indian symbol resolution, and caching"
```

---

### Task 5: Stock Router (API Endpoints)

**Files:**
- Create: `backend/routers/stocks.py`

**Step 1: Write the router**

```python
# backend/routers/stocks.py
import asyncio
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import SEARCH_RATE_LIMIT
from services.stock_service import stock_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _not_found(symbol: str):
    return JSONResponse(
        status_code=404,
        content={"error": f"Stock '{symbol}' not found", "code": "SYMBOL_NOT_FOUND"},
    )


def _server_error():
    return JSONResponse(
        status_code=502,
        content={"error": "Failed to fetch data from Yahoo Finance", "code": "UPSTREAM_ERROR"},
    )


@router.get("/search")
@limiter.limit(SEARCH_RATE_LIMIT)
async def search_stocks(request: Request, q: str = Query(..., min_length=1, max_length=50)):
    results = await stock_service.search(q.strip())
    if results is None:
        return _server_error()
    return {"results": results}


@router.get("/{symbol}/quote")
async def get_quote(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_quote, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/summary")
async def get_summary(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_summary, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/overview")
async def get_overview(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_overview, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/financials")
async def get_financials(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_financials, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/history")
async def get_history(symbol: str, range: str = Query("1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$")):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_history, resolved, range)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/statements")
async def get_statements(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_statements, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/dividends")
async def get_dividends(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_dividends, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/analysts")
async def get_analysts(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_analysts, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/holders")
async def get_holders(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_holders, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/earnings")
async def get_earnings(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_earnings, resolved)
    if not result:
        return _not_found(symbol)
    return result
```

**Step 2: Verify backend starts**

```bash
cd backend && uvicorn main:app --reload --port 8000
```

Expected: Server starts, `http://localhost:8000/api/health` returns `{"status": "ok"}`.

**Step 3: Test endpoints manually**

```bash
curl http://localhost:8000/api/stocks/search?q=reliance
curl http://localhost:8000/api/stocks/RELIANCE.NS/quote
curl http://localhost:8000/api/stocks/RELIANCE.NS/summary
```

**Step 4: Commit**

```bash
git add backend/routers/stocks.py
git commit -m "feat: add all stock API endpoints with async yfinance calls and error handling"
```

---

## Phase 2: Frontend Refactoring (Fix Existing Issues)

### Task 6: Add Proxy Config + Extract HomePage

**Files:**
- Modify: `package.json` (add proxy)
- Create: `src/components/HomePage.js` (extract from App.js)
- Modify: `src/App.js` (remove inline HomePage, import extracted one)

**Step 1: Add proxy to package.json**

Add to `package.json`:
```json
"proxy": "http://localhost:8000"
```

**Step 2: Extract HomePage from App.js into its own file**

```jsx
// src/components/HomePage.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import StockSearch from './StockSearch';

const HomePage = ({ updateSwotWidget, fetchStockPrice, updateStockChart }) => {
  const location = useLocation();
  const [initialized, setInitialized] = useState(false);
  const searchSymbol = new URLSearchParams(location.search).get('search');

  useEffect(() => {
    if (searchSymbol && !initialized) {
      updateSwotWidget(searchSymbol);
      fetchStockPrice(searchSymbol);
      setTimeout(() => {
        updateStockChart(searchSymbol);
      }, 500);
      setInitialized(true);
    }
  }, [searchSymbol, initialized, updateSwotWidget, fetchStockPrice, updateStockChart]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 gap-4 md:gap-6">
        {/* Top Part: StockSearch */}
        <div className="w-full">
          <div className="max-w-4xl mx-auto">
            <StockSearch
              updateSwotWidget={updateSwotWidget}
              fetchStockPrice={fetchStockPrice}
              updateStockChart={updateStockChart}
              className="w-full"
            />
          </div>
        </div>

        {/* Widgets Grid */}
        <div className="w-full max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {/* SWOT Analysis */}
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg col-span-1">
              <h2 className="text-lg font-semibold mb-4 text-gray-800">SWOT Analysis</h2>
              <iframe
                className="w-full h-80 md:h-96 rounded-lg shadow-md"
                id="swot-widget"
                src="https://trendlyne.com/web-widget/swot-widget/Poppins/LTFOODS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="SWOT Analysis for LT Foods"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* QVT Widget */}
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg col-span-1">
              <h2 className="text-lg font-semibold mb-4 text-gray-800">QVT Score</h2>
              <iframe
                className="w-full h-80 md:h-96 rounded-lg shadow-md"
                id="qvt-widget"
                src="https://trendlyne.com/web-widget/qvt-widget/Poppins/LTFOODS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="QVT Widget for LT Foods"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>

            {/* Checklist Widget */}
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg col-span-1 lg:col-span-2 xl:col-span-1">
              <h2 className="text-lg font-semibold mb-4 text-gray-800">Stock Checklist</h2>
              <iframe
                className="w-full h-80 md:h-96 rounded-lg shadow-md"
                id="checklist-widget"
                src="https://trendlyne.com/web-widget/checklist-widget/Poppins/TATAMOTORS/?posCol=00A25B&primaryCol=006AFF&negCol=EB3B00&neuCol=F7941E"
                title="Checklist Widget for TATA Motors"
                data-theme="light"
                frameBorder="0"
              ></iframe>
            </div>
          </div>
        </div>

        {/* TradingView Chart */}
        <div className="w-full max-w-7xl mx-auto">
          <div className="bg-white p-4 md:p-6 rounded-xl shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Stock Chart</h2>
            <div
              id="stock-chart-container"
              className="w-full h-80 sm:h-96 md:h-[500px] lg:h-[600px] bg-gray-100 rounded-lg shadow-inner overflow-hidden relative"
              style={{ minHeight: '320px' }}
            >
              <div id="stock-chart" className="w-full h-full"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

HomePage.propTypes = {
  updateSwotWidget: PropTypes.func.isRequired,
  fetchStockPrice: PropTypes.func.isRequired,
  updateStockChart: PropTypes.func.isRequired,
};

export default HomePage;
```

**Step 3: Update App.js**

Remove the inline `HomePage` component (lines 317-425) and import the extracted one:

```jsx
import HomePage from './components/HomePage';
```

Remove `PropTypes` for the old inline `HomePage`. Update the Route to use the imported `HomePage`.

**Step 4: Verify app still works**

```bash
npm start
```

Expected: App loads, stock search works, all widgets render.

**Step 5: Commit**

```bash
git add package.json src/components/HomePage.js src/App.js
git commit -m "refactor: extract HomePage from App.js, add backend proxy config"
```

---

### Task 7: StockContext + useStockData Hook

**Files:**
- Create: `src/context/StockContext.js`
- Create: `src/hooks/useStockData.js`

**Step 1: Create StockContext**

```jsx
// src/context/StockContext.js
import React, { createContext, useContext, useReducer } from 'react';

const StockContext = createContext(null);

const initialState = {
  symbol: null,
  stockName: null,
  quote: null,
};

function stockReducer(state, action) {
  switch (action.type) {
    case 'SET_STOCK':
      return {
        ...state,
        symbol: action.payload.symbol,
        stockName: action.payload.name || state.stockName,
      };
    case 'SET_QUOTE':
      return {
        ...state,
        quote: action.payload,
        stockName: action.payload.name || state.stockName,
      };
    case 'CLEAR':
      return initialState;
    default:
      return state;
  }
}

export function StockProvider({ children }) {
  const [state, dispatch] = useReducer(stockReducer, initialState);

  return (
    <StockContext.Provider value={{ state, dispatch }}>
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}
```

**Step 2: Create useStockData hook**

```jsx
// src/hooks/useStockData.js
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export function useStockData(endpoint, options = {}) {
  const { enabled = true, refetchOnMount = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!endpoint || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(endpoint);
      setData(response.data);
    } catch (err) {
      const message =
        err.response?.data?.error || err.message || 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    if (refetchOnMount) {
      fetchData();
    }
  }, [fetchData, refetchOnMount]);

  return { data, loading, error, refetch: fetchData };
}
```

**Step 3: Wrap App with StockProvider in index.js**

In `src/index.js`, wrap `<App />` with `<StockProvider>`:

```jsx
import { StockProvider } from './context/StockContext';

// Inside render:
<StockProvider>
  <App />
</StockProvider>
```

**Step 4: Commit**

```bash
git add src/context/ src/hooks/ src/index.js
git commit -m "feat: add StockContext and useStockData hook for state management"
```

---

### Task 8: Update StockSearch to Use Backend API

**Files:**
- Modify: `src/components/StockSearch.js`

**Step 1: Replace allorigins proxy calls with backend API**

Replace the `fetchStocks()` function inside StockSearch to call `/api/stocks/search?q=${input}` and `/api/stocks/${symbol}/quote` instead of allorigins proxy URLs.

Key changes:
- `fetchStocks()` calls `axios.get(`/api/stocks/search?q=${input}`)` 
- Suggestion click calls `/api/stocks/${symbol}/quote` for price
- Add `onSelect` prop for navigation mode (detail page) vs callback mode (dashboard)

```jsx
// In fetchStocks():
const response = await axios.get(`/api/stocks/search?q=${input}`);
const stocks = response.data.results || [];
const limitedStocks = stocks.slice(0, 5);

// Fetch prices from backend
const stocksWithPrices = await Promise.all(
  limitedStocks.map(async (stock) => {
    try {
      const priceResponse = await axios.get(`/api/stocks/${stock.symbol}/quote`);
      return {
        name: stock.name,
        symbol: stock.symbol,
        price: priceResponse.data.price || 'N/A',
      };
    } catch {
      return { name: stock.name, symbol: stock.symbol, price: 'N/A' };
    }
  })
);
setSuggestions(stocksWithPrices);
```

Add `onSelect` prop: if provided, call it instead of widget callbacks (used on detail page).

**Step 2: Verify search still works**

```bash
npm start
# Backend must be running: cd backend && uvicorn main:app --reload --port 8000
```

**Step 3: Commit**

```bash
git add src/components/StockSearch.js
git commit -m "refactor: update StockSearch to use backend API instead of allorigins proxy"
```

---

### Task 9: Update fetchStockPrice in App.js

**Files:**
- Modify: `src/App.js`

**Step 1: Replace allorigins proxy with backend API**

```jsx
const fetchStockPrice = useCallback((stockSymbol, div = null, stockName = null) => {
  axios.get(`/api/stocks/${stockSymbol}/quote`)
    .then((response) => {
      const price = response.data.price;
      if (div && stockName) {
        div.textContent = `${stockName} - ₹${price}`;
      }
    })
    .catch((error) => {
      console.error('Error fetching stock price:', error);
      if (div && stockName) {
        div.textContent = `${stockName} - Price not available`;
      }
    });
}, []);
```

Add `import axios from 'axios';` at top if not already present.

**Step 2: Verify dashboard still loads default stock**

```bash
npm start
```

Expected: LTFOODS loads on homepage with price displayed.

**Step 3: Commit**

```bash
git add src/App.js
git commit -m "refactor: update fetchStockPrice to use backend API"
```

---

## Phase 3: Stock Detail Page + Tabs

### Task 10: StockDetailPage Container + Route

**Files:**
- Create: `src/components/StockDetail/StockDetailPage.js`
- Create: `src/components/StockDetail/TabSkeleton.js`
- Modify: `src/App.js` (add route)
- Modify: `src/components/Header.js` (no changes needed yet)

**Step 1: Create TabSkeleton**

```jsx
// src/components/StockDetail/TabSkeleton.js
import React from 'react';

const TabSkeleton = ({ rows = 5 }) => (
  <div className="space-y-4 animate-pulse">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex justify-between items-center">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      </div>
    ))}
  </div>
);

export default TabSkeleton;
```

**Step 2: Create StockDetailPage**

```jsx
// src/components/StockDetail/StockDetailPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useStockData } from '../../hooks/useStockData';
import StockSearch from '../StockSearch';
import OverviewTab from './OverviewTab';
import FinancialsTab from './FinancialsTab';
import DividendsTab from './DividendsTab';
import AnalystsTab from './AnalystsTab';
import HoldersTab from './HoldersTab';
import EarningsTab from './EarningsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'analysts', label: 'Analysts' },
  { id: 'holders', label: 'Holders' },
  { id: 'earnings', label: 'Earnings' },
];

const StockDetailPage = () => {
  const { symbol } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get('tab') || 'overview';

  const { data: summary, loading, error } = useStockData(
    symbol ? `/api/stocks/${symbol}/summary` : null
  );

  const setActiveTab = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const handleStockSelect = (stock) => {
    navigate(`/stock/${stock.symbol}`);
  };

  const quote = summary?.quote;
  const changeColor = quote?.change >= 0 ? 'text-green-600' : 'text-red-600';
  const changeSign = quote?.change >= 0 ? '+' : '';

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab symbol={symbol} overview={summary?.overview} />;
      case 'financials':
        return <FinancialsTab symbol={symbol} />;
      case 'dividends':
        return <DividendsTab symbol={symbol} />;
      case 'analysts':
        return <AnalystsTab symbol={symbol} />;
      case 'holders':
        return <HoldersTab symbol={symbol} />;
      case 'earnings':
        return <EarningsTab symbol={symbol} />;
      default:
        return <OverviewTab symbol={symbol} overview={summary?.overview} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Search Bar */}
        <div className="max-w-4xl mx-auto">
          <StockSearch onSelect={handleStockSelect} className="w-full" />
        </div>

        {/* Price Banner */}
        {quote && (
          <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 sticky top-16 z-40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {quote.name || symbol}
                </h1>
                <span className="text-sm text-gray-500">{symbol}</span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">
                  ₹{quote.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-lg font-semibold ${changeColor}`}>
                  {changeSign}{quote.change?.toFixed(2)} ({changeSign}{quote.change_percent?.toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Tabs */}
        {summary && (
          <>
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div className="flex min-w-max border-b border-gray-200">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.id
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 md:p-6">
                {renderTab()}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default StockDetailPage;
```

**Step 3: Add route in App.js**

```jsx
import StockDetailPage from './components/StockDetail/StockDetailPage';

// In Routes:
<Route path="/stock/:symbol" element={<StockDetailPage />} />
```

**Step 4: Commit**

```bash
git add src/components/StockDetail/ src/App.js
git commit -m "feat: add StockDetailPage with tabbed layout, price banner, and routing"
```

---

### Task 11: OverviewTab

**Files:**
- Create: `src/components/StockDetail/OverviewTab.js`

**Step 1: Write OverviewTab**

```jsx
// src/components/StockDetail/OverviewTab.js
import React from 'react';
import TabSkeleton from './TabSkeleton';

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
    <span className="text-gray-600 text-sm">{label}</span>
    <span className="font-medium text-gray-900 text-sm text-right">{value || 'N/A'}</span>
  </div>
);

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e12) return `₹${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `₹${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const OverviewTab = ({ symbol, overview }) => {
  if (!overview) return <TabSkeleton rows={8} />;

  return (
    <div className="space-y-6">
      {/* Company Description */}
      {overview.description && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">About</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{overview.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Company Info</h3>
          <InfoRow label="Sector" value={overview.sector} />
          <InfoRow label="Industry" value={overview.industry} />
          <InfoRow label="Employees" value={overview.employees?.toLocaleString('en-IN')} />
          <InfoRow
            label="Website"
            value={
              overview.website ? (
                <a href={overview.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {overview.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null
            }
          />
        </div>

        {/* Key Stats */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Key Statistics</h3>
          <InfoRow label="Market Cap" value={formatNumber(overview.market_cap)} />
          <InfoRow label="Enterprise Value" value={formatNumber(overview.enterprise_value)} />
          <InfoRow label="52-Week High" value={overview.fifty_two_week_high ? `₹${overview.fifty_two_week_high.toFixed(2)}` : null} />
          <InfoRow label="52-Week Low" value={overview.fifty_two_week_low ? `₹${overview.fifty_two_week_low.toFixed(2)}` : null} />
          <InfoRow label="50-Day Avg" value={overview.fifty_day_average ? `₹${overview.fifty_day_average.toFixed(2)}` : null} />
          <InfoRow label="200-Day Avg" value={overview.two_hundred_day_average ? `₹${overview.two_hundred_day_average.toFixed(2)}` : null} />
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/OverviewTab.js
git commit -m "feat: add OverviewTab with company info and key statistics"
```

---

### Task 12: FinancialsTab

**Files:**
- Create: `src/components/StockDetail/FinancialsTab.js`

**Step 1: Write FinancialsTab**

```jsx
// src/components/StockDetail/FinancialsTab.js
import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const InfoRow = ({ label, value, highlight }) => (
  <div className={`flex justify-between items-center py-2 border-b border-gray-100 last:border-0 ${highlight ? 'bg-blue-50/50 px-2 rounded' : ''}`}>
    <span className="text-gray-600 text-sm">{label}</span>
    <span className="font-medium text-gray-900 text-sm">{value ?? 'N/A'}</span>
  </div>
);

const formatPercent = (val) => (val != null ? `${(val * 100).toFixed(2)}%` : 'N/A');
const formatRatio = (val) => (val != null ? val.toFixed(2) : 'N/A');
const formatCurrency = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const FinancialsTab = ({ symbol }) => {
  const { data: financials, loading, error } = useStockData(`/api/stocks/${symbol}/financials`);
  const { data: statements, loading: stLoading } = useStockData(`/api/stocks/${symbol}/statements`);
  const [statementType, setStatementType] = useState('income_statement');

  if (loading) return <TabSkeleton rows={10} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={() => window.location.reload()} className="text-blue-600 underline ml-2">Retry</button></div>;

  return (
    <div className="space-y-6">
      {/* Key Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Valuation</h3>
          <InfoRow label="P/E Ratio (TTM)" value={formatRatio(financials?.pe_ratio)} highlight />
          <InfoRow label="Forward P/E" value={formatRatio(financials?.forward_pe)} />
          <InfoRow label="PEG Ratio" value={formatRatio(financials?.peg_ratio)} />
          <InfoRow label="Price/Book" value={formatRatio(financials?.price_to_book)} />
          <InfoRow label="EPS (TTM)" value={financials?.eps ? `₹${financials.eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Forward EPS" value={financials?.forward_eps ? `₹${financials.forward_eps.toFixed(2)}` : 'N/A'} />
          <InfoRow label="Book Value" value={financials?.book_value ? `₹${financials.book_value.toFixed(2)}` : 'N/A'} />
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-md font-semibold text-gray-800 mb-3">Profitability & Growth</h3>
          <InfoRow label="Profit Margin" value={formatPercent(financials?.profit_margin)} highlight />
          <InfoRow label="Operating Margin" value={formatPercent(financials?.operating_margin)} />
          <InfoRow label="Gross Margin" value={formatPercent(financials?.gross_margin)} />
          <InfoRow label="ROE" value={formatPercent(financials?.return_on_equity)} />
          <InfoRow label="ROA" value={formatPercent(financials?.return_on_assets)} />
          <InfoRow label="Revenue" value={formatCurrency(financials?.revenue)} />
          <InfoRow label="Revenue Growth" value={formatPercent(financials?.revenue_growth)} />
          <InfoRow label="Debt/Equity" value={formatRatio(financials?.debt_to_equity)} />
        </div>
      </div>

      {/* Financial Statements */}
      {statements && (
        <div>
          <div className="flex gap-2 mb-4">
            {['income_statement', 'balance_sheet', 'cash_flow'].map((type) => (
              <button
                key={type}
                onClick={() => setStatementType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statementType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>

          {stLoading ? (
            <TabSkeleton rows={8} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 text-gray-600 font-medium">Item</th>
                    {statements[statementType]?.map((col) => (
                      <th key={col.date} className="text-right p-2 text-gray-600 font-medium">
                        {col.date}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statements[statementType]?.[0] &&
                    Object.keys(statements[statementType][0])
                      .filter((key) => key !== 'date')
                      .slice(0, 15)
                      .map((key) => (
                        <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-2 text-gray-700">{key}</td>
                          {statements[statementType].map((col) => (
                            <td key={col.date} className="p-2 text-right text-gray-900">
                              {col[key] != null ? formatCurrency(col[key]) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinancialsTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/FinancialsTab.js
git commit -m "feat: add FinancialsTab with key ratios and financial statements"
```

---

### Task 13: DividendsTab

**Files:**
- Create: `src/components/StockDetail/DividendsTab.js`

**Step 1: Write DividendsTab**

```jsx
// src/components/StockDetail/DividendsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const DividendsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/dividends`);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No dividend data available.</div>;

  const formatPercent = (val) => (val != null ? `${(val * 100).toFixed(2)}%` : 'N/A');

  return (
    <div className="space-y-6">
      {/* Dividend Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Dividend Yield', value: formatPercent(data.dividend_yield) },
          { label: 'Dividend Rate', value: data.dividend_rate ? `₹${data.dividend_rate.toFixed(2)}` : 'N/A' },
          { label: 'Payout Ratio', value: formatPercent(data.payout_ratio) },
          { label: 'Ex-Dividend Date', value: data.ex_dividend_date || 'N/A' },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-500 mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Dividend History */}
      {data.history?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Dividend History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Date</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.history.slice(-20).reverse().map((entry) => (
                  <tr key={entry.date} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-gray-700">{entry.date}</td>
                    <td className="p-2 text-right text-green-600 font-medium">₹{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Splits */}
      {data.splits?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Stock Splits</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Date</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {data.splits.reverse().map((entry) => (
                  <tr key={entry.date} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-gray-700">{entry.date}</td>
                    <td className="p-2 text-right font-medium">{entry.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DividendsTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/DividendsTab.js
git commit -m "feat: add DividendsTab with yield summary, history, and splits"
```

---

### Task 14: AnalystsTab

**Files:**
- Create: `src/components/StockDetail/AnalystsTab.js`

**Step 1: Write AnalystsTab**

```jsx
// src/components/StockDetail/AnalystsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const RatingBar = ({ label, value, total, color }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-4">
        <div className={`h-4 rounded-full ${color}`} style={{ width: `${pct}%` }}></div>
      </div>
      <span className="text-sm font-medium text-gray-900 w-8 text-right">{value}</span>
    </div>
  );
};

const AnalystsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/analysts`);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No analyst data available.</div>;

  return (
    <div className="space-y-6">
      {/* Target Prices */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Target Mean', value: data.target_mean_price },
          { label: 'Target High', value: data.target_high_price },
          { label: 'Target Low', value: data.target_low_price },
          { label: 'Analysts', value: data.number_of_analysts },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-sm text-gray-500 mb-1">{item.label}</div>
            <div className="text-lg font-bold text-gray-900">
              {item.label === 'Analysts' ? item.value || 'N/A' : item.value ? `₹${item.value.toFixed(2)}` : 'N/A'}
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      {data.recommendation && (
        <div className="text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold uppercase ${
            data.recommendation === 'buy' || data.recommendation === 'strong_buy'
              ? 'bg-green-100 text-green-700'
              : data.recommendation === 'hold'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {data.recommendation.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Ratings Breakdown */}
      {data.ratings?.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Ratings Breakdown</h3>
          {data.ratings.map((rating) => {
            const total = rating.strong_buy + rating.buy + rating.hold + rating.sell + rating.strong_sell;
            return (
              <div key={rating.period} className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="text-sm font-medium text-gray-700 mb-3">{rating.period}</div>
                <div className="space-y-2">
                  <RatingBar label="Strong Buy" value={rating.strong_buy} total={total} color="bg-green-600" />
                  <RatingBar label="Buy" value={rating.buy} total={total} color="bg-green-400" />
                  <RatingBar label="Hold" value={rating.hold} total={total} color="bg-yellow-400" />
                  <RatingBar label="Sell" value={rating.sell} total={total} color="bg-red-400" />
                  <RatingBar label="Strong Sell" value={rating.strong_sell} total={total} color="bg-red-600" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnalystsTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/AnalystsTab.js
git commit -m "feat: add AnalystsTab with target prices and ratings breakdown"
```

---

### Task 15: HoldersTab

**Files:**
- Create: `src/components/StockDetail/HoldersTab.js`

**Step 1: Write HoldersTab**

```jsx
// src/components/StockDetail/HoldersTab.js
import React, { useState } from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const formatNumber = (num) => {
  if (!num) return 'N/A';
  if (num >= 1e7) return `${(num / 1e7).toFixed(2)}Cr`;
  if (num >= 1e5) return `${(num / 1e5).toFixed(2)}L`;
  return num.toLocaleString('en-IN');
};

const HoldersTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/holders`);
  const [holderType, setHolderType] = useState('institutional');

  if (loading) return <TabSkeleton rows={8} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No holder data available.</div>;

  const holders = holderType === 'institutional' ? data.institutional : data.mutual_fund;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-2">
        {['institutional', 'mutual_fund'].map((type) => (
          <button
            key={type}
            onClick={() => setHolderType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              holderType === type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'institutional' ? 'Institutional' : 'Mutual Fund'}
          </button>
        ))}
      </div>

      {/* Table */}
      {holders?.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 text-gray-600 font-medium">Holder</th>
                <th className="text-right p-2 text-gray-600 font-medium">Shares</th>
                <th className="text-right p-2 text-gray-600 font-medium">% Held</th>
                <th className="text-right p-2 text-gray-600 font-medium hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {holders.map((holder, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-2 text-gray-700 max-w-xs truncate">{holder.name}</td>
                  <td className="p-2 text-right text-gray-900">{formatNumber(holder.shares)}</td>
                  <td className="p-2 text-right text-gray-900">
                    {holder.percent_held ? `${(holder.percent_held * 100).toFixed(2)}%` : 'N/A'}
                  </td>
                  <td className="p-2 text-right text-gray-500 hidden md:table-cell">{holder.date_reported || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8">No {holderType.replace('_', ' ')} holders data available.</div>
      )}
    </div>
  );
};

export default HoldersTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/HoldersTab.js
git commit -m "feat: add HoldersTab with institutional and mutual fund holder tables"
```

---

### Task 16: EarningsTab

**Files:**
- Create: `src/components/StockDetail/EarningsTab.js`

**Step 1: Write EarningsTab**

```jsx
// src/components/StockDetail/EarningsTab.js
import React from 'react';
import { useStockData } from '../../hooks/useStockData';
import TabSkeleton from './TabSkeleton';

const EarningsTab = ({ symbol }) => {
  const { data, loading, error, refetch } = useStockData(`/api/stocks/${symbol}/earnings`);

  if (loading) return <TabSkeleton rows={6} />;
  if (error) return <div className="text-red-600 text-center py-8">{error} <button onClick={refetch} className="text-blue-600 underline ml-2">Retry</button></div>;
  if (!data) return <div className="text-gray-500 text-center py-8">No earnings data available.</div>;

  return (
    <div className="space-y-6">
      {/* Next Earnings */}
      {data.earnings_date && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <div className="text-sm text-blue-600 mb-1">Next Earnings Date</div>
          <div className="text-xl font-bold text-blue-900">{data.earnings_date}</div>
        </div>
      )}

      {/* Earnings History */}
      {data.history?.length > 0 ? (
        <div>
          <h3 className="text-md font-semibold text-gray-800 mb-3">Earnings History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 text-gray-600 font-medium">Quarter</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Estimate</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Actual</th>
                  <th className="text-right p-2 text-gray-600 font-medium">Surprise</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((entry, idx) => {
                  const beat = entry.actual != null && entry.estimate != null && entry.actual > entry.estimate;
                  const miss = entry.actual != null && entry.estimate != null && entry.actual < entry.estimate;
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 text-gray-700">{entry.date}</td>
                      <td className="p-2 text-right text-gray-600">
                        {entry.estimate != null ? `₹${entry.estimate.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className={`p-2 text-right font-medium ${beat ? 'text-green-600' : miss ? 'text-red-600' : 'text-gray-900'}`}>
                        {entry.actual != null ? `₹${entry.actual.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className={`p-2 text-right ${entry.surprise_percent > 0 ? 'text-green-600' : entry.surprise_percent < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {entry.surprise_percent != null ? `${entry.surprise_percent > 0 ? '+' : ''}${entry.surprise_percent.toFixed(2)}%` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-gray-500 text-center py-8">No earnings history available.</div>
      )}
    </div>
  );
};

export default EarningsTab;
```

**Step 2: Commit**

```bash
git add src/components/StockDetail/EarningsTab.js
git commit -m "feat: add EarningsTab with upcoming dates and historical earnings"
```

---

## Phase 4: Integration & Polish

### Task 17: Update Header Navigation

**Files:**
- Modify: `src/components/Header.js`

**Step 1: Add "Stock Detail" awareness — highlight active route**

No new links needed, but ensure the current route is visually indicated:

```jsx
// In Header.js, update Link components to show active state
import { Link, useLocation } from 'react-router-dom';

function Header() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path || (path === '/' && location.pathname.startsWith('/stock'));

  return (
    <header className="bg-gray-800 text-white p-4 shadow-md sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          <div className="text-xl font-bold">
            <Link to="/" className="hover:text-gray-300 transition-colors">
              SWOT Analysis
            </Link>
          </div>
          <div className="flex gap-4 sm:gap-6">
            <Link
              to="/"
              className={`transition-colors px-2 py-1 rounded ${isActive('/') ? 'text-blue-400' : 'hover:text-gray-300'}`}
            >
              Home
            </Link>
            <Link
              to="/news"
              className={`transition-colors px-2 py-1 rounded ${isActive('/news') ? 'text-blue-400' : 'hover:text-gray-300'}`}
            >
              News
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Header.js
git commit -m "feat: add active route highlighting to Header navigation"
```

---

### Task 18: Wire StockSearch Navigation to Detail Page

**Files:**
- Modify: `src/components/StockSearch.js`
- Modify: `src/components/HomePage.js`

**Step 1: Add `onSelect` prop support to StockSearch**

When `onSelect` prop is provided (detail page), call it instead of widget callbacks. When not provided (dashboard), use existing widget callbacks.

In `handleSuggestionClick`:
```jsx
const handleSuggestionClick = (stock) => {
  isSelecting.current = true;
  setInput(stock.symbol);
  setIsDropdownVisible(false);

  // Navigation mode (detail page)
  if (onSelect) {
    onSelect(stock);
    return;
  }

  // Dashboard mode (existing behavior)
  try {
    if (updateSwotWidget) updateSwotWidget(stock.symbol);
    if (fetchStockPrice) fetchStockPrice(stock.symbol, null, stock.name);
    if (updateSelectedStock) updateSelectedStock(stock.symbol);
    if (updateStockChart) setTimeout(() => updateStockChart(stock.symbol), 300);
  } catch (error) {
    console.error('Error updating widgets:', error);
  }
};
```

Add `onSelect` to PropTypes.

**Step 2: Optionally add "View Details" link on dashboard**

In `HomePage.js`, add a link to `/stock/${searchSymbol}` below the search bar when a stock is selected, so users can navigate to the detail view.

**Step 3: Commit**

```bash
git add src/components/StockSearch.js src/components/HomePage.js
git commit -m "feat: add dual-mode StockSearch with onSelect for navigation and dashboard callbacks"
```

---

### Task 19: End-to-End Verification

**Step 1: Start backend**

```bash
cd backend && uvicorn main:app --reload --port 8000
```

**Step 2: Start frontend**

```bash
npm start
```

**Step 3: Test flows**

1. Home page loads with default LTFOODS stock
2. Search for "Reliance" — dropdown shows results with prices
3. Click a suggestion — dashboard widgets update
4. Navigate to `/stock/RELIANCE.NS` — detail page loads with price banner
5. Click through all 6 tabs — each loads data
6. Test mobile viewport (Chrome DevTools) — tabs scroll horizontally
7. Test invalid stock — shows 404 error
8. Test `/api/health` — returns ok

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete yfinance backend integration with tabbed stock detail page"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| **Phase 1** | Tasks 1-5 | Backend: FastAPI + yfinance + caching + all endpoints |
| **Phase 2** | Tasks 6-9 | Frontend refactoring: extract HomePage, add context/hooks, migrate API calls |
| **Phase 3** | Tasks 10-16 | Stock detail page: container + all 6 tab components |
| **Phase 4** | Tasks 17-19 | Polish: header nav, dual-mode search, end-to-end verification |

**Total: 19 tasks across 4 phases.**
