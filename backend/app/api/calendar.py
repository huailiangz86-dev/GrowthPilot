"""Calendar API — daily view with PnL, market filter, currency conversion."""

import json
import uuid

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.common import ApiResponse
from app.services.currency_service import convert_to_cny, market_to_currency

logger = structlog.get_logger()
router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/month", response_model=ApiResponse[dict])
async def month_view(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    market: str = Query("ALL", description="ALL / A / HK / US"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    uid = uuid.UUID(user_id)
    try:
        # Market filter
        market_filter = ""
        if market != "ALL":
            market_filter = f"AND content->>'market' = '{market}'"

        trades = await session.execute(text(f"""
            SELECT DATE(occurred_at AT TIME ZONE 'Asia/Shanghai') AS day,
                COALESCE(content->>'market', 'A') AS trade_market,
                COUNT(*) AS trade_count,
                COALESCE(SUM(CASE WHEN content->>'pnl' IS NOT NULL THEN (content->>'pnl')::float ELSE 0 END), 0) AS day_pnl,
                COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins,
                COUNT(*) FILTER (WHERE (content->>'pnl')::float < 0) AS losses
            FROM records
            WHERE user_id = :uid AND deleted_at IS NULL
                AND EXTRACT(YEAR FROM occurred_at AT TIME ZONE 'Asia/Shanghai') = :year
                AND EXTRACT(MONTH FROM occurred_at AT TIME ZONE 'Asia/Shanghai') = :month
                {market_filter}
            GROUP BY DATE(occurred_at AT TIME ZONE 'Asia/Shanghai'), content->>'market'
        """), {"uid": uid, "year": year, "month": month})

        # Aggregate by day, converting to CNY if "ALL"
        day_data: dict[str, dict] = {}
        for r in trades.fetchall():
            day_str = str(r.day)
            if day_str not in day_data:
                day_data[day_str] = {"trades": 0, "pnl_cny": 0.0, "wins": 0, "losses": 0}

            pnl = float(r.day_pnl)
            if market == "ALL":
                # Convert to CNY
                currency = market_to_currency(r.trade_market or "A")
                pnl = convert_to_cny(pnl, currency)

            day_data[day_str]["trades"] += r.trade_count
            day_data[day_str]["pnl_cny"] += pnl
            day_data[day_str]["wins"] += r.wins
            day_data[day_str]["losses"] += r.losses

        # Reviews
        reviews = await session.execute(text("""
            SELECT review_date AS day, COUNT(*) AS review_count FROM reviews
            WHERE user_id = :uid AND EXTRACT(YEAR FROM review_date) = :year AND EXTRACT(MONTH FROM review_date) = :month
            GROUP BY review_date
        """), {"uid": uid, "year": year, "month": month})
        review_days = {str(r.day): r.review_count for r in reviews.fetchall()}

        # Build calendar
        import calendar as cal
        _, num_days = cal.monthrange(year, month)
        days = []
        month_total_pnl = 0.0
        month_total_trades = 0

        for d in range(1, num_days + 1):
            day_str = f"{year}-{month:02d}-{d:02d}"
            dd = day_data.get(day_str, {})
            pnl = round(dd.get("pnl_cny", 0), 2)
            trades_count = dd.get("trades", 0)
            month_total_pnl += pnl
            month_total_trades += trades_count

            days.append({
                "date": day_str,
                "trades": trades_count,
                "pnl": pnl,
                "wins": dd.get("wins", 0),
                "losses": dd.get("losses", 0),
                "reviews": review_days.get(day_str, 0),
                "has_data": day_str in day_data or day_str in review_days,
            })

        currency_label = "¥" if market in ("ALL", "A") else ("HK$" if market == "HK" else "$")

        return ApiResponse(success=True, data={
            "days": days,
            "summary": {
                "month_pnl": round(month_total_pnl, 2),
                "month_trades": month_total_trades,
                "currency": currency_label,
                "market": market,
            },
        })
    except Exception as e:
        logger.error("calendar_month_error", error=str(e))
        return ApiResponse(success=True, data={"days": [], "summary": {"month_pnl": 0, "month_trades": 0, "currency": "¥", "market": market}})


@router.get("/day", response_model=ApiResponse[dict])
async def day_detail(
    date: str = Query(...),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    uid = uuid.UUID(user_id)
    try:
        trades_result = await session.execute(text("""
            SELECT id, title, content, tags, emotion, occurred_at, scene
            FROM records WHERE user_id = :uid AND deleted_at IS NULL
                AND DATE(occurred_at AT TIME ZONE 'Asia/Shanghai') = :date
            ORDER BY occurred_at ASC
        """), {"uid": uid, "date": date})

        trades = []
        total_pnl = 0.0
        for r in trades_result.fetchall():
            content = r.content if isinstance(r.content, dict) else json.loads(str(r.content))
            tags = r.tags if isinstance(r.tags, list) else json.loads(str(r.tags))
            pnl = content.get("pnl")
            if pnl:
                total_pnl += float(pnl)
            reasons = [t["value"] for t in tags if t.get("category") in ("buy_reason", "sell_reason", "category")]
            trades.append({
                "id": str(r.id), "title": r.title, "scene": r.scene,
                "direction": content.get("direction", ""),
                "symbol_name": content.get("symbol_name", ""),
                "market": content.get("market", ""),
                "pnl": pnl, "reasons": reasons, "emotion": r.emotion,
                "time": r.occurred_at.strftime("%H:%M") if r.occurred_at else "",
            })

        reviews_result = await session.execute(text("""
            SELECT id, did_right, did_wrong, next_plan, notes FROM reviews
            WHERE user_id = :uid AND review_date = :date ORDER BY created_at ASC
        """), {"uid": uid, "date": date})
        reviews = [
            {"id": str(r.id), "did_right": r.did_right, "did_wrong": r.did_wrong, "next_plan": r.next_plan, "notes": r.notes}
            for r in reviews_result.fetchall()
        ]

        return ApiResponse(success=True, data={
            "date": date, "trades": trades, "reviews": reviews,
            "summary": {"trade_count": len(trades), "total_pnl": round(total_pnl, 2), "review_count": len(reviews)},
        })
    except Exception as e:
        logger.error("calendar_day_error", error=str(e))
        return ApiResponse(success=True, data={"date": date, "trades": [], "reviews": [], "summary": {"trade_count": 0, "total_pnl": 0, "review_count": 0}})
