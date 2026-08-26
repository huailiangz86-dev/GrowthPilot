"""Universal Review model — template-based, scene-agnostic."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    scene: Mapped[str] = mapped_column(String(32), nullable=False)
    template: Mapped[str] = mapped_column(String(32), nullable=False)  # trading_daily / trading_post / project

    # Review content (universal three questions)
    did_right: Mapped[str | None] = mapped_column(Text, nullable=True)
    did_wrong: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    tags: Mapped[list] = mapped_column(JSONB, default=list)
    attachments: Mapped[list] = mapped_column(JSONB, default=list)

    # AI analysis
    ai_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_conversation: Mapped[list] = mapped_column(JSONB, default=list)

    # Linked records
    linked_record_ids: Mapped[list] = mapped_column(JSONB, default=list)

    review_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
