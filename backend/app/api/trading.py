from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException
from app.scenes.trading.trading_service import complete_trade, create_trading_record, decrypt_trading_content
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/trading", tags=["trading"])


class TradingRecordRequest(BaseModel):
    symbol: str = Field(..., max_length=16)
    symbol_name: str = Field(..., max_length=64)
    market: str = Field(..., pattern=r"^(A|HK|US|CRYPTO)$")
    direction: str = Field(..., pattern=r"^(BUY|SELL)$")
    price: float = Field(..., gt=0)
    quantity: float | None = Field(None, gt=0)
    tags: list[dict] = Field(default_factory=list)
    emotion: str | None = None
    occurred_at: datetime
    sell_price: float | None = Field(None, gt=0)


class CompleteTradeRequest(BaseModel):
    sell_price: float = Field(..., gt=0)
    sell_time: datetime
    sell_tags: list[dict] | None = None
    sell_emotion: str | None = None


@router.post("/record", response_model=ApiResponse[dict])
async def create_trade(
    payload: TradingRecordRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Create a trading record with encrypted prices and structured tags."""
    record = await create_trading_record(
        session=session, user_id=user_id,
        symbol=payload.symbol, symbol_name=payload.symbol_name,
        market=payload.market, direction=payload.direction,
        price=payload.price, quantity=payload.quantity,
        tags=payload.tags, emotion=payload.emotion,
        occurred_at=payload.occurred_at, sell_price=payload.sell_price,
    )
    return ApiResponse(success=True, data={
        "id": str(record.id),
        "title": record.title,
        "content": decrypt_trading_content(record.content),
        "tags": record.tags,
        "emotion": record.emotion,
        "proof_hash_short": record.proof_hash[:8],
    })


@router.post("/{record_id}/complete", response_model=ApiResponse[dict])
async def complete(
    record_id: str,
    payload: CompleteTradeRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Complete a trade by adding sell info + calculate PnL."""
    result = await complete_trade(
        session=session, user_id=user_id,
        buy_record_id=record_id,
        sell_price=payload.sell_price, sell_time=payload.sell_time,
        sell_tags=payload.sell_tags, sell_emotion=payload.sell_emotion,
    )
    if "error" in result:
        raise AppException("TRADE_ERROR", result["error"], 400)
    return ApiResponse(success=True, data=result)
