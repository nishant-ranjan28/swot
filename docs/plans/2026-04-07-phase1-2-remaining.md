# Phase 1 & 2 Remaining Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining Phase 1 & 2 features — professional charts, faster data fetching, sparklines, and risk analytics.

**Architecture:** Each feature is independent. Lightweight-charts replaces canvas code in ChartTab. yahooquery replaces yfinance for batch calls. uPlot adds sparklines to existing tables. Riskfolio adds risk metrics to portfolio.

**Tech Stack:** lightweight-charts (JS), uPlot (JS), yahooquery (Python), Riskfolio-Lib (Python)

**Already completed from Phase 3:** pandas-ta, VADER sentiment, backtesting, crypto, portfolio optimization, options chain, AI prediction. FinBERT skipped (400MB model too heavy for free Render).

---

## Task 1: Professional Charts — TradingView Lightweight Charts

**Files:**
- Modify: `src/components/StockDetail/ChartTab.js`
- Modify: `package.json` (add lightweight-charts)

**Step 1: Install**

```bash
npm install lightweight-charts
```

**Step 2: Rewrite ChartTab.js**

Replace the entire canvas-based `StockChart` component with TradingView's lightweight-charts:

```jsx
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
```

Key implementation:
- `useRef` for chart container div
- `useEffect` to create chart on mount, update data on change, cleanup on unmount
- Candlestick series for OHLC data
- Histogram series for volume (below price)
- Time range buttons (1W, 1M, 3M, 6M, 1Y, 2Y, 5Y, Max) — same as current
- Stats row (Period Return, High, Low, Avg Volume) — keep from current
- Responsive: `chart.applyOptions({ width: container.clientWidth })` on resize
- Dark/light theme support via chart options
- Currency-aware tooltip using `useMarket`
- MA overlay toggle (SMA 20, 50 on chart)

**Chart options:**
```javascript
const chart = createChart(containerRef.current, {
  layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#333' },
  grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#e0e0e0' },
  timeScale: { borderColor: '#e0e0e0', timeVisible: false },
  width: containerWidth,
  height: 400,
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#22c55e', downColor: '#ef4444',
  borderUpColor: '#22c55e', borderDownColor: '#ef4444',
  wickUpColor: '#22c55e', wickDownColor: '#ef4444',
});

// Data format: { time: '2024-01-15', open: 100, high: 105, low: 98, close: 103 }
candleSeries.setData(ohlcData);

// Volume
const volumeSeries = chart.addHistogramSeries({
  priceFormat: { type: 'volume' },
  priceScaleId: 'volume',
});
chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
volumeSeries.setData(volumeData);
```

**Step 3: Keep existing stats row and range selector**

The range buttons, stats cards (Period Return, High, Low, Avg Volume), loading/error states stay the same. Only the chart rendering changes.

**Step 4: Add MA overlay toggle**

```javascript
// Optional MA overlays
const [showMA, setShowMA] = useState(false);
if (showMA) {
  const ma20Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'SMA 20' });
  // Calculate SMA from data
}
```

**Step 5: Verify**

```bash
npm start
# Navigate to any stock chart tab
```

Expected: Professional candlestick chart with volume, crosshair, zoom/pan.

**Step 6: Commit**

```bash
git commit -m "feat: replace canvas charts with TradingView lightweight-charts"
```

---

## Task 2: Faster Data Fetching — yahooquery

**Files:**
- Modify: `backend/services/stock_service.py`
- Modify: `backend/requirements.txt`

**Step 1: Install**

```bash
pip3 install yahooquery
```

Add to requirements.txt: `yahooquery>=2.3.0`

**Step 2: Add batch quote fetching**

In `stock_service.py`, add a new method for batch fetching:

```python
from yahooquery import Ticker as YQTicker

def get_batch_quotes(self, symbols: list[str]) -> dict:
    """Fetch quotes for multiple symbols in one call using yahooquery."""
    cache_key = "_".join(sorted(symbols[:20]))
    cached = cache_manager.get("batch_quote", cache_key)
    if cached is not None:
        return cached

    try:
        tickers = YQTicker(symbols)
        prices = tickers.price
        
        results = {}
        for sym, data in prices.items():
            if isinstance(data, str):  # Error message
                continue
            price = data.get("regularMarketPrice", 0)
            prev = data.get("regularMarketPreviousClose", 0)
            change = round(price - prev, 2) if price and prev else 0
            change_pct = round((change / prev) * 100, 2) if prev else 0
            results[sym] = {
                "symbol": sym,
                "name": data.get("shortName", ""),
                "price": price,
                "previous_close": prev,
                "change": change,
                "change_percent": change_pct,
                "volume": data.get("regularMarketVolume"),
                "market_cap": data.get("marketCap"),
                "day_high": data.get("regularMarketDayHigh"),
                "day_low": data.get("regularMarketDayLow"),
                "week52_high": data.get("fiftyTwoWeekHigh"),
                "week52_low": data.get("fiftyTwoWeekLow"),
                "currency": data.get("currency", "INR"),
            }
        
        cache_manager.set("batch_quote", cache_key, results, ttl=60)
        return results
    except Exception as e:
        print(f"Batch quote error: {e}")
        return {}
```

**Step 3: Use batch quotes in trending stocks**

Replace the loop in `get_trending_stocks`:

```python
def get_trending_stocks(self, market: str = "in") -> list[dict]:
    cache_key = f"popular_{market}"
    cached = cache_manager.get("trending", cache_key)
    if cached is not None:
        return cached

    symbols = self.POPULAR_STOCKS.get(market, self.POPULAR_STOCKS["in"])
    batch = self.get_batch_quotes(symbols)
    results = [batch[s] for s in symbols if s in batch and batch[s].get("price")]

    cache_manager.set("trending", cache_key, results, ttl=300)
    return results
```

**Step 4: Add batch endpoint for frontend**

Add to router:
```python
@router.get("/batch")
async def get_batch_quotes(symbols: Annotated[str, Query()]):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()][:20]
    result = await asyncio.to_thread(stock_service.get_batch_quotes, symbol_list)
    return {"quotes": result}
```

**Step 5: Update watchlist/portfolio frontend to use batch endpoint**

Instead of N individual `/quote` calls, call `/api/stocks/batch?symbols=SYM1,SYM2,...` once.

**Step 6: Commit**

```bash
git commit -m "feat: add yahooquery batch fetching for faster trending and watchlist loads"
```

---

## Task 3: Dashboard Sparklines — uPlot

**Files:**
- Create: `src/components/Sparkline.js`
- Modify: `src/components/WatchlistPage.js`
- Modify: `src/components/PortfolioPage.js`
- Modify: `package.json` (add uplot)

**Step 1: Install**

```bash
npm install uplot
```

**Step 2: Create Sparkline component**

```jsx
// src/components/Sparkline.js
import React, { useRef, useEffect } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

const Sparkline = ({ data, width = 80, height = 30, color }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!data || data.length < 2 || !containerRef.current) return;

    const isPositive = data[data.length - 1] >= data[0];
    const lineColor = color || (isPositive ? '#22c55e' : '#ef4444');

    // Build timestamps (just sequential for sparkline)
    const timestamps = data.map((_, i) => i);

    const opts = {
      width,
      height,
      cursor: { show: false },
      legend: { show: false },
      axes: [{ show: false }, { show: false }],
      scales: { x: { time: false } },
      series: [
        {},
        {
          stroke: lineColor,
          width: 1.5,
          fill: lineColor + '15',
        },
      ],
    };

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new uPlot(opts, [timestamps, data], containerRef.current);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, width, height, color]);

  return <div ref={containerRef} className="inline-block" />;
};

export default Sparkline;
```

**Step 3: Add sparklines to WatchlistPage**

In each watchlist row, fetch 5-day close prices and show a sparkline:

- Add a new column "5D" to the watchlist table
- For each stock, fetch `/api/stocks/{symbol}/history?range=5d`
- Show `<Sparkline data={closes} />` in the cell
- Use a batch approach: fetch all sparkline data on mount

**Step 4: Add sparklines to PortfolioPage**

Same approach — add sparkline column to holdings table.

**Step 5: Commit**

```bash
git commit -m "feat: add uPlot sparklines to watchlist and portfolio tables"
```

---

## Task 4: Risk Analytics — Portfolio Risk Dashboard

**Files:**
- Create: `backend/services/risk_service.py`
- Modify: `backend/routers/portfolio.py` (add risk endpoint)
- Modify: `src/components/PortfolioPage.js` (add risk section)

**Step 1: Install Riskfolio-Lib**

```bash
pip3 install riskfolio-lib
```

Add to requirements.txt: `riskfolio-lib>=6.0.0`

Note: If riskfolio-lib fails on Render (heavy deps), fall back to manual calculations using numpy/scipy.

**Step 2: Create risk_service.py**

```python
# backend/services/risk_service.py
import numpy as np
import yfinance as yf
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class RiskService:
    def analyze(self, symbols: list[str], weights: list[float] = None) -> dict | None:
        """Calculate portfolio risk metrics."""
        cache_key = f"risk_{'_'.join(sorted(symbols))}"
        cached = cache_manager.get("risk", cache_key)
        if cached is not None:
            return cached

        try:
            df = yf.download(symbols, period="2y", auto_adjust=True)["Close"]
            if df.empty:
                return None

            df = df.dropna()
            returns = df.pct_change().dropna()

            if weights is None:
                weights = np.array([1.0 / len(symbols)] * len(symbols))
            else:
                weights = np.array(weights)

            # Portfolio returns
            port_returns = returns.dot(weights)

            # Metrics
            annual_return = float(port_returns.mean() * 252)
            annual_vol = float(port_returns.std() * np.sqrt(252))
            sharpe = round(annual_return / annual_vol, 2) if annual_vol > 0 else 0

            # VaR (95% confidence)
            var_95 = round(float(np.percentile(port_returns, 5)) * 100, 2)

            # CVaR (Expected Shortfall)
            cvar_95 = round(float(port_returns[port_returns <= np.percentile(port_returns, 5)].mean()) * 100, 2)

            # Max Drawdown
            cum_returns = (1 + port_returns).cumprod()
            rolling_max = cum_returns.cummax()
            drawdown = (cum_returns - rolling_max) / rolling_max
            max_drawdown = round(float(drawdown.min()) * 100, 2)

            # Beta (vs market — use NIFTY or S&P based on symbols)
            market_sym = "^GSPC" if not any(s.endswith(".NS") or s.endswith(".BO") for s in symbols) else "^NSEI"
            try:
                market = yf.download(market_sym, period="2y", auto_adjust=True)["Close"].pct_change().dropna()
                # Align dates
                common = port_returns.index.intersection(market.index)
                if len(common) > 60:
                    beta = round(float(np.cov(port_returns.loc[common], market.loc[common])[0][1] / np.var(market.loc[common])), 2)
                else:
                    beta = None
            except Exception:
                beta = None

            # Correlation matrix
            corr = returns.corr()
            correlation = {}
            for sym in symbols:
                if sym in corr:
                    correlation[sym] = {s: round(float(corr.loc[sym, s]), 2) for s in symbols if s in corr}

            # Risk contribution per stock
            cov = returns.cov() * 252
            port_var = float(weights @ cov.values @ weights)
            risk_contrib = []
            for i, sym in enumerate(symbols):
                mc = float(weights[i] * (cov.values @ weights)[i])
                pct = round((mc / port_var) * 100, 2) if port_var > 0 else 0
                risk_contrib.append({"symbol": sym, "contribution_pct": pct})

            # Diversification ratio
            individual_vols = np.sqrt(np.diag(cov.values))
            weighted_vol_sum = float(weights @ individual_vols)
            port_vol = np.sqrt(port_var)
            diversification = round(weighted_vol_sum / port_vol, 2) if port_vol > 0 else 1

            result = sanitize_json({
                "annual_return_pct": round(annual_return * 100, 2),
                "annual_volatility_pct": round(annual_vol * 100, 2),
                "sharpe_ratio": sharpe,
                "var_95_daily_pct": var_95,
                "cvar_95_daily_pct": cvar_95,
                "max_drawdown_pct": max_drawdown,
                "beta": beta,
                "diversification_ratio": diversification,
                "risk_contribution": sorted(risk_contrib, key=lambda x: x["contribution_pct"], reverse=True),
                "correlation": correlation,
            })

            cache_manager.set("risk", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Risk analysis error: {e}")
            return None


risk_service = RiskService()
```

**Step 3: Add risk endpoint to portfolio router**

```python
from services.risk_service import risk_service

@router.get("/risk")
async def analyze_risk(
    symbols: Annotated[str, Query(description="Comma-separated stock symbols")],
):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(symbol_list) < 2:
        return JSONResponse(status_code=400, content={"error": "Need at least 2 symbols"})
    result = await asyncio.to_thread(risk_service.analyze, symbol_list)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Risk analysis failed"})
    return result
```

**Step 4: Add risk dashboard to PortfolioPage**

After the "Portfolio Optimization" section, add a "Risk Analysis" section:
- Fetch `/api/portfolio/risk?symbols=SYM1,SYM2,...` when portfolio has 2+ stocks
- Summary cards: Annual Return, Volatility, Sharpe, VaR (95%), Max Drawdown, Beta
- Risk contribution bar chart (which stock contributes most to portfolio risk)
- Correlation heatmap (simple table with color-coded cells)
- Diversification ratio indicator

**Step 5: Commit**

```bash
git commit -m "feat: add portfolio risk analytics with VaR, CVaR, beta, and correlation"
```

---

## Summary

| Task | Feature | New Files | Effort |
|------|---------|-----------|--------|
| 1 | TradingView Lightweight Charts | 0 new, 2 modified | 2-3 hours |
| 2 | yahooquery batch fetching | 0 new, 2 modified | 2-3 hours |
| 3 | uPlot sparklines | 1 new, 3 modified | 1-2 hours |
| 4 | Risk analytics dashboard | 1 new, 2 modified | 3-4 hours |
| **Total** | **4 features** | **2 new, ~9 modified** | **8-12 hours** |

---

## What's already done (from Phase 3):

- ~~1.2 pandas-ta~~ — Done (Task 3 of Phase 3)
- ~~1.3 VADER sentiment~~ — Done (Task 2 of Phase 3)
- ~~2.1 Portfolio Optimization~~ — Done (Task 6 of Phase 3)
- ~~2.2 Backtesting~~ — Done (Task 4 of Phase 3)
- ~~2.5 NSE Options~~ — Done (Task 7 of Phase 3)
- ~~2.6 Crypto~~ — Done (Task 5 of Phase 3)
- 2.3 FinBERT — Skipped (400MB model, VADER is sufficient for free tier)
