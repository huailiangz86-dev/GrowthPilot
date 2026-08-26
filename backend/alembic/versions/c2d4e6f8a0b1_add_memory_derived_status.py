"""add derived status to memory entries

Revision ID: c2d4e6f8a0b1
Revises: af1c2d3e4f50
Create Date: 2026-08-08 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c2d4e6f8a0b1"
down_revision: Union[str, None] = "af1c2d3e4f50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "memory_entries",
        sa.Column(
            "derived_status",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(
                '\'{"summary":"ready","entities":"pending","embedding":"pending"}\'::jsonb'
            ),
        ),
    )
    op.alter_column("memory_entries", "derived_status", server_default=None)


def downgrade() -> None:
    op.drop_column("memory_entries", "derived_status")
