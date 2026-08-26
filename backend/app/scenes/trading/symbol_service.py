"""Stock symbol data service — A-share + HK stock search with pinyin support."""

import asyncio
import json

import structlog
from pypinyin import Style, lazy_pinyin

from app.core.redis import get_redis

logger = structlog.get_logger()

REDIS_KEY_A = "symbols:a_share"
REDIS_KEY_HK = "symbols:hk"
REDIS_KEY_UPDATED = "symbols:last_updated"
CACHE_TTL = 86400  # 24 hours


def _pinyin_initials(name: str) -> str:
    """Get pinyin initials for a Chinese name. e.g. '贵州茅台' → 'gzmt'"""
    return "".join(lazy_pinyin(name, style=Style.FIRST_LETTER))


def _pinyin_full(name: str) -> str:
    """Get full pinyin. e.g. '贵州茅台' → 'guizhoumaotai'"""
    return "".join(lazy_pinyin(name))


async def refresh_symbol_cache() -> dict[str, int]:
    """Fetch A-share and HK stock lists from AKShare, cache to Redis.

    Returns {"a_share": count, "hk": count}.
    """
    redis = await get_redis()

    # Run AKShare calls in thread pool (they are sync/blocking)
    a_shares = await asyncio.to_thread(_fetch_a_shares)
    hk_shares = await asyncio.to_thread(_fetch_hk_shares)

    # Store as Redis hash: code → json({name, pinyin_initials, pinyin_full, market})
    if a_shares:
        pipe = redis.pipeline()
        await pipe.delete(REDIS_KEY_A)
        for item in a_shares:
            await pipe.hset(REDIS_KEY_A, item["code"], json.dumps(item, ensure_ascii=False))
        await pipe.execute()

    if hk_shares:
        pipe = redis.pipeline()
        await pipe.delete(REDIS_KEY_HK)
        for item in hk_shares:
            await pipe.hset(REDIS_KEY_HK, item["code"], json.dumps(item, ensure_ascii=False))
        await pipe.execute()

    from datetime import UTC, datetime

    await redis.set(REDIS_KEY_UPDATED, datetime.now(UTC).isoformat())

    counts = {"a_share": len(a_shares), "hk": len(hk_shares)}
    logger.info("symbol_cache_refreshed", **counts)
    return counts


def _fetch_a_shares() -> list[dict]:
    """Fetch A-share stock list via AKShare."""
    try:
        import akshare as ak

        df = ak.stock_zh_a_spot_em()
        results = []
        for _, row in df.iterrows():
            code = str(row.get("代码", "")).strip()
            name = str(row.get("名称", "")).strip()
            if not code or not name:
                continue
            results.append({
                "code": code,
                "name": name,
                "market": "A",
                "pinyin_initials": _pinyin_initials(name),
                "pinyin_full": _pinyin_full(name),
            })
        return results
    except Exception as e:
        logger.error("fetch_a_shares_failed", error=str(e))
        return []


def _fetch_hk_shares() -> list[dict]:
    """Fetch HK stock list via AKShare."""
    try:
        import akshare as ak

        df = ak.stock_hk_spot_em()
        results = []
        for _, row in df.iterrows():
            code = str(row.get("代码", "")).strip()
            name = str(row.get("名称", "")).strip()
            if not code or not name:
                continue
            results.append({
                "code": code,
                "name": name,
                "market": "HK",
                "pinyin_initials": _pinyin_initials(name),
                "pinyin_full": _pinyin_full(name),
            })
        return results
    except Exception as e:
        logger.error("fetch_hk_shares_failed", error=str(e))
        return []


async def search_symbols(query: str, market: str = "ALL", limit: int = 10) -> list[dict]:
    """Search symbols by code, name, or pinyin.

    Supports:
    - Code prefix: "6006" → matches 600600, 600601, ...
    - Name prefix: "茅" → matches 贵州茅台
    - Pinyin initials: "gzmt" → matches 贵州茅台
    - Pinyin full: "maotai" → matches 贵州茅台
    """
    redis = await get_redis()
    query = query.strip().lower()
    if not query:
        return []

    results: list[dict] = []
    keys = []
    if market in ("A", "ALL"):
        keys.append(REDIS_KEY_A)
    if market in ("HK", "ALL"):
        keys.append(REDIS_KEY_HK)

    for redis_key in keys:
        # Scan all symbols in this market (OK for <10K items)
        all_symbols = await redis.hgetall(redis_key)
        for _code, raw in all_symbols.items():
            item = json.loads(raw)
            code_lower = item["code"].lower()
            name_lower = item["name"].lower()
            pinyin_init = item.get("pinyin_initials", "")
            pinyin_f = item.get("pinyin_full", "")

            if (
                code_lower.startswith(query)
                or query in name_lower
                or pinyin_init.startswith(query)
                or query in pinyin_f
            ):
                results.append(item)
                if len(results) >= limit:
                    return results

    return results


async def is_cache_fresh() -> bool:
    """Check if symbol cache exists and is less than 24h old."""
    redis = await get_redis()
    updated = await redis.get(REDIS_KEY_UPDATED)
    if not updated:
        return False

    from datetime import UTC, datetime

    last = datetime.fromisoformat(updated)
    age = (datetime.now(UTC) - last).total_seconds()
    return age < CACHE_TTL
