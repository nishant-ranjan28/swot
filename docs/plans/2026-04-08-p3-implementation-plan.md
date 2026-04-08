# P3 Implementation Plan - Advanced Features

> **5 features | ~20-27 hours | 5-7 days**

## Overview

P3 adds five high-impact features: Mutual Fund Analytics, ETF Screener, Multi-Timeframe Charts, Social/Trending Sentiment, and Chart Drawing Tools.

**Prerequisites:** All P0-P2 features are complete. Backend is on Render, frontend on Vercel.

---

## Task 1: Mutual Fund Analytics (6-8 hours)

**Priority:** Highest in P3 - most valuable for Indian users

### Backend

**New file:** `backend/services/mf_service.py`
```
- Install mftool: pip3 install mftool
- MFService class with methods:
  - search(query) → search by fund name, return scheme codes
  - get_nav(scheme_code) → current NAV, fund details
  - get_history(scheme_code, period) → historical NAV data
  - compare(codes[]) → compare 2-4 funds by NAV performance
  - get_category_list() → Equity, Debt, Hybrid, ELSS, Index, etc.
  - get_top_funds(category) → top funds by returns
- Cache all results (NAV: 1hr, history: 6hr, categories: 24hr)
```

**New file:** `backend/routers/mf.py`
```
Endpoints:
  GET /api/mf/search?q=axis+bluechip
  GET /api/mf/{scheme_code}/nav
  GET /api/mf/{scheme_code}/history?period=1y
  GET /api/mf/compare?codes=119551,120503
  GET /api/mf/top?category=Equity
```

**Modify:** `backend/main.py` - register mf router
**Modify:** `backend/requirements.txt` - add mftool

### Frontend

**New file:** `src/components/MutualFundPage.js`
```
Sections:
1. Search bar with autocomplete (fund names)
2. Category filter pills: All, Equity, Debt, Hybrid, ELSS, Index
3. Top funds grid (cards with NAV, 1Y/3Y/5Y returns, expense ratio)
4. Fund detail view (on click):
   - NAV chart (reuse PriceChart component with decimals=2)
   - Key metrics: AUM, expense ratio, min investment, fund manager
   - Rolling returns: 1Y, 3Y, 5Y
   - Risk metrics: Sharpe ratio, standard deviation
5. Compare mode: select 2-4 funds, show side-by-side table + overlaid NAV chart
6. Link to existing SIP calculator (pass fund NAV data)
```

**Modify:** `src/App.js` - add route `/mutual-funds`
**Modify:** `src/components/Header.js` - add to navigation

### Verification
- Search "axis bluechip" returns results
- Fund detail shows NAV chart with historical data
- Compare 2 funds shows overlaid performance
- Category filter works

---

## Task 2: ETF Screener & Overlap (4-5 hours)

### Backend

**Modify:** `backend/services/stock_service.py`
```
Add methods:
  - get_etf_list(market) → curated list of popular ETFs
    - IN: NIFTYBEES.NS, BANKBEES.NS, GOLDBEES.NS, JUNIORBEES.NS, ITBEES.NS, etc.
    - US: SPY, QQQ, VTI, VOO, ARKK, IWM, DIA, XLF, XLK, etc.
  - get_etf_details(symbol) → NAV, AUM, expense ratio, holdings (from yfinance info)
  - get_etf_holdings(symbol) → top holdings from yfinance ticker
  - compare_etf_overlap(sym1, sym2) → common holdings between 2 ETFs
```

**Modify:** `backend/routers/stocks.py`
```
New endpoints:
  GET /api/stocks/etfs?market=in
  GET /api/stocks/etf/{symbol}/details
  GET /api/stocks/etf/{symbol}/holdings
  GET /api/stocks/etf/overlap?symbols=SPY,QQQ
```

### Frontend

**New file:** `src/components/EtfPage.js`
```
Sections:
1. Market-aware ETF grid (IN toggle shows Indian ETFs, US shows US ETFs)
2. Each ETF card: name, price, change%, AUM, expense ratio
3. Click to expand: holdings breakdown (pie chart + table)
4. Overlap checker:
   - Select 2 ETFs from dropdowns
   - Show Venn-style overlap: common holdings, unique to each
   - Overlap percentage
5. Performance comparison chart (reuse PriceChart)
```

**Modify:** `src/App.js` - add route `/etf`
**Modify:** `src/components/Header.js` - add to More dropdown

### Verification
- ETF list loads for both IN and US markets
- Holdings breakdown shows top 10 holdings with weights
- Overlap checker shows common holdings between SPY and QQQ
- Price chart renders for selected ETF

---

## Task 3: Multi-Timeframe Charts (3-4 hours)

### Frontend only - no backend changes

**Modify:** `src/components/StockDetail/ChartTab.js`
```
Add view mode toggle: Single | Dual | Quad

Single mode: existing chart (no change)

Dual mode:
- Split view: 2 charts side by side
- Top/Left: Daily chart
- Bottom/Right: Weekly chart
- Crosshair sync between charts

Quad mode:
- 4 charts in 2x2 grid
- 1D, 1W, 1M, 3M timeframes
- All crosshairs synchronized

Implementation:
- Create multiple chart instances with createChart()
- Sync crosshairs:
    chart1.subscribeCrosshairMove(param => {
      if (param.time) chart2.setCrosshairPosition(param.seriesData, param.time);
    });
- Each chart fetches its own history range from the API
- Responsive: Quad → Dual on tablet, Dual → Single on mobile
- Store view preference in localStorage
```

### Verification
- Dual view shows 2 synced charts
- Hovering on one chart shows crosshair on the other
- Quad view shows 4 timeframes in grid
- Mobile falls back to single view
- View preference persists

---

## Task 4: Trending Tickers / Social Sentiment (3-4 hours)

### Backend

**New file:** `backend/services/social_service.py`
```
- SocialService class:
  - get_reddit_mentions(subreddit, limit=50):
    - Fetch from Reddit JSON API (no auth needed for public subreddits)
    - r/IndianStockMarket, r/wallstreetbets, r/stocks
    - Parse titles for stock symbols (regex: $AAPL or known symbol list)
    - Count mentions per symbol
    - Run VADER sentiment on title text
    - Return: [{ symbol, mentions, sentiment_score, sample_titles }]
  - get_trending_local():
    - Track most viewed stocks in-memory counter (reset daily)
    - Increment on /quote, /overview calls
    - Return top 20 most viewed
- Cache: reddit mentions 30min, local trending 5min
```

**New file:** `backend/routers/social.py`
```
Endpoints:
  GET /api/social/reddit?sub=IndianStockMarket
  GET /api/social/trending
```

**Modify:** `backend/main.py` - register social router

### Frontend

**New file:** `src/components/TrendingPage.js`
```
Sections:
1. "Trending on StockPulse" - most viewed stocks (from local tracking)
   - Bar chart or ranked list with view counts
2. "Reddit Buzz" - stock mentions from Reddit
   - Subreddit selector: r/IndianStockMarket | r/wallstreetbets | r/stocks
   - Ranked list: symbol, mention count, sentiment (bullish/bearish/neutral)
   - Sentiment badge (green/red/gray)
   - Sample post titles
3. "Social Sentiment" widget on stock detail page
   - Small badge showing Reddit sentiment for current stock
```

**Modify:** `src/App.js` - add route `/trending`
**Modify:** `src/components/Header.js` - add to navigation
**Modify:** `src/components/StockDetail/StockDetailPage.js` - add Reddit sentiment badge

### Verification
- Reddit mentions load for each subreddit
- Stocks ranked by mention count
- Sentiment scores shown with correct color coding
- Trending page shows most viewed stocks

---

## Task 5: Drawing Tools on Charts (5-6 hours)

### Frontend only - no backend changes

**New file:** `src/utils/chartDrawings.js`
```
- Storage: localStorage key per symbol (stockpulse_drawings_{symbol})
- Drawing types:
  1. Horizontal Line (support/resistance): click to place at price level
  2. Trendline: click two points, draw line between them
  3. Fibonacci Retracement: click high and low, auto-draw 0%, 23.6%, 38.2%, 50%, 61.8%, 100%
  4. Text Annotation: click to place, type label
- Each drawing stored as: { id, type, points, color, label?, createdAt }
- CRUD: addDrawing, removeDrawing, clearAll, getDrawings
```

**Modify:** `src/components/StockDetail/ChartTab.js`
```
Add drawing toolbar above chart:
- Tool icons: cursor (select), horizontal line, trendline, fibonacci, text, eraser
- Active tool highlighted
- Color picker for drawing color
- "Clear All" button

Implementation using lightweight-charts plugins:
- Use chart.addLineSeries() for horizontal lines
- Use PrimitivesPlugin for trendlines and fibonacci
- Mouse event handling: chart.subscribeClick for point placement
- State machine: IDLE → FIRST_POINT → SECOND_POINT → COMPLETE
- Render drawings from localStorage on chart load
- Delete drawing on click when eraser tool active
```

### Verification
- Can draw horizontal line at any price level
- Can draw trendline between two points
- Fibonacci retracement shows all levels
- Drawings persist after page reload
- Eraser tool removes individual drawings
- "Clear All" removes all drawings for symbol

---

## Execution Order

| Order | Task | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Mutual Fund Analytics | 6-8 hrs | mftool package |
| 2 | ETF Screener & Overlap | 4-5 hrs | yfinance (existing) |
| 3 | Trending / Social Sentiment | 3-4 hrs | Reddit JSON API (free) |
| 4 | Multi-Timeframe Charts | 3-4 hrs | lightweight-charts (existing) |
| 5 | Drawing Tools | 5-6 hrs | lightweight-charts plugins |

**Rationale:**
- MF Analytics first: highest user value, standalone feature
- ETF next: similar pattern to MF, reuse learned patterns
- Social/Trending: new data source, adds engagement
- Multi-TF Charts: frontend only, enhances existing chart
- Drawing Tools last: most complex, requires deep lightweight-charts knowledge

---

## Notes

- All data sources are **free**: mftool (NSE/AMFI), Reddit JSON API (no auth), yfinance
- No new paid API keys needed
- mftool only works for **Indian mutual funds** - show "India only" note when US market selected
- Reddit API rate limit: ~60 requests/minute without auth - cache aggressively
- Drawing tools use lightweight-charts v5 plugin API - check docs for primitives support
- Multi-TF charts will increase API calls per stock detail page (4x in quad mode) - batch where possible
