"""Immutable imported sources and independently retained excerpt provenance."""
import uuid
from datetime import UTC, datetime
from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class LearningMaterial(Base):
    __tablename__ = "learning_materials"
    __table_args__ = (UniqueConstraint("user_id", "request_id", name="uq_learning_material_request"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace_learning_items.id"), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    fingerprint: Mapped[str] = mapped_column(String(64))
    checksum: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(240))
    kind: Mapped[str] = mapped_column(String(16))
    filename: Mapped[str] = mapped_column(String(240))
    source_url: Mapped[str | None] = mapped_column(String(2000))
    byte_count: Mapped[int] = mapped_column(Integer)
    original: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    extraction: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(500))
    attempts: Mapped[int] = mapped_column(Integer)
    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    parser_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class LearningMaterialExcerpt(Base):
    __tablename__ = "learning_material_excerpts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    material_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learning_materials.id"), index=True)
    revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("personal_document_revisions.id"), unique=True)
    content: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
