"""Scoped calendar contents and durable device reminder outbox.

Revision ID: a7b8c9d0e1f2
Revises: f0a4b5c6d7e8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
revision='a7b8c9d0e1f2'
down_revision='f0a4b5c6d7e8'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('calendar_subscriptions',sa.Column('scope',pg.JSONB(),nullable=False,server_default=sa.text("'{\"deadlines\": true,\"blocks\": false,\"reviews\": false}'::jsonb")))
    op.create_table('push_subscriptions',sa.Column('id',sa.UUID(),primary_key=True),sa.Column('user_id',sa.UUID(),sa.ForeignKey('users.id'),nullable=False),sa.Column('workspace_id',sa.UUID(),sa.ForeignKey('workspaces.id'),nullable=False),sa.Column('endpoint_hash',sa.String(64),nullable=False),sa.Column('subscription',pg.JSONB(),nullable=False),sa.Column('enabled',sa.Boolean(),nullable=False),sa.Column('timezone',sa.String(64),nullable=False),sa.Column('send_time',sa.String(5),nullable=False),sa.Column('schedule_version',sa.Integer(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),nullable=False),sa.Column('updated_at',sa.DateTime(timezone=True),nullable=False),sa.UniqueConstraint('user_id','workspace_id','endpoint_hash',name='uq_push_device_scope'))
    op.create_index('ix_push_subscriptions_user_id','push_subscriptions',['user_id'])
    op.create_index('ix_push_subscriptions_workspace_id','push_subscriptions',['workspace_id'])
    op.create_table('reminder_deliveries',sa.Column('id',sa.UUID(),primary_key=True),sa.Column('subscription_id',sa.UUID(),sa.ForeignKey('push_subscriptions.id'),nullable=False),sa.Column('local_date',sa.Date(),nullable=False),sa.Column('schedule_version',sa.Integer(),nullable=False),sa.Column('due_at',sa.DateTime(timezone=True),nullable=False),sa.Column('next_attempt_at',sa.DateTime(timezone=True),nullable=False),sa.Column('status',sa.String(24),nullable=False),sa.Column('attempts',sa.Integer(),nullable=False),sa.Column('error',sa.String(240)),sa.Column('sent_at',sa.DateTime(timezone=True)),sa.UniqueConstraint('subscription_id','local_date','schedule_version',name='uq_reminder_day'))
    for name in ('subscription_id','due_at','next_attempt_at'):op.create_index('ix_reminder_deliveries_'+name,'reminder_deliveries',[name])

def downgrade():
    op.drop_table('reminder_deliveries');op.drop_table('push_subscriptions');op.drop_column('calendar_subscriptions','scope')
