"""D14: local import manifests, version mappings and provider receipts."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = 'e5f9a0b1c2d3'
down_revision = 'd4e8f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('source_pipelines',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('source_version_id', sa.UUID(), sa.ForeignKey('personal_source_versions.id'), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('mode', sa.String(16), nullable=False),
        sa.Column('source_checksum', sa.String(64), nullable=False),
        sa.Column('payload_checksum', sa.String(64), nullable=False),
        sa.Column('byte_count', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(160), nullable=False),
        sa.Column('endpoint', sa.String(100)),
        sa.Column('workspace_id', sa.String(160)),
        sa.Column('index_id', sa.String(160)),
        sa.Column('category_id', sa.String(160)),
        sa.Column('state', sa.String(16), nullable=False),
        sa.Column('lease_id', sa.String(240)),
        sa.Column('file_id', sa.String(160)),
        sa.Column('job_id', sa.String(160)),
        sa.Column('error', sa.String(500)),
        sa.Column('receipts', JSONB(), nullable=False),
        sa.Column('operation_id', sa.UUID()),
        sa.Column('lease_until', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id', 'request_id', name='uq_source_pipeline_request'),
        sa.CheckConstraint("mode IN ('original','extracted')", name='ck_pipeline_mode'),
        sa.CheckConstraint("state IN ('prepared','uploading','uploaded','registering','parsing','parsed','submitting','indexing','ready','uncertain','failed')", name='ck_pipeline_state'))
    for key in ('user_id', 'source_version_id'):
        op.create_index(f'ix_source_pipelines_{key}', 'source_pipelines', [key])


def downgrade():
    op.drop_table('source_pipelines')
