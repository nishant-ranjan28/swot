# StockPulse - All-in-One Stock Research Platform

A comprehensive stock research and analysis platform covering Indian (NSE/BSE) and US markets with real-time data, AI predictions, mutual fund analytics, and 25+ features.

**Live:** [swot-analyse.vercel.app](https://swot-analyse.vercel.app)

---

## Features

### Stock Analysis
- **Stock Detail Page** - 12 tabs: Overview, Chart, Technical, Fundamental, Financials, Dividends, Analysts, Holders, Earnings, Options, AI Predict, SWOT
- **Professional Charts** - TradingView lightweight-charts with candlestick, volume, multi-timeframe (Single/Dual/Quad view), drawing tools (H-Line, Fibonacci)
- **Technical Analysis** - 130+ indicators via pandas-ta, RSI, MACD, Bollinger Bands, Stochastic, ADX, candlestick patterns
- **Fundamental Analysis** - Scoring system with category breakdowns, financial ratios
- **AI Price Prediction** - Ridge Regression + Gradient Boosting with clamped predictions

### Market Tools
- **Screener** - Yahoo Finance screener API with 8000+ stocks, server-side filtering, AND/OR logic
- **52W Scanner** - Stocks near 52-week highs/lows with range bars
- **Stock Comparison** - Compare 2-4 stocks side by side with verdict scoring
- **Sector Heatmap** - Treemap + table view, NIFTY 50 / S&P 500 stock-level heatmap
- **Backtest Strategies** - SMA Cross and RSI strategies with equity curve and trade log

### Markets
- **Multi-Market Support** - India (NSE/BSE) + US market toggle throughout the app
- **Crypto Dashboard** - Live prices for top 15 cryptocurrencies via yfinance
- **Commodities** - Gold, Silver, Crude Oil, Natural Gas, Copper with charts
- **Forex** - Exchange rates + currency converter
- **Global Markets** - FTSE, Nikkei, DAX, Hang Seng, Euro Stoxx indices

### Mutual Funds & ETFs
- **Mutual Fund Analytics** - Search 14,000+ Indian MFs, NAV charts, top funds by category, holdings, portfolio overlap checker (via mfdata.in + mfapi.in)
- **ETF Screener** - Popular Indian and US ETFs, holdings breakdown, overlap analysis

### Intelligence
- **Trending & Social Sentiment** - Reddit stock mentions with VADER sentiment analysis, most viewed stocks tracking
- **FII/DII Flows** - Real NSE FII/DII data with NIFTY ETF proxy
- **Insider Deals** - Insider transaction search with autocomplete
- **Earnings Calendar** - Upcoming earnings grouped by date
- **Economic Calendar** - 18 recurring events with countdown (India, US, EU, Japan)
- **Market News** - Google News RSS + yfinance with VADER sentiment scoring

### Portfolio & Tools
- **Watchlist** - Price alerts with browser notifications, sparklines, technical signals, watchlist news
- **Portfolio Tracker** - P&L tracking, donut allocation chart, optimization (PyPortfolioOpt), risk analysis
- **Calculators** - SIP, Lumpsum, FIRE, EMI, CAGR, Margin, Brokerage (stocks + MFs)
- **Tax Calculator** - India (Budget 2024: STCG 20%, LTCG 12.5% + 4% cess) and US capital gains with cross-category loss offsetting
- **PDF Reports** - Download stock reports as PDF
- **CSV Export** - Export screener results, portfolio holdings

### UX
- **Dark Mode** - Persistent theme toggle
- **Responsive Design** - Mobile-friendly across all pages
- **Glossary** - 57 searchable finance terms across 9 categories
- **IPO Tracker** - Upcoming and recent IPOs
- **Macro Dashboard** - Treasury yields, dollar index, yield curve

---

## Tech Stack

### Frontend
- React 19 + Tailwind CSS
- TradingView lightweight-charts v5
- jsPDF for PDF generation
- localStorage for persistence (watchlist, portfolio, theme, drawings)
- React Context (Market, Theme, Stock)

### Backend
- FastAPI + uvicorn
- yfinance + yahooquery (stock data with yfinance fallback)
- pandas-ta (technical indicators)
- VADER Sentiment (news + Reddit)
- scikit-learn (AI prediction)
- backtesting.py (strategy backtesting)
- PyPortfolioOpt (portfolio optimization)
- mfdata.in + mfapi.in (mutual fund data)
- Google News RSS (market news)
- In-memory TTL caching (cachetools)

### Deployment
- **Frontend:** Vercel
- **Backend:** Render (free tier)

---

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.13+

### Frontend
```bash
npm install
npm start
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Environment Variables
Set `REACT_APP_API_URL` on Vercel pointing to your Render backend URL.

---

## Project Structure

```
swot/
├── src/
│   ├── components/          # React components (25+ pages)
│   │   ├── StockDetail/     # Stock detail tabs (12 tabs)
│   │   ├── HomePage.js      # Dashboard with indices, news, sentiment
│   │   ├── MutualFundPage.js
│   │   ├── EtfPage.js
│   │   ├── TrendingPage.js
│   │   └── ...
│   ├── context/             # MarketContext, ThemeContext, StockContext
│   ├── hooks/               # useStockData, useLocalStorage, useAlertNotifications
│   ├── utils/               # formatters, exportUtils, chartDrawings
│   └── data/                # glossary, economicEvents, ipoData
├── backend/
│   ├── services/            # Business logic
│   │   ├── stock_service.py # 40+ methods, main service
│   │   ├── mf_service.py    # Mutual fund analytics
│   │   ├── prediction_service.py
│   │   ├── crypto_service.py
│   │   └── ...
│   ├── routers/             # API endpoints
│   ├── utils/               # Caching
│   └── tests/               # pytest tests
└── docs/plans/              # Implementation plans
```

---

## API Endpoints

### Stocks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stocks/search` | Search stocks by name/symbol |
| GET | `/api/stocks/trending` | Popular stocks with quotes |
| GET | `/api/stocks/indices` | Market indices (IN/US/Global) |
| GET | `/api/stocks/{symbol}/quote` | Live quote |
| GET | `/api/stocks/{symbol}/overview` | Company overview |
| GET | `/api/stocks/{symbol}/history` | Historical OHLCV |
| GET | `/api/stocks/{symbol}/technical` | Technical analysis |
| GET | `/api/stocks/{symbol}/fundamental` | Fundamental scoring |
| GET | `/api/stocks/{symbol}/predict` | AI price prediction |
| GET | `/api/stocks/screener` | Stock screener with filters |
| GET | `/api/stocks/sector-performance` | Sector heatmap data |
| GET | `/api/stocks/etfs` | ETF listings |

### Mutual Funds
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mf/search` | Search MF schemes |
| GET | `/api/mf/top` | Top funds by category |
| GET | `/api/mf/{code}/nav` | Current NAV + details |
| GET | `/api/mf/{code}/history` | Historical NAV |
| GET | `/api/mf/{code}/holdings` | Stock-level holdings |
| GET | `/api/mf/overlap` | Portfolio overlap checker |

### Social
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/reddit` | Reddit stock mentions + sentiment |
| GET | `/api/social/trending` | Most viewed stocks |

---

## Data Sources

All data sources are **free** with no API keys required:

| Source | Used For |
|--------|----------|
| yfinance | Stock quotes, history, financials, news |
| yahooquery | Batch quotes (with yfinance fallback) |
| Yahoo Finance Search API | Stock/MF search |
| mfdata.in | MF search, NAV, holdings, overlap |
| mfapi.in | MF historical NAV |
| Google News RSS | Market news (India + US) |
| Reddit JSON API | Social sentiment |
| NSE API | FII/DII flows |

---

## License

MIT
