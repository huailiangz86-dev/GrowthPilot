"""Durable, explicitly requested help for one item, with frozen sources."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ItemHelp(Base):
    __tablename__ = "item_help"
    __table_args__ = (UniqueConstraint("user_id", "request_id", name="uq_item_help_request"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workspaces.id"), index=True)
    item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workspace_learning_items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    fingerprint: Mapped[str] = mapped_column(String(64))
    input: Mapped[dict] = mapped_column(JSONB)
    source: Mapped[dict] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(500))
    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    lease_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prompt_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
