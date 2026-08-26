"""add workspace goals

Revision ID: a72f1d3e8b04
Revises: f19a7c5d3b02
Create Date: 2026-08-17 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a72f1d3e8b04"
down_revision: Union[str, None] = "f19a7c5d3b02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("goals", sa.Column("id", sa.UUID(), nullable=False), sa.Column("user_id", sa.UUID(), nullable=False), sa.Column("workspace_id", sa.UUID(), nullable=False), sa.Column("project_id", sa.UUID(), nullable=True), sa.Column("title", sa.String(length=240), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("dimension", sa.String(length=32), nullable=True), sa.Column("goal_type", sa.String(length=32), nullable=True), sa.Column("due_at", sa.DateTime(timezone=True), nullable=True), sa.Column("importance", sa.Integer(), nullable=True), sa.Column("target_metric", postgresql.JSONB(astext_type=sa.Text()), nullable=True), sa.Column("progress", sa.Integer(), nullable=False), sa.Column("status", sa.String(length=16), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True), sa.ForeignKeyConstraint(["project_id"], ["projects.id"]), sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_goals_user_id"), "goals", ["user_id"], unique=False)
    op.create_index(op.f("ix_goals_workspace_id"), "goals", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_goals_project_id"), "goals", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_goals_project_id"), table_name="goals")
    op.drop_index(op.f("ix_goals_workspace_id"), table_name="goals")
    op.drop_index(op.f("ix_goals_user_id"), table_name="goals")
    op.drop_table("goals")
