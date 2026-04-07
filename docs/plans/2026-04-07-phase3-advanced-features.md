# Phase 3: Advanced Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI stock prediction, deep backtesting, options pricing, OpenBB macro data, and crypto support to transform StockPulse into a professional-grade investment platform.

**Architecture:** Each feature is a new backend service + router + frontend component. Services are isolated — they don't depend on each other. Backend services use yfinance data as input and return computed results. Frontend adds new tabs or pages. All results are cached aggressively.

**Tech Stack:** Python (scikit-learn, backtesting.py, QuantLib-Python, ccxt) | React (lightweight-charts) | FastAPI

---

## Task 1: Install Phase 3 Dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add new dependencies**

```txt
# Add to backend/requirements.txt:
scikit-learn>=1.5.0
backtesting>=0.3.3
ccxt>=4.3.0
vaderSentiment>=3.3.2
pandas-ta>=0.3.14b1
```

Note: QuantLib-Python and OpenBB are heavy — we'll use lighter alternatives:
- Instead of QuantLib: `py_vollib` for Black-Scholes (much lighter)
- Instead of full OpenBB: Use yfinance + direct FRED API for macro data

**Step 2: Install**

```bash
cd backend && pip3 install -r requirements.txt
```

Expected: All packages install successfully.

**Step 3: Verify imports**

```bash
cd backend && python3 -c "
import sklearn; print(f'sklearn {sklearn.__version__}')
from backtesting import Backtest; print('backtesting OK')
import ccxt; print(f'ccxt {ccxt.__version__}')
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer; print('vader OK')
import pandas_ta; print(f'pandas_ta {pandas_ta.version}')
"
```

Expected: All imports succeed with version numbers.

**Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add Phase 3 dependencies (sklearn, backtesting, ccxt, vader, pandas-ta)"
```

---

## Task 2: News Sentiment Scoring with VADER

**Files:**
- Modify: `backend/services/stock_service.py`
- Modify: `src/components/NewsPage.js`
- Modify: `src/components/WatchlistPage.js`

**Step 1: Add VADER sentiment to `_parse_news()` in stock_service.py**

Find the `_parse_news` method and add sentiment scoring:

```python
# At the top of stock_service.py, add import:
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Add as class attribute in StockService:
_sentiment_analyzer = SentimentIntensityAnalyzer()
```

In the `_parse_news` method, after building each article dict, add:

```python
# Score headline sentiment
headline = content.get("title", "")
summary_text = content.get("summary", "")
text_to_score = f"{headline}. {summary_text}" if summary_text else headline
scores = self._sentiment_analyzer.polarity_scores(text_to_score)
compound = scores["compound"]

if compound >= 0.15:
    sentiment_label = "Bullish"
elif compound <= -0.15:
    sentiment_label = "Bearish"
else:
    sentiment_label = "Neutral"

articles.append({
    # ... existing fields ...
    "sentiment_score": round(compound, 3),
    "sentiment_label": sentiment_label,
})
```

**Step 2: Update NewsPage.js**

Add a sentiment badge next to each article's source/time:

```jsx
{article.sentiment_label && (
  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
    article.sentiment_label === 'Bullish' ? 'bg-green-100 text-green-700' :
    article.sentiment_label === 'Bearish' ? 'bg-red-100 text-red-700' :
    'bg-gray-100 text-gray-600'
  }`}>{article.sentiment_label}</span>
)}
```

**Step 3: Test**

```bash
curl -s http://127.0.0.1:8000/api/stocks/news?market=us | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data['articles'][:5]:
    print(f'{a[\"sentiment_label\"]:8s} ({a[\"sentiment_score\"]:+.3f}) {a[\"title\"][:60]}')
"
```

Expected: Each article has a sentiment_label and sentiment_score.

**Step 4: Commit**

```bash
git add backend/services/stock_service.py src/components/NewsPage.js
git commit -m "feat: add VADER sentiment scoring to news articles"
```

---

## Task 3: Advanced Technical Indicators with pandas-ta

**Files:**
- Modify: `backend/services/stock_service.py`
- Modify: `src/components/StockDetail/TechnicalTab.js`

**Step 1: Replace manual TA calculations with pandas-ta**

In `stock_service.py`, replace the `get_technical_analysis` method. Instead of manual `_calc_sma`, `_calc_ema`, `_calc_rsi`, `_calc_macd`, `_calc_bollinger`, use:

```python
import pandas_ta as ta

# Inside get_technical_analysis:
df = ticker.history(period="1y")
if df.empty or len(df) < 50:
    return None

# Calculate all indicators at once
df.ta.sma(length=20, append=True)
df.ta.sma(length=50, append=True)
df.ta.sma(length=200, append=True)
df.ta.ema(length=12, append=True)
df.ta.ema(length=26, append=True)
df.ta.ema(length=50, append=True)
df.ta.rsi(length=14, append=True)
df.ta.macd(fast=12, slow=26, signal=9, append=True)
df.ta.bbands(length=20, std=2, append=True)
df.ta.atr(length=14, append=True)
df.ta.stoch(append=True)        # NEW: Stochastic
df.ta.adx(length=14, append=True)  # NEW: ADX
df.ta.willr(length=14, append=True) # NEW: Williams %R

# Candlestick patterns (NEW)
patterns = df.ta.cdl_pattern(name="all")
detected = []
if patterns is not None and not patterns.empty:
    last_row = patterns.iloc[-1]
    for col in patterns.columns:
        val = last_row[col]
        if val != 0:
            pattern_name = col.replace("CDL_", "").replace("_", " ").title()
            detected.append({
                "name": pattern_name,
                "signal": "Bullish" if val > 0 else "Bearish",
                "strength": abs(int(val)),
            })
```

**Step 2: Add new indicators and patterns to the response**

Add to the result dict:

```python
"stochastic": {
    "k": round(float(df[f"STOCHk_14_3_3"].iloc[-1]), 2) if f"STOCHk_14_3_3" in df else None,
    "d": round(float(df[f"STOCHd_14_3_3"].iloc[-1]), 2) if f"STOCHd_14_3_3" in df else None,
},
"adx": round(float(df["ADX_14"].iloc[-1]), 2) if "ADX_14" in df else None,
"williams_r": round(float(df["WILLR_14"].iloc[-1]), 2) if "WILLR_14" in df else None,
"candlestick_patterns": detected,
```

**Step 3: Update TechnicalTab.js**

Add new sections after the existing oscillators table:

- Stochastic Oscillator card (K and D values)
- ADX card (trend strength: <20 weak, 20-40 moderate, >40 strong)
- Williams %R card (overbought >-20, oversold <-80)
- Candlestick Patterns section: list of detected patterns with Bullish/Bearish badges

**Step 4: Test**

```bash
curl -s http://127.0.0.1:8000/api/stocks/AAPL/technical | python3 -m json.tool | grep -A2 "stochastic\|adx\|williams\|candlestick"
```

**Step 5: Commit**

```bash
git commit -m "feat: replace manual TA with pandas-ta, add stochastic/ADX/patterns"
```

---

## Task 4: Strategy Backtesting Engine

**Files:**
- Create: `backend/services/backtest_service.py`
- Create: `backend/routers/backtest.py`
- Create: `src/components/BacktestPage.js`
- Modify: `backend/main.py` (add router)
- Modify: `src/App.js` (add route)
- Modify: `src/components/Header.js` (add nav)

**Step 1: Create backtest_service.py**

```python
# backend/services/backtest_service.py
import yfinance as yf
import pandas as pd
from backtesting import Backtest, Strategy
from backtesting.lib import crossover
from backtesting.test import SMA
from utils.cache import cache_manager


class SmaCross(Strategy):
    fast = 10
    slow = 30

    def init(self):
        price = self.data.Close
        self.ma_fast = self.I(SMA, price, self.fast)
        self.ma_slow = self.I(SMA, price, self.slow)

    def next(self):
        if crossover(self.ma_fast, self.ma_slow):
            self.buy()
        elif crossover(self.ma_slow, self.ma_fast):
            self.sell()


class RsiStrategy(Strategy):
    rsi_period = 14
    overbought = 70
    oversold = 30

    def init(self):
        close = pd.Series(self.data.Close)
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(self.rsi_period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(self.rsi_period).mean()
        rs = gain / loss
        self.rsi = self.I(lambda: 100 - (100 / (1 + rs)))

    def next(self):
        if self.rsi[-1] < self.oversold:
            self.buy()
        elif self.rsi[-1] > self.overbought:
            self.sell()


STRATEGIES = {
    "sma_crossover": {"class": SmaCross, "params": {"fast": 10, "slow": 30}, "name": "SMA Crossover"},
    "rsi": {"class": RsiStrategy, "params": {"rsi_period": 14, "overbought": 70, "oversold": 30}, "name": "RSI Strategy"},
}


class BacktestService:
    def run_backtest(self, symbol: str, strategy_name: str = "sma_crossover",
                     period: str = "2y", cash: float = 100000, **params) -> dict | None:
        cache_key = f"{symbol}_{strategy_name}_{period}_{cash}_{str(params)}"
        cached = cache_manager.get("backtest", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period)
            if df.empty or len(df) < 100:
                return None

            # Clean data for backtesting lib
            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()

            strat_config = STRATEGIES.get(strategy_name)
            if not strat_config:
                return None

            strat_class = strat_config["class"]
            merged_params = {**strat_config["params"], **params}

            bt = Backtest(df, strat_class, cash=cash, commission=0.001)
            stats = bt.run(**merged_params)

            # Extract trade log
            trades = []
            if hasattr(stats, '_trades') and stats._trades is not None:
                for _, trade in stats._trades.iterrows():
                    trades.append({
                        "entry_date": str(trade.get("EntryTime", "")),
                        "exit_date": str(trade.get("ExitTime", "")),
                        "entry_price": round(float(trade.get("EntryPrice", 0)), 2),
                        "exit_price": round(float(trade.get("ExitPrice", 0)), 2),
                        "pnl": round(float(trade.get("PnL", 0)), 2),
                        "return_pct": round(float(trade.get("ReturnPct", 0) * 100), 2),
                        "type": "Long" if trade.get("Size", 0) > 0 else "Short",
                    })

            # Build equity curve
            equity = stats._equity_curve
            equity_data = []
            if equity is not None:
                sampled = equity.iloc[::max(1, len(equity)//100)]  # Max 100 points
                for idx, row in sampled.iterrows():
                    equity_data.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "equity": round(float(row.get("Equity", cash)), 2),
                    })

            result = {
                "symbol": symbol,
                "strategy": strat_config["name"],
                "period": period,
                "initial_cash": cash,
                "final_equity": round(float(stats["Equity Final [$]"]), 2),
                "total_return_pct": round(float(stats["Return [%]"]), 2),
                "buy_hold_return_pct": round(float(stats["Buy & Hold Return [%]"]), 2),
                "max_drawdown_pct": round(float(stats["Max. Drawdown [%]"]), 2),
                "sharpe_ratio": round(float(stats["Sharpe Ratio"]), 2) if stats["Sharpe Ratio"] == stats["Sharpe Ratio"] else None,
                "win_rate_pct": round(float(stats["Win Rate [%]"]), 2),
                "total_trades": int(stats["# Trades"]),
                "avg_trade_pct": round(float(stats["Avg. Trade [%]"]), 2),
                "best_trade_pct": round(float(stats["Best Trade [%]"]), 2),
                "worst_trade_pct": round(float(stats["Worst Trade [%]"]), 2),
                "profit_factor": round(float(stats["Profit Factor"]), 2) if stats["Profit Factor"] == stats["Profit Factor"] else None,
                "trades": trades[:50],  # Limit to 50 trades
                "equity_curve": equity_data,
                "available_strategies": list(STRATEGIES.keys()),
            }

            from services.stock_service import sanitize_json
            result = sanitize_json(result)
            cache_manager.set("backtest", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Backtest error: {e}")
            return None


backtest_service = BacktestService()
```

**Step 2: Create backtest router**

```python
# backend/routers/backtest.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.backtest_service import backtest_service

router = APIRouter()


@router.get("/{symbol}")
async def run_backtest(
    symbol: str,
    strategy: Annotated[str, Query()] = "sma_crossover",
    period: Annotated[str, Query(pattern="^(6mo|1y|2y|5y|max)$")] = "2y",
    cash: Annotated[float, Query(ge=10000, le=10000000)] = 100000,
):
    result = await asyncio.to_thread(
        backtest_service.run_backtest, symbol, strategy, period, cash
    )
    if not result:
        return JSONResponse(status_code=404, content={"error": "Could not run backtest", "code": "BACKTEST_FAILED"})
    return result
```

**Step 3: Register router in main.py**

Add after the stocks router import:

```python
from routers.backtest import router as backtest_router
app.include_router(backtest_router, prefix="/api/backtest")
```

**Step 4: Create BacktestPage.js**

Create a full-featured backtesting page with:
- Stock symbol search input (reuse SearchInput pattern)
- Strategy selector dropdown (SMA Crossover, RSI)
- Period selector (6M, 1Y, 2Y, 5Y)
- Initial capital input (default 100000)
- "Run Backtest" button
- Results section:
  - Summary cards: Final Equity, Total Return%, Buy&Hold%, Max Drawdown, Sharpe, Win Rate
  - Strategy vs Buy&Hold comparison badges
  - Equity curve chart (canvas-based, like existing ChartTab)
  - Trade log table: Entry Date, Exit Date, Entry Price, Exit Price, P&L, Return%
- Disclaimer

**Step 5: Add route and nav**

In `src/App.js`: Add `import BacktestPage` and `<Route path="/backtest" element={<BacktestPage />} />`

In `src/components/Header.js`: Add `{ to: '/backtest', label: 'Backtest' }` to NAV_ITEMS.

**Step 6: Test end-to-end**

```bash
curl -s "http://127.0.0.1:8000/api/backtest/AAPL?strategy=sma_crossover&period=2y" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Strategy: {d[\"strategy\"]}')
print(f'Return: {d[\"total_return_pct\"]}% vs Buy&Hold: {d[\"buy_hold_return_pct\"]}%')
print(f'Trades: {d[\"total_trades\"]}, Win Rate: {d[\"win_rate_pct\"]}%')
print(f'Sharpe: {d[\"sharpe_ratio\"]}, Max DD: {d[\"max_drawdown_pct\"]}%')
"
```

**Step 7: Commit**

```bash
git add backend/services/backtest_service.py backend/routers/backtest.py backend/main.py src/components/BacktestPage.js src/App.js src/components/Header.js
git commit -m "feat: add strategy backtesting engine with SMA crossover and RSI strategies"
```

---

## Task 5: Crypto Market Page with CCXT

**Files:**
- Create: `backend/services/crypto_service.py`
- Create: `backend/routers/crypto.py`
- Create: `src/components/CryptoPage.js`
- Modify: `backend/main.py` (add router)
- Modify: `src/App.js` (add route)
- Modify: `src/components/Header.js` (add nav)

**Step 1: Create crypto_service.py**

```python
# backend/services/crypto_service.py
import ccxt
from utils.cache import cache_manager


class CryptoService:
    def __init__(self):
        self.exchange = ccxt.binance({"enableRateLimit": True})

    TOP_CRYPTOS = [
        "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
        "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "DOT/USDT", "MATIC/USDT",
        "LINK/USDT", "UNI/USDT", "ATOM/USDT", "LTC/USDT", "FIL/USDT",
    ]

    def get_crypto_prices(self) -> list[dict]:
        cached = cache_manager.get("crypto", "prices")
        if cached is not None:
            return cached

        try:
            tickers = self.exchange.fetch_tickers(self.TOP_CRYPTOS)
            results = []
            for symbol, data in tickers.items():
                base = symbol.split("/")[0]
                results.append({
                    "symbol": symbol,
                    "name": base,
                    "price": data.get("last"),
                    "change_24h": data.get("change"),
                    "change_pct_24h": data.get("percentage"),
                    "volume_24h": data.get("quoteVolume"),
                    "high_24h": data.get("high"),
                    "low_24h": data.get("low"),
                })
            results.sort(key=lambda x: x.get("volume_24h") or 0, reverse=True)
            cache_manager.set("crypto", "prices", results, ttl=60)
            return results
        except Exception as e:
            print(f"Crypto error: {e}")
            return []

    def get_crypto_chart(self, symbol: str = "BTC/USDT", timeframe: str = "1d", limit: int = 90) -> list[dict]:
        cache_key = f"chart_{symbol}_{timeframe}_{limit}"
        cached = cache_manager.get("crypto", cache_key)
        if cached is not None:
            return cached

        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            data = []
            for candle in ohlcv:
                data.append({
                    "timestamp": candle[0],
                    "date": self.exchange.iso8601(candle[0])[:10],
                    "open": candle[1],
                    "high": candle[2],
                    "low": candle[3],
                    "close": candle[4],
                    "volume": candle[5],
                })
            cache_manager.set("crypto", cache_key, data, ttl=300)
            return data
        except Exception as e:
            print(f"Crypto chart error: {e}")
            return []


crypto_service = CryptoService()
```

**Step 2: Create crypto router**

```python
# backend/routers/crypto.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from services.crypto_service import crypto_service

router = APIRouter()


@router.get("/prices")
async def get_prices():
    data = await asyncio.to_thread(crypto_service.get_crypto_prices)
    return {"cryptos": data}


@router.get("/chart/{symbol}")
async def get_chart(
    symbol: str,
    timeframe: Annotated[str, Query(pattern="^(1h|4h|1d|1w)$")] = "1d",
    limit: Annotated[int, Query(ge=10, le=365)] = 90,
):
    # Convert URL-safe symbol to exchange format (BTC -> BTC/USDT)
    pair = f"{symbol}/USDT" if "/" not in symbol else symbol
    data = await asyncio.to_thread(crypto_service.get_crypto_chart, pair, timeframe, limit)
    return {"symbol": pair, "data": data}
```

**Step 3: Register router in main.py**

```python
from routers.crypto import router as crypto_router
app.include_router(crypto_router, prefix="/api/crypto")
```

**Step 4: Create CryptoPage.js**

Create a crypto dashboard with:
- Top 15 cryptos table: Name, Price (USD), 24h Change%, 24h Volume, 24h High/Low
- Click any crypto to see its chart below
- Chart with timeframe selector (1H, 4H, 1D, 1W)
- Auto-refresh indicator (prices cached 60s)
- Green/red coloring for price changes

**Step 5: Add route and nav**

In `src/App.js`: Add `import CryptoPage` and `<Route path="/crypto" element={<CryptoPage />} />`

In `src/components/Header.js`: Add `{ to: '/crypto', label: 'Crypto' }` to NAV_ITEMS.

**Step 6: Test**

```bash
curl -s http://127.0.0.1:8000/api/crypto/prices | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data['cryptos'][:5]:
    print(f'{c[\"name\"]:6s} \${c[\"price\"]:>10,.2f}  {c[\"change_pct_24h\"]:+.2f}%')
"
```

**Step 7: Commit**

```bash
git commit -m "feat: add crypto market page with live prices and charts via CCXT"
```

---

## Task 6: Portfolio Optimization with PyPortfolioOpt

**Files:**
- Create: `backend/services/portfolio_service.py`
- Create: `backend/routers/portfolio.py`
- Modify: `backend/main.py` (add router)
- Modify: `backend/requirements.txt` (add PyPortfolioOpt)
- Modify: `src/components/PortfolioPage.js` (add optimize section)

**Step 1: Install PyPortfolioOpt**

```bash
pip3 install PyPortfolioOpt
```

Add to requirements.txt: `PyPortfolioOpt>=2.0.0`

**Step 2: Create portfolio_service.py**

```python
# backend/services/portfolio_service.py
import yfinance as yf
import pandas as pd
from pypfopt import EfficientFrontier, risk_models, expected_returns
from pypfopt.discrete_allocation import DiscreteAllocation, get_latest_prices
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class PortfolioService:
    def optimize(self, symbols: list[str], total_amount: float = 100000) -> dict | None:
        cache_key = f"{'_'.join(sorted(symbols))}_{total_amount}"
        cached = cache_manager.get("portfolio_opt", cache_key)
        if cached is not None:
            return cached

        try:
            # Download historical data
            df = yf.download(symbols, period="2y", auto_adjust=True)["Close"]
            if df.empty:
                return None

            # Calculate expected returns and covariance
            mu = expected_returns.mean_historical_return(df)
            S = risk_models.sample_cov(df)

            # Max Sharpe optimization
            ef = EfficientFrontier(mu, S)
            ef.max_sharpe(risk_free_rate=0.05)
            weights = ef.clean_weights()
            perf = ef.portfolio_performance(verbose=False, risk_free_rate=0.05)

            # Discrete allocation
            latest_prices = get_latest_prices(df)
            da = DiscreteAllocation(weights, latest_prices, total_portfolio_value=total_amount)
            allocation, leftover = da.greedy_portfolio()

            # Build response
            allocations = []
            for sym, weight in weights.items():
                shares = allocation.get(sym, 0)
                price = float(latest_prices[sym])
                allocations.append({
                    "symbol": sym,
                    "weight": round(float(weight) * 100, 2),
                    "shares": shares,
                    "price": round(price, 2),
                    "value": round(shares * price, 2),
                })

            result = sanitize_json({
                "symbols": symbols,
                "total_amount": total_amount,
                "leftover_cash": round(float(leftover), 2),
                "expected_return": round(float(perf[0]) * 100, 2),
                "volatility": round(float(perf[1]) * 100, 2),
                "sharpe_ratio": round(float(perf[2]), 2),
                "allocations": sorted(allocations, key=lambda x: x["weight"], reverse=True),
            })

            cache_manager.set("portfolio_opt", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Portfolio optimization error: {e}")
            return None


portfolio_service = PortfolioService()
```

**Step 3: Create portfolio router**

```python
# backend/routers/portfolio.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.portfolio_service import portfolio_service

router = APIRouter()


@router.get("/optimize")
async def optimize_portfolio(
    symbols: Annotated[str, Query(description="Comma-separated stock symbols")],
    amount: Annotated[float, Query(ge=10000, le=100000000)] = 100000,
):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(symbol_list) < 2:
        return JSONResponse(status_code=400, content={"error": "Need at least 2 symbols"})
    result = await asyncio.to_thread(portfolio_service.optimize, symbol_list, amount)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Optimization failed"})
    return result
```

**Step 4: Register router**

In `backend/main.py`:
```python
from routers.portfolio import router as portfolio_router
app.include_router(portfolio_router, prefix="/api/portfolio")
```

**Step 5: Add "Optimize Portfolio" section to PortfolioPage.js**

Add a button below portfolio summary that:
- Takes all portfolio symbols
- Calls `/api/portfolio/optimize?symbols=SYM1,SYM2&amount=TOTAL`
- Shows: Expected Return%, Volatility%, Sharpe Ratio
- Shows allocation table: Stock, Current Weight, Optimal Weight, Suggested Shares
- Bar chart comparing current vs optimal allocation

**Step 6: Test**

```bash
curl -s "http://127.0.0.1:8000/api/portfolio/optimize?symbols=AAPL,MSFT,GOOGL,AMZN&amount=100000" | python3 -m json.tool | head -20
```

**Step 7: Commit**

```bash
git commit -m "feat: add portfolio optimization with PyPortfolioOpt (max Sharpe)"
```

---

## Task 7: Options Chain Tab

**Files:**
- Modify: `backend/services/stock_service.py` (add get_options method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/StockDetail/OptionsTab.js`
- Modify: `src/components/StockDetail/StockDetailPage.js` (add tab)

**Step 1: Add get_options to stock_service.py**

```python
def get_options(self, symbol: str) -> dict | None:
    """Get options chain data using yfinance."""
    cached = cache_manager.get("options", symbol)
    if cached is not None:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        expirations = ticker.options  # List of expiration dates
        if not expirations:
            return None

        # Get chain for nearest expiration
        nearest = expirations[0]
        chain = ticker.option_chain(nearest)

        def parse_options(df, option_type):
            options = []
            for _, row in df.iterrows():
                options.append({
                    "strike": float(row.get("strike", 0)),
                    "last_price": float(row.get("lastPrice", 0)),
                    "bid": float(row.get("bid", 0)),
                    "ask": float(row.get("ask", 0)),
                    "volume": int(row.get("volume", 0)) if row.get("volume") == row.get("volume") else 0,
                    "open_interest": int(row.get("openInterest", 0)) if row.get("openInterest") == row.get("openInterest") else 0,
                    "implied_vol": round(float(row.get("impliedVolatility", 0)) * 100, 2),
                    "in_the_money": bool(row.get("inTheMoney", False)),
                    "type": option_type,
                })
            return options

        calls = parse_options(chain.calls, "call")
        puts = parse_options(chain.puts, "put")

        # Calculate PCR and Max Pain
        total_call_oi = sum(c["open_interest"] for c in calls)
        total_put_oi = sum(p["open_interest"] for p in puts)
        pcr = round(total_put_oi / total_call_oi, 2) if total_call_oi > 0 else 0

        info = self._get_ticker_info(symbol)
        current_price = info.get("regularMarketPrice", 0) if info else 0

        result = sanitize_json({
            "symbol": symbol,
            "current_price": current_price,
            "expirations": list(expirations[:6]),
            "selected_expiration": nearest,
            "calls": calls,
            "puts": puts,
            "pcr": pcr,
            "total_call_oi": total_call_oi,
            "total_put_oi": total_put_oi,
        })

        cache_manager.set("options", symbol, result, ttl=600)
        return result
    except Exception as e:
        print(f"Options error: {e}")
        return None
```

**Step 2: Add router endpoint**

In `backend/routers/stocks.py`, add before the `/{symbol}/quote` route:

```python
@router.get("/{symbol}/options")
async def get_options(symbol: str):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_options, resolved)
    if not result:
        return _not_found(symbol)
    return result
```

**Step 3: Create OptionsTab.js**

Create with:
- Expiration date selector dropdown
- Call/Put toggle or side-by-side view
- Options chain table: Strike, Last Price, Bid, Ask, Volume, OI, IV%, ITM indicator
- PCR (Put-Call Ratio) gauge
- Total Call OI vs Put OI bar
- Current stock price line indicator in the table
- ITM rows highlighted

**Step 4: Add tab to StockDetailPage.js**

Add `{ id: 'options', label: 'Options' }` to TABS array and import/render OptionsTab.

**Step 5: Test**

```bash
curl -s "http://127.0.0.1:8000/api/stocks/AAPL/options" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Expiry: {d[\"selected_expiration\"]}')
print(f'Calls: {len(d[\"calls\"])}, Puts: {len(d[\"puts\"])}')
print(f'PCR: {d[\"pcr\"]}')
"
```

**Step 6: Commit**

```bash
git commit -m "feat: add Options Chain tab with calls/puts data and PCR"
```

---

## Task 8: AI Stock Price Prediction (LSTM)

**Files:**
- Create: `backend/services/prediction_service.py`
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/StockDetail/PredictionTab.js`
- Modify: `src/components/StockDetail/StockDetailPage.js` (add tab)

**Step 1: Create prediction_service.py**

```python
# backend/services/prediction_service.py
import numpy as np
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import GradientBoostingRegressor
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class PredictionService:
    def predict(self, symbol: str, days: int = 7) -> dict | None:
        cache_key = f"{symbol}_{days}"
        cached = cache_manager.get("prediction", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="2y")
            if df.empty or len(df) < 100:
                return None

            closes = df["Close"].values.reshape(-1, 1)

            # Feature engineering
            df_feat = df.copy()
            for lag in [1, 3, 5, 10, 20]:
                df_feat[f"lag_{lag}"] = df_feat["Close"].shift(lag)
            df_feat["ma_5"] = df_feat["Close"].rolling(5).mean()
            df_feat["ma_20"] = df_feat["Close"].rolling(20).mean()
            df_feat["volatility"] = df_feat["Close"].rolling(10).std()
            df_feat = df_feat.dropna()

            feature_cols = [c for c in df_feat.columns if c.startswith("lag_") or c in ["ma_5", "ma_20", "volatility"]]
            X = df_feat[feature_cols].values
            y = df_feat["Close"].values

            # Scale
            scaler_X = MinMaxScaler()
            scaler_y = MinMaxScaler()
            X_scaled = scaler_X.fit_transform(X)
            y_scaled = scaler_y.fit_transform(y.reshape(-1, 1)).flatten()

            # Train on all but last 30 days
            split = -30
            X_train, X_test = X_scaled[:split], X_scaled[split:]
            y_train, y_test = y_scaled[:split], y_scaled[split:]

            # Model 1: Linear Regression
            lr = LinearRegression()
            lr.fit(X_train, y_train)
            lr_score = lr.score(X_test, y_test)

            # Model 2: Gradient Boosting
            gb = GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42)
            gb.fit(X_train, y_train)
            gb_score = gb.score(X_test, y_test)

            # Use best model for prediction
            best_model = gb if gb_score > lr_score else lr
            best_name = "Gradient Boosting" if gb_score > lr_score else "Linear Regression"

            # Predict next N days iteratively
            last_features = X_scaled[-1:].copy()
            predictions = []
            last_date = df.index[-1]

            for i in range(days):
                pred_scaled = best_model.predict(last_features)[0]
                pred_price = float(scaler_y.inverse_transform([[pred_scaled]])[0][0])
                pred_date = last_date + pd.Timedelta(days=i + 1)

                # Skip weekends
                while pred_date.weekday() >= 5:
                    pred_date += pd.Timedelta(days=1)

                predictions.append({
                    "date": pred_date.strftime("%Y-%m-%d"),
                    "predicted_price": round(pred_price, 2),
                })

                # Shift features for next prediction
                new_features = np.roll(last_features[0], -1)
                new_features[-1] = pred_scaled
                last_features = new_features.reshape(1, -1)

            current_price = float(df["Close"].iloc[-1])
            predicted_end = predictions[-1]["predicted_price"]
            direction = "Bullish" if predicted_end > current_price else "Bearish"
            change_pct = round(((predicted_end - current_price) / current_price) * 100, 2)

            # Historical accuracy on test set
            test_pred = scaler_y.inverse_transform(best_model.predict(X_test).reshape(-1, 1)).flatten()
            test_actual = scaler_y.inverse_transform(y_test.reshape(-1, 1)).flatten()
            mape = round(float(np.mean(np.abs((test_actual - test_pred) / test_actual)) * 100), 2)

            import pandas as pd

            result = sanitize_json({
                "symbol": symbol,
                "model": best_name,
                "model_accuracy": round(max(lr_score, gb_score) * 100, 2),
                "mape": mape,
                "current_price": round(current_price, 2),
                "predictions": predictions,
                "direction": direction,
                "predicted_change_pct": change_pct,
                "prediction_days": days,
                "disclaimer": "AI predictions are experimental and should not be used as the sole basis for investment decisions.",
            })

            cache_manager.set("prediction", cache_key, result, ttl=86400)
            return result
        except Exception as e:
            print(f"Prediction error: {e}")
            import traceback
            traceback.print_exc()
            return None


prediction_service = PredictionService()
```

**Step 2: Add router endpoint**

In `backend/routers/stocks.py`:

```python
@router.get("/{symbol}/predict")
async def get_prediction(symbol: str, days: Annotated[int, Query(ge=1, le=30)] = 7):
    from services.prediction_service import prediction_service
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(prediction_service.predict, resolved, days)
    if not result:
        return _not_found(symbol)
    return result
```

**Step 3: Create PredictionTab.js**

Create with:
- Day selector: 7, 14, 30 days
- Direction badge (Bullish/Bearish) with predicted change %
- Model info: which model, accuracy %, MAPE
- Prediction chart: current price line + predicted prices as dashed extension
- Prediction table: Date, Predicted Price
- BIG disclaimer banner

**Step 4: Add tab to StockDetailPage.js**

Add `{ id: 'prediction', label: 'AI Predict' }` to TABS array.

**Step 5: Test**

```bash
curl -s "http://127.0.0.1:8000/api/stocks/AAPL/predict?days=7" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Model: {d[\"model\"]} (Accuracy: {d[\"model_accuracy\"]}%)')
print(f'Direction: {d[\"direction\"]} ({d[\"predicted_change_pct\"]:+.2f}%)')
for p in d['predictions']:
    print(f'  {p[\"date\"]}: \${p[\"predicted_price\"]}')
"
```

**Step 6: Commit**

```bash
git commit -m "feat: add AI stock price prediction with Linear Regression and Gradient Boosting"
```

---

## Summary

| Task | Feature | New Files | Effort |
|------|---------|-----------|--------|
| 1 | Install dependencies | 0 | 10 min |
| 2 | News Sentiment (VADER) | 0 new, 3 modified | 1-2 hours |
| 3 | Advanced TA (pandas-ta) | 0 new, 2 modified | 2-3 hours |
| 4 | Strategy Backtesting | 3 new, 3 modified | 4-5 hours |
| 5 | Crypto Market | 3 new, 3 modified | 3-4 hours |
| 6 | Portfolio Optimization | 2 new, 3 modified | 3-4 hours |
| 7 | Options Chain | 1 new, 3 modified | 3-4 hours |
| 8 | AI Prediction | 1 new, 3 modified | 4-5 hours |
| **Total** | **8 features** | **10 new, ~15 modified** | **~22-28 hours** |
