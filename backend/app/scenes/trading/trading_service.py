"""Trading scene plugin — encrypts prices, pairs buy/sell, calculates PnL.

Uses the universal record_engine underneath. Only adds trading-specific logic.
Does NOT duplicate CRUD — delegates to engines/record_engine.
"""

from datetime import datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_float, encrypt_float
from app.engines.record_engine import create_record, get_record
from app.models.record import Record

logger = structlog.get_logger()


async def create_trading_record(
    session: AsyncSession,
    user_id: str,
    symbol: str,
    symbol_name: str,
    market: str,
    direction: str,  # BUY / SELL
    price: float,
    quantity: float | None,
    tags: list[dict],
    emotion: str | None,
    occurred_at: datetime,
    sell_price: float | None = None,
    attachments: list[dict] | None = None,
) -> Record:
    """Create a trading record with encrypted price fields (Red Line R-02)."""
    content = {
        "symbol": symbol,
        "symbol_name": symbol_name,
        "market": market,
        "direction": direction,
        "price_enc": encrypt_float(price),
        "quantity_enc": encrypt_float(quantity) if quantity else None,
    }

    if sell_price is not None:
        content["sell_price_enc"] = encrypt_float(sell_price)
        pnl = (sell_price - price) * (quantity or 1)
        pnl_pct = ((sell_price - price) / price) * 100 if price > 0 else 0
        content["pnl"] = round(pnl, 2)
        content["pnl_pct"] = round(pnl_pct, 2)

    title = f"{symbol_name} {'买入' if direction == 'BUY' else '卖出'}"

    return await create_record(
        session=session, user_id=user_id,
        scene="trading", record_type=direction.lower(),
        title=title, content=content,
        tags=tags, emotion=emotion,
        occurred_at=occurred_at, attachments=attachments,
    )


async def complete_trade(
    session: AsyncSession,
    user_id: str,
    buy_record_id: str,
    sell_price: float,
    sell_time: datetime,
    sell_tags: list[dict] | None = None,
    sell_emotion: str | None = None,
) -> dict:
    """Complete a trade by adding sell info. Calculates PnL."""
    buy_record = await get_record(session, user_id, buy_record_id)
    if buy_record is None:
        return {"error": "Buy record not found"}
    if buy_record.scene != "trading":
        return {"error": "Not a trading record"}

    content = dict(buy_record.content)
    buy_price = decrypt_float(content["price_enc"])
    quantity = decrypt_float(content["quantity_enc"]) if content.get("quantity_enc") else 1

    content["sell_price_enc"] = encrypt_float(sell_price)
    content["sell_time"] = sell_time.isoformat()
    pnl = (sell_price - buy_price) * quantity
    pnl_pct = ((sell_price - buy_price) / buy_price) * 100 if buy_price > 0 else 0
    content["pnl"] = round(pnl, 2)
    content["pnl_pct"] = round(pnl_pct, 2)

    # Merge sell tags into existing tags
    all_tags = list(buy_record.tags)
    if sell_tags:
        all_tags.extend(sell_tags)

    buy_record.content = content
    buy_record.tags = all_tags
    if sell_emotion:
        buy_record.emotion = sell_emotion
    await session.commit()

    holding_days = (sell_time - buy_record.occurred_at).days

    return {
        "record_id": str(buy_record.id),
        "symbol_name": content["symbol_name"],
        "buy_price": buy_price,
        "sell_price": sell_price,
        "pnl": content["pnl"],
        "pnl_pct": content["pnl_pct"],
        "holding_days": holding_days,
        "is_win": sell_price > buy_price,
    }


def decrypt_trading_content(content: dict) -> dict:
    """Decrypt trading content for display."""
    result = dict(content)
    if "price_enc" in result:
        result["price"] = decrypt_float(result.pop("price_enc"))
    if "quantity_enc" in result and result["quantity_enc"]:
        result["quantity"] = decrypt_float(result.pop("quantity_enc"))
    else:
        result.pop("quantity_enc", None)
    if "sell_price_enc" in result and result["sell_price_enc"]:
        result["sell_price"] = decrypt_float(result.pop("sell_price_enc"))
    else:
        result.pop("sell_price_enc", None)
    return result
