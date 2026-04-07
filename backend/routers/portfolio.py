# backend/routers/portfolio.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.portfolio_service import portfolio_service
from services.risk_service import risk_service

router = APIRouter()


@router.get("/optimize")
async def optimize_portfolio(
    symbols: Annotated[str, Query(description="Comma-separated stock symbols")],
    amount: Annotated[float, Query(ge=10000, le=100000000)] = 100000,
):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if len(symbol_list) < 2:
        return JSONResponse(status_code=400, content={"error": "Need at least 2 symbols"})
    result = await asyncio.to_thread(portfolio_service.optimize, symbol_list, amount)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Optimization failed"})
    return result


@router.get("/risk")
async def analyze_risk(
    symbols: Annotated[str, Query(description="Comma-separated stock symbols")],
):
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()][:20]
    if len(symbol_list) < 2:
        return JSONResponse(status_code=400, content={"error": "Need at least 2 symbols"})
    result = await asyncio.to_thread(risk_service.analyze, symbol_list)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Risk analysis failed"})
    return result
