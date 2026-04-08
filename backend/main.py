from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import CORS_ORIGINS

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="SWOT Stock API", version="1.0.0")

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": "Rate limit exceeded", "code": "RATE_LIMITED"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Import and include routers after app is created
from routers.stocks import router as stocks_router
from routers.backtest import router as backtest_router
from routers.crypto import router as crypto_router
from routers.portfolio import router as portfolio_router
from routers.mf import router as mf_router
from routers.social import router as social_router

app.include_router(stocks_router, prefix="/api/stocks")
app.include_router(backtest_router, prefix="/api/backtest")
app.include_router(crypto_router, prefix="/api/crypto")
app.include_router(portfolio_router, prefix="/api/portfolio")
app.include_router(mf_router, prefix="/api/mf")
app.include_router(social_router, prefix="/api/social")
