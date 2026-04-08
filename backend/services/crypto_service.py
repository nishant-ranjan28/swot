# backend/services/crypto_service.py
import yfinance as yf
from datetime import datetime
from utils.cache import cache_manager
from services.stock_service import sanitize_json


class CryptoService:
    TOP_CRYPTOS = [
        {"symbol": "BTC-USD", "name": "Bitcoin"},
        {"symbol": "ETH-USD", "name": "Ethereum"},
        {"symbol": "BNB-USD", "name": "BNB"},
        {"symbol": "SOL-USD", "name": "Solana"},
        {"symbol": "XRP-USD", "name": "XRP"},
        {"symbol": "ADA-USD", "name": "Cardano"},
        {"symbol": "DOGE-USD", "name": "Dogecoin"},
        {"symbol": "AVAX-USD", "name": "Avalanche"},
        {"symbol": "DOT-USD", "name": "Polkadot"},
        {"symbol": "MATIC-USD", "name": "Polygon"},
        {"symbol": "LINK-USD", "name": "Chainlink"},
        {"symbol": "UNI-USD", "name": "Uniswap"},
        {"symbol": "ATOM-USD", "name": "Cosmos"},
        {"symbol": "LTC-USD", "name": "Litecoin"},
        {"symbol": "FIL-USD", "name": "Filecoin"},
    ]

    def get_crypto_prices(self) -> list[dict]:
        cached = cache_manager.get("crypto", "prices")
        if cached is not None:
            return cached

        try:
            symbols = [c["symbol"] for c in self.TOP_CRYPTOS]
            name_map = {c["symbol"]: c["name"] for c in self.TOP_CRYPTOS}

            results = []
            for sym in symbols:
                try:
                    ticker = yf.Ticker(sym)
                    info = ticker.info
                    if not info or not info.get("regularMarketPrice"):
                        continue
                    price = info.get("regularMarketPrice", 0)
                    prev = info.get("previousClose", 0)
                    change = round(price - prev, 2) if price and prev else 0
                    change_pct = round((change / prev) * 100, 2) if prev else 0

                    results.append({
                        "symbol": sym.replace("-USD", "/USDT"),
                        "name": name_map.get(sym, sym),
                        "price": price,
                        "change_24h": change,
                        "change_pct_24h": change_pct,
                        "volume_24h": info.get("volume24Hr") or info.get("volume"),
                        "high_24h": info.get("dayHigh"),
                        "low_24h": info.get("dayLow"),
                        "market_cap": info.get("marketCap"),
                    })
                except Exception:
                    continue

            results.sort(key=lambda x: x.get("market_cap") or 0, reverse=True)
            results = sanitize_json(results)
            if results:
                cache_manager.set("crypto", "prices", results, ttl=120)
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
            # Convert symbol format: BTC/USDT → BTC-USD
            yf_symbol = symbol.replace("/USDT", "-USD").replace("/USD", "-USD")
            if not yf_symbol.endswith("-USD"):
                yf_symbol = f"{yf_symbol}-USD"

            period_map = {"1h": "5d", "4h": "1mo", "1d": "3mo", "1w": "1y"}
            period = period_map.get(timeframe, "3mo")

            ticker = yf.Ticker(yf_symbol)
            df = ticker.history(period=period)
            df = df.dropna(subset=["Close"])

            if df.empty:
                return []

            data = []
            for date, row in df.iterrows():
                data.append({
                    "timestamp": int(date.timestamp() * 1000),
                    "date": date.strftime("%Y-%m-%d"),
                    "open": round(row.get("Open", 0), 2),
                    "high": round(row.get("High", 0), 2),
                    "low": round(row.get("Low", 0), 2),
                    "close": round(row.get("Close", 0), 2),
                    "volume": int(row.get("Volume", 0)),
                })

            data = sanitize_json(data)
            if data:
                cache_manager.set("crypto", cache_key, data, ttl=300)
            return data
        except Exception as e:
            print(f"Crypto chart error: {e}")
            return []


crypto_service = CryptoService()
