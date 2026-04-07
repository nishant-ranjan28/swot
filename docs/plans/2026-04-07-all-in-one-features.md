# StockPulse All-in-One Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 20 features across 3 tiers to make StockPulse a truly comprehensive all-in-one investment platform.

**Architecture:** Each feature is independent. Frontend-only features (dark mode, glossary, export) need no backend changes. Data features use existing yfinance + free APIs. All results cached.

**Tech Stack:** React + Tailwind (frontend) | FastAPI + yfinance + FRED API (backend) | jsPDF + react-csv (export)

---

## Tier 1: Quick Wins (1-2 days)

### Task 1: Dark Mode / Theme Toggle

**Files:**
- Create: `src/context/ThemeContext.js`
- Modify: `src/index.js` (wrap with ThemeProvider)
- Modify: `src/components/Header.js` (add toggle button)
- Modify: `src/App.css` (add dark mode CSS variables)
- Modify: `tailwind.config.js` (enable dark mode class strategy)

**Implementation:**

1. Enable Tailwind dark mode in `tailwind.config.js`:
```javascript
module.exports = {
  darkMode: 'class',
  // ... rest of config
}
```

2. Create ThemeContext:
```jsx
// src/context/ThemeContext.js
import React, { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('stockpulse_theme', 'light');
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme === 'dark' ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

3. Add dark variants to key elements across the app:
- `bg-gray-50` → `bg-gray-50 dark:bg-gray-900`
- `bg-white` → `bg-white dark:bg-gray-800`
- `text-gray-900` → `text-gray-900 dark:text-white`
- `border-gray-100` → `border-gray-100 dark:border-gray-700`
- Header: `bg-gray-800` stays (already dark)

4. Add sun/moon toggle icon in Header next to the IN/US market toggle.

5. Persist theme in localStorage via `stockpulse_theme`.

**Effort:** Low (2-3 hours)

---

### Task 2: Earnings Calendar (All Stocks)

**Files:**
- Create: `backend/services/calendar_service.py`
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/EarningsCalendarPage.js`
- Modify: `src/App.js` (add route)
- Modify: `src/components/Header.js` (add to More menu or as sub-item)

**Implementation:**

1. Backend: Fetch upcoming earnings dates for popular stocks using yfinance `earnings_dates`:
```python
class CalendarService:
    def get_earnings_calendar(self, market="in") -> list[dict]:
        """Get upcoming earnings dates for tracked stocks."""
        symbols = POPULAR_STOCKS[market][:30]
        calendar = []
        for sym in symbols:
            try:
                ticker = yf.Ticker(sym)
                dates = ticker.earnings_dates
                if dates is not None and not dates.empty:
                    for idx, row in dates.head(2).iterrows():
                        if row.get("Reported EPS") != row.get("Reported EPS"):  # NaN = upcoming
                            calendar.append({
                                "symbol": sym,
                                "name": ticker.info.get("shortName", sym),
                                "date": idx.strftime("%Y-%m-%d"),
                                "eps_estimate": row.get("EPS Estimate"),
                            })
            except: continue
        calendar.sort(key=lambda x: x["date"])
        return calendar
```

2. Endpoint: `GET /api/stocks/earnings-calendar?market=in`

3. Frontend: Calendar page with:
   - Week view showing which stocks report each day
   - Filter by this week / next week / this month
   - Stock name links to detail page
   - EPS estimate shown
   - Color-coded by sector

**Effort:** Low-Medium (2-3 hours)

---

### Task 3: Commodities Tracker

**Files:**
- Create: `src/components/CommoditiesPage.js`
- Modify: `src/App.js` (add route)

**Implementation:**

Use existing `/api/stocks/{symbol}/quote` and `/api/stocks/{symbol}/history` endpoints with commodity symbols:
- Gold: `GC=F`
- Silver: `SI=F`
- Crude Oil: `CL=F`
- Natural Gas: `NG=F`
- Copper: `HG=F`

Frontend page:
- Price cards for each commodity with 24h change
- Click to see chart (reuse existing chart infrastructure)
- Historical comparison view
- Impact note: "Gold up → IT stocks may benefit" etc.

**Effort:** Low (1-2 hours) — no backend changes, reuse existing endpoints

---

### Task 4: Forex Dashboard

**Files:**
- Create: `src/components/ForexPage.js`
- Modify: `src/App.js` (add route)

**Implementation:**

Same as commodities — use existing endpoints with forex symbols:
- USD/INR: `USDINR=X`
- EUR/USD: `EURUSD=X`
- GBP/USD: `GBPUSD=X`
- USD/JPY: `USDJPY=X`
- EUR/INR: `EURINR=X`
- BTC/USD: `BTC-USD`

Frontend:
- Exchange rate cards with change%
- Click for chart
- Currency converter calculator
- Impact section: "Weak rupee → IT exporters benefit"

**Effort:** Low (1-2 hours)

---

### Task 5: Global Market Overview

**Files:**
- Modify: `src/components/HomePage.js` (add global markets section)

**Implementation:**

Add a "Global Markets" section to homepage showing:
- `^FTSE` (London), `^N225` (Tokyo), `^GDAXI` (Frankfurt), `^HSI` (Hong Kong), `^GSPC` (S&P 500)
- Each shows: index name, price, change%, market status (open/closed based on timezone)
- Uses existing `/api/stocks/indices` pattern but with a new `market=global` option

Backend: Add global indices list:
```python
"global": [
    {"symbol": "^FTSE", "name": "FTSE 100"},
    {"symbol": "^N225", "name": "Nikkei 225"},
    {"symbol": "^GDAXI", "name": "DAX"},
    {"symbol": "^HSI", "name": "Hang Seng"},
    {"symbol": "^GSPC", "name": "S&P 500"},
]
```

**Effort:** Low (1 hour)

---

### Task 6: Stock Glossary & Learning Center

**Files:**
- Create: `src/components/GlossaryPage.js`
- Create: `src/data/glossary.js` (static data)
- Modify: `src/App.js` (add route)

**Implementation:**

Static content — no backend needed:
- 200+ finance terms with definitions
- Searchable/filterable
- Categories: Technical Analysis, Fundamental Analysis, Trading, Options, Mutual Funds, Tax
- Each term: name, short definition, detailed explanation, related terms
- "Term of the Day" feature (random term shown on homepage)
- Beginner-friendly language

Data file:
```javascript
export const GLOSSARY = [
  { term: "P/E Ratio", category: "Fundamental", short: "Price to Earnings ratio", detail: "Compares stock price to earnings per share. Lower P/E may indicate undervaluation..." },
  { term: "RSI", category: "Technical", short: "Relative Strength Index", detail: "Momentum oscillator measuring speed of price changes. RSI > 70 = overbought, < 30 = oversold..." },
  // ... 200+ terms
];
```

**Effort:** Low (2-3 hours for component, content can be expanded over time)

---

## Tier 2: Medium Effort, High Value (3-5 days)

### Task 7: Sector Heatmap

**Files:**
- Create: `src/components/SectorHeatmapPage.js`
- Modify: `backend/services/stock_service.py` (add sector performance method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Modify: `src/App.js` (add route)

**Implementation:**

Backend: `GET /api/stocks/sector-performance?market=in`
```python
def get_sector_performance(self, market="in"):
    """Get performance by sector using sector ETFs or stock aggregation."""
    sectors_in = {
        "Banking": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "IT": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS"],
        "Energy": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "IOC.NS", "TATAPOWER.NS"],
        # ... more sectors
    }
    sectors_us = {
        "Technology": ["AAPL", "MSFT", "GOOGL", "META", "NVDA"],
        "Finance": ["JPM", "BAC", "GS", "MS", "V"],
        # ... more sectors
    }
    # Fetch batch quotes, aggregate by sector
    # Return: sector name, avg change%, top gainer, top loser, market cap total
```

Frontend: Treemap/heatmap visualization:
- Each rectangle = sector, sized by market cap
- Color: green (up) to red (down) based on daily change%
- Click sector to see constituent stocks
- Canvas-based rendering for performance
- Also support table view toggle

**Effort:** Medium (3-4 hours)

---

### Task 8: Technical Alerts Engine

**Files:**
- Create: `backend/services/alert_service.py`
- Modify: `backend/routers/stocks.py` (add scan endpoint)
- Modify: `src/components/WatchlistPage.js` (add technical alerts section)
- Modify: `src/hooks/useAlertNotifications.js` (extend to check technical conditions)

**Implementation:**

Backend: Scan watchlist stocks for technical signals:
```python
def scan_technical_alerts(self, symbols: list[str]) -> list[dict]:
    """Scan stocks for technical conditions."""
    alerts = []
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            df = ticker.history(period="3mo")
            df.ta.sma(length=50, append=True)
            df.ta.sma(length=200, append=True)
            df.ta.rsi(length=14, append=True)
            df.ta.macd(append=True)
            
            last = df.iloc[-1]
            prev = df.iloc[-2]
            
            # Golden Cross (50 SMA crosses above 200 SMA)
            if prev["SMA_50"] <= prev["SMA_200"] and last["SMA_50"] > last["SMA_200"]:
                alerts.append({"symbol": sym, "alert": "Golden Cross", "type": "bullish"})
            
            # Death Cross
            if prev["SMA_50"] >= prev["SMA_200"] and last["SMA_50"] < last["SMA_200"]:
                alerts.append({"symbol": sym, "alert": "Death Cross", "type": "bearish"})
            
            # RSI Oversold
            if last["RSI_14"] < 30:
                alerts.append({"symbol": sym, "alert": "RSI Oversold", "type": "bullish"})
            
            # RSI Overbought
            if last["RSI_14"] > 70:
                alerts.append({"symbol": sym, "alert": "RSI Overbought", "type": "bearish"})
            
            # MACD Bullish Crossover
            if prev["MACDh_12_26_9"] <= 0 and last["MACDh_12_26_9"] > 0:
                alerts.append({"symbol": sym, "alert": "MACD Bullish Crossover", "type": "bullish"})
        except: continue
    return alerts
```

Endpoint: `GET /api/stocks/technical-alerts?symbols=SYM1,SYM2,...`

Frontend: Show alerts section on watchlist page with browser notifications for triggered alerts.

**Effort:** Medium (3-4 hours)

---

### Task 9: FII/DII Flow Tracker (India)

**Files:**
- Create: `backend/services/fii_service.py`
- Create: `backend/routers/fii.py`
- Create: `src/components/FiiDiiPage.js`
- Modify: `backend/main.py`, `src/App.js`, `src/components/Header.js`

**Implementation:**

Backend: Scrape NSDL/Moneycontrol for daily FII/DII data or use alternative sources.

Simpler approach: Use yfinance for India ETFs that track FII activity:
- NIFTYBEES.NS (Nifty ETF)
- Track volume/price changes as FII activity proxy
- Or use httpx to fetch from publicly available NSDL CSV data

Frontend:
- Daily FII/DII net buy/sell bar chart
- Running monthly total
- Correlation with NIFTY movement
- "FII sold ₹5000 Cr today — may indicate bearish pressure"

**Effort:** Medium (3-4 hours)

---

### Task 10: IPO Tracker

**Files:**
- Create: `backend/services/ipo_service.py`
- Create: `backend/routers/ipo.py`
- Create: `src/components/IpoPage.js`
- Modify: `backend/main.py`, `src/App.js`, `src/components/Header.js`

**Implementation:**

Backend: Scrape from chittorgarh.com or investpy for IPO data:
- Upcoming IPOs: name, date range, price band, lot size
- Current IPOs: subscription status (retail/QIB/HNI)
- Recently listed: listing price, listing gain%, current price

Frontend:
- Three tabs: Upcoming, Current, Recently Listed
- IPO cards with key details
- Subscription status bars (retail, HNI, QIB multiplied by X)
- Listing gain calculator

**Effort:** Medium (4-5 hours)

---

### Task 11: Export / PDF Reports

**Files:**
- Modify: `package.json` (add jspdf, jspdf-autotable, react-csv)
- Create: `src/utils/exportUtils.js`
- Modify: `src/components/PortfolioPage.js` (add export buttons)
- Modify: `src/components/ScreenerPage.js` (add CSV export)
- Modify: `src/components/StockDetail/StockDetailPage.js` (add PDF report button)

**Implementation:**

```bash
npm install jspdf jspdf-autotable react-csv
```

Export utilities:
```javascript
// PDF one-pager for a stock
export function generateStockReport(stockData) {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text(stockData.name, 20, 20);
  // ... add price, fundamentals, technicals, etc.
  doc.save(`${stockData.symbol}_report.pdf`);
}

// CSV export for screener/portfolio
export function exportToCSV(data, filename) {
  // Use react-csv or manual CSV generation
}
```

Add buttons:
- Stock detail page: "Download Report" button → PDF one-pager
- Portfolio page: "Export Holdings" → CSV
- Screener page: "Export Results" → CSV
- Watchlist page: "Export Watchlist" → CSV

**Effort:** Medium (3-4 hours)

---

### Task 12: Capital Gains Tax Calculator

**Files:**
- Create: `src/components/TaxCalculatorPage.js`
- Modify: `src/App.js` (add route)

**Implementation:**

Frontend-only — uses portfolio data from localStorage:
- Read holdings from `stockpulse_portfolio`
- For each holding: calculate holding period, classify as STCG (<1yr) or LTCG (>1yr)
- Apply Indian tax rules: STCG = 15%, LTCG = 10% above ₹1L exemption
- US rules: STCG = ordinary income rate, LTCG = 0/15/20% based on income
- Show: total unrealized gains, tax liability estimate, tax-loss harvesting suggestions
- Disclaimer: "This is an estimate. Consult a tax advisor."

Input: buy date, buy price, current price (from live data), quantity
Output: holding period, gain type, estimated tax, effective tax rate

**Effort:** Medium (2-3 hours) — pure frontend calculation

---

### Task 13: Economic Calendar

**Files:**
- Create: `backend/services/calendar_service.py` (extend from Task 2)
- Create: `src/components/EconomicCalendarPage.js`
- Modify: `src/App.js`

**Implementation:**

Backend: Use FRED API (free, requires key) for US economic data:
```python
# Free FRED API: https://fred.stlouisfed.org/docs/api/
# Key indicators: GDP, CPI, unemployment, fed funds rate
# Also: RBI repo rate, Indian CPI, WPI from RBI data
```

Simpler alternative: Curated static calendar of recurring events:
- RBI MPC meetings (6 per year, dates known in advance)
- Fed FOMC meetings (8 per year)
- GDP release dates
- Quarterly results season

Frontend: Calendar view with:
- Event name, date, expected value, actual value (when released)
- Impact indicator (High/Medium/Low)
- Filterable by country (India/US)

**Effort:** Medium (3-4 hours)

---

### Task 14: Insider / Bulk / Block Deals

**Files:**
- Create: `backend/services/deals_service.py`
- Create: `backend/routers/deals.py`
- Create: `src/components/DealsPage.js`
- Modify: `backend/main.py`, `src/App.js`

**Implementation:**

Backend: Scrape NSE/BSE public data for bulk and block deals:
```python
# NSE bulk deals: https://www.nseindia.com/market-data/bulk-deals
# Use httpx with proper headers to fetch CSV/JSON data
```

Alternative: Use yfinance `insider_transactions` (works for US stocks):
```python
ticker.insider_transactions  # Who bought/sold, how many shares, at what price
```

Frontend:
- Daily deals table: stock, buyer/seller, quantity, price, deal type
- Filter by date range, stock
- Highlight promoter transactions (strongest signal)

**Effort:** Medium (3-4 hours)

---

### Task 15: Macro Dashboard

**Files:**
- Create: `src/components/MacroPage.js`
- Modify: `backend/services/stock_service.py` (add macro data method)
- Modify: `src/App.js`

**Implementation:**

Use yfinance for treasury yields and macro proxies:
- `^TNX` (10-Year Treasury Yield)
- `^FVX` (5-Year Treasury Yield)
- `^IRX` (13-Week Treasury Bill)
- `DX-Y.NYB` (US Dollar Index)

Frontend: Dashboard cards showing:
- Current yield curve (plot 2Y/5Y/10Y/30Y)
- Dollar index trend
- Repo rate (static for India, updated manually)
- Historical chart of key indicators

**Effort:** Medium (2-3 hours)

---

## Tier 3: Bigger Features (1-2 weeks)

### Task 16: Mutual Fund Analytics

**Files:**
- Create: `backend/services/mf_service.py`
- Create: `backend/routers/mf.py`
- Create: `src/components/MutualFundPage.js`
- Modify: `backend/main.py`, `src/App.js`, `src/components/Header.js`
- Modify: `backend/requirements.txt` (add mftool)

**Implementation:**

```bash
pip3 install mftool
```

Backend:
```python
from mftool import Mftool
mf = Mftool()

class MFService:
    def search(self, query): return mf.get_scheme_codes(query)
    def get_nav(self, scheme_code): return mf.get_scheme_quote(scheme_code)
    def get_history(self, scheme_code, start, end): return mf.get_scheme_historical_nav(scheme_code, start, end)
    def compare(self, codes): # Compare NAV performance
    def rolling_returns(self, code, periods): # 1Y, 3Y, 5Y rolling returns
    def overlap(self, code1, code2): # Compare holdings overlap
```

Frontend:
- MF search by name
- Fund detail page: NAV chart, rolling returns, holdings, expense ratio
- Compare 2-4 funds side by side
- SIP calculator (already exists, extend to use MF NAV data)
- Category filter: Equity, Debt, Hybrid, ELSS, Index

**Effort:** High (6-8 hours)

---

### Task 17: ETF Screener & Overlap

**Files:**
- Create: `src/components/EtfPage.js`
- Modify: `backend/services/stock_service.py` (add ETF-specific methods)
- Modify: `src/App.js`

**Implementation:**

Use yfinance for ETF data — ETFs have the same API as stocks:
- Popular Indian ETFs: NIFTYBEES.NS, BANKBEES.NS, GOLDBEES.NS
- Popular US ETFs: SPY, QQQ, VTI, VOO, ARKK

Backend: ETF holdings via yfinance `ticker.info` fields or scraping
Frontend:
- ETF search/screener
- Holdings breakdown
- Overlap checker: select 2 ETFs, show common holdings
- Performance comparison

**Effort:** Medium-High (4-5 hours)

---

### Task 18: Multi-Timeframe Charts

**Files:**
- Modify: `src/components/StockDetail/ChartTab.js`

**Implementation:**

Using lightweight-charts, create a split view:
- 2 or 4 synchronized charts showing same stock at different timeframes
- Timeframe combos: Daily + Weekly, Daily + Monthly, or all four
- Crosshair sync between charts (when you hover on one, others follow)
- Toggle: "Single" / "Dual" / "Quad" view

lightweight-charts supports multiple chart instances that can be synced:
```javascript
chart1.timeScale().subscribeCrosshairMove(param => {
  chart2.timeScale().scrollToPosition(param.point.x, false);
});
```

**Effort:** Medium (3-4 hours)

---

### Task 19: Trending Tickers / Social Sentiment

**Files:**
- Create: `backend/services/social_service.py`
- Create: `src/components/TrendingPage.js`
- Modify: `backend/main.py`, `src/App.js`

**Implementation:**

Backend: Track which stocks are most searched/viewed in the app (localStorage analytics) + scrape Reddit for stock mentions:
```python
# Reddit API (free with account):
# Search r/IndianStockMarket, r/wallstreetbets for ticker mentions
# Count mentions per day, calculate sentiment
import httpx

def get_reddit_mentions(self, subreddit="IndianStockMarket"):
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    # Parse titles for stock symbols
    # Count and rank
```

Frontend:
- Most searched stocks (tracked locally)
- Reddit mention leaderboard
- Sentiment per mentioned stock (using VADER)
- "Trending on Reddit" badges on stock detail pages

**Effort:** Medium (3-4 hours)

---

### Task 20: Drawing Tools on Charts

**Files:**
- Modify: `src/components/StockDetail/ChartTab.js`
- Create: `src/utils/chartDrawings.js` (localStorage persistence)

**Implementation:**

lightweight-charts v5 has plugin support for custom overlays. Add:
- Horizontal line tool (support/resistance)
- Trendline tool (two-point line)
- Fibonacci retracement tool
- Text annotation tool

Each drawing is persisted in localStorage keyed by symbol:
```javascript
// localStorage: stockpulse_drawings_AAPL = [{ type: 'hline', price: 150, color: '#ff0000' }, ...]
```

Toolbar: Small icon bar above chart with drawing tool icons.

**Effort:** High (5-6 hours) — lightweight-charts plugin API is complex

---

## Implementation Priority Matrix

| Priority | Tasks | Total Effort | Timeline |
|----------|-------|-------------|----------|
| **P0 (Week 1)** | 1 (Dark Mode), 2 (Earnings Cal), 3 (Commodities), 4 (Forex), 5 (Global Markets), 6 (Glossary) | 10-14 hrs | 2 days |
| **P1 (Week 1-2)** | 7 (Sector Heatmap), 8 (Tech Alerts), 11 (Export/PDF), 12 (Tax Calc) | 12-15 hrs | 3 days |
| **P2 (Week 2)** | 9 (FII/DII), 10 (IPO), 13 (Econ Calendar), 14 (Insider Deals), 15 (Macro) | 16-20 hrs | 4 days |
| **P3 (Week 3-4)** | 16 (Mutual Funds), 17 (ETF), 18 (Multi-TF Charts), 19 (Social), 20 (Drawing Tools) | 20-27 hrs | 5-7 days |
| **Total** | **20 features** | **~58-76 hours** | **~2-3 weeks** |

---

## Notes

- All features use FREE data sources (yfinance, FRED API, mftool, Reddit API, static content)
- No new paid API keys needed
- Dark mode is foundational — do it first, all subsequent UI work benefits from it
- Export/PDF adds professional credibility instantly
- Mutual fund analytics is the biggest single feature but also the highest-value for Indian users
- Drawing tools require deep lightweight-charts plugin knowledge — save for last
