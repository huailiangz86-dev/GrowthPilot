"""D6 immutable sourced questions, actual recall attempts and personal reflection."""
import uuid
from datetime import UTC, date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, String, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class LearningReviewUnit(Base):
    __tablename__ = 'learning_review_units'
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('workspaces.id'), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('workspace_learning_items.id'), index=True)
    question: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(16))
    source: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class LearningReviewAttempt(Base):
    __tablename__ = 'learning_review_attempts'
    __table_args__ = (CheckConstraint("status IN ('answered','completed')", name='ck_learning_review_attempt_status'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('workspaces.id'), index=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('learning_review_units.id'), index=True)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    answer: Mapped[str] = mapped_column(Text)
    did_not_recall: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(16))
    rating: Mapped[str | None] = mapped_column(String(16))
    understanding: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[str | None] = mapped_column(Text)
    next_action: Mapped[str | None] = mapped_column(Text)
    next_review_date: Mapped[date | None] = mapped_column(Date)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
