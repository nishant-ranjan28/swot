# backend/services/stock_service.py
import yfinance as yf
import httpx
import hashlib
import numpy as np
from datetime import datetime
from urllib.parse import quote_plus
from utils.cache import cache_manager
from config import CACHE_TTL, IST, MARKET_OPEN, MARKET_CLOSE
import math


def sanitize_json(obj):
    """Replace NaN/Inf floats with None recursively so JSON serialization doesn't fail."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_json(v) for v in obj]
    return obj


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
        """Resolve symbol — for Indian stocks ensure .NS/.BO suffix, for US stocks use as-is."""
        # Already has a suffix — return as-is
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            return symbol

        # Try as US stock first (no suffix)
        info = self._get_ticker_info(symbol)
        if info:
            return symbol

        # Try NSE
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

    async def search(self, query: str, market: str = "in") -> list[dict] | None:
        """Search stocks using Yahoo Finance search API (not yfinance)."""
        cache_key = f"{market}_{query.lower().strip()}"
        cached = cache_manager.get("search", cache_key)
        if cached is not None:
            return cached

        try:
            region = "IN" if market == "in" else "US"
            url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&region={region}&quotesCount=10"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
            }
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=10.0, headers=headers)
                data = response.json()

            quotes = data.get("quotes", [])
            results = []
            for q in quotes:
                symbol = q.get("symbol", "")
                quote_type = q.get("quoteType", "")

                if market == "us":
                    # US stocks: no suffix, exclude Indian/foreign stocks
                    if "." not in symbol and quote_type == "EQUITY":
                        name = q.get("longname") or q.get("shortname") or symbol
                        results.append({
                            "name": name, "symbol": symbol,
                            "exchange": q.get("exchange", ""), "type": quote_type,
                        })
                else:
                    # Indian stocks: .NS or .BO suffix
                    if symbol.endswith(".NS") or symbol.endswith(".BO"):
                        name = q.get("longname") or q.get("shortname") or symbol
                        results.append({
                            "name": name, "symbol": symbol,
                            "exchange": q.get("exchange", ""), "type": quote_type,
                        })

            cache_manager.set("search", cache_key, results)
            return results
        except Exception:
            return None

    async def search_mutual_funds(self, query: str) -> list[dict] | None:
        """Search mutual funds using Yahoo Finance search API."""
        cache_key = f"mf_{query.lower().strip()}"
        cached = cache_manager.get("search", cache_key)
        if cached is not None:
            return cached

        try:
            url = f"https://query1.finance.yahoo.com/v1/finance/search?q={quote_plus(query)}&quotesCount=20&newsCount=0"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"
            }
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=10.0, headers=headers)
                data = response.json()

            quotes = data.get("quotes", [])
            results = []
            for q in quotes:
                if q.get("quoteType") == "MUTUALFUND":
                    results.append({
                        "name": q.get("longname", q.get("shortname", "")),
                        "symbol": q.get("symbol", ""),
                        "exchange": q.get("exchange", ""),
                        "type": "MUTUALFUND",
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
            "week52_high": info.get("fiftyTwoWeekHigh"),
            "week52_low": info.get("fiftyTwoWeekLow"),
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

            result = sanitize_json({"symbol": symbol, "data": data})
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
        """Get holder data — uses major_holders for Indian stocks, institutional/mutual fund for others."""
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
                        "percent_held": round(float(row.get("pctHeld", 0)), 4) if row.get("pctHeld") else None,
                        "value": int(row.get("Value", 0)) if row.get("Value") else None,
                    })
                return holders

            institutional = parse_holders(ticker.institutional_holders)
            mutual_fund = parse_holders(ticker.mutualfund_holders)

            # For Indian stocks, institutional_holders is often empty
            # Use major_holders for ownership breakdown
            ownership = []
            major = ticker.major_holders
            if major is not None and not major.empty:
                label_map = {
                    "insidersPercentHeld": "Insiders / Promoters",
                    "institutionsPercentHeld": "Institutions",
                    "institutionsFloatPercentHeld": "Institutions (% of Float)",
                    "institutionsCount": "Number of Institutions",
                }
                for idx, row in major.iterrows():
                    label = label_map.get(idx, idx)
                    val = row.get("Value", 0)
                    ownership.append({
                        "category": label,
                        "value": round(float(val) * 100, 2) if val < 10 else int(val),
                    })

            result = {
                "symbol": symbol,
                "institutional": institutional,
                "mutual_fund": mutual_fund,
                "ownership": ownership,
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
                for idx, row in earnings_hist.iterrows():
                    quarter_date = str(idx) if idx else ""
                    # Try formatting as date if it's a Timestamp
                    try:
                        quarter_date = idx.strftime("%Y-%m-%d")
                    except (AttributeError, ValueError):
                        quarter_date = str(idx)
                    history.append({
                        "date": quarter_date,
                        "actual": row.get("epsActual"),
                        "estimate": row.get("epsEstimate"),
                        "surprise": row.get("epsDifference"),
                        "surprise_percent": round(row.get("surprisePercent", 0) * 100, 2) if row.get("surprisePercent") is not None else None,
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

    # Popular Indian stocks for homepage
    POPULAR_STOCKS = {
        "in": [
            "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
            "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
            "LT.NS", "TMCV.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS",
            "WIPRO.NS", "ADANIENT.NS", "TATAPOWER.NS", "TATASTEEL.NS", "HCLTECH.NS",
        ],
        "us": [
            "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
            "META", "TSLA", "BRK-B", "JPM", "V",
            "UNH", "JNJ", "WMT", "MA", "PG",
            "HD", "DIS", "NFLX", "CRM", "AMD",
        ],
    }

    MARKET_INDICES = {
        "in": [
            {"symbol": "^NSEI", "name": "NIFTY 50"},
            {"symbol": "^BSESN", "name": "SENSEX"},
            {"symbol": "^NSEBANK", "name": "NIFTY Bank"},
            {"symbol": "^CNXIT", "name": "NIFTY IT"},
        ],
        "us": [
            {"symbol": "^GSPC", "name": "S&P 500"},
            {"symbol": "^IXIC", "name": "NASDAQ"},
            {"symbol": "^DJI", "name": "Dow Jones"},
            {"symbol": "^RUT", "name": "Russell 2000"},
        ],
    }

    SENTIMENT_CONFIG = {
        "in": {"vix": "^INDIAVIX", "index": "^NSEI"},
        "us": {"vix": "^VIX", "index": "^GSPC"},
    }

    def get_trending_stocks(self, market: str = "in") -> list[dict]:
        """Get quotes for popular stocks by market."""
        cache_key = f"popular_{market}"
        cached = cache_manager.get("trending", cache_key)
        if cached is not None:
            return cached

        results = []
        for symbol in self.POPULAR_STOCKS.get(market, self.POPULAR_STOCKS["in"]):
            quote = self.get_quote(symbol)
            if quote and quote.get("price"):
                results.append(quote)

        cache_manager.set("trending", cache_key, results, ttl=300)
        return results

    def get_market_indices(self, market: str = "in") -> list[dict]:
        """Get major market indices by market."""
        cache_key = f"indices_{market}"
        cached = cache_manager.get("trending", cache_key)
        if cached is not None:
            return cached

        indices = self.MARKET_INDICES.get(market, self.MARKET_INDICES["in"])
        results = []
        for idx in indices:
            try:
                ticker = yf.Ticker(idx["symbol"])
                info = ticker.info
                price = info.get("regularMarketPrice", 0)
                prev = info.get("previousClose", 0)
                change = round(price - prev, 2) if price and prev else 0
                change_pct = round((change / prev) * 100, 2) if prev else 0
                results.append({
                    "symbol": idx["symbol"],
                    "name": idx["name"],
                    "price": price,
                    "change": change,
                    "change_percent": change_pct,
                })
            except Exception:
                continue

        cache_manager.set("trending", cache_key, results, ttl=300)
        return results

    def get_market_sentiment(self, market: str = "in") -> dict:
        """Get market sentiment indicators by market."""
        cache_key = f"sentiment_{market}"
        cached = cache_manager.get("trending", cache_key)
        if cached is not None:
            return cached

        config = self.SENTIMENT_CONFIG.get(market, self.SENTIMENT_CONFIG["in"])

        try:
            # VIX (fear gauge)
            vix = yf.Ticker(config["vix"])
            vix_info = vix.info
            vix_price = vix_info.get("regularMarketPrice", 0)
            vix_prev = vix_info.get("previousClose", 0)
            vix_change = round(vix_price - vix_prev, 2) if vix_price and vix_prev else 0

            # VIX thresholds differ by market
            if market == "us":
                if vix_price < 12: vix_signal = "Extreme Greed"
                elif vix_price < 16: vix_signal = "Greed"
                elif vix_price < 20: vix_signal = "Neutral"
                elif vix_price < 30: vix_signal = "Fear"
                else: vix_signal = "Extreme Fear"
            else:
                if vix_price < 13: vix_signal = "Extreme Greed"
                elif vix_price < 17: vix_signal = "Greed"
                elif vix_price < 22: vix_signal = "Neutral"
                elif vix_price < 30: vix_signal = "Fear"
                else: vix_signal = "Extreme Fear"

            vix_label = "VIX" if market == "us" else "India VIX"

            # Index position analysis
            index_ticker = yf.Ticker(config["index"])
            idx_info = index_ticker.info
            idx_price = idx_info.get("regularMarketPrice", 0)
            idx_50dma = idx_info.get("fiftyDayAverage", 0)
            idx_200dma = idx_info.get("twoHundredDayAverage", 0)
            idx_52h = idx_info.get("fiftyTwoWeekHigh", 0)
            idx_52l = idx_info.get("fiftyTwoWeekLow", 0)
            idx_name = "S&P 500" if market == "us" else "NIFTY"

            above_50dma = idx_price > idx_50dma if idx_50dma else None
            above_200dma = idx_price > idx_200dma if idx_200dma else None
            pct_from_high = round(((idx_52h - idx_price) / idx_52h) * 100, 2) if idx_52h else 0
            pct_from_low = round(((idx_price - idx_52l) / idx_52l) * 100, 2) if idx_52l else 0

            # Breadth from trending stocks
            trending = self.get_trending_stocks(market)
            gainers = sum(1 for s in trending if (s.get("change_percent") or 0) > 0)
            losers = sum(1 for s in trending if (s.get("change_percent") or 0) < 0)
            total = len(trending)
            breadth_pct = round((gainers / total) * 100) if total > 0 else 50

            # Sentiment score
            score = 50
            if vix_price < 15: score += 15
            elif vix_price < 20: score += 5
            elif vix_price > 35: score -= 20
            elif vix_price > 25: score -= 10

            if above_50dma: score += 10
            else: score -= 10
            if above_200dma: score += 10
            else: score -= 10
            if breadth_pct > 60: score += 10
            elif breadth_pct < 40: score -= 10

            score = max(0, min(100, score))

            if score >= 75: overall = "Bullish"
            elif score >= 55: overall = "Mildly Bullish"
            elif score >= 45: overall = "Neutral"
            elif score >= 25: overall = "Mildly Bearish"
            else: overall = "Bearish"

            result = {
                "market": market,
                "overall": overall,
                "score": score,
                "vix": {
                    "name": vix_label,
                    "value": vix_price,
                    "change": vix_change,
                    "signal": vix_signal,
                },
                "index": {
                    "name": idx_name,
                    "price": idx_price,
                    "50dma": round(idx_50dma, 2) if idx_50dma else None,
                    "200dma": round(idx_200dma, 2) if idx_200dma else None,
                    "above_50dma": above_50dma,
                    "above_200dma": above_200dma,
                    "pct_from_52w_high": pct_from_high,
                    "pct_from_52w_low": pct_from_low,
                },
                "breadth": {
                    "gainers": gainers,
                    "losers": losers,
                    "total": total,
                    "pct": breadth_pct,
                },
            }

            cache_manager.set("trending", cache_key, result, ttl=300)
            return result
        except Exception as e:
            print(f"Sentiment error for {market}: {e}")
            return None

    def _parse_news(self, news_items: list) -> list[dict]:
        """Parse yfinance news items into a clean format."""
        articles = []
        for item in news_items:
            content = item.get("content", {})
            if not content.get("title"):
                continue

            thumbnail = content.get("thumbnail")
            image_url = None
            if thumbnail and thumbnail.get("resolutions"):
                # Get the largest resolution
                resolutions = thumbnail["resolutions"]
                image_url = resolutions[-1].get("url") if resolutions else thumbnail.get("originalUrl")

            articles.append({
                "title": content.get("title", ""),
                "summary": content.get("summary", ""),
                "url": content.get("canonicalUrl", {}).get("url", ""),
                "published_at": content.get("pubDate", ""),
                "source": content.get("provider", {}).get("displayName", "Yahoo Finance"),
                "image": image_url,
            })
        return articles

    def get_stock_news(self, symbol: str) -> list[dict]:
        """Get news for a specific stock."""
        cached = cache_manager.get("news", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news or []
            articles = self._parse_news(news)
            cache_manager.set("news", symbol, articles, ttl=900)
            return articles
        except Exception:
            return []

    def get_market_news(self, market: str = "in") -> list[dict]:
        """Get general market news by aggregating news from indices and popular stocks."""
        cache_key = f"market_{market}"
        cached = cache_manager.get("news", cache_key)
        if cached is not None:
            return cached

        # Fetch news from market-specific sources
        if market == "us":
            news_sources = ["^GSPC", "^IXIC", "AAPL", "MSFT", "GOOGL",
                            "AMZN", "NVDA", "META"]
        else:
            news_sources = ["^NSEI", "^BSESN", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS",
                            "INFY.NS", "ICICIBANK.NS", "SBIN.NS"]

        all_articles = []
        seen_titles = set()

        for sym in news_sources:
            try:
                ticker = yf.Ticker(sym)
                news = ticker.news or []
                for article in self._parse_news(news):
                    if article["title"] not in seen_titles:
                        seen_titles.add(article["title"])
                        all_articles.append(article)
            except Exception:
                continue

        all_articles.sort(key=lambda x: x.get("published_at", ""), reverse=True)
        cache_manager.set("news", cache_key, all_articles, ttl=900)
        return all_articles

    def _calc_sma(self, prices, period):
        """Simple Moving Average."""
        if len(prices) < period:
            return None
        return round(float(np.mean(prices[-period:])), 2)

    def _calc_ema(self, prices, period):
        """Exponential Moving Average."""
        if len(prices) < period:
            return None
        multiplier = 2 / (period + 1)
        ema = prices[0]
        for price in prices[1:]:
            ema = (price - ema) * multiplier + ema
        return round(float(ema), 2)

    def _calc_rsi(self, prices, period=14):
        """Relative Strength Index."""
        if len(prices) < period + 1:
            return None
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(100 - (100 / (1 + rs)), 2)

    def _calc_macd(self, prices):
        """MACD (12, 26, 9)."""
        if len(prices) < 26:
            return None, None, None
        ema12 = self._calc_ema(prices, 12)
        ema26 = self._calc_ema(prices, 26)
        macd_line = round(ema12 - ema26, 2)
        # Signal line approximation using last 9 MACD values
        macd_values = []
        for i in range(max(0, len(prices) - 30), len(prices)):
            subset = prices[:i + 1]
            if len(subset) >= 26:
                e12 = self._calc_ema(subset, 12)
                e26 = self._calc_ema(subset, 26)
                macd_values.append(e12 - e26)
        signal = self._calc_ema(macd_values, 9) if len(macd_values) >= 9 else None
        histogram = round(macd_line - signal, 2) if signal else None
        return macd_line, signal, histogram

    def _calc_bollinger(self, prices, period=20):
        """Bollinger Bands."""
        if len(prices) < period:
            return None, None, None
        sma = np.mean(prices[-period:])
        std = np.std(prices[-period:])
        return round(float(sma + 2 * std), 2), round(float(sma), 2), round(float(sma - 2 * std), 2)

    def _calc_atr(self, highs, lows, closes, period=14):
        """Average True Range."""
        if len(closes) < period + 1:
            return None
        tr_values = []
        for i in range(1, len(closes)):
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            )
            tr_values.append(tr)
        if len(tr_values) < period:
            return None
        return round(float(np.mean(tr_values[-period:])), 2)

    def _find_support_resistance(self, prices, window=20):
        """Find support and resistance levels."""
        if len(prices) < window * 2:
            return [], []
        supports = []
        resistances = []
        for i in range(window, len(prices) - window):
            if prices[i] == min(prices[i - window:i + window + 1]):
                supports.append(round(float(prices[i]), 2))
            if prices[i] == max(prices[i - window:i + window + 1]):
                resistances.append(round(float(prices[i]), 2))
        # Return closest levels
        current = prices[-1]
        supports = sorted(set(s for s in supports if s < current), reverse=True)[:3]
        resistances = sorted(set(r for r in resistances if r > current))[:3]
        return supports, resistances

    def get_technical_analysis(self, symbol: str) -> dict | None:
        """Comprehensive technical analysis with indicators and signals."""
        cached = cache_manager.get("technical", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period="1y")
            if df.empty or len(df) < 50:
                return None

            closes = df["Close"].values.tolist()
            highs = df["High"].values.tolist()
            lows = df["Low"].values.tolist()
            current_price = closes[-1]

            # Moving Averages
            sma_20 = self._calc_sma(closes, 20)
            sma_50 = self._calc_sma(closes, 50)
            sma_200 = self._calc_sma(closes, 200)
            ema_12 = self._calc_ema(closes, 12)
            ema_26 = self._calc_ema(closes, 26)
            ema_50 = self._calc_ema(closes, 50)

            # Oscillators
            rsi = self._calc_rsi(closes)
            macd_line, macd_signal, macd_histogram = self._calc_macd(closes)
            bb_upper, bb_middle, bb_lower = self._calc_bollinger(closes)
            atr = self._calc_atr(highs, lows, closes)

            # Support/Resistance
            supports, resistances = self._find_support_resistance(closes)

            # Generate signals
            ma_signals = []
            ma_buy = 0
            ma_total = 0

            for label, ma_val in [("SMA 20", sma_20), ("SMA 50", sma_50), ("SMA 200", sma_200),
                                   ("EMA 12", ema_12), ("EMA 26", ema_26), ("EMA 50", ema_50)]:
                if ma_val:
                    signal = "Buy" if current_price > ma_val else "Sell"
                    ma_signals.append({"name": label, "value": ma_val, "signal": signal})
                    ma_total += 1
                    if signal == "Buy":
                        ma_buy += 1

            osc_signals = []
            osc_buy = 0
            osc_total = 0

            # RSI signal
            if rsi is not None:
                if rsi < 30:
                    sig = "Buy"
                elif rsi > 70:
                    sig = "Sell"
                else:
                    sig = "Neutral"
                osc_signals.append({"name": "RSI (14)", "value": rsi, "signal": sig})
                osc_total += 1
                if sig == "Buy":
                    osc_buy += 1
                elif sig == "Neutral":
                    osc_buy += 0.5

            # MACD signal
            if macd_histogram is not None:
                sig = "Buy" if macd_histogram > 0 else "Sell"
                osc_signals.append({"name": "MACD (12,26,9)", "value": macd_line, "signal": sig})
                osc_total += 1
                if sig == "Buy":
                    osc_buy += 1

            # Bollinger signal
            if bb_upper and bb_lower:
                if current_price < bb_lower:
                    sig = "Buy"
                elif current_price > bb_upper:
                    sig = "Sell"
                else:
                    sig = "Neutral"
                osc_signals.append({"name": "Bollinger Bands", "value": f"{bb_lower} - {bb_upper}", "signal": sig})
                osc_total += 1
                if sig == "Buy":
                    osc_buy += 1
                elif sig == "Neutral":
                    osc_buy += 0.5

            # Overall signal
            total_buy = ma_buy + osc_buy
            total_indicators = ma_total + osc_total
            buy_pct = (total_buy / total_indicators * 100) if total_indicators > 0 else 50

            if buy_pct >= 70:
                overall = "Strong Buy"
            elif buy_pct >= 55:
                overall = "Buy"
            elif buy_pct >= 45:
                overall = "Neutral"
            elif buy_pct >= 30:
                overall = "Sell"
            else:
                overall = "Strong Sell"

            # Trend analysis
            trend_short = "Bullish" if current_price > (sma_20 or 0) else "Bearish"
            trend_medium = "Bullish" if current_price > (sma_50 or 0) else "Bearish"
            trend_long = "Bullish" if current_price > (sma_200 or 0) else "Bearish"

            # Volatility
            daily_returns = np.diff(closes) / closes[:-1]
            volatility = round(float(np.std(daily_returns) * np.sqrt(252) * 100), 2)

            result = {
                "symbol": symbol,
                "current_price": round(current_price, 2),
                "overall_signal": overall,
                "buy_percentage": round(buy_pct, 1),
                "moving_averages": {
                    "signals": ma_signals,
                    "buy_count": ma_buy,
                    "sell_count": ma_total - ma_buy,
                    "summary": "Buy" if ma_buy > ma_total / 2 else "Sell" if ma_buy < ma_total / 2 else "Neutral",
                },
                "oscillators": {
                    "signals": osc_signals,
                    "rsi": rsi,
                    "macd": {"line": macd_line, "signal": macd_signal, "histogram": macd_histogram},
                    "bollinger": {"upper": bb_upper, "middle": bb_middle, "lower": bb_lower},
                    "summary": "Buy" if osc_buy > osc_total / 2 else "Sell" if osc_buy < osc_total / 2 else "Neutral",
                },
                "trend": {
                    "short_term": trend_short,
                    "medium_term": trend_medium,
                    "long_term": trend_long,
                },
                "volatility": volatility,
                "atr": atr,
                "support_levels": supports,
                "resistance_levels": resistances,
            }

            result = sanitize_json(result)
            cache_manager.set("technical", symbol, result, ttl=3600)
            return result
        except Exception as e:
            print(f"Technical analysis error: {e}")
            return None

    def get_fundamental_analysis(self, symbol: str) -> dict | None:
        """Comprehensive fundamental analysis with scoring."""
        cached = cache_manager.get("fundamental", symbol)
        if cached is not None:
            return cached

        try:
            info = self._get_ticker_info(symbol)
            if not info:
                return None

            ticker = yf.Ticker(symbol)

            # --- Valuation ---
            pe = info.get("trailingPE")
            forward_pe = info.get("forwardPE")
            pb = info.get("priceToBook")
            peg = info.get("pegRatio")
            ev_ebitda = info.get("enterpriseToEbitda")
            ev_revenue = info.get("enterpriseToRevenue")

            valuation_score = 0
            valuation_max = 0
            valuation_items = []

            def score_metric(name, value, good_range, ok_range, description):
                nonlocal valuation_score, valuation_max
                if value is None:
                    return
                valuation_max += 10
                if good_range[0] <= value <= good_range[1]:
                    s = 10
                    verdict = "Attractive"
                elif ok_range[0] <= value <= ok_range[1]:
                    s = 6
                    verdict = "Fair"
                else:
                    s = 2
                    verdict = "Expensive" if value > ok_range[1] else "Very Low"
                valuation_score += s
                valuation_items.append({
                    "name": name, "value": round(value, 2), "score": s,
                    "max_score": 10, "verdict": verdict, "description": description,
                })

            score_metric("P/E Ratio", pe, (0, 20), (0, 30),
                         "Price relative to earnings. Lower suggests better value.")
            score_metric("Forward P/E", forward_pe, (0, 18), (0, 25),
                         "Expected P/E based on future earnings estimates.")
            score_metric("P/B Ratio", pb, (0, 3), (0, 5),
                         "Price relative to book value. Under 3 is generally good.")
            score_metric("PEG Ratio", peg, (0, 1), (0, 2),
                         "P/E adjusted for growth. Under 1 suggests undervaluation.")
            score_metric("EV/EBITDA", ev_ebitda, (0, 12), (0, 20),
                         "Enterprise value relative to operating earnings.")

            # --- Profitability ---
            profit_margin = info.get("profitMargins")
            operating_margin = info.get("operatingMargins")
            gross_margin = info.get("grossMargins")
            roe = info.get("returnOnEquity")
            roa = info.get("returnOnAssets")

            profitability_score = 0
            profitability_max = 0
            profitability_items = []

            def score_profit(name, value, good_thresh, ok_thresh, description):
                nonlocal profitability_score, profitability_max
                if value is None:
                    return
                profitability_max += 10
                pct = value * 100
                if pct >= good_thresh:
                    s = 10
                    verdict = "Excellent"
                elif pct >= ok_thresh:
                    s = 6
                    verdict = "Good"
                elif pct >= 0:
                    s = 3
                    verdict = "Weak"
                else:
                    s = 1
                    verdict = "Negative"
                profitability_score += s
                profitability_items.append({
                    "name": name, "value": round(pct, 2), "unit": "%", "score": s,
                    "max_score": 10, "verdict": verdict, "description": description,
                })

            score_profit("Profit Margin", profit_margin, 15, 8,
                         "Net income as % of revenue. Higher means more profitable.")
            score_profit("Operating Margin", operating_margin, 20, 10,
                         "Operating income as % of revenue. Measures operational efficiency.")
            score_profit("Gross Margin", gross_margin, 40, 25,
                         "Revenue minus cost of goods. Higher means better pricing power.")
            score_profit("Return on Equity", roe, 15, 10,
                         "Profit generated per rupee of shareholder equity.")
            score_profit("Return on Assets", roa, 8, 4,
                         "How efficiently assets generate profit.")

            # --- Growth ---
            revenue_growth = info.get("revenueGrowth")
            earnings_growth = info.get("earningsGrowth")

            growth_score = 0
            growth_max = 0
            growth_items = []

            def score_growth(name, value, good_thresh, ok_thresh, description):
                nonlocal growth_score, growth_max
                if value is None:
                    return
                growth_max += 10
                pct = value * 100
                if pct >= good_thresh:
                    s = 10
                    verdict = "Strong"
                elif pct >= ok_thresh:
                    s = 6
                    verdict = "Moderate"
                elif pct >= 0:
                    s = 3
                    verdict = "Slow"
                else:
                    s = 1
                    verdict = "Declining"
                growth_score += s
                growth_items.append({
                    "name": name, "value": round(pct, 2), "unit": "%", "score": s,
                    "max_score": 10, "verdict": verdict, "description": description,
                })

            score_growth("Revenue Growth", revenue_growth, 15, 5,
                         "Year-over-year revenue increase. Shows business expansion.")
            score_growth("Earnings Growth", earnings_growth, 15, 5,
                         "Year-over-year earnings increase. Shows profitability trend.")

            # --- Financial Health ---
            debt_equity = info.get("debtToEquity")
            current_ratio = info.get("currentRatio")
            quick_ratio = info.get("quickRatio")

            health_score = 0
            health_max = 0
            health_items = []

            if debt_equity is not None:
                health_max += 10
                de = debt_equity / 100 if debt_equity > 10 else debt_equity  # normalize
                if de < 0.5:
                    s, v = 10, "Low Debt"
                elif de < 1:
                    s, v = 7, "Moderate"
                elif de < 2:
                    s, v = 4, "High"
                else:
                    s, v = 1, "Very High"
                health_score += s
                health_items.append({
                    "name": "Debt/Equity", "value": round(de, 2), "score": s,
                    "max_score": 10, "verdict": v,
                    "description": "Total debt relative to equity. Lower is safer.",
                })

            if current_ratio is not None:
                health_max += 10
                if current_ratio >= 2:
                    s, v = 10, "Strong"
                elif current_ratio >= 1.5:
                    s, v = 7, "Good"
                elif current_ratio >= 1:
                    s, v = 4, "Adequate"
                else:
                    s, v = 1, "Weak"
                health_score += s
                health_items.append({
                    "name": "Current Ratio", "value": round(current_ratio, 2), "score": s,
                    "max_score": 10, "verdict": v,
                    "description": "Ability to pay short-term obligations. Above 1.5 is healthy.",
                })

            if quick_ratio is not None:
                health_max += 10
                if quick_ratio >= 1.5:
                    s, v = 10, "Strong"
                elif quick_ratio >= 1:
                    s, v = 7, "Good"
                elif quick_ratio >= 0.5:
                    s, v = 4, "Adequate"
                else:
                    s, v = 1, "Weak"
                health_score += s
                health_items.append({
                    "name": "Quick Ratio", "value": round(quick_ratio, 2), "score": s,
                    "max_score": 10, "verdict": v,
                    "description": "Like current ratio but excludes inventory. Stricter test.",
                })

            # --- Dividend ---
            div_yield = info.get("dividendYield")
            payout = info.get("payoutRatio")

            dividend_items = []
            dividend_score = 0
            dividend_max = 0

            if div_yield is not None:
                dividend_max += 10
                dy = div_yield * 100
                if dy >= 3:
                    s, v = 10, "High Yield"
                elif dy >= 1:
                    s, v = 6, "Moderate"
                elif dy > 0:
                    s, v = 3, "Low"
                else:
                    s, v = 1, "None"
                dividend_score += s
                dividend_items.append({
                    "name": "Dividend Yield", "value": round(dy, 2), "unit": "%",
                    "score": s, "max_score": 10, "verdict": v,
                    "description": "Annual dividend as % of stock price.",
                })

            if payout is not None and payout > 0:
                dividend_max += 10
                po = payout * 100
                if 20 <= po <= 60:
                    s, v = 10, "Sustainable"
                elif po < 20:
                    s, v = 5, "Conservative"
                elif po <= 80:
                    s, v = 4, "High"
                else:
                    s, v = 1, "Unsustainable"
                dividend_score += s
                dividend_items.append({
                    "name": "Payout Ratio", "value": round(po, 2), "unit": "%",
                    "score": s, "max_score": 10, "verdict": v,
                    "description": "% of earnings paid as dividends. 20-60% is ideal.",
                })

            # Overall Score
            total_score = valuation_score + profitability_score + growth_score + health_score + dividend_score
            total_max = valuation_max + profitability_max + growth_max + health_max + dividend_max
            overall_pct = round((total_score / total_max * 100), 1) if total_max > 0 else 0

            if overall_pct >= 75:
                overall_verdict = "Strong"
            elif overall_pct >= 60:
                overall_verdict = "Good"
            elif overall_pct >= 45:
                overall_verdict = "Average"
            elif overall_pct >= 30:
                overall_verdict = "Weak"
            else:
                overall_verdict = "Poor"

            result = {
                "symbol": symbol,
                "overall_score": total_score,
                "overall_max": total_max,
                "overall_percentage": overall_pct,
                "overall_verdict": overall_verdict,
                "valuation": {
                    "score": valuation_score, "max": valuation_max, "items": valuation_items,
                },
                "profitability": {
                    "score": profitability_score, "max": profitability_max, "items": profitability_items,
                },
                "growth": {
                    "score": growth_score, "max": growth_max, "items": growth_items,
                },
                "financial_health": {
                    "score": health_score, "max": health_max, "items": health_items,
                },
                "dividend": {
                    "score": dividend_score, "max": dividend_max, "items": dividend_items,
                },
            }

            result = sanitize_json(result)
            cache_manager.set("fundamental", symbol, result, ttl=86400)
            return result
        except Exception as e:
            print(f"Fundamental analysis error: {e}")
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

    # Expanded stock list for screener/scanner
    SCREENER_STOCKS = POPULAR_STOCKS["in"] + [
        # Large Cap
        "SUNPHARMA.NS", "BAJAJFINSV.NS", "TITAN.NS", "ASIANPAINT.NS",
        "ULTRACEMCO.NS", "NESTLEIND.NS", "POWERGRID.NS", "NTPC.NS",
        "JSWSTEEL.NS", "M&M.NS", "COALINDIA.NS", "ONGC.NS",
        "GRASIM.NS", "CIPLA.NS", "DRREDDY.NS", "DIVISLAB.NS",
        "BPCL.NS", "HEROMOTOCO.NS", "EICHERMOT.NS", "TECHM.NS",
        "APOLLOHOSP.NS", "LTIM.NS", "DABUR.NS", "PIDILITIND.NS",
        "HAVELLS.NS", "GODREJCP.NS", "INDUSINDBK.NS", "BANKBARODA.NS",
        "PNB.NS", "IOC.NS",
        # Mid Cap
        "TATACOMM.NS", "MPHASIS.NS", "PAGEIND.NS", "COFORGE.NS",
        "PERSISTENT.NS", "AUROPHARMA.NS", "FEDERALBNK.NS", "IDFCFIRSTB.NS",
        "CROMPTON.NS", "JUBLFOOD.NS", "VOLTAS.NS", "TRENT.NS",
        "CANBK.NS", "ABCAPITAL.NS", "MANAPPURAM.NS",
        # Small Cap
        "KPITTECH.NS", "DEEPAKNTR.NS", "ROUTE.NS", "CDSL.NS",
        "IIFL.NS", "GRINDWELL.NS", "FINEORG.NS", "RAJESHEXPO.NS",
        "CAMS.NS", "HAPPSTMNDS.NS",
    ]

    # Yahoo screener field constants
    _MCAP = "intradaymarketcap"
    _PE = "peratio.lasttwelvemonths"
    _PB = "pricebookvalue.quarterly"
    _DIV = "dividendyield"
    _PEG = "pegratio_5y"
    _EVEBITDA = "evebitda.lasttwelvemonths"
    _ROE = "returnonequity.annual"
    _PM = "profitmargin.lasttwelvemonths"
    _RG = "revenue_growth.annual"
    _ANALYST = "averageanalystrating"

    @classmethod
    def _yf_filter_map(cls):
        return {
            "market_cap_large": {"operator": "gt", "operands": [cls._MCAP, 1000000000000]},
            "market_cap_mid": [
                {"operator": "gte", "operands": [cls._MCAP, 250000000000]},
                {"operator": "lt", "operands": [cls._MCAP, 1000000000000]},
            ],
            "market_cap_small": {"operator": "lt", "operands": [cls._MCAP, 250000000000]},
            "pe_<10": {"operator": "lt", "operands": [cls._PE, 10]},
            "pe_10-20": [
                {"operator": "gte", "operands": [cls._PE, 10]},
                {"operator": "lte", "operands": [cls._PE, 20]},
            ],
            "pe_20-40": [
                {"operator": "gte", "operands": [cls._PE, 20]},
                {"operator": "lte", "operands": [cls._PE, 40]},
            ],
            "pe_>40": {"operator": "gt", "operands": [cls._PE, 40]},
            "pb_<1": {"operator": "lt", "operands": [cls._PB, 1]},
            "pb_1-3": [
                {"operator": "gte", "operands": [cls._PB, 1]},
                {"operator": "lte", "operands": [cls._PB, 3]},
            ],
            "pb_3-5": [
                {"operator": "gte", "operands": [cls._PB, 3]},
                {"operator": "lte", "operands": [cls._PB, 5]},
            ],
            "pb_>5": {"operator": "gt", "operands": [cls._PB, 5]},
            "div_>1": {"operator": "gt", "operands": [cls._DIV, 1]},
            "div_>3": {"operator": "gt", "operands": [cls._DIV, 3]},
            "div_>5": {"operator": "gt", "operands": [cls._DIV, 5]},
            "div_0": {"operator": "eq", "operands": [cls._DIV, 0]},
            "peg_<1": {"operator": "lt", "operands": [cls._PEG, 1]},
            "peg_1-2": [
                {"operator": "gte", "operands": [cls._PEG, 1]},
                {"operator": "lte", "operands": [cls._PEG, 2]},
            ],
            "peg_>2": {"operator": "gt", "operands": [cls._PEG, 2]},
            "ev_ebitda_<10": {"operator": "lt", "operands": [cls._EVEBITDA, 10]},
            "ev_ebitda_10-20": [
                {"operator": "gte", "operands": [cls._EVEBITDA, 10]},
                {"operator": "lte", "operands": [cls._EVEBITDA, 20]},
            ],
            "ev_ebitda_>20": {"operator": "gt", "operands": [cls._EVEBITDA, 20]},
            "roe_>10": {"operator": "gt", "operands": [cls._ROE, 0.10]},
            "roe_>15": {"operator": "gt", "operands": [cls._ROE, 0.15]},
            "roe_>20": {"operator": "gt", "operands": [cls._ROE, 0.20]},
            "roe_<0": {"operator": "lt", "operands": [cls._ROE, 0]},
            "pm_>20": {"operator": "gt", "operands": [cls._PM, 0.20]},
            "pm_>10": {"operator": "gt", "operands": [cls._PM, 0.10]},
            "pm_>0": {"operator": "gt", "operands": [cls._PM, 0]},
            "pm_<0": {"operator": "lt", "operands": [cls._PM, 0]},
            "rg_>20": {"operator": "gt", "operands": [cls._RG, 0.20]},
            "rg_>10": {"operator": "gt", "operands": [cls._RG, 0.10]},
            "rg_>0": {"operator": "gt", "operands": [cls._RG, 0]},
            "rg_<0": {"operator": "lt", "operands": [cls._RG, 0]},
            "rec_strong_buy": {"operator": "lte", "operands": [cls._ANALYST, 1.5]},
            "rec_buy": {"operator": "lte", "operands": [cls._ANALYST, 2.5]},
            "rec_hold": [
                {"operator": "gt", "operands": [cls._ANALYST, 2.5]},
                {"operator": "lte", "operands": [cls._ANALYST, 3.5]},
            ],
            "rec_sell": {"operator": "gt", "operands": [cls._ANALYST, 3.5]},
        }

    async def screener_query(self, params: dict) -> dict:
        """Query Yahoo Finance screener with filters. Searches all 8000+ Indian stocks."""
        size = min(int(params.get("size", 50)), 200)
        sort_field = params.get("sort", "intradaymarketcap")
        sort_type = params.get("sort_dir", "desc")
        logic = params.get("logic", "AND").upper()
        if logic not in ("AND", "OR"):
            logic = "AND"

        # Build operands from filter params
        # Region filter always applies (AND)
        region = params.get("market", "in")
        region_filter = {"operator": "eq", "operands": ["region", region]}
        user_operands = []

        filter_keys = {
            "market_cap_range": {"large": "market_cap_large", "mid": "market_cap_mid", "small": "market_cap_small"},
            "pe_range": {"<10": "pe_<10", "10-20": "pe_10-20", "20-40": "pe_20-40", ">40": "pe_>40"},
            "pb_range": {"<1": "pb_<1", "1-3": "pb_1-3", "3-5": "pb_3-5", ">5": "pb_>5"},
            "div_yield_range": {">1": "div_>1", ">3": "div_>3", ">5": "div_>5", "0": "div_0"},
            "peg_range": {"<1": "peg_<1", "1-2": "peg_1-2", ">2": "peg_>2"},
            "ev_ebitda_range": {"<10": "ev_ebitda_<10", "10-20": "ev_ebitda_10-20", ">20": "ev_ebitda_>20"},
            "roe_range": {">10": "roe_>10", ">15": "roe_>15", ">20": "roe_>20", "<0": "roe_<0"},
            "profit_margin_range": {">20": "pm_>20", ">10": "pm_>10", ">0": "pm_>0", "<0": "pm_<0"},
            "rev_growth_range": {">20": "rg_>20", ">10": "rg_>10", ">0": "rg_>0", "<0": "rg_<0"},
            "recommendation_range": {"strong_buy": "rec_strong_buy", "buy": "rec_buy", "hold": "rec_hold", "sell": "rec_sell"},
        }

        for param_key, value_map in filter_keys.items():
            val = params.get(param_key)
            if val and val != "all" and val in value_map:
                yahoo_key = value_map[val]
                yahoo_filter = self._yf_filter_map().get(yahoo_key)
                if yahoo_filter:
                    if isinstance(yahoo_filter, list):
                        user_operands.extend(yahoo_filter)
                    else:
                        user_operands.append(yahoo_filter)

        cache_key = f"screener_{hashlib.sha256(str(sorted(params.items())).encode()).hexdigest()[:16]}"
        cached = cache_manager.get("screener", cache_key)
        if cached is not None:
            return cached

        try:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
            async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
                await client.get("https://fc.yahoo.com/curveball?crumb")
                crumb_resp = await client.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
                crumb = crumb_resp.text

                url = f"https://query2.finance.yahoo.com/v1/finance/screener?crumb={crumb}"
                payload = {
                    "offset": 0, "size": size,
                    "sortField": sort_field, "sortType": sort_type,
                    "quoteType": "EQUITY",
                    "query": {"operator": "AND", "operands": [
                        region_filter,
                        *(user_operands if logic == "AND" else
                          [{"operator": "OR", "operands": user_operands}] if user_operands else [])
                    ]},
                }
                resp = await client.post(url, json=payload, timeout=20.0)
                data = resp.json()

            result_data = data.get("finance", {}).get("result", [{}])[0]
            total = result_data.get("total", 0)
            quotes = result_data.get("quotes", [])

            # Transform Yahoo quotes to our format
            stocks = []
            seen = set()
            for q in quotes:
                sym = q.get("symbol", "")
                # Dedupe .NS and .BO for same stock
                base = sym.replace(".NS", "").replace(".BO", "")
                if base in seen:
                    continue
                seen.add(base)

                price = q.get("regularMarketPrice", 0)
                prev = q.get("regularMarketPreviousClose", 0)
                change = round(price - prev, 2) if price and prev else 0
                change_pct = round((change / prev) * 100, 2) if prev else 0

                stocks.append({
                    "symbol": sym,
                    "name": q.get("shortName", q.get("longName", "")),
                    "sector": q.get("sector", ""),
                    "industry": q.get("industry", ""),
                    "price": price,
                    "change": change,
                    "change_percent": change_pct,
                    "market_cap": q.get("marketCap"),
                    "pe_ratio": q.get("trailingPE"),
                    "forward_pe": q.get("forwardPE"),
                    "pb_ratio": q.get("priceToBook"),
                    "peg_ratio": None,
                    "ev_ebitda": None,
                    "dividend_yield": round((q.get("dividendYield", 0) or 0) * 100, 2),
                    "roe": None,
                    "roa": None,
                    "profit_margin": None,
                    "operating_margin": None,
                    "gross_margin": None,
                    "revenue_growth": None,
                    "earnings_growth": None,
                    "debt_to_equity": None,
                    "current_ratio": None,
                    "beta": None,
                    "eps": q.get("epsTrailingTwelveMonths"),
                    "forward_eps": q.get("epsForward"),
                    "book_value": q.get("bookValue"),
                    "week52_high": q.get("fiftyTwoWeekHigh"),
                    "week52_low": q.get("fiftyTwoWeekLow"),
                    "fifty_day_avg": q.get("fiftyDayAverage"),
                    "two_hundred_day_avg": q.get("twoHundredDayAverage"),
                    "volume": q.get("regularMarketVolume"),
                    "avg_volume": q.get("averageDailyVolume3Month"),
                    "recommendation": q.get("averageAnalystRating", "").split(" - ")[-1].lower().replace(" ", "_") if q.get("averageAnalystRating") else None,
                    "target_mean_price": None,
                })

            result = {"stocks": stocks, "total": total, "showing": len(stocks)}
            cache_manager.set("screener", cache_key, result, ttl=600)
            return result

        except Exception as e:
            print(f"Yahoo screener error: {e}")
            # Fallback
            fallback = self.get_screener_data(self.SCREENER_STOCKS[:size])
            return {"stocks": fallback, "total": len(fallback), "showing": len(fallback)}

    async def get_screener_symbols(self, size: int = 100, sort_field: str = "intradaymarketcap", sort_type: str = "desc") -> list[str]:
        """Fetch Indian stock symbols from Yahoo Finance screener API."""
        cache_key = f"screener_symbols_{size}_{sort_field}"
        cached = cache_manager.get("screener", cache_key)
        if cached is not None:
            return cached

        try:
            headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
            async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
                await client.get("https://fc.yahoo.com/curveball?crumb")
                crumb_resp = await client.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
                crumb = crumb_resp.text

                url = f"https://query2.finance.yahoo.com/v1/finance/screener?crumb={crumb}"
                payload = {
                    "offset": 0, "size": size,
                    "sortField": sort_field, "sortType": sort_type,
                    "quoteType": "EQUITY",
                    "query": {"operator": "AND", "operands": [
                        {"operator": "eq", "operands": ["region", "in"]},
                    ]}
                }
                resp = await client.post(url, json=payload, timeout=15.0)
                data = resp.json()

            quotes = data.get("finance", {}).get("result", [{}])[0].get("quotes", [])
            symbols = [q.get("symbol", "") for q in quotes if q.get("symbol", "").endswith((".NS", ".BO"))]
            cache_manager.set("screener", cache_key, symbols, ttl=900)
            return symbols
        except Exception as e:
            print(f"Yahoo screener API error: {e}")
            # Fallback to hardcoded list
            return self.SCREENER_STOCKS

    def get_screener_data(self, symbols: list[str] = None) -> list[dict]:
        """Get fundamental data for stocks for screening."""
        stock_list = symbols or self.SCREENER_STOCKS
        cache_key = "_".join(sorted(stock_list[:10])) + f"_{len(stock_list)}"
        cached = cache_manager.get("screener", cache_key)
        if cached is not None:
            return cached

        results = []
        for symbol in stock_list:
            try:
                info = self._get_ticker_info(symbol)
                if not info or not info.get("regularMarketPrice"):
                    continue

                price = info.get("regularMarketPrice", 0)
                prev_close = info.get("previousClose", 0)
                change = round(price - prev_close, 2) if price and prev_close else 0
                change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

                # Helper for safe percentage conversion
                def pct(val):
                    return round(val * 100, 2) if val is not None else None

                results.append({
                    "symbol": symbol,
                    "name": info.get("shortName", ""),
                    "sector": info.get("sector", ""),
                    "industry": info.get("industry", ""),
                    "price": price,
                    "change": change,
                    "change_percent": change_pct,
                    # Valuation
                    "market_cap": info.get("marketCap"),
                    "pe_ratio": info.get("trailingPE"),
                    "forward_pe": info.get("forwardPE"),
                    "pb_ratio": info.get("priceToBook"),
                    "ps_ratio": info.get("priceToSalesTrailing12Months"),
                    "peg_ratio": info.get("pegRatio"),
                    "ev": info.get("enterpriseValue"),
                    "ev_ebitda": info.get("enterpriseToEbitda"),
                    "ev_revenue": info.get("enterpriseToRevenue"),
                    # Profitability
                    "roe": pct(info.get("returnOnEquity")),
                    "roa": pct(info.get("returnOnAssets")),
                    "profit_margin": pct(info.get("profitMargins")),
                    "operating_margin": pct(info.get("operatingMargins")),
                    "gross_margin": pct(info.get("grossMargins")),
                    # Growth
                    "revenue_growth": pct(info.get("revenueGrowth")),
                    "earnings_growth": pct(info.get("earningsGrowth")),
                    "earnings_quarterly_growth": pct(info.get("earningsQuarterlyGrowth")),
                    # Financial Health
                    "debt_to_equity": info.get("debtToEquity"),
                    "current_ratio": info.get("currentRatio"),
                    "total_debt": info.get("totalDebt"),
                    "total_cash": info.get("totalCash"),
                    "cash_per_share": info.get("totalCashPerShare"),
                    # Dividends (dividendYield is already a percentage in yfinance)
                    "dividend_yield": round(info.get("dividendYield", 0), 2) if info.get("dividendYield") else 0,
                    "payout_ratio": pct(info.get("payoutRatio")),
                    "five_yr_avg_yield": info.get("fiveYearAvgDividendYield"),
                    # Price & Technical
                    "week52_high": info.get("fiftyTwoWeekHigh"),
                    "week52_low": info.get("fiftyTwoWeekLow"),
                    "week52_change": pct(info.get("52WeekChange")),
                    "fifty_day_avg": info.get("fiftyDayAverage"),
                    "two_hundred_day_avg": info.get("twoHundredDayAverage"),
                    "volume": info.get("volume"),
                    "avg_volume": info.get("averageVolume"),
                    "beta": info.get("beta"),
                    # Per Share
                    "eps": info.get("trailingEps"),
                    "forward_eps": info.get("forwardEps"),
                    "book_value": info.get("bookValue"),
                    "revenue_per_share": info.get("revenuePerShare"),
                    # Analyst
                    "recommendation": info.get("recommendationKey"),
                    "target_mean_price": info.get("targetMeanPrice"),
                    "num_analysts": info.get("numberOfAnalystOpinions"),
                    # Risk
                    "overall_risk": info.get("overallRisk"),
                })
            except Exception:
                continue

        cache_manager.set("screener", cache_key, results, ttl=900)
        return results

    def get_52week_scanner(self, market: str = "in") -> dict:
        """Get stocks near 52-week high and low."""
        cache_key = f"52week_{market}"
        cached = cache_manager.get("scanner", cache_key)
        if cached is not None:
            return cached

        stock_list = self.POPULAR_STOCKS.get(market, self.POPULAR_STOCKS["in"]) + (self.SCREENER_STOCKS if market == "in" else self.POPULAR_STOCKS.get("us", []))
        # Dedupe
        stock_list = list(dict.fromkeys(stock_list))
        screener_data = self.get_screener_data(stock_list)
        near_high = []
        near_low = []

        for stock in screener_data:
            price = stock.get("price", 0)
            high = stock.get("week52_high", 0)
            low = stock.get("week52_low", 0)

            if not price or not high or not low or high == low:
                continue

            pct_from_high = round(((high - price) / high) * 100, 2)
            pct_from_low = round(((price - low) / low) * 100, 2)
            position = round(((price - low) / (high - low)) * 100, 2)

            entry = {
                **stock,
                "pct_from_high": pct_from_high,
                "pct_from_low": pct_from_low,
                "position_in_range": position,
            }

            if pct_from_high <= 5:  # Within 5% of 52W high
                near_high.append(entry)
            if pct_from_low <= 10:  # Within 10% of 52W low
                near_low.append(entry)

        near_high.sort(key=lambda x: x["pct_from_high"])
        near_low.sort(key=lambda x: x["pct_from_low"])

        result = {"near_high": near_high, "near_low": near_low}
        cache_manager.set("scanner", cache_key, result, ttl=900)
        return result

    def calculate_sip_returns(self, symbol: str, monthly_amount: float = 5000, years: int = 5) -> dict | None:
        """Calculate SIP returns for a stock over historical period."""
        cache_key = f"{symbol}_{monthly_amount}_{years}"
        cached = cache_manager.get("sip", cache_key)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            period = f"{years}y" if years <= 10 else "max"
            df = ticker.history(period=period)
            if df.empty or len(df) < 22:
                return None

            closes = df["Close"]
            # Get monthly prices (first trading day of each month)
            monthly = closes.resample("MS").first().dropna()

            if len(monthly) < 2:
                return None

            total_invested = 0
            total_units = 0
            investments = []

            for date, price in monthly.items():
                if price <= 0:
                    continue
                units = monthly_amount / price
                total_units += units
                total_invested += monthly_amount

                current_value = total_units * closes.iloc[-1]
                investments.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "price": round(float(price), 2),
                    "units": round(units, 4),
                    "total_units": round(total_units, 4),
                    "invested": round(total_invested, 2),
                    "current_value": round(float(current_value), 2),
                })

            current_value = total_units * closes.iloc[-1]
            total_return = current_value - total_invested
            total_return_pct = (total_return / total_invested) * 100 if total_invested > 0 else 0

            # XIRR approximation (annualized return)
            num_months = len(monthly)
            num_years = num_months / 12
            if num_years > 0 and total_invested > 0 and current_value > 0:
                cagr = (pow(float(current_value / total_invested), 1 / num_years) - 1) * 100
            else:
                cagr = 0

            result = {
                "symbol": symbol,
                "monthly_amount": monthly_amount,
                "period_years": years,
                "total_months": num_months,
                "total_invested": round(total_invested, 2),
                "current_value": round(float(current_value), 2),
                "total_return": round(float(total_return), 2),
                "total_return_pct": round(total_return_pct, 2),
                "cagr": round(cagr, 2),
                "total_units": round(total_units, 4),
                "current_price": round(float(closes.iloc[-1]), 2),
                "investments": investments,
            }

            cache_manager.set("sip", cache_key, result, ttl=3600)
            return result
        except Exception as e:
            print(f"SIP calculation error: {e}")
            return None


# Singleton
stock_service = StockService()
