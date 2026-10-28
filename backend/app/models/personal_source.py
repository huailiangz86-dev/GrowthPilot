"""Person-owned sources and immutable originals, independent of a workspace or learning item."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PersonalSource(Base):
    __tablename__ = "personal_sources"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PersonalSourceVersion(Base):
    __tablename__ = "personal_source_versions"
    __table_args__ = (
        UniqueConstraint("user_id", "request_id", name="uq_personal_source_request"),
        UniqueConstraint("source_id", "version", name="uq_personal_source_version"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("personal_sources.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    fingerprint: Mapped[str] = mapped_column(String(64))
    checksum: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(240))
    category: Mapped[str] = mapped_column(String(16))
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
    parser_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
