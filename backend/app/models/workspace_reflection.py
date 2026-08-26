"""Workspace-first daily reflection current-state model."""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkspaceReflection(Base):
    __tablename__ = "workspace_reflections"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", "reflection_key", name="uq_workspace_reflection_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    reflection_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    reflection_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reflection_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    energy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    intention: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wins: Mapped[str | None] = mapped_column(Text, nullable=True)
    friction: Mapped[str | None] = mapped_column(Text, nullable=True)
    adjustment: Mapped[str | None] = mapped_column(Text, nullable=True)
    mood: Mapped[str | None] = mapped_column(String(32), nullable=True)
    micro_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    micro_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_makeup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
