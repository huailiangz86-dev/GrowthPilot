"""Persist personal Agent conversations, retry leases and confirmed actions."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a4c8d9e0f1b2"
down_revision = "f3b7c8d9e0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("agent_conversations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_agent_conversations_user_id", "agent_conversations", ["user_id"])
    op.create_index("ix_agent_conversations_workspace_id", "agent_conversations", ["workspace_id"])
    op.create_table("agent_turns",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), sa.ForeignKey("agent_conversations.id"), nullable=False),
        sa.Column("client_request_id", sa.UUID(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reply", sa.Text(), nullable=True),
        sa.Column("error", sa.String(240), nullable=True),
        sa.Column("context_refs", postgresql.JSONB(), nullable=False),
        sa.Column("citations", postgresql.JSONB(), nullable=False),
        sa.Column("suggestion", postgresql.JSONB(), nullable=True),
        sa.Column("confirmed_task_id", sa.UUID(), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("attempt_id", sa.UUID(), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prompt_version", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "client_request_id", name="uq_agent_turn_request"))
    op.create_index("ix_agent_turns_conversation_id", "agent_turns", ["conversation_id"])


def downgrade() -> None:
    op.drop_table("agent_turns")
    op.drop_table("agent_conversations")
