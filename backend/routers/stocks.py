# backend/routers/stocks.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query, Path, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import SEARCH_RATE_LIMIT, DEFAULT_RATE_LIMIT, NEWS_RATE_LIMIT
from services.stock_service import stock_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Valid stock symbol: alphanumeric, dots, hyphens, carets (for indices like ^NSEI), 1-20 chars
SYMBOL_PATTERN = r"^[\w\.\-\^&]{1,20}$"
ValidSymbol = Annotated[str, Path(pattern=SYMBOL_PATTERN)]


def _not_found(symbol: str):
    return JSONResponse(
        status_code=404,
        content={"error": "Stock not found", "code": "SYMBOL_NOT_FOUND"},
    )


def _server_error():
    return JSONResponse(
        status_code=502,
        content={"error": "Failed to fetch data from Yahoo Finance", "code": "UPSTREAM_ERROR"},
    )


@router.get("/search")
@limiter.limit(SEARCH_RATE_LIMIT)
async def search_stocks(request: Request, q: Annotated[str, Query(min_length=1, max_length=50)]):
    results = await stock_service.search(q.strip())
    if results is None:
        return _server_error()
    return {"results": results}


@router.get("/search/mf")
@limiter.limit(SEARCH_RATE_LIMIT)
async def search_mutual_funds(request: Request, q: Annotated[str, Query(min_length=1, max_length=50)]):
    results = await stock_service.search_mutual_funds(q.strip())
    if results is None:
        return _server_error()
    return {"results": results}


@router.get("/trending")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_trending(request: Request):
    stocks = await asyncio.to_thread(stock_service.get_trending_stocks)
    return {"stocks": stocks}


@router.get("/indices")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_indices(request: Request):
    indices = await asyncio.to_thread(stock_service.get_market_indices)
    return {"indices": indices}


@router.get("/sentiment")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_sentiment(request: Request):
    data = await asyncio.to_thread(stock_service.get_market_sentiment)
    if not data:
        return _server_error()
    return data


@router.get("/screener")
@limiter.limit(SEARCH_RATE_LIMIT)
async def get_screener(request: Request):
    # Pass all query params as filters to Yahoo screener
    params = dict(request.query_params)
    result = await stock_service.screener_query(params)
    return result


@router.get("/52week")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_52week_scanner(request: Request):
    data = await asyncio.to_thread(stock_service.get_52week_scanner)
    return data


@router.get("/sip/{symbol}")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_sip_returns(
    request: Request,
    symbol: ValidSymbol,
    amount: Annotated[float, Query(ge=100, le=1000000)] = 5000,
    years: Annotated[int, Query(ge=1, le=20)] = 5,
):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.calculate_sip_returns, resolved, amount, years)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/news")
@limiter.limit(NEWS_RATE_LIMIT)
async def get_market_news(request: Request):
    articles = await asyncio.to_thread(stock_service.get_market_news)
    return {"articles": articles}


@router.get("/news/{symbol}")
@limiter.limit(NEWS_RATE_LIMIT)
async def get_stock_news(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    articles = await asyncio.to_thread(stock_service.get_stock_news, resolved)
    return {"articles": articles}


@router.get("/{symbol}/technical")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_technical(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_technical_analysis, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/fundamental")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_fundamental(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_fundamental_analysis, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/quote")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_quote(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_quote, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/summary")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_summary(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_summary, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/overview")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_overview(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_overview, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/financials")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_financials(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_financials, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/history")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_history(request: Request, symbol: ValidSymbol, range: Annotated[str, Query(pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$")] = "1y"):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_history, resolved, range)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/statements")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_statements(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_statements, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/dividends")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_dividends(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_dividends, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/analysts")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_analysts(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_analysts, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/holders")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_holders(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_holders, resolved)
    if not result:
        return _not_found(symbol)
    return result


@router.get("/{symbol}/earnings")
@limiter.limit(DEFAULT_RATE_LIMIT)
async def get_earnings(request: Request, symbol: ValidSymbol):
    resolved = await asyncio.to_thread(stock_service.resolve_indian_symbol, symbol)
    result = await asyncio.to_thread(stock_service.get_earnings, resolved)
    if not result:
        return _not_found(symbol)
    return result
