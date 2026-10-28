"""D5: source snapshots and confirmed excerpts, separate from learning progress."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB
revision = "b1d5e6f7a8c9"
down_revision = "a0c4d5e6f7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("learning_materials",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("item_id", sa.UUID(), sa.ForeignKey("workspace_learning_items.id"), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False), sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False), sa.Column("title", sa.String(240), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False), sa.Column("filename", sa.String(240), nullable=False),
        sa.Column("source_url", sa.String(2000)), sa.Column("byte_count", sa.Integer(), nullable=False),
        sa.Column("original", sa.LargeBinary(), nullable=False), sa.Column("extraction", JSONB()),
        sa.Column("status", sa.String(16), nullable=False), sa.Column("error", sa.String(500)),
        sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("attempt_id", sa.UUID(), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("parser_version", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "request_id", name="uq_learning_material_request"))
    for name in ("user_id", "workspace_id", "item_id"):
        op.create_index(f"ix_learning_materials_{name}", "learning_materials", [name])
    op.create_table("learning_material_excerpts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("material_id", sa.UUID(), sa.ForeignKey("learning_materials.id"), nullable=False),
        sa.Column("revision_id", sa.UUID(), sa.ForeignKey("personal_document_revisions.id"), nullable=False, unique=True),
        sa.Column("content", JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    for name in ("user_id", "material_id"):
        op.create_index(f"ix_learning_material_excerpts_{name}", "learning_material_excerpts", [name])


def downgrade():
    op.drop_table("learning_material_excerpts")
    op.drop_table("learning_materials")
