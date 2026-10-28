import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextlib import suppress

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.analysis import router as analysis_router
from app.api.auth import router as auth_router
from app.api.banners import router as banners_router
from app.api.calendar import router as calendar_router
from app.api.capabilities import router as capabilities_router
from app.api.capability_runs import router as capability_runs_router
from app.api.growth import router as growth_router
from app.api.health import router as health_router
from app.api.kline import router as kline_router
from app.api.knowledge import router as knowledge_router
from app.api.knowledge_base import router as knowledge_base_router
from app.api.ai_coach import router as ai_coach_router
from app.api.personal_agent import router as personal_agent_router
from app.api.workspace_analysis import router as workspace_analysis_router
from app.api.news import router as news_router
from app.api.onboarding import router as onboarding_router
from app.api.growth_report import router as growth_report_router
from app.api.market import router as market_router
from app.api.memory import router as memory_router
from app.api.ocr import router as ocr_router
from app.api.persona import router as persona_router
from app.api.portfolio import router as portfolio_router
from app.api.records import router as records_router
from app.api.reviews import router as reviews_router
from app.api.stats import router as stats_router
from app.api.symbols import router as symbols_router
from app.api.tags import router as tags_router
from app.api.trading import router as trading_router
from app.api.workspaces import projects_router, router as workspaces_router
from app.api.tasks import router as tasks_router
from app.api.goals import router as goals_router
from app.api.growth_plans import router as growth_plans_router
from app.api.dashboard import router as dashboard_router
from app.api.reflections import router as reflections_router
from app.api.learning_items import router as learning_items_router
from app.api.knowledge_cards import router as knowledge_cards_router
from app.api.execution import router as execution_router
from app.api.personal_work import router as personal_work_router
from app.api.personal_life import router as personal_life_router
from app.api.item_help import router as item_help_router
from app.api.learning_materials import router as learning_materials_router
from app.api.personal_sources import router as personal_sources_router
from app.api.source_pipeline import router as source_pipeline_router
from app.api.source_summaries import router as source_summaries_router
from app.api.learning_review import router as learning_review_router
from app.api.learning_knowledge import router as learning_knowledge_router
from app.api.bailian_knowledge import router as bailian_knowledge_router
from app.api.learning_diagnosis import router as learning_diagnosis_router
from app.api.fitness_expert import router as fitness_expert_router
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.redis import close_redis
from app.middleware.error_handler import (
    app_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.core.security import validate_auth_configuration
    validate_auth_configuration()
    # Auto-seed review templates & tag presets on startup
    from app.core.database import async_session_factory
    from app.engines.review_engine import seed_templates
    from app.engines.tag_engine import seed_preset_tags
    from app.engines.capability_engine import seed_capability_catalog
    from app.engines.knowledge_engine import seed_knowledge

    async with async_session_factory() as session:
        await seed_templates(session)
        await seed_preset_tags(session)
        await seed_knowledge(session)
        await seed_capability_catalog(session)
        await session.commit()
    from app.engines.execution_engine import execution_loop
    from app.engines.fitness_expert import expert_loop
    workers = [asyncio.create_task(execution_loop()), asyncio.create_task(expert_loop())] if settings.EXECUTION_ENABLED else []
    try:
        yield
    finally:
        for worker in workers:
            worker.cancel()
        for worker in workers:
            with suppress(asyncio.CancelledError):
                await worker
        await close_redis()


app = FastAPI(title=settings.APP_NAME, version="2.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# --- All Routers ---
from app.api.reminders import router as reminders_router
app.include_router(reminders_router, prefix=settings.API_V1_PREFIX)
from app.api.source_learning import router as source_learning_router
app.include_router(source_learning_router, prefix=settings.API_V1_PREFIX)

app.include_router(health_router)
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(records_router, prefix=settings.API_V1_PREFIX)
app.include_router(tags_router, prefix=settings.API_V1_PREFIX)
app.include_router(trading_router, prefix=settings.API_V1_PREFIX)
app.include_router(symbols_router, prefix=settings.API_V1_PREFIX)
app.include_router(reviews_router, prefix=settings.API_V1_PREFIX)
app.include_router(calendar_router, prefix=settings.API_V1_PREFIX)
app.include_router(stats_router, prefix=settings.API_V1_PREFIX)
app.include_router(analysis_router, prefix=settings.API_V1_PREFIX)
app.include_router(persona_router, prefix=settings.API_V1_PREFIX)
app.include_router(knowledge_router, prefix=settings.API_V1_PREFIX)
app.include_router(growth_router, prefix=settings.API_V1_PREFIX)
app.include_router(news_router, prefix=settings.API_V1_PREFIX)
app.include_router(kline_router, prefix=settings.API_V1_PREFIX)
app.include_router(portfolio_router, prefix=settings.API_V1_PREFIX)
app.include_router(ocr_router, prefix=settings.API_V1_PREFIX)
app.include_router(banners_router, prefix=settings.API_V1_PREFIX)
app.include_router(knowledge_base_router, prefix=settings.API_V1_PREFIX)
app.include_router(ai_coach_router, prefix=settings.API_V1_PREFIX)
app.include_router(personal_agent_router, prefix=settings.API_V1_PREFIX)
app.include_router(workspace_analysis_router, prefix=settings.API_V1_PREFIX)
app.include_router(onboarding_router, prefix=settings.API_V1_PREFIX)
app.include_router(growth_report_router, prefix=settings.API_V1_PREFIX)
app.include_router(market_router, prefix=settings.API_V1_PREFIX)
app.include_router(memory_router, prefix=settings.API_V1_PREFIX)
app.include_router(workspaces_router, prefix=settings.API_V1_PREFIX)
app.include_router(projects_router, prefix=settings.API_V1_PREFIX)
app.include_router(tasks_router, prefix=settings.API_V1_PREFIX)
app.include_router(goals_router, prefix=settings.API_V1_PREFIX)
app.include_router(growth_plans_router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard_router, prefix=settings.API_V1_PREFIX)
app.include_router(reflections_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_items_router, prefix=settings.API_V1_PREFIX)
app.include_router(knowledge_cards_router, prefix=settings.API_V1_PREFIX)
app.include_router(capability_runs_router, prefix=settings.API_V1_PREFIX)
app.include_router(capabilities_router, prefix=settings.API_V1_PREFIX)
app.include_router(execution_router, prefix=settings.API_V1_PREFIX)
app.include_router(personal_work_router, prefix=settings.API_V1_PREFIX)
app.include_router(personal_life_router, prefix=settings.API_V1_PREFIX)
app.include_router(item_help_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_materials_router, prefix=settings.API_V1_PREFIX)
app.include_router(personal_sources_router, prefix=settings.API_V1_PREFIX)
app.include_router(source_pipeline_router, prefix=settings.API_V1_PREFIX)
app.include_router(source_summaries_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_review_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_knowledge_router, prefix=settings.API_V1_PREFIX)
app.include_router(bailian_knowledge_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_diagnosis_router, prefix=settings.API_V1_PREFIX)
app.include_router(fitness_expert_router, prefix=settings.API_V1_PREFIX)
