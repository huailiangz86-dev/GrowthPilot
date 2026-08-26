import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PersonaSnapshot(Base):
    __tablename__ = "persona_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    period: Mapped[str] = mapped_column(String(8), nullable=False)  # YYYY-MM

    # Persona type (Red Line R-08: positive naming only)
    persona_type: Mapped[str] = mapped_column(String(32), nullable=False)

    # 5-dimension scores (0-100 each)
    # {"risk_appetite":70, "time_frame":40, "emotion_stability":85, "decision_speed":60, "market_sensitivity":50}
    dimensions: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Raw scores and analysis from AI
    raw_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Growth direction (strengths + areas to improve)
    growth_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
