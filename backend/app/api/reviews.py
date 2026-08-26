from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException
from app.engines.review_engine import (
    create_review,
    get_review,
    get_template,
    get_templates,
    list_reviews,
    seed_templates,
)
from app.schemas.common import ApiResponse, PaginatedResponse

router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewCreateRequest(BaseModel):
    template_id: str = Field(default="trade_post")
    answers: dict = Field(default_factory=dict)
    scene: str = Field(default="trading")
    linked_record_ids: list[str] = Field(default_factory=list)
    review_date: date | None = None
    did_right: str | None = None
    did_wrong: str | None = None
    next_plan: str | None = None


class ReviewResponse(BaseModel):
    id: str
    scene: str
    template: str
    did_right: str | None
    did_wrong: str | None
    next_plan: str | None
    answers: dict | None
    review_date: str
    created_at: str


def _to_response(r) -> ReviewResponse:
    answers = r.ai_analysis.get("answers") if r.ai_analysis else None
    return ReviewResponse(
        id=str(r.id), scene=r.scene, template=r.template,
        did_right=r.did_right, did_wrong=r.did_wrong, next_plan=r.next_plan,
        answers=answers, review_date=str(r.review_date), created_at=r.created_at.isoformat(),
    )


@router.get("/templates", response_model=ApiResponse[list])
async def templates_list(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    return ApiResponse(success=True, data=await get_templates(session, user_id))


@router.get("/templates/{template_id}", response_model=ApiResponse[dict | None])
async def template_detail(template_id: str, session: AsyncSession = Depends(get_db)) -> ApiResponse[dict | None]:
    data = await get_template(session, template_id)
    if data is None:
        raise NotFoundException("Template")
    return ApiResponse(success=True, data=data)


@router.post("/seed-templates", response_model=ApiResponse[dict])
async def seed(session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    count = await seed_templates(session)
    return ApiResponse(success=True, data={"seeded": count})


@router.post("", response_model=ApiResponse[ReviewResponse])
async def create(
    payload: ReviewCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReviewResponse]:
    answers = dict(payload.answers)
    if payload.did_right and "did_right" not in answers:
        answers["did_right"] = payload.did_right
    if payload.did_wrong and "did_wrong" not in answers:
        answers["did_wrong"] = payload.did_wrong
    if payload.next_plan and "lesson" not in answers:
        answers["lesson"] = payload.next_plan

    review = await create_review(
        session=session, user_id=user_id, template_id=payload.template_id,
        answers=answers, scene=payload.scene,
        linked_record_ids=payload.linked_record_ids, review_date=payload.review_date,
    )
    # Auto-complete daily task
    try:
        from app.engines.growth_engine import complete_task
        await complete_task(session, user_id, "reviewed")
    except Exception:
        pass
    return ApiResponse(success=True, data=_to_response(review))


@router.get("/trade-context", response_model=ApiResponse[list])
async def trade_context(
    record_ids: str = Query(..., description="Comma-separated record IDs"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Fetch AI context data for linked trades (symbol, volume, trend, etc.)."""
    import asyncio
    from app.engines.record_engine import get_record

    results = []
    for rid in record_ids.split(","):
        rid = rid.strip()
        if not rid:
            continue
        record = await get_record(session, user_id, rid)
        if not record or record.scene != "trading":
            continue

        symbol = record.content.get("symbol", "") or record.content.get("symbol_name", "")
        market = record.content.get("market", "A")

        # Extract stock name from title (e.g. "永鼎股份 买入" → "永鼎股份")
        stock_name = record.title.split(" ")[0] if record.title else ""

        # If no symbol or symbol is Chinese name, search by name
        search_term = symbol if symbol and symbol.replace(".", "").isdigit() else (symbol or stock_name)
        tf_symbol = symbol

        if symbol and symbol.replace(".", "").isdigit() and "." not in symbol:
            # Pure digit code: 600519 → 600519.SH
            if market == "A":
                tf_symbol = f"{symbol}.SH" if symbol.startswith("6") else f"{symbol}.SZ" if symbol[0] in "03" else f"{symbol}.BJ"
            elif market == "HK":
                tf_symbol = f"{symbol.zfill(5)}.HK"
        else:
            # No code or Chinese name — search TickFlow by name
            try:
                from app.scenes.trading.tickflow_service import search_symbols_tickflow
                search_res = await search_symbols_tickflow(search_term, market, limit=1)
                if search_res:
                    tf_symbol = search_res[0].get("symbol", "")
                    if not symbol:
                        symbol = search_res[0].get("code", "")
            except Exception:
                pass

        if not tf_symbol:
            # Still no symbol, skip TickFlow but return basic info
            ctx: dict = {
                "record_id": str(record.id), "title": record.title, "symbol": symbol or stock_name,
                "market": market, "direction": record.content.get("direction", ""),
                "entry_price": record.content.get("price", ""), "pnl": record.content.get("pnl"),
                "occurred_at": record.occurred_at.isoformat(),
            }
            results.append(ctx)
            continue

        # Fetch kline from TickFlow
        ctx: dict = {
            "record_id": str(record.id),
            "title": record.title,
            "symbol": symbol,
            "market": record.content.get("market", "A"),
            "direction": record.content.get("direction", ""),
            "entry_price": record.content.get("price", ""),
            "pnl": record.content.get("pnl"),
            "occurred_at": record.occurred_at.isoformat(),
        }

        try:
            def _fetch_tf(sym):
                import os
                for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
                    os.environ.pop(k, None)
                from tickflow import TickFlow
                tf = TickFlow.free()
                info = tf.instruments.get(sym)
                klines_raw = tf.klines.get(sym, period="1d", count=20)
                return info, klines_raw

            info, klines_raw = await asyncio.to_thread(_fetch_tf, tf_symbol)

            if info:
                ctx["name"] = info.get("name", "")
                ctx["industry"] = info.get("industry", "")

            if klines_raw and isinstance(klines_raw, dict) and "close" in klines_raw:
                closes = klines_raw["close"]
                volumes = klines_raw.get("volume", [])
                if len(closes) >= 5:
                    latest = float(closes[-1])
                    ma5 = sum(float(c) for c in closes[-5:]) / 5
                    ma10 = sum(float(c) for c in closes[-10:]) / 10 if len(closes) >= 10 else ma5
                    ma20 = sum(float(c) for c in closes[-20:]) / 20 if len(closes) >= 20 else ma10

                    ctx["latest_price"] = round(latest, 2)
                    change_pct = round((float(closes[-1]) - float(closes[-2])) / float(closes[-2]) * 100, 2) if len(closes) >= 2 else 0
                    ctx["change_pct"] = change_pct

                    # Trend
                    if latest > ma5 > ma10 > ma20:
                        ctx["trend"] = "多头排列（强势上涨）"
                    elif latest > ma5 > ma10:
                        ctx["trend"] = "偏多（短期上涨趋势）"
                    elif latest < ma5 < ma10 < ma20:
                        ctx["trend"] = "空头排列（弱势下跌）"
                    elif latest < ma5 < ma10:
                        ctx["trend"] = "偏空（短期下跌趋势）"
                    else:
                        ctx["trend"] = "震荡整理"

                    ctx["ma5"] = round(ma5, 2)
                    ctx["ma10"] = round(ma10, 2)
                    ctx["ma20"] = round(ma20, 2)

                if volumes and len(volumes) >= 2:
                    latest_vol = int(volumes[-1])
                    avg_vol = sum(int(v) for v in volumes[-5:]) / min(5, len(volumes))
                    ctx["latest_volume"] = latest_vol
                    ctx["avg_volume_5d"] = round(avg_vol)
                    vol_ratio = latest_vol / avg_vol if avg_vol > 0 else 1
                    if vol_ratio > 2:
                        ctx["volume_status"] = "显著放量"
                    elif vol_ratio > 1.3:
                        ctx["volume_status"] = "温和放量"
                    elif vol_ratio < 0.5:
                        ctx["volume_status"] = "明显缩量"
                    else:
                        ctx["volume_status"] = "量能平稳"
        except Exception:
            pass  # TickFlow unavailable, return what we have

        results.append(ctx)

    return ApiResponse(success=True, data=results)


@router.get("", response_model=ApiResponse[PaginatedResponse[ReviewResponse]])
async def list_all(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
    scene: str | None = None,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[ReviewResponse]]:
    items, total = await list_reviews(session, user_id, scene, page, page_size)
    return ApiResponse(
        success=True,
        data=PaginatedResponse(items=[_to_response(r) for r in items], total=total, page=page, page_size=page_size),
    )


@router.get("/{review_id}/recommendations", response_model=ApiResponse[list])
async def get_recommendations(
    review_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Get AI-powered knowledge recommendations based on review content."""
    review = await get_review(session, user_id, review_id)
    if review is None:
        raise NotFoundException("Review")

    recommendations = []
    answers = review.ai_analysis.get("answers", {}) if review.ai_analysis else {}
    template_id = review.template

    # 1. Always recommend the master's knowledge article
    from sqlalchemy import select as sa_select
    from app.models.knowledge import KnowledgeArticle
    if template_id:
        result = await session.execute(
            sa_select(KnowledgeArticle).where(KnowledgeArticle.related_template_id == template_id)
        )
        master_article = result.scalar_one_or_none()
        if master_article:
            recommendations.append({
                "id": str(master_article.id), "title": master_article.title,
                "cover_emoji": master_article.cover_emoji,
                "reason": f"深入了解{master_article.title.split('：')[0] if '：' in master_article.title else template_id}的方法论",
            })

    # 2. Match weaknesses from answers to knowledge
    all_text = " ".join(str(v) for v in answers.values())

    WEAKNESS_MAP = [
        (["追涨", "入场过早", "没等待", "冲动", "急"], "利弗莫尔", "入场时机问题，学习关键点理论"),
        (["止损", "扛单", "没止", "犹豫", "补仓"], "止损", "止损执行不果断"),
        (["焦虑", "恐慌", "贪婪", "冲动", "情绪控制"], "交易心理", "情绪影响了交易决策"),
        (["仓位", "满仓", "重仓", "太大"], "仓位管理", "仓位管理需要改进"),
        (["没计划", "随便", "感觉", "没有计划"], "检查清单", "缺少交易计划"),
        (["拿不住", "提前卖", "过早平仓"], "利润奔跑", "持仓耐心不够"),
        (["趋势", "逆势", "方向"], "趋势", "趋势判断需要提升"),
        (["板块", "主线", "热点", "轮动"], "板块轮动", "板块分析能力"),
    ]

    added_titles = {r["title"] for r in recommendations}
    for keywords, search_term, reason in WEAKNESS_MAP:
        if len(recommendations) >= 3:
            break
        if any(kw in all_text for kw in keywords):
            from sqlalchemy import text
            result = await session.execute(
                text("SELECT id, title, cover_emoji FROM knowledge_articles WHERE is_active = true AND (title ILIKE :kw OR content_md ILIKE :kw) LIMIT 1"),
                {"kw": f"%{search_term}%"},
            )
            row = result.fetchone()
            if row and row[1] not in added_titles:
                recommendations.append({
                    "id": str(row[0]), "title": row[1], "cover_emoji": row[2] or "📄", "reason": reason,
                })
                added_titles.add(row[1])

    return ApiResponse(success=True, data=recommendations[:3])


@router.get("/{review_id}", response_model=ApiResponse[ReviewResponse])
async def get_one(
    review_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReviewResponse]:
    review = await get_review(session, user_id, review_id)
    if review is None:
        raise NotFoundException("Review")
    return ApiResponse(success=True, data=_to_response(review))
