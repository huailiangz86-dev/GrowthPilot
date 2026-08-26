"""Universal Record model — scene-agnostic, extensible via content JSONB + tags JSONB."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Record(Base):
    __tablename__ = "records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # Scene routing
    scene: Mapped[str] = mapped_column(String(32), nullable=False)  # trading / career / skill
    record_type: Mapped[str] = mapped_column(String(32), nullable=False)  # buy / sell / project / course

    # Universal fields
    title: Mapped[str] = mapped_column(String(200), nullable=False)  # "贵州茅台 买入"
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # scene-specific data

    # Tags — THE core data structure for pattern discovery
    # [{"category":"buy_reason","value":"突破前高"}, {"category":"emotion","value":"平静"}]
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    emotion: Mapped[str | None] = mapped_column(String(16), nullable=True)  # shortcut for quick filter

    # Timing
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Proof of record
    proof_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    proof_ts: Mapped[int] = mapped_column(Integer, nullable=False)

    # Attachments: [{"type":"image","key":"oss://..."}]
    attachments: Mapped[list] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
