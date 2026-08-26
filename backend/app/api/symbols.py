from fastapi import APIRouter, Query

from app.scenes.trading.tickflow_service import get_instrument, refresh_tickflow_cache, search_symbols_tickflow
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/trades", tags=["symbols"])


@router.get("/search-symbol", response_model=ApiResponse[list])
async def search_symbol(
    q: str = Query(..., min_length=1, max_length=20),
    market: str = Query("ALL", description="A / HK / US / ALL"),
    limit: int = Query(10, ge=1, le=50),
) -> ApiResponse[list]:
    """Search symbols via TickFlow (A/HK/US)."""
    results = await search_symbols_tickflow(query=q, market=market, limit=limit)
    return ApiResponse(success=True, data=results)


@router.get("/instrument", response_model=ApiResponse[dict | None])
async def instrument(
    symbol: str = Query(..., description="600519.SH / AAPL.US / 00700.HK"),
) -> ApiResponse[dict | None]:
    """Get instrument details via TickFlow."""
    data = await get_instrument(symbol)
    return ApiResponse(success=True, data=data)


@router.post("/refresh-symbols", response_model=ApiResponse[dict])
async def refresh_symbols() -> ApiResponse[dict]:
    """Refresh TickFlow symbol cache (all exchanges)."""
    result = await refresh_tickflow_cache()
    return ApiResponse(success=True, data=result)
