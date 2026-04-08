# backend/routers/mf.py
import asyncio
from typing import Annotated
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from services.mf_service import mf_service

router = APIRouter()


def _not_found(scheme_code: str):
    return JSONResponse(
        status_code=404,
        content={"error": f"Scheme '{scheme_code}' not found", "code": "SCHEME_NOT_FOUND"},
    )


def _server_error():
    return JSONResponse(
        status_code=502,
        content={"error": "Failed to fetch data from mftool", "code": "UPSTREAM_ERROR"},
    )


@router.get("/search")
async def search_funds(q: Annotated[str, Query(min_length=1, max_length=100)]):
    results = await asyncio.to_thread(mf_service.search, q.strip())
    if results is None:
        return _server_error()
    return {"results": results}


@router.get("/top")
async def get_top_funds(category: Annotated[str, Query(max_length=50)] = "all"):
    results = await asyncio.to_thread(mf_service.get_top_funds, category.strip())
    return {"funds": results}


@router.get("/compare")
async def compare_funds(codes: Annotated[str, Query(min_length=1)]):
    code_list = [c.strip() for c in codes.split(",") if c.strip()][:5]
    if not code_list:
        return JSONResponse(status_code=400, content={"error": "No valid scheme codes provided"})
    result = await asyncio.to_thread(mf_service.compare, code_list)
    return result


@router.get("/overlap")
async def get_overlap(codes: Annotated[str, Query(min_length=1)]):
    code_list = [c.strip() for c in codes.split(",") if c.strip()][:2]
    if len(code_list) != 2:
        return JSONResponse(status_code=400, content={"error": "Provide exactly 2 scheme codes"})
    result = await asyncio.to_thread(mf_service.get_overlap, code_list[0], code_list[1])
    if not result:
        return JSONResponse(status_code=404, content={"error": "Overlap data not available for these funds"})
    return result


@router.get("/{scheme_code}/holdings")
async def get_holdings(scheme_code: str):
    result = await asyncio.to_thread(mf_service.get_holdings, scheme_code)
    if not result:
        return JSONResponse(status_code=404, content={"error": "Holdings not available for this fund"})
    return result


@router.get("/{scheme_code}/nav")
async def get_nav(scheme_code: str):
    result = await asyncio.to_thread(mf_service.get_nav, scheme_code)
    if not result:
        return _not_found(scheme_code)
    return result


@router.get("/{scheme_code}/history")
async def get_history(
    scheme_code: str,
    period: Annotated[str, Query(pattern="^(1y|3y|5y|max)$")] = "1y",
):
    result = await asyncio.to_thread(mf_service.get_history, scheme_code, period)
    if not result:
        return _not_found(scheme_code)
    return result
