"""Market API — real-time indices + finance news."""

import re
from datetime import datetime, UTC

import httpx
import structlog
from fastapi import APIRouter, Query

from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/market", tags=["market"])

INDICES = [
    {"code": "sh000001", "name": "上证指数"},
    {"code": "sz399001", "name": "深证成指"},
    {"code": "sz399006", "name": "创业板指"},
]


@router.get("/indices", response_model=ApiResponse[list])
async def get_indices() -> ApiResponse[list]:
    """Get major market indices with real-time data from Tencent finance."""
    try:
        codes = ",".join(idx["code"] for idx in INDICES)
        async with httpx.AsyncClient(trust_env=False, timeout=5) as client:
            resp = await client.get(f"https://qt.gtimg.cn/q={codes}")
            text = resp.text

        results = []
        for idx in INDICES:
            # Parse: v_sh000001="1~上证指数~000001~当前价~昨收~..."
            pattern = rf'v_{idx["code"]}="([^"]*)"'
            match = re.search(pattern, text)
            if match:
                parts = match.group(1).split("~")
                if len(parts) >= 5:
                    current = float(parts[3])
                    prev_close = float(parts[4])
                    change = round((current - prev_close) / prev_close * 100, 2) if prev_close else 0
                    results.append({
                        "name": idx["name"],
                        "symbol": idx["code"],
                        "value": current,
                        "change": change,
                        "up": change >= 0,
                    })
                else:
                    results.append({"name": idx["name"], "symbol": idx["code"], "value": 0, "change": 0, "up": True})
            else:
                results.append({"name": idx["name"], "symbol": idx["code"], "value": 0, "change": 0, "up": True})

        return ApiResponse(success=True, data=results)
    except Exception as e:
        logger.error("market_indices_error", error=str(e))
        return ApiResponse(success=True, data=[])


@router.get("/news", response_model=ApiResponse[list])
async def get_news(num: int = Query(10, ge=1, le=30)) -> ApiResponse[list]:
    """Get latest finance news from Sina finance."""
    try:
        async with httpx.AsyncClient(trust_env=False, timeout=8) as client:
            resp = await client.get(
                "https://feed.mix.sina.com.cn/api/roll/get",
                params={"pageid": 153, "lid": 2516, "num": num, "page": 1},
            )
            data = resp.json()

        news = []
        for item in data.get("result", {}).get("data", []):
            title = item.get("title", "").strip()
            if not title:
                continue
            ctime = int(item.get("ctime", 0))
            time_str = datetime.fromtimestamp(ctime).strftime("%H:%M") if ctime else ""
            url = item.get("url", "")
            intro = item.get("intro", "")[:100] if item.get("intro") else ""
            news.append({
                "title": title,
                "time": time_str,
                "url": url,
                "summary": intro,
                "source": "新浪财经",
            })

        return ApiResponse(success=True, data=news)
    except Exception as e:
        logger.error("market_news_error", error=str(e))
        return ApiResponse(success=True, data=[])
