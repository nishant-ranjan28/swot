# P0 + P1 + P2 Batch Execution Plan (15 Features)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 15 features in one batch — dark mode, earnings calendar, commodities, forex, global markets, glossary, sector heatmap, technical alerts, export/PDF, tax calculator, FII/DII tracker, IPO tracker, economic calendar, insider deals, macro dashboard.

**Architecture:** Features are grouped into 6 execution batches based on dependencies and file overlap. Each batch can be dispatched to parallel agents where files don't conflict.

**Tech Stack:** React + Tailwind dark mode | FastAPI + yfinance | jsPDF + react-csv | mftool | static content

---

## Batch 1: Foundation (Dark Mode + Dependencies)

### Task 1: Dark Mode + Theme Toggle + npm Dependencies

**Files:**
- Create: `src/context/ThemeContext.js`
- Modify: `tailwind.config.js` (add `darkMode: 'class'`)
- Modify: `src/index.js` (wrap with ThemeProvider)
- Modify: `src/components/Header.js` (add sun/moon toggle)
- Modify: `src/App.css` (add dark utility overrides)
- Run: `npm install jspdf jspdf-autotable`

**ThemeContext.js:**
```jsx
import React, { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('stockpulse_theme', 'light');
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const isDark = theme === 'dark';
  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      <div className={isDark ? 'dark' : ''}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

**tailwind.config.js:** Add `darkMode: 'class'` at top level.

**Header.js:** Add a sun/moon toggle button next to the IN/US market toggle. Use `useTheme()` hook.

**App.css:** Add base dark mode overrides:
```css
.dark body, .dark .min-h-screen { background-color: #111827; color: #f9fafb; }
.dark .bg-white { background-color: #1f2937; }
.dark .bg-gray-50 { background-color: #111827; }
.dark .text-gray-900 { color: #f9fafb; }
.dark .text-gray-800 { color: #e5e7eb; }
.dark .text-gray-700 { color: #d1d5db; }
.dark .text-gray-600 { color: #9ca3af; }
.dark .text-gray-500 { color: #6b7280; }
.dark .border-gray-100 { border-color: #374151; }
.dark .border-gray-200 { border-color: #374151; }
.dark .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.dark .shadow-lg { box-shadow: 0 4px 6px rgba(0,0,0,0.4); }
.dark input, .dark select { background-color: #374151; color: #f9fafb; border-color: #4b5563; }
.dark .bg-gray-100 { background-color: #374151; }
.dark table thead tr { background-color: #1f2937; }
.dark table tbody tr:hover { background-color: #374151; }
```

This CSS approach avoids modifying every single component file (100+ `dark:` classes). Global overrides handle 90% of cases.

**index.js:** Wrap with ThemeProvider inside MarketProvider.

---

## Batch 2: Market Data Pages (Commodities + Forex + Global Markets)

These 3 are nearly identical — price cards + chart for different symbol sets. One agent can build all 3.

### Task 2: Commodities Page

**Files:**
- Create: `src/components/CommoditiesPage.js`
- Modify: `src/App.js` (add route)
- Modify: `src/components/Header.js` (add to nav or "More" dropdown)

**Implementation:** No backend changes — reuse existing `/api/stocks/{symbol}/quote` and `/api/stocks/{symbol}/history`.

Symbols: `GC=F` (Gold), `SI=F` (Silver), `CL=F` (Crude Oil), `NG=F` (Natural Gas), `HG=F` (Copper)

Page layout:
- 5 commodity cards with live price, 24h change%, mini sparkline
- Click card → show chart below (reuse existing history API + lightweight-charts or canvas)
- Market impact notes (static text)

### Task 3: Forex Dashboard

**Files:**
- Create: `src/components/ForexPage.js`
- Modify: `src/App.js` (add route)

Same pattern as commodities. Symbols: `USDINR=X`, `EURUSD=X`, `GBPUSD=X`, `USDJPY=X`, `EURINR=X`

Extra: Simple currency converter calculator (input amount, select from/to, multiply by rate).

### Task 4: Global Market Overview

**Files:**
- Modify: `backend/services/stock_service.py` (add `"global"` to MARKET_INDICES)
- Modify: `src/components/HomePage.js` (add Global Markets section)

Add to `MARKET_INDICES` in stock_service.py:
```python
"global": [
    {"symbol": "^FTSE", "name": "FTSE 100"},
    {"symbol": "^N225", "name": "Nikkei 225"},
    {"symbol": "^GDAXI", "name": "DAX"},
    {"symbol": "^HSI", "name": "Hang Seng"},
    {"symbol": "^STOXX50E", "name": "Euro Stoxx 50"},
],
```

Homepage: Add "Global Markets" section after the market-specific indices, always visible regardless of IN/US toggle. Fetch via `/api/stocks/indices?market=global`.

---

## Batch 3: Calendar + Glossary (Frontend-heavy)

### Task 5: Earnings Calendar

**Files:**
- Modify: `backend/services/stock_service.py` (add `get_earnings_calendar` method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/EarningsCalendarPage.js`
- Modify: `src/App.js`

Backend `get_earnings_calendar(market)`:
- Fetch earnings_dates for top 30 stocks using yahooquery batch (faster than yfinance loop)
- Filter to upcoming (Reported EPS is NaN)
- Return sorted by date

Endpoint: `GET /api/stocks/earnings-calendar?market=in`

Frontend: 
- Week/month calendar grid
- Each day cell shows stocks reporting that day
- Filter: This Week / Next Week / This Month
- Each stock links to its detail page

### Task 6: Stock Glossary & Learning Center

**Files:**
- Create: `src/data/glossary.js` (200+ terms)
- Create: `src/components/GlossaryPage.js`
- Modify: `src/App.js`

Pure frontend — no backend needed. Static data file with 200+ finance terms organized by category. Searchable, filterable page.

Categories: Technical Analysis, Fundamental Analysis, Trading Basics, Options, Mutual Funds, Taxation, Market Concepts

### Task 7: Economic Calendar

**Files:**
- Create: `src/data/economicEvents.js` (static recurring events)
- Create: `src/components/EconomicCalendarPage.js`
- Modify: `src/App.js`

Static data approach (no FRED API needed for MVP):
```javascript
export const ECONOMIC_EVENTS = [
  { name: "RBI MPC Meeting", country: "IN", dates: ["2026-04-08", "2026-06-04", "2026-08-06"], impact: "High" },
  { name: "Fed FOMC Meeting", country: "US", dates: ["2026-05-05", "2026-06-16", "2026-07-28"], impact: "High" },
  { name: "US Jobs Report (NFP)", country: "US", recurrence: "First Friday monthly", impact: "High" },
  { name: "India GDP", country: "IN", dates: ["2026-05-29", "2026-08-28"], impact: "High" },
  // ... 30+ events
];
```

Frontend: Calendar/list view with country filter, impact badges, countdown to next event.

---

## Batch 4: Sector Heatmap + Technical Alerts

### Task 8: Sector Heatmap

**Files:**
- Modify: `backend/services/stock_service.py` (add `get_sector_performance` method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/SectorHeatmapPage.js`
- Modify: `src/App.js`

Backend `get_sector_performance(market)`:
```python
SECTOR_STOCKS = {
    "in": {
        "Banking": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
        "IT": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS"],
        "Energy": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "IOC.NS", "TATAPOWER.NS"],
        "Auto": ["TMCV.NS", "MARUTI.NS", "M&M.NS", "EICHERMOT.NS", "BAJAJ-AUTO.NS"],
        "Pharma": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "AUROPHARMA.NS"],
        "FMCG": ["HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "DABUR.NS", "GODREJCP.NS"],
        "Metals": ["TATASTEEL.NS", "JSWSTEEL.NS", "HINDALCO.NS", "COALINDIA.NS"],
        "Infra": ["LT.NS", "ULTRACEMCO.NS", "GRASIM.NS", "ADANIENT.NS"],
        "Telecom": ["BHARTIARTL.NS"],
        "Finance": ["BAJFINANCE.NS", "BAJAJFINSV.NS", "SBILIFE.NS"],
    },
    "us": {
        "Technology": ["AAPL", "MSFT", "GOOGL", "META", "NVDA"],
        "Finance": ["JPM", "BAC", "GS", "V", "MA"],
        "Healthcare": ["UNH", "JNJ", "PFE", "ABBV", "MRK"],
        "Consumer": ["AMZN", "WMT", "HD", "PG", "KO"],
        "Energy": ["XOM", "CVX", "COP"],
        "Industrials": ["CAT", "HON", "GE", "BA"],
    }
}
```

Use `get_batch_quotes()` per sector, calculate avg change%, top gainer/loser per sector.

Endpoint: `GET /api/stocks/sector-performance?market=in`

Frontend: Canvas-based treemap + table view toggle:
- Rectangles sized by market cap, colored by change% (green→red gradient)
- Click sector to expand and see stocks
- Table view: Sector, Avg Change%, Top Gainer, Top Loser, Total MCap

### Task 9: Technical Alerts Engine

**Files:**
- Modify: `backend/services/stock_service.py` (add `scan_technical_alerts` method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Modify: `src/components/WatchlistPage.js` (add alerts section)
- Modify: `src/hooks/useAlertNotifications.js` (extend to check technical signals)

Backend `scan_technical_alerts(symbols)`:
- For each symbol, fetch 3mo history, run pandas-ta
- Check conditions: Golden Cross, Death Cross, RSI Oversold/Overbought, MACD Crossover, Bollinger Breakout, 52W High/Low proximity
- Return list of triggered alerts

Endpoint: `GET /api/stocks/technical-alerts?symbols=SYM1,SYM2`

Frontend: "Technical Signals" section on Watchlist page showing triggered alerts with browser notifications.

---

## Batch 5: Export + Tax Calculator

### Task 10: Export / PDF Reports

**Files:**
- Create: `src/utils/exportUtils.js`
- Modify: `src/components/PortfolioPage.js` (add export buttons)
- Modify: `src/components/ScreenerPage.js` (add CSV export)
- Modify: `src/components/StockDetail/StockDetailPage.js` (add PDF report button)

Install: `npm install jspdf jspdf-autotable`

Export utils:
- `exportToCSV(data, columns, filename)` — generic CSV export
- `generateStockReport(stockData)` — one-pager PDF with key metrics
- `exportPortfolio(holdings, liveData)` — portfolio CSV

Add buttons:
- Portfolio: "Export CSV" button in holdings section
- Screener: "Export Results" button above table
- Stock detail: "Download Report" button in price banner
- Watchlist: "Export Watchlist" button

### Task 11: Capital Gains Tax Calculator

**Files:**
- Create: `src/components/TaxCalculatorPage.js`
- Modify: `src/App.js`

Pure frontend — reads portfolio from localStorage:
- For each holding: holding period from buyDate, classify STCG (<1yr) or LTCG (>1yr)
- India rules: STCG 15%, LTCG 10% above ₹1L exemption (equity), different for debt
- US rules: STCG = ordinary rate, LTCG 0/15/20%
- Show: total gains, tax estimate, breakdown by holding
- Tax-loss harvesting: highlight positions with unrealized losses that could offset gains
- Editable tax slab / rate input
- Disclaimer banner

---

## Batch 6: Market Intelligence (FII/DII + IPO + Insider + Macro)

### Task 12: FII/DII Flow Tracker

**Files:**
- Modify: `backend/services/stock_service.py` (add FII/DII proxy method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/FiiDiiPage.js`
- Modify: `src/App.js`

Backend: Use NIFTY ETF (NIFTYBEES.NS) volume and delivery % as FII activity proxy. Or use httpx to fetch NSDL data (public CSV).

Simpler approach for MVP: Track daily institutional trading volume using yfinance `ticker.info` fields `heldPercentInstitutions` change + volume analysis.

Frontend: Dashboard with:
- Daily net FII/DII activity estimate
- 30-day trend chart
- Correlation with NIFTY chart overlay
- Interpretation text

### Task 13: IPO Tracker

**Files:**
- Create: `src/data/ipoData.js` (curated static data for MVP)
- Create: `src/components/IpoPage.js`
- Modify: `src/App.js`

MVP approach — static curated data (updated weekly):
```javascript
export const UPCOMING_IPOS = [
  { name: "Company XYZ", date: "2026-04-15 to 2026-04-17", priceRange: "₹100-110", lotSize: 135, sector: "IT" },
  // ...
];
export const RECENT_LISTINGS = [
  { name: "Company ABC", listingDate: "2026-04-01", issuePrice: 100, listingPrice: 135, currentPrice: 142, listingGain: 35 },
  // ...
];
```

Three tabs: Upcoming, Current, Recently Listed. Cards with key details. Can be enhanced later with live scraping.

### Task 14: Insider / Bulk / Block Deals

**Files:**
- Modify: `backend/services/stock_service.py` (add insider transactions method)
- Modify: `backend/routers/stocks.py` (add endpoint)
- Create: `src/components/DealsPage.js`
- Modify: `src/App.js`

Backend: Use yfinance `ticker.insider_transactions` (works for US stocks). For Indian stocks, this data is limited — show what's available.

Endpoint: `GET /api/stocks/{symbol}/insider`

Frontend: Table of recent insider transactions with buy/sell badges, amounts, and dates. Accessible from stock detail page and a standalone deals page.

### Task 15: Macro Dashboard

**Files:**
- Create: `src/components/MacroPage.js`
- Modify: `src/App.js`

Use existing yfinance endpoints for:
- `^TNX` (10Y Treasury), `^FVX` (5Y Treasury), `^IRX` (13W T-Bill)
- `DX-Y.NYB` (US Dollar Index)
- `USDINR=X` (Rupee)

Frontend: Dashboard with yield cards, dollar index chart, and a simple yield curve visualization (2Y/5Y/10Y/30Y plotted).

---

## Navigation Update

With 15 new pages, the Header needs a grouped navigation. Update `Header.js` NAV_ITEMS to use categories:

```javascript
const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/screener', label: 'Screener' },
  { to: '/compare', label: 'Compare' },
  { to: '/backtest', label: 'Backtest' },
];

const MORE_ITEMS = [
  { to: '/scanner', label: '52W Scanner' },
  { to: '/calculator', label: 'Calculators' },
  { to: '/crypto', label: 'Crypto' },
  { to: '/commodities', label: 'Commodities' },
  { to: '/forex', label: 'Forex' },
  { to: '/sector-heatmap', label: 'Sector Heatmap' },
  { to: '/earnings-calendar', label: 'Earnings Calendar' },
  { to: '/economic-calendar', label: 'Economic Calendar' },
  { to: '/ipo', label: 'IPO Tracker' },
  { to: '/deals', label: 'Insider Deals' },
  { to: '/fii-dii', label: 'FII/DII' },
  { to: '/macro', label: 'Macro' },
  { to: '/tax', label: 'Tax Calculator' },
  { to: '/glossary', label: 'Glossary' },
  { to: '/news', label: 'News' },
];
```

Header shows top 6 nav items + "More" dropdown for the rest. Mobile hamburger shows all.

---

## Summary

| Batch | Tasks | Features | Effort |
|-------|-------|----------|--------|
| 1 | Task 1 | Dark Mode + deps | 2-3 hrs |
| 2 | Tasks 2-4 | Commodities, Forex, Global Markets | 3-5 hrs |
| 3 | Tasks 5-7 | Earnings Cal, Glossary, Economic Cal | 5-7 hrs |
| 4 | Tasks 8-9 | Sector Heatmap, Technical Alerts | 6-8 hrs |
| 5 | Tasks 10-11 | Export/PDF, Tax Calculator | 4-6 hrs |
| 6 | Tasks 12-15 | FII/DII, IPO, Insider Deals, Macro | 10-14 hrs |
| **Total** | **15 tasks** | **15 features** | **~30-43 hours** |
