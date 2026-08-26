"""add workspace knowledge cards

Revision ID: f2a6b7c8d9e0
Revises: e95a1d7b4c03
Create Date: 2026-08-17 17:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a6b7c8d9e0"
down_revision: Union[str, None] = "e95a1d7b4c03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_knowledge_cards",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("goal_id", sa.UUID(), nullable=True),
        sa.Column("learning_item_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_url", sa.String(length=2000), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workspace_knowledge_cards_user_id"), "workspace_knowledge_cards", ["user_id"], unique=False)
    op.create_index(op.f("ix_workspace_knowledge_cards_workspace_id"), "workspace_knowledge_cards", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_workspace_knowledge_cards_project_id"), "workspace_knowledge_cards", ["project_id"], unique=False)
    op.create_index(op.f("ix_workspace_knowledge_cards_goal_id"), "workspace_knowledge_cards", ["goal_id"], unique=False)
    op.create_index(op.f("ix_workspace_knowledge_cards_learning_item_id"), "workspace_knowledge_cards", ["learning_item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workspace_knowledge_cards_learning_item_id"), table_name="workspace_knowledge_cards")
    op.drop_index(op.f("ix_workspace_knowledge_cards_goal_id"), table_name="workspace_knowledge_cards")
    op.drop_index(op.f("ix_workspace_knowledge_cards_project_id"), table_name="workspace_knowledge_cards")
    op.drop_index(op.f("ix_workspace_knowledge_cards_workspace_id"), table_name="workspace_knowledge_cards")
    op.drop_index(op.f("ix_workspace_knowledge_cards_user_id"), table_name="workspace_knowledge_cards")
    op.drop_table("workspace_knowledge_cards")
