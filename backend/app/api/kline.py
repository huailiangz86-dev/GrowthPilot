"""K-line API — historical candlestick data for trade review."""

import os
from datetime import UTC

import structlog
from fastapi import APIRouter, Query

from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/kline", tags=["kline"])


def _clear_proxy():
    for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
        os.environ.pop(k, None)


@router.get("", response_model=ApiResponse[dict])
async def get_kline(
    symbol: str = Query(...),
    period: str = Query("1d"),
    count: int = Query(60, ge=10, le=200),
    trade_date: str | None = Query(None),
) -> ApiResponse[dict]:
    import asyncio

    def _fetch():
        try:
            _clear_proxy()
            from tickflow import TickFlow
            tf = TickFlow.free()

            info = tf.instruments.get(symbol)
            name = info.get("name", "") if info else symbol

            klines_raw = tf.klines.get(symbol, period=period, count=count)
            if klines_raw is None:
                return {"symbol": symbol, "name": name, "klines": [], "trade_date": trade_date}

            # TickFlow returns columnar dict: {timestamp:[], open:[], close:[], ...}
            data = []
            if isinstance(klines_raw, dict) and "timestamp" in klines_raw:
                from datetime import datetime
                timestamps = klines_raw.get("timestamp", [])
                opens = klines_raw.get("open", [])
                highs = klines_raw.get("high", [])
                lows = klines_raw.get("low", [])
                closes = klines_raw.get("close", [])
                volumes = klines_raw.get("volume", [])
                for i in range(len(timestamps)):
                    dt = datetime.fromtimestamp(timestamps[i] / 1000, tz=UTC)
                    data.append({
                        "date": dt.strftime("%Y-%m-%d"),
                        "open": round(float(opens[i]), 2) if i < len(opens) else 0,
                        "high": round(float(highs[i]), 2) if i < len(highs) else 0,
                        "low": round(float(lows[i]), 2) if i < len(lows) else 0,
                        "close": round(float(closes[i]), 2) if i < len(closes) else 0,
                        "volume": int(volumes[i]) if i < len(volumes) else 0,
                    })

            return {
                "symbol": symbol,
                "name": name,
                "period": period,
                "count": len(data),
                "klines": data,
                "trade_date": trade_date,
            }
        except Exception as e:
            logger.error("kline_fetch_error", symbol=symbol, error=str(e))
            return {"symbol": symbol, "name": symbol, "klines": [], "trade_date": trade_date, "error": str(e)}

    result = await asyncio.to_thread(_fetch)
    return ApiResponse(success=True, data=result)
