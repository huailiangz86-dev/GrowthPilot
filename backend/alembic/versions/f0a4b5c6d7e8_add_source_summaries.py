"""D15: evidence-backed summaries and explicitly saved reusable results."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = 'f0a4b5c6d7e8'
down_revision = 'e5f9a0b1c2d3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('source_summaries',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('fingerprint', sa.String(64), nullable=False),
        sa.Column('input', JSONB(), nullable=False),
        sa.Column('source', JSONB(), nullable=False),
        sa.Column('result', JSONB()),
        sa.Column('saved', JSONB()),
        sa.Column('saved_at', sa.DateTime(timezone=True)),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('error', sa.String(500)),
        sa.Column('attempt_id', sa.UUID(), nullable=False),
        sa.Column('lease_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('prompt_version', sa.String(32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'request_id', name='uq_source_summary_request'),
        sa.CheckConstraint("status IN ('processing','failed','completed')", name='ck_source_summary_status'))
    op.create_index('ix_source_summaries_user_id', 'source_summaries', ['user_id'])


def downgrade():
    op.drop_table('source_summaries')

