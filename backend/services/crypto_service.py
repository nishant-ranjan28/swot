# backend/services/crypto_service.py
import ccxt
from utils.cache import cache_manager


class CryptoService:
    def __init__(self):
        self.exchange = ccxt.binance({"enableRateLimit": True})

    TOP_CRYPTOS = [
        "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
        "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "DOT/USDT", "MATIC/USDT",
        "LINK/USDT", "UNI/USDT", "ATOM/USDT", "LTC/USDT", "FIL/USDT",
    ]

    def get_crypto_prices(self) -> list[dict]:
        cached = cache_manager.get("crypto", "prices")
        if cached is not None:
            return cached

        try:
            tickers = self.exchange.fetch_tickers(self.TOP_CRYPTOS)
            results = []
            for symbol, data in tickers.items():
                base = symbol.split("/")[0]
                results.append({
                    "symbol": symbol,
                    "name": base,
                    "price": data.get("last"),
                    "change_24h": data.get("change"),
                    "change_pct_24h": data.get("percentage"),
                    "volume_24h": data.get("quoteVolume"),
                    "high_24h": data.get("high"),
                    "low_24h": data.get("low"),
                })
            results.sort(key=lambda x: x.get("volume_24h") or 0, reverse=True)
            cache_manager.set("crypto", "prices", results, ttl=60)
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
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            data = []
            for candle in ohlcv:
                data.append({
                    "timestamp": candle[0],
                    "date": self.exchange.iso8601(candle[0])[:10],
                    "open": candle[1],
                    "high": candle[2],
                    "low": candle[3],
                    "close": candle[4],
                    "volume": candle[5],
                })
            cache_manager.set("crypto", cache_key, data, ttl=300)
            return data
        except Exception as e:
            print(f"Crypto chart error: {e}")
            return []


crypto_service = CryptoService()
