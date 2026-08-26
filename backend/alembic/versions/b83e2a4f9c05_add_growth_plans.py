"""add growth plans

Revision ID: b83e2a4f9c05
Revises: a72f1d3e8b04
Create Date: 2026-08-17 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b83e2a4f9c05"
down_revision: Union[str, None] = "a72f1d3e8b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("growth_plans", sa.Column("id", sa.UUID(), nullable=False), sa.Column("user_id", sa.UUID(), nullable=False), sa.Column("workspace_id", sa.UUID(), nullable=False), sa.Column("goal_id", sa.UUID(), nullable=False), sa.Column("project_id", sa.UUID(), nullable=True), sa.Column("title", sa.String(length=240), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("period_type", sa.String(length=16), nullable=False), sa.Column("total_weeks", sa.Integer(), nullable=True), sa.Column("current_week", sa.Integer(), nullable=True), sa.Column("milestones", postgresql.JSONB(astext_type=sa.Text()), nullable=False), sa.Column("progress", sa.Integer(), nullable=False), sa.Column("status", sa.String(length=16), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True), sa.ForeignKeyConstraint(["goal_id"], ["goals.id"]), sa.ForeignKeyConstraint(["project_id"], ["projects.id"]), sa.ForeignKeyConstraint(["user_id"], ["users.id"]), sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_growth_plans_user_id"), "growth_plans", ["user_id"], unique=False)
    op.create_index(op.f("ix_growth_plans_workspace_id"), "growth_plans", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_growth_plans_goal_id"), "growth_plans", ["goal_id"], unique=False)
    op.create_index(op.f("ix_growth_plans_project_id"), "growth_plans", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_growth_plans_project_id"), table_name="growth_plans")
    op.drop_index(op.f("ix_growth_plans_goal_id"), table_name="growth_plans")
    op.drop_index(op.f("ix_growth_plans_workspace_id"), table_name="growth_plans")
    op.drop_index(op.f("ix_growth_plans_user_id"), table_name="growth_plans")
    op.drop_table("growth_plans")
