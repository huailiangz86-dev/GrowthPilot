"""D3: reviews and arrangements never manufacture actual activity."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a0c4d5e6f7b8"
down_revision = "f9b3c4d5e6a7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("fitness_review_rules",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("next_start", sa.Date(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("fitness_reviews",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("rule_id", sa.UUID(), sa.ForeignKey("fitness_review_rules.id")),
        sa.Column("fingerprint", sa.String(64), nullable=False), sa.Column("input", JSONB(), nullable=False),
        sa.Column("source", JSONB(), nullable=False), sa.Column("result", JSONB()),
        sa.Column("status", sa.String(16), nullable=False), sa.Column("error", sa.String(500)),
        sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("attempt_id", sa.UUID()),
        sa.Column("lease_until", sa.DateTime(timezone=True)), sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prompt_version", sa.String(32)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "request_id", name="uq_fitness_review_request"))
    op.create_index("ix_fitness_reviews_user_id", "fitness_reviews", ["user_id"])
    op.create_table("fitness_arrangements",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("review_id", sa.UUID(), sa.ForeignKey("fitness_reviews.id"), nullable=False, unique=True),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("feedback_record_id", sa.UUID(), sa.ForeignKey("life_records.id"), unique=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_fitness_arrangements_user_id", "fitness_arrangements", ["user_id"])
    op.create_table("fitness_expert_revisions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False), sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("content", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("entity_id", "version", name="uq_fitness_expert_revision"))
    for field in ("user_id", "entity_id"):
        op.create_index(f"ix_fitness_expert_revisions_{field}", "fitness_expert_revisions", [field])


def downgrade():
    for table in ("fitness_expert_revisions", "fitness_arrangements", "fitness_reviews", "fitness_review_rules"):
        op.drop_table(table)
