"""D13: independent person-owned originals and revision history."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = 'd4e8f0a1b2c3'
down_revision = 'c2e6f7a8b9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('personal_sources',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_personal_sources_user_id', 'personal_sources', ['user_id'])
    op.create_table('personal_source_versions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('source_id', sa.UUID(), sa.ForeignKey('personal_sources.id'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('fingerprint', sa.String(64), nullable=False),
        sa.Column('checksum', sa.String(64), nullable=False),
        sa.Column('title', sa.String(240), nullable=False),
        sa.Column('category', sa.String(16), nullable=False),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('filename', sa.String(240), nullable=False),
        sa.Column('source_url', sa.String(2000)),
        sa.Column('byte_count', sa.Integer(), nullable=False),
        sa.Column('original', sa.LargeBinary(), nullable=False),
        sa.Column('extraction', JSONB()),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('error', sa.String(500)),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('attempt_id', sa.UUID(), nullable=False),
        sa.Column('lease_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('parser_version', sa.String(40), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'request_id', name='uq_personal_source_request'),
        sa.UniqueConstraint('source_id', 'version', name='uq_personal_source_version'),
        sa.CheckConstraint("status IN ('processing','ready','failed')", name='ck_personal_source_status'))
    for column in ('user_id', 'source_id'):
        op.create_index(f'ix_personal_source_versions_{column}', 'personal_source_versions', [column])


def downgrade():
    op.drop_table('personal_source_versions')
    op.drop_table('personal_sources')
