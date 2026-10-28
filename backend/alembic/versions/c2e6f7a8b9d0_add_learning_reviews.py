"""D6: sourced concepts/questions and actual personal review attempts."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB
revision='c2e6f7a8b9d0'
down_revision='b1d5e6f7a8c9'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('learning_review_units',sa.Column('id',sa.UUID(),primary_key=True),
        sa.Column('user_id',sa.UUID(),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('workspace_id',sa.UUID(),sa.ForeignKey('workspaces.id'),nullable=False),
        sa.Column('item_id',sa.UUID(),sa.ForeignKey('workspace_learning_items.id'),nullable=False),
        sa.Column('question',sa.Text(),nullable=False),sa.Column('kind',sa.String(16),nullable=False),
        sa.Column('source',JSONB(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('archived_at',sa.DateTime(timezone=True)))
    for name in ('user_id','workspace_id','item_id'):op.create_index(f'ix_learning_review_units_{name}','learning_review_units',[name])
    op.create_table('learning_review_attempts',sa.Column('id',sa.UUID(),primary_key=True),
        sa.Column('user_id',sa.UUID(),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('workspace_id',sa.UUID(),sa.ForeignKey('workspaces.id'),nullable=False),
        sa.Column('unit_id',sa.UUID(),sa.ForeignKey('learning_review_units.id'),nullable=False),
        sa.Column('snapshot',JSONB(),nullable=False),sa.Column('answer',sa.Text(),nullable=False),
        sa.Column('did_not_recall',sa.Boolean(),nullable=False),sa.Column('status',sa.String(16),nullable=False),
        sa.Column('rating',sa.String(16)),sa.Column('understanding',sa.Text()),sa.Column('difficulty',sa.Text()),
        sa.Column('next_action',sa.Text()),sa.Column('next_review_date',sa.Date()),
        sa.Column('answered_at',sa.DateTime(timezone=True),nullable=False),sa.Column('completed_at',sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('answered','completed')",name='ck_learning_review_attempt_status'))
    for name in ('user_id','workspace_id','unit_id'):op.create_index(f'ix_learning_review_attempts_{name}','learning_review_attempts',[name])

def downgrade():
    op.drop_table('learning_review_attempts');op.drop_table('learning_review_units')
