import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.engines.pattern_engine import discover_all_patterns, get_patterns
from app.scenes.trading.trading_stats import check_pattern_alert, get_pnl_curve
from app.schemas.common import ApiResponse
from app.workers.tasks.report_task import generate_weekly_report

router = APIRouter(tags=["stats"])


@router.get("/stats/overview", response_model=ApiResponse[dict])
async def overview(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Core trading statistics."""
    uid = uuid.UUID(user_id)
    result = await session.execute(text("""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE content->>'pnl' IS NOT NULL) AS completed,
            COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins,
            ROUND(AVG((content->>'pnl')::float) FILTER (WHERE content->>'pnl' IS NOT NULL)::numeric, 2) AS avg_pnl,
            ROUND(SUM((content->>'pnl')::float) FILTER (WHERE content->>'pnl' IS NOT NULL)::numeric, 2) AS total_pnl
        FROM records
        WHERE user_id = :uid AND scene = 'trading' AND deleted_at IS NULL
    """), {"uid": uid})
    row = result.fetchone()
    completed = row.completed or 0
    wins = row.wins or 0
    win_rate = round(wins / completed * 100, 1) if completed > 0 else None

    return ApiResponse(success=True, data={
        "total_trades": row.total,
        "completed_trades": completed,
        "win_rate": win_rate,
        "avg_pnl": float(row.avg_pnl or 0),
        "total_pnl": float(row.total_pnl or 0),
        "unlocked": completed >= 10,
    })


@router.get("/patterns", response_model=ApiResponse[list])
async def list_patterns(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """List discovered patterns."""
    data = await get_patterns(session, user_id)
    return ApiResponse(success=True, data=data)


@router.post("/patterns/discover", response_model=ApiResponse[dict])
async def trigger_discovery(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Trigger pattern discovery (SQL-first, minimal LLM cost)."""
    patterns = await discover_all_patterns(session, user_id)
    return ApiResponse(success=True, data={"discovered": len(patterns), "patterns": patterns})


@router.get("/dashboard", response_model=ApiResponse[dict])
async def dashboard(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Homepage dashboard — today's data + latest AI suggestion."""
    uid = uuid.UUID(user_id)

    # Today's trades (all scenes, timezone aware)
    today_result = await session.execute(text("""
        SELECT COUNT(*) AS count,
            COALESCE(ROUND(SUM(CASE WHEN content->>'pnl' IS NOT NULL THEN (content->>'pnl')::float ELSE 0 END)::numeric, 2), 0) AS today_pnl
        FROM records
        WHERE user_id = :uid AND deleted_at IS NULL
            AND DATE(occurred_at AT TIME ZONE 'Asia/Shanghai') = CURRENT_DATE
    """), {"uid": uid})
    today = today_result.fetchone()

    # Overall stats (all time, all scenes)
    overall = await session.execute(text("""
        SELECT
            COUNT(*) AS total,
            COALESCE(ROUND(SUM(CASE WHEN content->>'pnl' IS NOT NULL THEN (content->>'pnl')::float ELSE 0 END)::numeric, 2), 0) AS month_pnl,
            COUNT(*) FILTER (WHERE content->>'pnl' IS NOT NULL) AS completed,
            COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins
        FROM records
        WHERE user_id = :uid AND deleted_at IS NULL
            AND occurred_at AT TIME ZONE 'Asia/Shanghai' >= DATE_TRUNC('month', CURRENT_DATE)
    """), {"uid": uid})
    ov = overall.fetchone()
    win_rate = round(ov.wins / ov.completed * 100, 1) if ov.completed > 0 else None

    # All time win rate if no monthly data
    if win_rate is None:
        alltime = await session.execute(text("""
            SELECT COUNT(*) FILTER (WHERE content->>'pnl' IS NOT NULL) AS completed,
                COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins
            FROM records WHERE user_id = :uid AND deleted_at IS NULL
        """), {"uid": uid})
        at = alltime.fetchone()
        win_rate = round(at.wins / at.completed * 100, 1) if at.completed > 0 else None

    # Generate real AI analysis via Qwen + TickFlow data, cached in Redis
    import asyncio as _aio
    import json as _json
    import httpx

    from app.core.config import settings as _settings
    from app.core.redis import get_redis

    ai_suggestion = ""
    ai_severity = None
    total_trades = ov.total or 0

    if total_trades == 0:
        ai_suggestion = "还没有交易记录，记录第一笔交易开始你的成长之旅"
    else:
        # Check cache first (4 hour TTL)
        redis = await get_redis()
        cache_key = f"ai_insight:{user_id}"
        cached = await redis.get(cache_key) if redis else None
        if cached:
            cache_data = _json.loads(cached)
            ai_suggestion = cache_data.get("suggestion", "")
            ai_severity = cache_data.get("severity")
        else:
            # Gather data for Qwen
            # 1. Open positions + TickFlow trends
            open_positions = await session.execute(text("""
                SELECT title, content->>'symbol' AS symbol, content->>'symbol_name' AS symbol_name,
                    content->>'market' AS market, emotion
                FROM records
                WHERE user_id = :uid AND deleted_at IS NULL AND scene = 'trading'
                    AND (content->>'pnl' IS NULL OR content->>'pnl' = '')
                ORDER BY occurred_at DESC LIMIT 5
            """), {"uid": uid})
            positions = open_positions.fetchall()

            position_info = []
            if positions:
                resolved = {}
                for p in positions:
                    sym = p.symbol or p.symbol_name or ""
                    name = p.title.split(" ")[0]
                    if name in resolved:
                        continue
                    if sym and sym.isdigit():
                        resolved[name] = f"{sym}.SH" if sym.startswith("6") else f"{sym}.SZ" if sym[0] in "03" else f"{sym}.BJ"
                    elif "." in sym:
                        resolved[name] = sym
                    else:
                        try:
                            from app.scenes.trading.tickflow_service import search_symbols_tickflow
                            sr = await search_symbols_tickflow(name, p.market or "A", 1)
                            if sr:
                                resolved[name] = sr[0].get("symbol", "")
                        except Exception:
                            pass

                def _fetch(pos_list):
                    import os
                    for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
                        os.environ.pop(k, None)
                    from tickflow import TickFlow
                    tf = TickFlow.free()
                    out = []
                    seen = set()
                    for p in pos_list:
                        name = p.title.split(" ")[0]
                        if name in seen:
                            continue
                        seen.add(name)
                        tf_sym = resolved.get(name, "")
                        if not tf_sym:
                            out.append(f"{name}：无法获取行情")
                            continue
                        try:
                            klines = tf.klines.get(tf_sym, period="1d", count=20)
                            if klines and klines.get("close") and len(klines["close"]) >= 5:
                                closes = [float(c) for c in klines["close"]]
                                volumes = [int(v) for v in klines.get("volume", [])]
                                latest = closes[-1]
                                chg1d = round((closes[-1] - closes[-2]) / closes[-2] * 100, 1)
                                chg5d = round((closes[-1] - closes[-5]) / closes[-5] * 100, 1)
                                ma5 = round(sum(closes[-5:]) / 5, 2)
                                ma10 = round(sum(closes[-10:]) / min(10, len(closes)), 2)
                                ma20 = round(sum(closes[-20:]) / min(20, len(closes)), 2)
                                vol_ratio = round(volumes[-1] / (sum(volumes[-5:]) / 5), 1) if volumes and len(volumes) >= 5 else 1.0
                                out.append(f"{name}：最新价{latest}，日涨跌{chg1d}%，5日涨跌{chg5d}%，MA5={ma5} MA10={ma10} MA20={ma20}，量比{vol_ratio}，情绪:{p.emotion or '未标记'}")
                            else:
                                out.append(f"{name}：行情数据不足")
                        except Exception:
                            out.append(f"{name}：获取失败")
                    return out

                try:
                    position_info = await _aio.to_thread(_fetch, positions)
                except Exception:
                    pass

            # 2. Trading stats
            emo_result = await session.execute(text("""
                SELECT emotion, COUNT(*) as cnt FROM records
                WHERE user_id = :uid AND deleted_at IS NULL AND emotion IS NOT NULL
                    AND occurred_at AT TIME ZONE 'Asia/Shanghai' >= DATE_TRUNC('month', CURRENT_DATE)
                GROUP BY emotion ORDER BY cnt DESC
            """), {"uid": uid})
            emo_summary = ", ".join(f"{r.emotion}{r.cnt}笔" for r in emo_result.fetchall())

            review_count = (await session.execute(text("""
                SELECT COUNT(*) FROM reviews WHERE user_id = :uid
                    AND created_at AT TIME ZONE 'Asia/Shanghai' >= DATE_TRUNC('month', CURRENT_DATE)
            """), {"uid": uid})).scalar() or 0

            # 3. Call Qwen for real analysis
            data_prompt = f"""用户交易数据：
- 本月交易{total_trades}笔，胜率{win_rate or '未知'}%，总盈亏{float(ov.month_pnl)}
- 情绪分布：{emo_summary or '无'}
- 本月复盘{review_count}次

当前持仓行情：
{chr(10).join(position_info) if position_info else '无持仓'}"""

            try:
                async with httpx.AsyncClient(trust_env=False, timeout=15) as client:
                    resp = await client.post(
                        f"{_settings.QWEN_BASE_URL}/chat/completions",
                        json={
                            "model": "qwen-plus",
                            "messages": [
                                {"role": "system", "content": "你是交易分析师。根据用户的交易数据和持仓行情，给出简短的分析判断（2-3句话，不超过80字）。要有具体建议，不要空话。不推荐股票，只分析已有持仓。说中文。"},
                                {"role": "user", "content": data_prompt},
                            ],
                            "max_tokens": 150,
                            "temperature": 0.6,
                        },
                        headers={"Authorization": f"Bearer {_settings.QWEN_API_KEY}", "Content-Type": "application/json"},
                    )
                    if resp.status_code == 200:
                        ai_suggestion = resp.json()["choices"][0]["message"]["content"].strip()
                        if "亏" in ai_suggestion or "风险" in ai_suggestion or "注意" in ai_suggestion:
                            ai_severity = "negative"
                    else:
                        ai_suggestion = f"本月{total_trades}笔交易，持续记录解锁更多分析"
            except Exception:
                ai_suggestion = f"本月{total_trades}笔交易，持续记录解锁更多分析"

            # Cache for 4 hours
            if redis and ai_suggestion:
                await redis.setex(cache_key, 14400, _json.dumps({"suggestion": ai_suggestion, "severity": ai_severity}))

    # Recent trades (last 5, simple list)
    recent_result = await session.execute(text("""
        SELECT title, emotion,
            CASE WHEN content->>'pnl' IS NOT NULL THEN (content->>'pnl')::float ELSE NULL END AS pnl,
            content->>'price' AS price, content->>'price_enc' AS price_enc,
            content->>'direction' AS direction,
            content->>'symbol' AS symbol, content->>'symbol_name' AS symbol_name,
            TO_CHAR(occurred_at AT TIME ZONE 'Asia/Shanghai', 'MM/DD') AS date,
            (SELECT string_agg(t->>'value', ',') FROM jsonb_array_elements(tags) AS t WHERE t->>'category' = 'buy_reason') AS reasons
        FROM records
        WHERE user_id = :uid AND deleted_at IS NULL AND scene = 'trading'
        ORDER BY occurred_at DESC LIMIT 5
    """), {"uid": uid})

    recent_trades = []
    for r in recent_result.fetchall():
        # Generate AI judgment per trade
        judgments = []
        if r.pnl is not None:
            if r.pnl > 0:
                judgments.append(f"盈利 +{r.pnl}")
            elif r.pnl < 0:
                judgments.append(f"亏损 {r.pnl}，注意总结原因")
        else:
            judgments.append("持仓中")

        if r.emotion in ("焦虑", "恐慌", "冲动"):
            judgments.append(f"情绪「{r.emotion}」入场，需警惕")
        if r.reasons:
            reason_list = r.reasons.split(",")
            if "追涨" in reason_list or "FOMO" in reason_list:
                judgments.append("追涨操作，注意回调风险")
            if "抄底" in reason_list:
                judgments.append("抄底操作，确认是否到位")

        recent_trades.append({
            "title": r.title, "pnl": r.pnl, "date": r.date,
            "direction": r.direction or "",
            "judgment": "；".join(judgments) if judgments else "",
        })

    return ApiResponse(success=True, data={
        "today_trades": today.count,
        "today_pnl": float(today.today_pnl),
        "month_trades": total_trades,
        "month_pnl": float(ov.month_pnl),
        "win_rate": win_rate,
        "ai_suggestion": ai_suggestion,
        "ai_severity": ai_severity,
        "recent_trades": recent_trades,
    })


@router.get("/stats/pnl-curve", response_model=ApiResponse[list])
async def pnl_curve(
    days: int = Query(30, ge=0),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Daily PnL curve for chart display."""
    data = await get_pnl_curve(session, user_id, days)
    return ApiResponse(success=True, data=data)


class AlertCheckRequest(BaseModel):
    tags: list[dict] = Field(default_factory=list)


@router.post("/stats/check-alert", response_model=ApiResponse[dict | None])
async def check_alert(
    payload: AlertCheckRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict | None]:
    """Check if tags match a known low-winrate pattern (real-time alert)."""
    result = await check_pattern_alert(session, user_id, payload.tags)
    return ApiResponse(success=True, data=result)


@router.get("/stats/weekly-report", response_model=ApiResponse[dict])
async def weekly_report(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Generate weekly trading report."""
    data = await generate_weekly_report(session, user_id)
    return ApiResponse(success=True, data=data)
