"""C1: additive content and scheduling; existing tasks and learning keep their IDs."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "d7f1a2b3c4e5"
down_revision = "c6e0f1a2b3d4"
branch_labels = None
depends_on = None


def scope():
    return [sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False)]


def upgrade():
    op.create_table("personal_documents", sa.Column("id", sa.UUID(), primary_key=True), *scope(),
        sa.Column("task_id", sa.UUID(), sa.ForeignKey("tasks.id"), unique=True),
        sa.Column("learning_item_id", sa.UUID(), sa.ForeignKey("workspace_learning_items.id"), unique=True),
        sa.Column("reflection_id", sa.UUID(), sa.ForeignKey("workspace_reflections.id"), unique=True),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("num_nonnulls(task_id, learning_item_id, reflection_id) = 1", name="ck_personal_document_owner"))
    op.create_table("personal_document_revisions", sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("document_id", sa.UUID(), sa.ForeignKey("personal_documents.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("source", sa.String(24), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("document_id", "version", name="uq_personal_revision_version"))
    op.create_table("schedule_blocks", sa.Column("id", sa.UUID(), primary_key=True), *scope(),
        sa.Column("task_id", sa.UUID(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False), sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name="ck_schedule_positive_duration"))
    op.create_table("personal_command_receipts", sa.Column("id", sa.UUID(), primary_key=True), *scope(),
        sa.Column("request_id", sa.UUID(), nullable=False), sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("result", JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "workspace_id", "request_id", name="uq_personal_command_request"))
    for table in ("personal_documents", "schedule_blocks", "personal_command_receipts"):
        for field in ("user_id", "workspace_id"):
            op.create_index(f"ix_{table}_{field}", table, [field])
    op.create_index("ix_personal_document_revisions_document_id", "personal_document_revisions", ["document_id"])
    op.create_index("ix_schedule_blocks_task_id", "schedule_blocks", ["task_id"])
    op.create_index("ix_schedule_blocks_starts_at", "schedule_blocks", ["starts_at"])


def downgrade():
    for table in ("personal_command_receipts", "schedule_blocks", "personal_document_revisions", "personal_documents"):
        op.drop_table(table)
