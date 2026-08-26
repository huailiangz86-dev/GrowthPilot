"""add knowledge card ai summaries

Revision ID: a4b5c6d7e8f9
Revises: f2a6b7c8d9e0
Create Date: 2026-08-17 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f2a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workspace_knowledge_cards",
        sa.Column("ai_status", sa.String(length=24), nullable=False, server_default="not_requested"),
    )
    op.add_column("workspace_knowledge_cards", sa.Column("ai_summary", sa.Text(), nullable=True))
    op.add_column(
        "workspace_knowledge_cards",
        sa.Column("ai_concepts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "workspace_knowledge_cards",
        sa.Column("ai_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column("workspace_knowledge_cards", sa.Column("ai_processed_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("workspace_knowledge_cards", "ai_status", server_default=None)
    op.alter_column("workspace_knowledge_cards", "ai_concepts", server_default=None)
    op.alter_column("workspace_knowledge_cards", "ai_tags", server_default=None)


def downgrade() -> None:
    op.drop_column("workspace_knowledge_cards", "ai_processed_at")
    op.drop_column("workspace_knowledge_cards", "ai_tags")
    op.drop_column("workspace_knowledge_cards", "ai_concepts")
    op.drop_column("workspace_knowledge_cards", "ai_summary")
    op.drop_column("workspace_knowledge_cards", "ai_status")
