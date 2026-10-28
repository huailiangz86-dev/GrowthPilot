"""D1: person-owned confirmed life facts, habit rules and durable receipts."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "e8a2b3c4d5f6"
down_revision = "d7f1a2b3c4e5"
branch_labels = None
depends_on = None


def owner():
    return sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False)


def upgrade():
    op.create_table("life_records", sa.Column("id", sa.UUID(), primary_key=True), owner(),
        sa.Column("domain", sa.String(24), nullable=False), sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("personal_habits", sa.Column("id", sa.UUID(), primary_key=True), owner(),
        sa.Column("domain", sa.String(24), nullable=False), sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", JSONB(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "domain", name="uq_personal_habit_domain"))
    op.create_table("life_revisions", sa.Column("id", sa.UUID(), primary_key=True), owner(),
        sa.Column("record_id", sa.UUID(), sa.ForeignKey("life_records.id")), sa.Column("habit_id", sa.UUID(), sa.ForeignKey("personal_habits.id")),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("num_nonnulls(record_id, habit_id) = 1", name="ck_life_revision_owner"),
        sa.UniqueConstraint("record_id", "version", name="uq_life_record_version"),
        sa.UniqueConstraint("habit_id", "version", name="uq_life_habit_version"))
    op.create_table("life_workspace_references", sa.Column("id", sa.UUID(), primary_key=True), owner(),
        sa.Column("record_id", sa.UUID(), sa.ForeignKey("life_records.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("record_id", "workspace_id", name="uq_life_workspace_reference"))
    op.create_table("life_command_receipts", sa.Column("id", sa.UUID(), primary_key=True), owner(),
        sa.Column("request_id", sa.UUID(), nullable=False), sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("result", JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "request_id", name="uq_life_command_request"))
    for table in ("life_records", "personal_habits", "life_revisions", "life_workspace_references", "life_command_receipts"):
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
    for table, field in (("life_records", "occurred_on"), ("life_revisions", "record_id"), ("life_revisions", "habit_id"),
                         ("life_workspace_references", "record_id"), ("life_workspace_references", "workspace_id")):
        op.create_index(f"ix_{table}_{field}", table, [field])


def downgrade():
    for table in ("life_command_receipts", "life_workspace_references", "life_revisions", "personal_habits", "life_records"):
        op.drop_table(table)
