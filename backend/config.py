import os
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
    "https://swot-analyse.vercel.app",
    "https://swot.iamnishant.in",
]
# Vercel preview deployments of this project only (per-commit and per-branch URLs),
# e.g. https://swot-analyse-<hash>-nishants-projects-b0da7be3.vercel.app
CORS_ORIGIN_REGEX = r"^https://swot-analyse-[a-z0-9-]+-nishants-projects-b0da7be3\.vercel\.app$"

# Rate limiting
SEARCH_RATE_LIMIT = "30/minute"


# ---- Background jobs (price-alert emails) ------------------------------------
# Read at call time (not import time) so tests can monkeypatch the environment.
# Secrets come only from environment variables; never log or echo these values.


def job_settings() -> dict:
    return {
        "supabase_url": (os.environ.get("SUPABASE_URL") or "").rstrip("/"),
        "service_role_key": os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "",
        "brevo_api_key": os.environ.get("BREVO_API_KEY") or "",
        "mail_from": os.environ.get("MAIL_FROM") or "",
        "mail_from_name": os.environ.get("MAIL_FROM_NAME") or "StockPulse",
        "job_secret": os.environ.get("JOB_SECRET") or "",
        "app_url": (os.environ.get("APP_URL") or "https://swot.iamnishant.in").rstrip("/"),
    }
