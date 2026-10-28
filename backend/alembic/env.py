import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.core.database import Base
from app.models.item_help import ItemHelp  # noqa: F401

# Import all models
from app.models.reminders import PushSubscription, ReminderDelivery  # noqa: F401
from app.models.workspace_fact import WorkspaceFact, AnalysisSnapshot  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.personal_work import PersonalDocument, DocumentRevision, ScheduleBlock, PersonalCommandReceipt  # noqa: F401
from app.models.personal_life import LifeRecord, PersonalHabit, LifeRevision, LifeWorkspaceReference, LifeCommandReceipt  # noqa: F401
from app.models.record import Record  # noqa: F401
from app.models.review import Review  # noqa: F401
from app.models.tag_definition import TagDefinition  # noqa: F401
from app.models.pattern import PatternDiscovery  # noqa: F401
from app.models.llm_call import LLMCall  # noqa: F401
from app.models.growth import Achievement, Banner, CheckIn, DailyTask  # noqa: F401
from app.models.news import NewsItem  # noqa: F401
from app.models.review_template import ReviewTemplate  # noqa: F401
from app.models.knowledge import (  # noqa: F401
    KnowledgeCategory,
    KnowledgeArticle,
    KnowledgeTerm,
    LearningPath,
    UserLearningProgress,
    UserBookmark,
)
from app.models.memory import MemoryEntry  # noqa: F401
from app.models.agent_conversation import AgentConversation, AgentTurn  # noqa: F401
from app.models.onboarding_submission import OnboardingSubmission  # noqa: F401
from app.models.workspace import Project, Workspace, WorkspaceEvent  # noqa: F401
from app.models.task import Task  # noqa: F401
from app.models.goal import Goal  # noqa: F401
from app.models.growth_plan import GrowthPlan  # noqa: F401
from app.models.workspace_reflection import WorkspaceReflection  # noqa: F401
from app.models.workspace_learning_item import WorkspaceLearningItem  # noqa: F401
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard  # noqa: F401
from app.models.capability import AgentRun, CapabilityRegistry, CapabilityRun, WorkspaceCapabilitySetting  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
