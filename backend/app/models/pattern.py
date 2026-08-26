"""AI Pattern Discovery results."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PatternDiscovery(Base):
    __tablename__ = "pattern_discoveries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    scene: Mapped[str] = mapped_column(String(32), nullable=False)
    pattern_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # tag_winrate / time_pattern / holding_pattern / emotion_pattern / streak_pattern
    title: Mapped[str] = mapped_column(String(200), nullable=False)  # "抄底胜率仅28%"
    description: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)  # statistical data
    sample_size: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)  # positive / negative / neutral
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
