"""Actual learning time, action feedback and source-bound analysis snapshots."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
revision = "b5d9e0f1a2c3"
down_revision = "a4c8d9e0f1b2"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("workspace_facts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("task_id", sa.UUID(), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("task_id", name="uq_workspace_fact_task_feedback"),
        sa.CheckConstraint("(kind = 'learning' AND minutes IS NOT NULL AND minutes BETWEEN 1 AND 1440 AND task_id IS NULL) OR (kind = 'feedback' AND minutes IS NULL AND task_id IS NOT NULL)", name="ck_workspace_fact_shape"))
    for field in ("user_id", "workspace_id", "entry_date"):
        op.create_index(f"ix_workspace_facts_{field}", "workspace_facts", [field])
    op.create_table("analysis_snapshots",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("period", sa.String(8), nullable=False),
        sa.Column("anchor", sa.Date(), nullable=False),
        sa.Column("report", postgresql.JSONB(), nullable=False),
        sa.Column("source_refs", postgresql.JSONB(), nullable=False),
        sa.Column("enabled_sources", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    for field in ("user_id", "workspace_id"):
        op.create_index(f"ix_analysis_snapshots_{field}", "analysis_snapshots", [field])
    op.add_column("agent_conversations", sa.Column("analysis_snapshot_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_agent_analysis_snapshot", "agent_conversations", "analysis_snapshots", ["analysis_snapshot_id"], ["id"])

def downgrade():
    op.drop_constraint("fk_agent_analysis_snapshot", "agent_conversations", type_="foreignkey")
    op.drop_column("agent_conversations", "analysis_snapshot_id")
    op.drop_table("analysis_snapshots")
    op.drop_table("workspace_facts")
