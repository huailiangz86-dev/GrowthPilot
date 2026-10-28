"""Durable per-version upload manifests and sanitized provider receipts."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourcePipeline(Base):
    __tablename__ = 'source_pipelines'
    __table_args__ = (UniqueConstraint('user_id', 'request_id', name='uq_source_pipeline_request'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    source_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('personal_source_versions.id'), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    mode: Mapped[str] = mapped_column(String(16))
    source_checksum: Mapped[str] = mapped_column(String(64))
    payload_checksum: Mapped[str] = mapped_column(String(64))
    byte_count: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(160))
    endpoint: Mapped[str | None] = mapped_column(String(100))
    workspace_id: Mapped[str | None] = mapped_column(String(160))
    index_id: Mapped[str | None] = mapped_column(String(160))
    category_id: Mapped[str | None] = mapped_column(String(160))
    state: Mapped[str] = mapped_column(String(16))
    lease_id: Mapped[str | None] = mapped_column(String(240))
    file_id: Mapped[str | None] = mapped_column(String(160))
    job_id: Mapped[str | None] = mapped_column(String(160))
    error: Mapped[str | None] = mapped_column(String(500))
    receipts: Mapped[list] = mapped_column(JSONB)
    operation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
