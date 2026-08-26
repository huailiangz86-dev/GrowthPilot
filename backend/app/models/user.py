import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wx_openid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    wx_unionid: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    nickname: Mapped[str] = mapped_column(String(64), default="")
    avatar_url: Mapped[str] = mapped_column(String(512), default="")
    markets: Mapped[list] = mapped_column(JSONB, default=["A"])  # ["A","HK","US","CRYPTO"]
    review_schedule: Mapped[str] = mapped_column(String(16), default="manual")  # post_trade/daily/manual
    review_time: Mapped[str | None] = mapped_column(String(8), nullable=True, default="20:00")
    watchlist: Mapped[list] = mapped_column(JSONB, default=list)  # ["600519","BTC","AAPL"]
    is_beta_user: Mapped[bool] = mapped_column(Boolean, default=False)
    beta_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
