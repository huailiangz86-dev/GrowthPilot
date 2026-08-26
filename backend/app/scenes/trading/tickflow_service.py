"""TickFlow integration — A/HK/US stock search via TickFlow SDK.

Free tier: instrument info + daily K-lines (no realtime).
"""

import asyncio
import json
import os

import structlog

from app.core.redis import get_redis

logger = structlog.get_logger()

CACHE_KEY = "tickflow:all_symbols"
CACHE_TTL = 86400  # 24h


def _clear_proxy():
    for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
        os.environ.pop(k, None)


def _get_tf():
    _clear_proxy()
    from tickflow import TickFlow
    return TickFlow.free()


async def refresh_tickflow_cache() -> dict:
    """Fetch all securities from TickFlow exchanges and cache to Redis."""
    redis = await get_redis()

    def _fetch():
        tf = _get_tf()
        all_symbols = []
        exchanges = tf.exchanges.list()
        for ex in exchanges:
            try:
                secs = tf.exchanges.get_instruments(ex["exchange"])
                for s in secs:
                    mkt = "HK" if ex["exchange"] == "HK" else ("US" if ex["exchange"] == "US" else "A")
                    all_symbols.append({
                        "code": s.get("code", ""),
                        "name": s.get("name", ""),
                        "symbol": s.get("symbol", ""),
                        "market": mkt,
                    })
            except Exception as e:
                logger.warning("tickflow_exchange_error", exchange=ex["exchange"], error=str(e))
        return all_symbols

    symbols = await asyncio.to_thread(_fetch)
    if symbols:
        await redis.setex(CACHE_KEY, CACHE_TTL, json.dumps(symbols, ensure_ascii=False))
    logger.info("tickflow_cache_refreshed", count=len(symbols))
    return {"total": len(symbols)}


async def search_symbols_tickflow(query: str, market: str = "ALL", limit: int = 10) -> list[dict]:
    """Search symbols from cached TickFlow data."""
    redis = await get_redis()
    cached = await redis.get(CACHE_KEY)

    if not cached:
        await refresh_tickflow_cache()
        cached = await redis.get(CACHE_KEY)
        if not cached:
            return []

    all_symbols = json.loads(cached)
    query_lower = query.lower()

    results = []
    for s in all_symbols:
        if market != "ALL" and s["market"] != market:
            continue
        if (query_lower in s["code"].lower()
                or query_lower in s["name"].lower()
                or query_lower in s["symbol"].lower()):
            results.append(s)
            if len(results) >= limit * 2:
                break

    results.sort(key=lambda x: (0 if x["code"].lower() == query_lower else 1, x["code"]))
    return results[:limit]


async def get_instrument(symbol: str) -> dict | None:
    """Get instrument info for a specific symbol."""
    try:
        return await asyncio.to_thread(lambda: _get_tf().instruments.get(symbol))
    except Exception as e:
        logger.error("tickflow_instrument_error", symbol=symbol, error=str(e))
        return None
