"""Social / trending sentiment router."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Query

from services.social_service import social_service

router = APIRouter()


@router.get("/reddit")
async def get_reddit_mentions(
    sub: Annotated[str, Query(max_length=50)] = "IndianStockMarket",
):
    results = await asyncio.to_thread(social_service.get_reddit_mentions, sub)
    return {"results": results}


@router.get("/trending")
async def get_trending():
    return {"results": social_service.get_trending_local()}
