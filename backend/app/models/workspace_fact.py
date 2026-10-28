"""Explicit learning time and final action feedback, distinct from estimates."""
import uuid
from datetime import UTC, date, datetime
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class WorkspaceFact(Base):
    __tablename__ = "workspace_facts"
    __table_args__ = (
        UniqueConstraint("task_id", name="uq_workspace_fact_task_feedback"),
        CheckConstraint("(kind = 'learning' AND minutes IS NOT NULL AND minutes BETWEEN 1 AND 1440 AND task_id IS NULL) OR (kind = 'feedback' AND minutes IS NULL AND task_id IS NOT NULL)", name="ck_workspace_fact_shape"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

class AnalysisSnapshot(Base):
    __tablename__ = "analysis_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(8), nullable=False)
    anchor: Mapped[date] = mapped_column(Date, nullable=False)
    report: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_refs: Mapped[list] = mapped_column(JSONB, nullable=False)
    enabled_sources: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
