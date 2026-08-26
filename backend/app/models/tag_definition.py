"""Tag definitions — system presets + user custom tags."""

import uuid

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TagDefinition(Base):
    __tablename__ = "tag_definitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # NULL = system preset
    scene: Mapped[str] = mapped_column(String(32), nullable=False)  # trading / career / all
    category: Mapped[str] = mapped_column(String(32), nullable=False)  # buy_reason / sell_reason / emotion
    value: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
