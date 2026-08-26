"""add capability invocation audits

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-08-17 21:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=True),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("agent_name", sa.String(length=120), nullable=False),
        sa.Column("intent", sa.String(length=80), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("context_refs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("prompt_version", sa.String(length=80), nullable=True),
        sa.Column("llm_call_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_runs_user_id"), "agent_runs", ["user_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_workspace_id"), "agent_runs", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_agent_runs_project_id"), "agent_runs", ["project_id"], unique=False)
    op.create_table(
        "capability_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("capability_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("agent_run_id", sa.UUID(), nullable=True),
        sa.Column("input_summary", sa.Text(), nullable=False),
        sa.Column("permission_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("access_scope", sa.String(length=240), nullable=False),
        sa.Column("side_effect_level", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("output_ref", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["capability_id"], ["capability_registry.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_capability_runs_user_id"), "capability_runs", ["user_id"], unique=False)
    op.create_index(op.f("ix_capability_runs_capability_id"), "capability_runs", ["capability_id"], unique=False)
    op.create_index(op.f("ix_capability_runs_workspace_id"), "capability_runs", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_capability_runs_project_id"), "capability_runs", ["project_id"], unique=False)
    op.create_index(op.f("ix_capability_runs_agent_run_id"), "capability_runs", ["agent_run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_capability_runs_agent_run_id"), table_name="capability_runs")
    op.drop_index(op.f("ix_capability_runs_project_id"), table_name="capability_runs")
    op.drop_index(op.f("ix_capability_runs_workspace_id"), table_name="capability_runs")
    op.drop_index(op.f("ix_capability_runs_capability_id"), table_name="capability_runs")
    op.drop_index(op.f("ix_capability_runs_user_id"), table_name="capability_runs")
    op.drop_table("capability_runs")
    op.drop_index(op.f("ix_agent_runs_project_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_workspace_id"), table_name="agent_runs")
    op.drop_index(op.f("ix_agent_runs_user_id"), table_name="agent_runs")
    op.drop_table("agent_runs")
