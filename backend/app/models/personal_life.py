"""Personal life facts are owned by a person; workspaces only reference them."""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LifeRecord(Base):
    __tablename__ = "life_records"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    domain: Mapped[str] = mapped_column(String(24), default="fitness")
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class PersonalHabit(Base):
    __tablename__ = "personal_habits"
    __table_args__ = (UniqueConstraint("user_id", "domain", name="uq_personal_habit_domain"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    domain: Mapped[str] = mapped_column(String(24), default="fitness")
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class LifeRevision(Base):
    __tablename__ = "life_revisions"
    __table_args__ = (
        CheckConstraint("num_nonnulls(record_id, habit_id) = 1", name="ck_life_revision_owner"),
        UniqueConstraint("record_id", "version", name="uq_life_record_version"),
        UniqueConstraint("habit_id", "version", name="uq_life_habit_version"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    record_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("life_records.id"), index=True)
    habit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("personal_habits.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONB)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class LifeWorkspaceReference(Base):
    __tablename__ = "life_workspace_references"
    __table_args__ = (UniqueConstraint("record_id", "workspace_id", name="uq_life_workspace_reference"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    record_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("life_records.id"), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LifeCommandReceipt(Base):
    __tablename__ = "life_command_receipts"
    __table_args__ = (UniqueConstraint("user_id", "request_id", name="uq_life_command_request"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    fingerprint: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
