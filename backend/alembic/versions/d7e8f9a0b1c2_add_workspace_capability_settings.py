"""add workspace capability settings

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-08-17 20:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_capability_settings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("capability_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["capability_id"], ["capability_registry.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "workspace_id",
            "capability_id",
            name="uq_workspace_capability_setting",
        ),
    )
    op.create_index(
        op.f("ix_workspace_capability_settings_user_id"),
        "workspace_capability_settings",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workspace_capability_settings_workspace_id"),
        "workspace_capability_settings",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workspace_capability_settings_capability_id"),
        "workspace_capability_settings",
        ["capability_id"],
        unique=False,
    )
    op.execute(
        "UPDATE capability_registry SET status = 'available' "
        "WHERE slug IN ('research-skill', 'growth-coach-agent') AND status = 'enabled'"
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_workspace_capability_settings_capability_id"),
        table_name="workspace_capability_settings",
    )
    op.drop_index(
        op.f("ix_workspace_capability_settings_workspace_id"),
        table_name="workspace_capability_settings",
    )
    op.drop_index(
        op.f("ix_workspace_capability_settings_user_id"),
        table_name="workspace_capability_settings",
    )
    op.drop_table("workspace_capability_settings")
