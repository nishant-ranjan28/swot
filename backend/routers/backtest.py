# backend/routers/backtest.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from services.backtest_service import backtest_service

router = APIRouter()


@router.get("/{symbol}")
async def run_backtest(
    symbol: str,
    strategy: Annotated[str, Query()] = "sma_crossover",
    period: Annotated[str, Query(pattern="^(6mo|1y|2y|5y|max)$")] = "2y",
    cash: Annotated[float, Query(ge=10000, le=10000000)] = 100000,
):
    result = await asyncio.to_thread(
        backtest_service.run_backtest, symbol, strategy, period, cash
    )
    if not result:
        return JSONResponse(status_code=404, content={"error": "Could not run backtest", "code": "BACKTEST_FAILED"})
    return result
