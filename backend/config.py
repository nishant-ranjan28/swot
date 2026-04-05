from datetime import time, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

# Market hours (IST)
MARKET_OPEN = time(9, 15)
MARKET_CLOSE = time(15, 30)

# Cache TTLs (seconds)
CACHE_TTL = {
    "search": 300,           # 5 minutes
    "quote": 60,             # 1 minute
    "quote_off_hours": 900,  # 15 minutes
    "overview": 3600,        # 1 hour
    "history": 3600,         # 1 hour
    "financials": 86400,     # 24 hours
    "statements": 86400,
    "dividends": 86400,
    "analysts": 86400,
    "holders": 86400,
    "earnings": 86400,
}

# Cache max sizes
CACHE_MAX_SIZE = {
    "search": 200,
    "ticker": 100,
    "data": 500,
}

# CORS
CORS_ORIGINS = [
    "http://localhost:3000",
]

# Rate limiting
SEARCH_RATE_LIMIT = "30/minute"
