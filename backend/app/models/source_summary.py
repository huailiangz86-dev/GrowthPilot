"""A person-owned summary request, frozen evidence, and explicit saved adoption."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceSummary(Base):
    __tablename__ = 'source_summaries'
    __table_args__ = (
        UniqueConstraint('user_id', 'request_id', name='uq_source_summary_request'),
        CheckConstraint("status IN ('processing','failed','completed')", name='ck_source_summary_status'),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    fingerprint: Mapped[str] = mapped_column(String(64))
    input: Mapped[dict] = mapped_column(JSONB)
    source: Mapped[list] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB)
    saved: Mapped[dict | None] = mapped_column(JSONB)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(500))
    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prompt_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

