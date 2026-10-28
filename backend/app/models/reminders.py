"""Device consent, persistent local-time schedule and push delivery outbox."""
import uuid
from datetime import UTC, datetime
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class PushSubscription(Base):
    __tablename__ = 'push_subscriptions'
    __table_args__ = (UniqueConstraint('user_id','workspace_id','endpoint_hash',name='uq_push_device_scope'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), index=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('workspaces.id'), index=True)
    endpoint_hash: Mapped[str] = mapped_column(String(64))
    subscription: Mapped[dict] = mapped_column(JSONB)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String(64))
    send_time: Mapped[str] = mapped_column(String(5))
    schedule_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

class ReminderDelivery(Base):
    __tablename__ = 'reminder_deliveries'
    __table_args__ = (UniqueConstraint('subscription_id','local_date','schedule_version',name='uq_reminder_day'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('push_subscriptions.id'), index=True)
    local_date: Mapped[object] = mapped_column(Date)
    schedule_version: Mapped[int] = mapped_column(Integer)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(24), default='pending')
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(240))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
