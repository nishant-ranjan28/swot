# backend/services/stock_service.py
import yfinance as yf
from yahooquery import Ticker as YQTicker
import httpx
import hashlib
import numpy as np
import pandas as pd
import pandas_ta as ta
from datetime import datetime
from urllib.parse import quote_plus
from utils.cache import cache_manager
from config import CACHE_TTL, IST, MARKET_OPEN, MARKET_CLOSE
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
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

    _sentiment_analyzer = SentimentIntensityAnalyzer()

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
            url = f"https://query1.finance.yahoo.com/v1/finance/search?q={quote_plus(query)}&region={region}&quotesCount=10"
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
            df = df.dropna(subset=["Close"])  # Drop rows with NaN prices
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
        """Get comprehensive earnings data."""
        cached = cache_manager.get("earnings", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = self._get_ticker_info(symbol)
            if not info:
                return None

            from datetime import datetime as dt

            # Next earnings date
            earnings_date = info.get("earningsTimestamp")
            if earnings_date and isinstance(earnings_date, (int, float)):
                earnings_date = dt.fromtimestamp(earnings_date).strftime("%Y-%m-%d")

            # EPS data from earnings_dates (more reliable than earnings_history)
            eps_history = []
            upcoming_earnings = []
            try:
                ed = ticker.earnings_dates
                if ed is not None and not ed.empty:
                    for idx, row in ed.iterrows():
                        try:
                            date_str = idx.strftime("%Y-%m-%d")
                        except (AttributeError, ValueError):
                            date_str = str(idx)
                        entry = {
                            "date": date_str,
                            "estimate": float(row.get("EPS Estimate")) if row.get("EPS Estimate") is not None and row.get("EPS Estimate") == row.get("EPS Estimate") else None,
                            "actual": float(row.get("Reported EPS")) if row.get("Reported EPS") is not None and row.get("Reported EPS") == row.get("Reported EPS") else None,
                            "surprise_percent": round(float(row.get("Surprise(%)")), 2) if row.get("Surprise(%)") is not None and row.get("Surprise(%)") == row.get("Surprise(%)") else None,
                        }
                        if entry["actual"] is not None:
                            eps_history.append(entry)
                        else:
                            upcoming_earnings.append(entry)
            except Exception:
                pass

            # Fallback to earnings_history if earnings_dates is empty
            if not eps_history:
                try:
                    eh = ticker.earnings_history
                    if eh is not None and not eh.empty:
                        for idx, row in eh.iterrows():
                            try:
                                date_str = idx.strftime("%Y-%m-%d")
                            except (AttributeError, ValueError):
                                date_str = str(idx)
                            eps_history.append({
                                "date": date_str,
                                "actual": row.get("epsActual"),
                                "estimate": row.get("epsEstimate"),
                                "surprise_percent": round(row.get("surprisePercent", 0) * 100, 2) if row.get("surprisePercent") is not None else None,
                            })
                except Exception:
                    pass

            # Quarterly revenue and income from financial statements
            quarterly_results = []
            try:
                qf = ticker.quarterly_financials
                if qf is not None and not qf.empty:
                    for col in qf.columns[:8]:  # Last 8 quarters
                        entry = {"date": col.strftime("%Y-%m-%d")}
                        for row_name, key in [
                            ("Total Revenue", "revenue"),
                            ("Net Income", "net_income"),
                            ("Operating Income", "operating_income"),
                            ("Gross Profit", "gross_profit"),
                            ("EBITDA", "ebitda"),
                        ]:
                            val = qf.loc[row_name, col] if row_name in qf.index else None
                            entry[key] = float(val) if val is not None and val == val else None
                        quarterly_results.append(entry)
            except Exception:
                pass

            # Annual revenue and income
            annual_results = []
            try:
                af = ticker.financials
                if af is not None and not af.empty:
                    for col in af.columns[:5]:  # Last 5 years
                        entry = {"date": col.strftime("%Y-%m-%d")}
                        for row_name, key in [
                            ("Total Revenue", "revenue"),
                            ("Net Income", "net_income"),
                            ("Operating Income", "operating_income"),
                            ("Gross Profit", "gross_profit"),
                            ("EBITDA", "ebitda"),
                        ]:
                            val = af.loc[row_name, col] if row_name in af.index else None
                            entry[key] = float(val) if val is not None and val == val else None
                        annual_results.append(entry)
            except Exception:
                pass

            # Key metrics from info
            key_metrics = {
                "trailing_eps": info.get("trailingEps"),
                "forward_eps": info.get("forwardEps"),
                "eps_current_year": info.get("epsCurrentYear"),
                "pe_ratio": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "peg_ratio": info.get("pegRatio"),
                "earnings_growth": info.get("earningsGrowth"),
                "earnings_quarterly_growth": info.get("earningsQuarterlyGrowth"),
                "revenue_growth": info.get("revenueGrowth"),
                "total_revenue": info.get("totalRevenue"),
                "net_income": info.get("netIncomeToCommon"),
                "ebitda": info.get("ebitda"),
                "ebitda_margins": info.get("ebitdaMargins"),
                "profit_margins": info.get("profitMargins"),
                "gross_profits": info.get("grossProfits"),
                "revenue_per_share": info.get("revenuePerShare"),
            }

            result = sanitize_json({
                "symbol": symbol,
                "earnings_date": earnings_date,
                "upcoming": upcoming_earnings,
                "history": eps_history,
                "quarterly": quarterly_results,
                "annual": annual_results,
                "metrics": key_metrics,
            })

            cache_manager.set("earnings", symbol, result)
            return result
        except Exception as e:
            print(f"Earnings error: {e}")
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
        "global": [
            {"symbol": "^FTSE", "name": "FTSE 100"},
            {"symbol": "^N225", "name": "Nikkei 225"},
            {"symbol": "^GDAXI", "name": "DAX"},
            {"symbol": "^HSI", "name": "Hang Seng"},
            {"symbol": "^STOXX50E", "name": "Euro Stoxx 50"},
        ],
    }

    SENTIMENT_CONFIG = {
        "in": {"vix": "^INDIAVIX", "index": "^NSEI"},
        "us": {"vix": "^VIX", "index": "^GSPC"},
    }

    def _yf_fallback_batch(self, symbols: list[str]) -> dict:
        """Fallback: fetch quotes one-by-one via yfinance when yahooquery fails."""
        results = {}
        for sym in symbols:
            try:
                info = self._get_ticker_info(sym)
                if not info:
                    continue
                price = info.get("regularMarketPrice", 0)
                prev = info.get("previousClose", 0)
                change = round(price - prev, 2) if price and prev else 0
                change_pct = round((change / prev) * 100, 2) if prev else 0
                results[sym] = {
                    "symbol": sym,
                    "name": info.get("shortName", ""),
                    "price": price,
                    "previous_close": prev,
                    "change": change,
                    "change_percent": change_pct,
                    "volume": info.get("volume"),
                    "market_cap": info.get("marketCap"),
                    "day_high": info.get("dayHigh"),
                    "day_low": info.get("dayLow"),
                    "week52_high": info.get("fiftyTwoWeekHigh"),
                    "week52_low": info.get("fiftyTwoWeekLow"),
                    "currency": info.get("currency", "INR"),
                }
            except Exception:
                continue
        return results

    def get_batch_quotes(self, symbols: list[str]) -> dict:
        """Fetch quotes for multiple symbols using yahooquery, with yfinance fallback."""
        if not symbols:
            return {}
        cache_key = f"batch_{'_'.join(sorted(symbols[:20]))}"
        cached = cache_manager.get("batch_quote", cache_key)
        if cached is not None:
            return cached
        results = {}
        try:
            tickers = YQTicker(symbols)
            prices = tickers.price
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
        except Exception as e:
            print(f"Batch quote error (yahooquery): {e}")

        # Fallback to yfinance if yahooquery returned nothing
        if not results:
            print(f"yahooquery returned empty, falling back to yfinance for {len(symbols)} symbols")
            results = self._yf_fallback_batch(symbols)

        if results:
            cache_manager.set("batch_quote", cache_key, results, ttl=60)
        return results

    def get_trending_stocks(self, market: str = "in") -> list[dict]:
        """Get quotes for popular stocks by market."""
        cache_key = f"popular_{market}"
        cached = cache_manager.get("trending", cache_key)
        if cached is not None:
            return cached

        symbols = self.POPULAR_STOCKS.get(market, self.POPULAR_STOCKS["in"])
        batch = self.get_batch_quotes(symbols)
        results = [batch[s] for s in symbols if s in batch and batch[s].get("price")]

        if results:  # Don't cache empty results from cold-start timeouts
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

        if results:
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

            # Score headline sentiment with VADER
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
                "title": content.get("title", ""),
                "summary": content.get("summary", ""),
                "url": content.get("canonicalUrl", {}).get("url", ""),
                "published_at": content.get("pubDate", ""),
                "source": content.get("provider", {}).get("displayName", "Yahoo Finance"),
                "image": image_url,
                "sentiment_score": round(compound, 3),
                "sentiment_label": sentiment_label,
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
            current_price = closes[-1]

            # --- Compute indicators with pandas-ta ---
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
            df.ta.stoch(append=True)
            df.ta.adx(length=14, append=True)
            df.ta.willr(length=14, append=True)

            # Candlestick patterns
            candle_df = df.ta.cdl_pattern(name="all")

            # Helper to safely get last value from a column
            def _last(col_name):
                if col_name in df.columns and pd.notna(df[col_name].iloc[-1]):
                    return round(float(df[col_name].iloc[-1]), 2)
                return None

            # Moving Averages
            sma_20 = _last("SMA_20")
            sma_50 = _last("SMA_50")
            sma_200 = _last("SMA_200")
            ema_12 = _last("EMA_12")
            ema_26 = _last("EMA_26")
            ema_50 = _last("EMA_50")

            # Oscillators
            rsi = _last("RSI_14")
            macd_line = _last("MACD_12_26_9")
            macd_signal = _last("MACDs_12_26_9")
            macd_histogram = _last("MACDh_12_26_9")
            bb_upper = _last("BBU_20_2.0")
            bb_middle = _last("BBM_20_2.0")
            bb_lower = _last("BBL_20_2.0")
            atr = _last("ATRr_14")

            # New indicators
            stoch_k = _last("STOCHk_14_3_3")
            stoch_d = _last("STOCHd_14_3_3")
            adx_val = _last("ADX_14")
            willr_val = _last("WILLR_14")

            # Support/Resistance
            supports, resistances = self._find_support_resistance(closes)

            # --- Generate signals (same logic as before) ---
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

            # Stochastic signal
            if stoch_k is not None:
                if stoch_k < 20:
                    sig = "Buy"
                elif stoch_k > 80:
                    sig = "Sell"
                else:
                    sig = "Neutral"
                osc_signals.append({"name": "Stochastic (14,3,3)", "value": stoch_k, "signal": sig})
                osc_total += 1
                if sig == "Buy":
                    osc_buy += 1
                elif sig == "Neutral":
                    osc_buy += 0.5

            # Williams %R signal
            if willr_val is not None:
                if willr_val < -80:
                    sig = "Buy"
                elif willr_val > -20:
                    sig = "Sell"
                else:
                    sig = "Neutral"
                osc_signals.append({"name": "Williams %R (14)", "value": willr_val, "signal": sig})
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

            # Candlestick patterns detection
            candlestick_patterns = []
            if candle_df is not None and not candle_df.empty:
                last_row = candle_df.iloc[-1]
                for col in candle_df.columns:
                    val = last_row[col]
                    if pd.notna(val) and val != 0:
                        # Column names are like CDL_DOJI, CDL_HAMMER etc.
                        pattern_name = col.replace("CDL_", "").replace("_", " ").title()
                        signal_type = "Bullish" if val > 0 else "Bearish"
                        strength = "Strong" if abs(val) >= 100 else "Moderate"
                        candlestick_patterns.append({
                            "name": pattern_name,
                            "signal": signal_type,
                            "strength": strength,
                        })

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
                "stochastic": {"k": stoch_k, "d": stoch_d},
                "adx": adx_val,
                "williams_r": willr_val,
                "candlestick_patterns": candlestick_patterns,
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

            # Calculate PCR
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

    def get_earnings_calendar(self, market: str = "in") -> list[dict]:
        """Get upcoming earnings dates for top stocks in the given market."""
        cache_key = f"earnings_calendar_{market}"
        cached = cache_manager.get("earnings_calendar", cache_key)
        if cached is not None:
            return cached

        symbols = self.POPULAR_STOCKS.get(market, self.POPULAR_STOCKS["in"])[:20]
        results = []

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                earnings_dates = ticker.earnings_dates
                if earnings_dates is None or earnings_dates.empty:
                    continue

                # Filter upcoming earnings (where Reported EPS is NaN = not yet reported)
                for idx, row in earnings_dates.iterrows():
                    reported_eps = row.get("Reported EPS")
                    if pd.isna(reported_eps):
                        eps_estimate = row.get("EPS Estimate")
                        date_val = idx
                        if hasattr(date_val, 'tz_localize'):
                            date_str = date_val.strftime("%Y-%m-%d")
                        else:
                            date_str = str(date_val)[:10]

                        info = ticker.info or {}
                        name = info.get("shortName") or info.get("longName") or symbol.replace(".NS", "").replace(".BO", "")

                        results.append({
                            "symbol": symbol,
                            "name": name,
                            "date": date_str,
                            "eps_estimate": round(float(eps_estimate), 2) if not pd.isna(eps_estimate) else None,
                        })
            except Exception as e:
                print(f"Earnings calendar error for {symbol}: {e}")
                continue

        # Sort by date
        results.sort(key=lambda x: x["date"])
        cache_manager.set("earnings_calendar", cache_key, results, ttl=3600)
        return results

    # ── Sector Performance (Heatmap) ────────────────────────────────
    SECTOR_STOCKS = {
        "in": {
            "Banking": ["HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS", "AXISBANK.NS"],
            "IT": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS"],
            "Energy": ["RELIANCE.NS", "ONGC.NS", "BPCL.NS", "IOC.NS", "TATAPOWER.NS"],
            "Auto": ["TATAMOTORS.NS", "MARUTI.NS", "M&M.NS", "EICHERMOT.NS", "BAJAJ-AUTO.NS"],
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
        },
    }

    def get_sector_performance(self, market: str = "in") -> list[dict]:
        """Calculate sector-level performance stats using batch quotes."""
        cache_key = f"sector_perf_{market}"
        cached = cache_manager.get("sector_performance", cache_key)
        if cached is not None:
            return cached

        sectors_map = self.SECTOR_STOCKS.get(market, self.SECTOR_STOCKS["in"])
        results = []

        for sector_name, symbols in sectors_map.items():
            try:
                quotes = self.get_batch_quotes(symbols)
                if not quotes:
                    continue

                changes = []
                total_mcap = 0
                top_gainer = None
                top_loser = None

                for sym in symbols:
                    q = quotes.get(sym)
                    if not q or q.get("price") is None:
                        continue
                    cp = q.get("change_percent", 0) or 0
                    mcap = q.get("market_cap") or 0
                    changes.append(cp)
                    total_mcap += mcap

                    if top_gainer is None or cp > top_gainer["change_percent"]:
                        top_gainer = {"symbol": sym, "name": q.get("name", sym), "change_percent": cp}
                    if top_loser is None or cp < top_loser["change_percent"]:
                        top_loser = {"symbol": sym, "name": q.get("name", sym), "change_percent": cp}

                if not changes:
                    continue

                avg_change = round(sum(changes) / len(changes), 2)
                results.append({
                    "sector": sector_name,
                    "avg_change_percent": avg_change,
                    "total_market_cap": total_mcap,
                    "stock_count": len(changes),
                    "top_gainer": top_gainer,
                    "top_loser": top_loser,
                })
            except Exception as e:
                print(f"Sector performance error for {sector_name}: {e}")
                continue

        # Sort by absolute avg change (most movement first)
        results.sort(key=lambda x: abs(x["avg_change_percent"]), reverse=True)
        cache_manager.set("sector_performance", cache_key, results, ttl=300)
        return results

    # NIFTY 50 / S&P 500 constituents for stock-level heatmap
    INDEX_STOCKS = {
        "in": [
            "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
            "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "KOTAKBANK.NS",
            "LT.NS", "AXISBANK.NS", "BAJFINANCE.NS", "MARUTI.NS", "WIPRO.NS",
            "ADANIENT.NS", "TATAPOWER.NS", "TATASTEEL.NS", "HCLTECH.NS", "M&M.NS",
            "SUNPHARMA.NS", "BAJAJFINSV.NS", "TITAN.NS", "ASIANPAINT.NS", "ULTRACEMCO.NS",
            "NESTLEIND.NS", "POWERGRID.NS", "NTPC.NS", "JSWSTEEL.NS", "ONGC.NS",
            "GRASIM.NS", "CIPLA.NS", "DRREDDY.NS", "DIVISLAB.NS", "BPCL.NS",
            "HEROMOTOCO.NS", "EICHERMOT.NS", "TECHM.NS", "APOLLOHOSP.NS", "LTIM.NS",
            "COALINDIA.NS", "INDUSINDBK.NS", "BAJAJ-AUTO.NS", "TRENT.NS",
            "SBILIFE.NS", "HINDALCO.NS", "DABUR.NS", "GODREJCP.NS", "PIDILITIND.NS",
        ],
        "us": [
            "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
            "JPM", "V", "UNH", "JNJ", "WMT", "MA", "PG", "HD", "DIS", "NFLX",
            "CRM", "AMD", "INTC", "CSCO", "PEP", "KO", "ABBV", "MRK", "PFE",
            "XOM", "CVX", "COP", "BAC", "GS", "MS", "CAT", "HON", "GE", "BA",
            "LLY", "AVGO", "COST", "ADBE", "ORCL", "ACN", "IBM", "QCOM",
        ],
    }

    def get_index_stock_heatmap(self, market: str = "in") -> list[dict]:
        """Get individual stock data for NIFTY 50 / S&P 500 heatmap."""
        cache_key = f"index_heatmap_{market}"
        cached = cache_manager.get("heatmap", cache_key)
        if cached is not None:
            return cached

        symbols = self.INDEX_STOCKS.get(market, self.INDEX_STOCKS["in"])
        quotes = self.get_batch_quotes(symbols)

        results = []
        for sym in symbols:
            q = quotes.get(sym)
            if not q or not q.get("price"):
                continue
            results.append({
                "symbol": sym,
                "name": q.get("name", sym),
                "price": q.get("price"),
                "change_percent": q.get("change_percent", 0) or 0,
                "market_cap": q.get("market_cap", 0) or 0,
                "volume": q.get("volume", 0) or 0,
            })

        results.sort(key=lambda x: x["market_cap"], reverse=True)
        if results:
            cache_manager.set("heatmap", cache_key, results, ttl=300)
        return results

    # ── Technical Alerts Engine ──────────────────────────────────────
    def scan_technical_alerts(self, symbols: list[str]) -> list[dict]:
        """Scan symbols for technical alert conditions (crossovers, RSI, MACD)."""
        cache_key = f"tech_alerts_{'_'.join(sorted(symbols[:30]))}"
        cached = cache_manager.get("technical_alerts", cache_key)
        if cached is not None:
            return cached

        alerts = []
        for symbol in symbols[:30]:  # cap at 30 symbols
            try:
                ticker = yf.Ticker(symbol)
                df = ticker.history(period="3mo")
                if df.empty or len(df) < 50:
                    continue

                name = ticker.info.get("shortName", symbol) if hasattr(ticker, "info") else symbol

                # Compute indicators
                df.ta.sma(length=50, append=True)
                df.ta.sma(length=200, append=True)
                df.ta.rsi(length=14, append=True)
                df.ta.macd(fast=12, slow=26, signal=9, append=True)

                # Need at least 2 rows to detect crossovers
                if len(df) < 2:
                    continue

                last = df.iloc[-1]
                prev = df.iloc[-2]

                # Helper to safely get float
                def _val(row, col):
                    if col in df.columns and pd.notna(row.get(col)):
                        return float(row[col])
                    return None

                sma50_now = _val(last, "SMA_50")
                sma50_prev = _val(prev, "SMA_50")
                sma200_now = _val(last, "SMA_200")
                sma200_prev = _val(prev, "SMA_200")
                rsi_now = _val(last, "RSI_14")
                macd_hist_now = _val(last, "MACDh_12_26_9")
                macd_hist_prev = _val(prev, "MACDh_12_26_9")

                # Golden Cross: SMA50 crosses above SMA200
                if (sma50_now is not None and sma200_now is not None and
                        sma50_prev is not None and sma200_prev is not None):
                    if sma50_prev <= sma200_prev and sma50_now > sma200_now:
                        alerts.append({
                            "symbol": symbol, "name": name,
                            "alert": "Golden Cross",
                            "type": "bullish",
                            "description": f"50-day SMA crossed above 200-day SMA — a classic bullish signal.",
                        })
                    # Death Cross: SMA50 crosses below SMA200
                    if sma50_prev >= sma200_prev and sma50_now < sma200_now:
                        alerts.append({
                            "symbol": symbol, "name": name,
                            "alert": "Death Cross",
                            "type": "bearish",
                            "description": f"50-day SMA crossed below 200-day SMA — a classic bearish signal.",
                        })

                # RSI Oversold
                if rsi_now is not None and rsi_now < 30:
                    alerts.append({
                        "symbol": symbol, "name": name,
                        "alert": "RSI Oversold",
                        "type": "bullish",
                        "description": f"RSI at {rsi_now:.1f} — stock may be oversold and due for a bounce.",
                    })
                # RSI Overbought
                if rsi_now is not None and rsi_now > 70:
                    alerts.append({
                        "symbol": symbol, "name": name,
                        "alert": "RSI Overbought",
                        "type": "bearish",
                        "description": f"RSI at {rsi_now:.1f} — stock may be overbought and due for a pullback.",
                    })

                # MACD Bullish Crossover (histogram goes from negative to positive)
                if macd_hist_now is not None and macd_hist_prev is not None:
                    if macd_hist_prev <= 0 and macd_hist_now > 0:
                        alerts.append({
                            "symbol": symbol, "name": name,
                            "alert": "MACD Bullish Crossover",
                            "type": "bullish",
                            "description": "MACD histogram turned positive — bullish momentum building.",
                        })
                    # MACD Bearish Crossover (histogram goes from positive to negative)
                    if macd_hist_prev >= 0 and macd_hist_now < 0:
                        alerts.append({
                            "symbol": symbol, "name": name,
                            "alert": "MACD Bearish Crossover",
                            "type": "bearish",
                            "description": "MACD histogram turned negative — bearish momentum building.",
                        })

            except Exception as e:
                print(f"Technical alert scan error for {symbol}: {e}")
                continue

        cache_manager.set("technical_alerts", cache_key, alerts, ttl=900)
        return alerts

    async def get_fii_dii_data(self) -> dict | None:
        """Fetch real-time FII/DII data from NSE."""
        cached = cache_manager.get("fii_dii", "daily")
        if cached is not None:
            return cached

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Referer": "https://www.nseindia.com/",
                "Accept": "application/json",
            }
            async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
                # Get cookies first
                await client.get("https://www.nseindia.com", timeout=10.0)
                # Fetch FII/DII data
                resp = await client.get("https://www.nseindia.com/api/fiidiiTradeReact", timeout=10.0)
                data = resp.json()

            result = {"date": None, "fii": None, "dii": None}
            for entry in data:
                category = entry.get("category", "")
                buy = float(entry.get("buyValue", 0))
                sell = float(entry.get("sellValue", 0))
                net = float(entry.get("netValue", 0))
                date = entry.get("date", "")

                item = {
                    "buy": round(buy, 2),
                    "sell": round(sell, 2),
                    "net": round(net, 2),
                    "date": date,
                }

                if "FII" in category or "FPI" in category:
                    result["fii"] = item
                elif "DII" in category:
                    result["dii"] = item

                if date:
                    result["date"] = date

            cache_manager.set("fii_dii", "daily", result, ttl=300)
            return result
        except Exception as e:
            print(f"FII/DII fetch error: {e}")
            return None

    ETF_LIST = {
        "in": [
            {"symbol": "NIFTYBEES.NS", "name": "Nippon India Nifty 50 BeES", "category": "Index"},
            {"symbol": "BANKBEES.NS", "name": "Nippon India Bank BeES", "category": "Banking"},
            {"symbol": "GOLDBEES.NS", "name": "Nippon India Gold BeES", "category": "Gold"},
            {"symbol": "JUNIORBEES.NS", "name": "Nippon India Nifty Next 50 BeES", "category": "Index"},
            {"symbol": "ITBEES.NS", "name": "Nippon India IT BeES", "category": "IT"},
            {"symbol": "SETFNIF50.NS", "name": "SBI Nifty 50 ETF", "category": "Index"},
            {"symbol": "SETFNIFBK.NS", "name": "SBI Nifty Bank ETF", "category": "Banking"},
            {"symbol": "LIQUIDBEES.NS", "name": "Nippon India Liquid BeES", "category": "Liquid"},
            {"symbol": "SILVERBEES.NS", "name": "Nippon India Silver BeES", "category": "Silver"},
            {"symbol": "MIDCPBEES.NS", "name": "Nippon India Nifty Midcap 150 BeES", "category": "Mid Cap"},
        ],
        "us": [
            {"symbol": "SPY", "name": "SPDR S&P 500 ETF", "category": "Index"},
            {"symbol": "QQQ", "name": "Invesco QQQ (Nasdaq-100)", "category": "Tech"},
            {"symbol": "VTI", "name": "Vanguard Total Stock Market", "category": "Broad Market"},
            {"symbol": "VOO", "name": "Vanguard S&P 500", "category": "Index"},
            {"symbol": "IWM", "name": "iShares Russell 2000", "category": "Small Cap"},
            {"symbol": "DIA", "name": "SPDR Dow Jones", "category": "Index"},
            {"symbol": "ARKK", "name": "ARK Innovation ETF", "category": "Innovation"},
            {"symbol": "XLF", "name": "Financial Select SPDR", "category": "Finance"},
            {"symbol": "XLK", "name": "Technology Select SPDR", "category": "Tech"},
            {"symbol": "GLD", "name": "SPDR Gold Shares", "category": "Gold"},
        ],
    }

    def get_etf_list(self, market: str = "in") -> list[dict]:
        """Get list of ETFs with live quote data for a given market."""
        cache_key = f"etf_list_{market}"
        cached = cache_manager.get("etf_list", cache_key)
        if cached is not None:
            return cached

        etfs = self.ETF_LIST.get(market, [])
        result = []
        for etf in etfs:
            quote = self.get_quote(etf["symbol"])
            entry = {
                "symbol": etf["symbol"],
                "name": etf["name"],
                "category": etf["category"],
                "price": quote.get("price") if quote else None,
                "change": quote.get("change") if quote else None,
                "change_percent": quote.get("change_percent") if quote else None,
                "volume": quote.get("volume") if quote else None,
                "market_cap": quote.get("market_cap") if quote else None,
            }
            result.append(entry)

        result = sanitize_json(result)
        cache_manager.set("etf_list", cache_key, result, ttl=300)
        return result

    def get_etf_holdings(self, symbol: str) -> dict | None:
        """Get ETF holdings and fund overview using funds_data API."""
        cached = cache_manager.get("etf_holdings", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if not info:
                return None

            top_holdings = []
            expense_ratio = None
            ytd_return = None
            three_year_return = None

            # Try funds_data API (works for US ETFs)
            try:
                fd = ticker.funds_data
                if fd:
                    th = fd.top_holdings
                    if th is not None and not th.empty:
                        for idx, row in th.iterrows():
                            top_holdings.append({
                                "symbol": str(idx),
                                "name": row.get("Name", str(idx)),
                                "weight": round(float(row.get("Holding Percent", 0)) * 100, 2),
                            })
                    # Fund operations for expense ratio
                    try:
                        ops = fd.fund_operations
                        if ops is not None and isinstance(ops, dict):
                            expense_ratio = ops.get("annualReportExpenseRatio")
                    except Exception:
                        pass
                    # Fund performance
                    try:
                        perf = fd.fund_overview
                        if perf and isinstance(perf, dict):
                            ytd_return = perf.get("ytdReturn")
                            three_year_return = perf.get("threeYearAverageReturn")
                    except Exception:
                        pass
            except Exception:
                pass

            # Fallback: use info fields
            if expense_ratio is None:
                expense_ratio = info.get("annualReportExpenseRatio") or info.get("netExpenseRatio")

            result = {
                "symbol": symbol,
                "name": info.get("shortName") or info.get("longName"),
                "total_assets": info.get("totalAssets") or info.get("netAssets"),
                "expense_ratio": expense_ratio,
                "ytd_return": ytd_return,
                "three_year_return": three_year_return,
                "top_holdings": top_holdings,
            }

            result = sanitize_json(result)
            cache_manager.set("etf_holdings", symbol, result, ttl=21600)
            return result
        except Exception:
            return None

    def get_etf_overlap(self, sym1: str, sym2: str) -> dict:
        """Compare two ETFs and find common holdings."""
        cache_key = f"{sym1}_{sym2}"
        cached = cache_manager.get("etf_overlap", cache_key)
        if cached is not None:
            return cached

        h1 = self.get_etf_holdings(sym1)
        h2 = self.get_etf_holdings(sym2)

        holdings1 = h1.get("top_holdings", []) if h1 else []
        holdings2 = h2.get("top_holdings", []) if h2 else []

        # Build symbol/name sets for overlap detection
        names1 = set()
        for h in holdings1:
            sym = h.get("symbol", "")
            if sym:
                names1.add(sym.strip().upper())

        names2 = set()
        for h in holdings2:
            sym = h.get("symbol", "")
            if sym:
                names2.add(sym.strip().upper())

        common_names = names1 & names2
        common_holdings = sorted(common_names)

        result = {
            "etf1": {"symbol": sym1, "name": h1.get("name") if h1 else sym1},
            "etf2": {"symbol": sym2, "name": h2.get("name") if h2 else sym2},
            "common_holdings": sorted(common_holdings),
            "overlap_count": len(common_holdings),
            "etf1_total": len(holdings1),
            "etf2_total": len(holdings2),
        }

        cache_manager.set("etf_overlap", cache_key, result, ttl=21600)
        return result

    def get_insider_transactions(self, symbol: str) -> list:
        """Get insider transactions for a stock."""
        cached = cache_manager.get("insider", symbol)
        if cached is not None:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            txns = ticker.insider_transactions
            if txns is None or txns.empty:
                return []
            result = []
            for _, row in txns.head(20).iterrows():
                result.append({
                    "insider": str(row.get("Insider Trading", row.get("insiderName", ""))),
                    "relation": str(row.get("Relationship", row.get("relation", ""))),
                    "transaction": str(row.get("Transaction", row.get("transactionType", ""))),
                    "shares": int(row.get("Shares", row.get("shares", 0))) if row.get("Shares", row.get("shares")) else 0,
                    "value": float(row.get("Value", 0)) if row.get("Value") else None,
                    "date": str(row.get("Start Date", row.get("startDate", "")))[:10],
                })
            result = sanitize_json(result)
            cache_manager.set("insider", symbol, result, ttl=3600)
            return result
        except Exception:
            return []


# Singleton
stock_service = StockService()
