"""add workspace reflections

Revision ID: c68d4f8a1e02
Revises: b83e2a4f9c05
Create Date: 2026-08-17 15:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c68d4f8a1e02"
down_revision: Union[str, None] = "b83e2a4f9c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_reflections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("goal_id", sa.UUID(), nullable=True),
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("reflection_type", sa.String(length=16), nullable=False),
        sa.Column("reflection_date", sa.Date(), nullable=False),
        sa.Column("reflection_key", sa.String(length=32), nullable=True),
        sa.Column("energy", sa.Integer(), nullable=True),
        sa.Column("intention", sa.Text(), nullable=True),
        sa.Column("completion", sa.Integer(), nullable=True),
        sa.Column("wins", sa.Text(), nullable=True),
        sa.Column("friction", sa.Text(), nullable=True),
        sa.Column("adjustment", sa.Text(), nullable=True),
        sa.Column("mood", sa.String(length=32), nullable=True),
        sa.Column("micro_type", sa.String(length=16), nullable=True),
        sa.Column("micro_status", sa.String(length=16), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("is_makeup", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "workspace_id", "reflection_key", name="uq_workspace_reflection_key"),
    )
    op.create_index(op.f("ix_workspace_reflections_user_id"), "workspace_reflections", ["user_id"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_workspace_id"), "workspace_reflections", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_project_id"), "workspace_reflections", ["project_id"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_goal_id"), "workspace_reflections", ["goal_id"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_task_id"), "workspace_reflections", ["task_id"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_reflection_type"), "workspace_reflections", ["reflection_type"], unique=False)
    op.create_index(op.f("ix_workspace_reflections_reflection_date"), "workspace_reflections", ["reflection_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workspace_reflections_reflection_date"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_reflection_type"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_task_id"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_goal_id"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_project_id"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_workspace_id"), table_name="workspace_reflections")
    op.drop_index(op.f("ix_workspace_reflections_user_id"), table_name="workspace_reflections")
    op.drop_table("workspace_reflections")
