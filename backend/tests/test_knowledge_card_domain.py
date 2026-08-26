import asyncio
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.knowledge_cards import (
    KnowledgeCardCreateRequest,
    KnowledgeCardContextLinkRequest,
    KnowledgeCardSummaryConfirmRequest,
    _citation_response,
    _summary_suggestion,
    preview_knowledge_card_summary_endpoint,
)
from app.engines.knowledge_card_engine import (
    add_knowledge_card_to_learning,
    confirm_knowledge_card_summary,
    create_knowledge_card,
    knowledge_card_citation_query,
    knowledge_card_query,
    update_knowledge_card_context_links,
)
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)


class _PreviewSession:
    async def commit(self) -> None:
        return None

    async def refresh(self, _item: object) -> None:
        return None


def test_knowledge_card_request_requires_text_or_http_source() -> None:
    try:
        KnowledgeCardCreateRequest(
            workspace_id=str(uuid.uuid4()),
            source_type="text",
        )
    except ValidationError as error:
        assert "文本捕获需要内容" in str(error)
    else:
        raise AssertionError("text capture should require content")

    try:
        KnowledgeCardCreateRequest(
            workspace_id=str(uuid.uuid4()),
            source_type="url",
            source_url="example.com/article",
        )
    except ValidationError as error:
        assert "http 或 https" in str(error)
    else:
        raise AssertionError("url capture should require an http source")


def test_knowledge_card_query_scopes_user_and_archived_workspace() -> None:
    query = knowledge_card_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_knowledge_cards.user_id" in sql
    assert "workspace_knowledge_cards.archived_at IS NULL" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_knowledge_card_citation_query_only_reads_confirmed_workspace_cards() -> None:
    query = knowledge_card_citation_query(uuid.uuid4(), uuid.uuid4(), "访谈")
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_knowledge_cards.workspace_id" in sql
    assert "workspace_knowledge_cards.ai_status" in sql
    assert "workspace_knowledge_cards.ai_summary IS NOT NULL" in sql
    assert "workspace_knowledge_cards.source_type" in sql
    assert "ILIKE" in sql


def test_knowledge_card_writes_capture_and_explicit_queue_events() -> None:
    async def run() -> None:
        session = _FakeSession()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            name="研究输入",
            description="",
            workspace_type="personal",
        )
        card = await create_knowledge_card(
            session,
            workspace=workspace,
            values={
                "project_id": None,
                "goal_id": None,
                "title": "用户研究方法",
                "source_type": "text",
                "source_url": None,
                "content": "访谈时先追问具体行为，而不是假设。",
                "status": "captured",
            },
        )
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "knowledge_card_captured"

        queued_card, learning_item = await add_knowledge_card_to_learning(
            session,
            card=card,
            workspace=workspace,
        )
        assert queued_card.status == "queued"
        assert queued_card.learning_item_id == learning_item.id
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "knowledge_card_queued"

        confirmed = await confirm_knowledge_card_summary(
            session,
            card=card,
            summary="先从具体行为开始追问，避免从假设出发。",
            concepts=["具体行为", "追问"],
            tags=["用户访谈"],
        )
        assert confirmed.ai_status == "confirmed"
        assert confirmed.ai_summary == "先从具体行为开始追问，避免从假设出发。"
        assert confirmed.ai_concepts == ["具体行为", "追问"]
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "knowledge_card_summary_confirmed"

        linked = await update_knowledge_card_context_links(
            session,
            card=card,
            goal_id=uuid.uuid4(),
            task_id=uuid.uuid4(),
        )
        assert linked.goal_id is not None
        assert linked.task_id is not None
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "knowledge_card_context_linked"

    asyncio.run(run())


def test_knowledge_card_summary_request_normalizes_user_confirmation() -> None:
    payload = KnowledgeCardSummaryConfirmRequest(
        summary="  先记录具体行为。  ",
        concepts=[" 行为 ", "行为", ""],
        tags=["访谈", " 访谈 ", "研究"],
    )

    assert payload.summary == "先记录具体行为。"
    assert payload.concepts == ["行为"]
    assert payload.tags == ["访谈", "研究"]


def test_context_link_request_requires_an_explicit_change() -> None:
    try:
        KnowledgeCardContextLinkRequest()
    except ValidationError as error:
        assert "至少提供一个" in str(error)
    else:
        raise AssertionError("an empty context link request should be rejected")


def test_knowledge_card_summary_preview_returns_editable_source_traced_draft() -> None:
    card = WorkspaceKnowledgeCard(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        title="用户研究",
        source_type="text",
        source_url=None,
        content="先问发生了什么，再追问为什么。",
        status="captured",
        ai_status="not_requested",
        ai_concepts=[],
        ai_tags=[],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    suggestion = _summary_suggestion(
        card,
        {
            "summary": "访谈先回到具体发生的行为，再追问原因。",
            "concepts": ["具体行为", "追问原因"],
            "tags": ["用户访谈"],
        },
    )

    assert suggestion.summary == "访谈先回到具体发生的行为，再追问原因。"
    assert suggestion.source_reference.card_id == str(card.id)
    assert suggestion.source_reference.type == "knowledge_card_content"

    card.ai_status = "confirmed"
    card.ai_summary = suggestion.summary
    card.ai_concepts = suggestion.concepts
    card.ai_tags = suggestion.tags
    citation = _citation_response(card)
    assert citation.summary == suggestion.summary
    assert citation.source_reference.card_id == str(card.id)
    assert citation.excerpt.startswith("访谈先回到具体发生的行为")


def test_knowledge_card_summary_preview_keeps_source_when_ai_fails() -> None:
    async def run() -> None:
        card = WorkspaceKnowledgeCard(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            title="用户研究",
            source_type="text",
            source_url=None,
            content="先问发生了什么，再追问为什么。",
            status="captured",
            ai_status="not_requested",
            ai_concepts=[],
            ai_tags=[],
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        with (
            patch("app.api.knowledge_cards.get_knowledge_card", new=AsyncMock(return_value=card)),
            patch("app.api.knowledge_cards.structured_output", new=AsyncMock(side_effect=TimeoutError("provider timeout"))),
        ):
            response = await preview_knowledge_card_summary_endpoint(
                card_id=str(card.id),
                user_id=str(card.user_id),
                session=_PreviewSession(),
            )

        assert response.success is True
        assert response.data is not None
        assert response.data.ai_generated is False
        assert response.data.suggestion is None
        assert card.ai_status == "failed"
        assert card.content == "先问发生了什么，再追问为什么。"

    asyncio.run(run())
