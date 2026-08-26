"""Portfolio API — holdings with avg cost + floating PnL via TickFlow."""

import os
import uuid
from collections import defaultdict

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.record import Record
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _clear_proxy():
    for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
        os.environ.pop(k, None)


def _get_latest_price(symbol: str) -> float | None:
    try:
        _clear_proxy()
        from tickflow import TickFlow
        tf = TickFlow.free()
        klines = tf.klines.get(symbol, period="1d", count=1)
        if klines and "close" in klines and len(klines["close"]) > 0:
            return float(klines["close"][-1])
    except Exception as e:
        logger.warning("price_fetch_error", symbol=symbol, error=str(e))
    return None


@router.get("/holdings", response_model=ApiResponse[list])
async def get_holdings(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Get merged holdings — same symbol buys aggregated, with avg cost."""
    uid = uuid.UUID(user_id)

    result = await session.execute(
        select(Record).where(
            Record.user_id == uid,
            Record.scene.in_(["trading", "crypto"]),
            Record.deleted_at.is_(None),
        ).order_by(Record.occurred_at.asc())
    )
    all_records = result.scalars().all()

    # Merge by symbol_name: accumulate buys, subtract sells
    positions: dict[str, dict] = defaultdict(lambda: {
        "total_quantity": 0.0,
        "total_cost": 0.0,
        "buy_count": 0,
        "sell_count": 0,
        "realized_pnl": 0.0,
        "market": "A",
        "scene": "trading",
        "last_date": "",
        "record_ids": [],
    })

    for r in all_records:
        content = r.content or {}
        symbol_name = content.get("symbol_name", r.title.split(" ")[0])
        direction = content.get("direction", "BUY")

        try:
            price = float(content.get("price_enc", 0) or 0)
            qty = float(content.get("quantity_enc", 0) or 0)
        except (ValueError, TypeError):
            continue

        if qty <= 0 or price <= 0:
            continue

        pos = positions[symbol_name]
        pos["market"] = content.get("market", "A")
        pos["scene"] = r.scene
        pos["last_date"] = r.occurred_at.strftime("%Y-%m-%d")
        pos["record_ids"].append(str(r.id))

        if direction == "BUY":
            pos["total_cost"] += price * qty
            pos["total_quantity"] += qty
            pos["buy_count"] += 1
        elif direction == "SELL":
            # Realize PnL on sell
            if pos["total_quantity"] > 0:
                avg_cost = pos["total_cost"] / pos["total_quantity"]
                sell_qty = min(qty, pos["total_quantity"])
                pos["realized_pnl"] += (price - avg_cost) * sell_qty
                pos["total_cost"] -= avg_cost * sell_qty
                pos["total_quantity"] -= sell_qty
            pos["sell_count"] += 1

    # Build response
    holdings = []
    for symbol_name, pos in positions.items():
        if pos["total_quantity"] <= 0 and pos["realized_pnl"] == 0:
            continue  # Fully closed, no PnL

        avg_cost = pos["total_cost"] / pos["total_quantity"] if pos["total_quantity"] > 0 else 0

        holdings.append({
            "symbol_name": symbol_name,
            "market": pos["market"],
            "scene": pos["scene"],
            "quantity": round(pos["total_quantity"], 4),
            "avg_cost": round(avg_cost, 2),
            "total_cost": round(pos["total_cost"], 2),
            "buy_count": pos["buy_count"],
            "sell_count": pos["sell_count"],
            "realized_pnl": round(pos["realized_pnl"], 2),
            "current_price": None,
            "floating_pnl": None,
            "floating_pnl_pct": None,
            "last_date": pos["last_date"],
            "status": "holding" if pos["total_quantity"] > 0 else "closed",
        })

    # Sort: open positions first, then by last date
    holdings.sort(key=lambda x: (0 if x["status"] == "holding" else 1, x["last_date"]), reverse=True)

    return ApiResponse(success=True, data=holdings)


@router.post("/refresh-prices", response_model=ApiResponse[list])
async def refresh_prices(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Refresh current prices for all open holdings via TickFlow."""
    import asyncio

    # Get holdings first
    holdings_resp = await get_holdings(user_id=user_id, session=session)
    holdings = holdings_resp.data or []

    open_holdings = [h for h in holdings if h["status"] == "holding"]

    for h in open_holdings:
        # Search for TickFlow symbol
        from app.scenes.trading.tickflow_service import search_symbols_tickflow
        results = await search_symbols_tickflow(h["symbol_name"], market=h["market"], limit=1)
        if not results:
            continue

        tf_symbol = results[0]["symbol"]
        current_price = await asyncio.to_thread(_get_latest_price, tf_symbol)

        if current_price is not None:
            h["current_price"] = current_price
            h["floating_pnl"] = round((current_price - h["avg_cost"]) * h["quantity"], 2)
            h["floating_pnl_pct"] = round((current_price - h["avg_cost"]) / h["avg_cost"] * 100, 2) if h["avg_cost"] > 0 else 0

    return ApiResponse(success=True, data=holdings)


@router.get("/summary", response_model=ApiResponse[dict])
async def portfolio_summary(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Portfolio summary — total holdings, realized PnL, position count."""
    holdings_resp = await get_holdings(user_id=user_id, session=session)
    holdings = holdings_resp.data or []

    open_count = sum(1 for h in holdings if h["status"] == "holding")
    closed_count = sum(1 for h in holdings if h["status"] == "closed")
    total_realized = sum(h["realized_pnl"] for h in holdings)
    total_cost = sum(h["total_cost"] for h in holdings if h["status"] == "holding")

    # Calculate market value from holdings that have current_price
    total_market_value = sum(
        h["current_price"] * h["quantity"]
        for h in holdings
        if h["status"] == "holding" and h.get("current_price")
    )
    total_floating = sum(
        h["floating_pnl"]
        for h in holdings
        if h["status"] == "holding" and h.get("floating_pnl") is not None
    )
    total_pnl = total_realized + total_floating

    return ApiResponse(success=True, data={
        "open_positions": open_count,
        "closed_positions": closed_count,
        "total_invested": round(total_cost, 2),
        "total_market_value": round(total_market_value, 2),
        "total_realized_pnl": round(total_realized, 2),
        "total_floating_pnl": round(total_floating, 2),
        "total_pnl": round(total_pnl, 2),
    })
