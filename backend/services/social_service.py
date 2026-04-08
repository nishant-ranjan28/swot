"""Social / trending sentiment service."""

import re
from collections import defaultdict
from datetime import date

import httpx
from cachetools import TTLCache
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

KNOWN_SYMBOLS = {
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD", "NFLX", "CRM",
    "JPM", "BAC", "GS", "V", "MA", "DIS", "INTC", "CSCO", "PFE", "JNJ",
    "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "ITC", "WIPRO",
    "BHARTIARTL", "KOTAKBANK", "LT", "TATASTEEL", "HCLTECH", "ADANIENT", "MARUTI",
    "BAJFINANCE", "TITAN", "SUNPHARMA", "AXISBANK", "HDFC",
    "SPY", "QQQ", "VTI", "VOO", "ARKK", "GME", "AMC", "PLTR", "SOFI", "NIO",
}

_UPPER_RE = re.compile(r"\b[A-Z]{2,5}\b")
_DOLLAR_RE = re.compile(r"\$([A-Z]{2,5})")


class SocialService:
    def __init__(self):
        self._cache = TTLCache(maxsize=32, ttl=1800)  # 30 min
        self._analyzer = SentimentIntensityAnalyzer()
        self._view_counts: dict[str, int] = defaultdict(int)
        self._view_date: date = date.today()

    # ── Reddit mentions ───────────────────────────────────────────────

    def get_reddit_mentions(self, subreddit: str = "IndianStockMarket", limit: int = 50) -> list[dict]:
        cache_key = f"reddit:{subreddit}:{limit}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            result = self._fetch_reddit(subreddit, limit)
            self._cache[cache_key] = result
            return result
        except Exception:
            return []

    def _fetch_reddit(self, subreddit: str, limit: int) -> list[dict]:
        url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}"
        with httpx.Client(headers={"User-Agent": "StockPulse/1.0"}, timeout=15) as client:
            resp = client.get(url)
            resp.raise_for_status()

        posts = resp.json()["data"]["children"]
        titles = [p["data"]["title"] for p in posts]

        # Map symbol -> list of titles mentioning it
        symbol_titles: dict[str, list[str]] = defaultdict(list)
        for title in titles:
            found: set[str] = set()
            found.update(_UPPER_RE.findall(title))
            found.update(_DOLLAR_RE.findall(title))
            for sym in found & KNOWN_SYMBOLS:
                symbol_titles[sym].append(title)

        results = []
        for sym, matched_titles in symbol_titles.items():
            scores = [self._analyzer.polarity_scores(t)["compound"] for t in matched_titles]
            avg = sum(scores) / len(scores)
            if avg > 0.1:
                label = "Bullish"
            elif avg < -0.1:
                label = "Bearish"
            else:
                label = "Neutral"
            results.append({
                "symbol": sym,
                "mentions": len(matched_titles),
                "sentiment": round(avg, 4),
                "sentiment_label": label,
                "sample_titles": matched_titles[:3],
            })

        results.sort(key=lambda x: x["mentions"], reverse=True)
        return results

    # ── Local trending ────────────────────────────────────────────────

    def record_view(self, symbol: str) -> None:
        today = date.today()
        if self._view_date != today:
            self._view_counts.clear()
            self._view_date = today
        self._view_counts[symbol.upper()] += 1

    def get_trending_local(self) -> list[dict]:
        today = date.today()
        if self._view_date != today:
            self._view_counts.clear()
            self._view_date = today
            return []

        sorted_items = sorted(self._view_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        return [{"symbol": sym, "views": count} for sym, count in sorted_items]


social_service = SocialService()
