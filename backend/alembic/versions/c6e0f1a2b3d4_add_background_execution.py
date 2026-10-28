"""Durable execution, source URLs and scoped calendar feeds."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c6e0f1a2b3d4"
down_revision = "b5d9e0f1a2c3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("growth_plans", sa.Column("execution_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("workspace_learning_items", sa.Column("source_url", sa.String(2000), nullable=True))
    # Recover original links already saved in knowledge cards.
    op.execute("""UPDATE workspace_learning_items AS l SET source_url = k.source_url
        FROM workspace_knowledge_cards AS k WHERE k.learning_item_id = l.id
        AND k.user_id = l.user_id AND k.workspace_id = l.workspace_id
        AND k.source_url ~ '^https?://' AND k.archived_at IS NULL""")
    op.create_table("execution_jobs",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "kind", "resource_id", name="uq_execution_resource"))
    for field in ("user_id", "workspace_id", "next_run_at"):
        op.create_index(f"ix_execution_jobs_{field}", "execution_jobs", [field])
    op.create_table("execution_heartbeats", sa.Column("name", sa.String(32), primary_key=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("calendar_subscriptions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.UniqueConstraint("user_id", "workspace_id", name="uq_calendar_workspace"))
    op.create_table("workspace_learning_sessions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("learning_item_id", sa.UUID(), sa.ForeignKey("workspace_learning_items.id"), nullable=False),
        sa.Column("active_seconds", sa.Integer(), nullable=False),
        sa.Column("seconds_by_date", postgresql.JSONB(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True))
    op.create_index("ix_workspace_learning_sessions_user_id", "workspace_learning_sessions", ["user_id"])


def downgrade():
    op.drop_table("workspace_learning_sessions")
    op.drop_table("calendar_subscriptions")
    op.drop_table("execution_heartbeats")
    op.drop_table("execution_jobs")
    op.drop_column("workspace_learning_items", "source_url")
    op.drop_column("growth_plans", "execution_enabled")
