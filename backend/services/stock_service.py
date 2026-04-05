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
    POPULAR_STOCKS = [
        "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
        "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
        "LT.NS", "TATAMOTORS.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS",
        "WIPRO.NS", "ADANIENT.NS", "TATAPOWER.NS", "TATASTEEL.NS", "HCLTECH.NS",
    ]

    def get_trending_stocks(self) -> list[dict]:
        """Get quotes for popular Indian stocks."""
        cached = cache_manager.get("trending", "popular")
        if cached is not None:
            return cached

        results = []
        for symbol in self.POPULAR_STOCKS:
            quote = self.get_quote(symbol)
            if quote and quote.get("price"):
                results.append(quote)

        cache_manager.set("trending", "popular", results, ttl=300)
        return results

    def get_market_indices(self) -> list[dict]:
        """Get major Indian market indices."""
        cached = cache_manager.get("trending", "indices")
        if cached is not None:
            return cached

        indices = [
            {"symbol": "^NSEI", "name": "NIFTY 50"},
            {"symbol": "^BSESN", "name": "SENSEX"},
            {"symbol": "^NSEBANK", "name": "NIFTY Bank"},
            {"symbol": "^CNXIT", "name": "NIFTY IT"},
        ]

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

        cache_manager.set("trending", "indices", results, ttl=300)
        return results

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

    def get_market_news(self) -> list[dict]:
        """Get general market news by aggregating news from indices and popular stocks."""
        cached = cache_manager.get("news", "market")
        if cached is not None:
            return cached

        # Fetch news from multiple sources for variety
        news_sources = ["^NSEI", "^BSESN", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS",
                        "INFY.NS", "ICICIBANK.NS", "SBIN.NS"]
        all_articles = []
        seen_titles = set()

        for sym in news_sources:
            try:
                ticker = yf.Ticker(sym)
                news = ticker.news or []
                for article in self._parse_news(news):
                    # Deduplicate by title
                    if article["title"] not in seen_titles:
                        seen_titles.add(article["title"])
                        all_articles.append(article)
            except Exception:
                continue

        # Sort by date, newest first
        all_articles.sort(key=lambda x: x.get("published_at", ""), reverse=True)
        cache_manager.set("news", "market", all_articles, ttl=900)
        return all_articles

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
