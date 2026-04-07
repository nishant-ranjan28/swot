# backend/routers/crypto.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from services.crypto_service import crypto_service

router = APIRouter()


@router.get("/prices")
async def get_prices():
    data = await asyncio.to_thread(crypto_service.get_crypto_prices)
    return {"cryptos": data}


@router.get("/chart/{symbol}")
async def get_chart(
    symbol: str,
    timeframe: Annotated[str, Query(pattern="^(1h|4h|1d|1w)$")] = "1d",
    limit: Annotated[int, Query(ge=10, le=365)] = 90,
):
    # Convert URL-safe symbol to exchange format (BTC -> BTC/USDT)
    pair = f"{symbol}/USDT" if "/" not in symbol else symbol
    data = await asyncio.to_thread(crypto_service.get_crypto_chart, pair, timeframe, limit)
    return {"symbol": pair, "data": data}
