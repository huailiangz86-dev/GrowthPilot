"""add knowledge card task link

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-17 19:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workspace_knowledge_cards", sa.Column("task_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_workspace_knowledge_cards_task_id_tasks",
        "workspace_knowledge_cards",
        "tasks",
        ["task_id"],
        ["id"],
    )
    op.create_index(op.f("ix_workspace_knowledge_cards_task_id"), "workspace_knowledge_cards", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workspace_knowledge_cards_task_id"), table_name="workspace_knowledge_cards")
    op.drop_constraint("fk_workspace_knowledge_cards_task_id_tasks", "workspace_knowledge_cards", type_="foreignkey")
    op.drop_column("workspace_knowledge_cards", "task_id")
