"""add workspace learning items

Revision ID: e95a1d7b4c03
Revises: c68d4f8a1e02
Create Date: 2026-08-17 16:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e95a1d7b4c03"
down_revision: Union[str, None] = "c68d4f8a1e02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_learning_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("goal_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("progress_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workspace_learning_items_user_id"), "workspace_learning_items", ["user_id"], unique=False)
    op.create_index(op.f("ix_workspace_learning_items_workspace_id"), "workspace_learning_items", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_workspace_learning_items_project_id"), "workspace_learning_items", ["project_id"], unique=False)
    op.create_index(op.f("ix_workspace_learning_items_goal_id"), "workspace_learning_items", ["goal_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workspace_learning_items_goal_id"), table_name="workspace_learning_items")
    op.drop_index(op.f("ix_workspace_learning_items_project_id"), table_name="workspace_learning_items")
    op.drop_index(op.f("ix_workspace_learning_items_workspace_id"), table_name="workspace_learning_items")
    op.drop_index(op.f("ix_workspace_learning_items_user_id"), table_name="workspace_learning_items")
    op.drop_table("workspace_learning_items")
