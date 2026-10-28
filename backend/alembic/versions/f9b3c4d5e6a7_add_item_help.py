"""D2: durable item help; existing life and learning facts stay intact."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "f9b3c4d5e6a7"
down_revision = "e8a2b3c4d5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("item_help",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id")),
        sa.Column("item_id", sa.UUID(), sa.ForeignKey("workspace_learning_items.id")),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("input", JSONB(), nullable=False), sa.Column("source", JSONB(), nullable=False),
        sa.Column("result", JSONB()), sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.String(500)), sa.Column("attempt_id", sa.UUID(), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prompt_version", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "request_id", name="uq_item_help_request"))
    for field in ("user_id", "workspace_id", "item_id"):
        op.create_index(f"ix_item_help_{field}", "item_help", [field])


def downgrade():
    op.drop_table("item_help")
