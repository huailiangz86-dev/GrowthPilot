"""Accumulate bounded, visible study time without inventing completion."""
import uuid
from datetime import UTC, date, datetime, timedelta
from sqlalchemy import select, text
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.daily_preferences import user_daily_timezone
from app.engines.learning_engine import get_learning_item, update_learning_progress
from app.engines.workspace_engine import append_event
from app.models.learning_session import LearningSession
from app.models.user import User
from app.models.workspace_fact import WorkspaceFact
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard


def observed_seconds(previous, now):
    if not previous.active:
        return 0
    delta = max(0, int((now - previous.last_seen_at).total_seconds()))
    # A lost tab or interrupted connection never adds a long unobserved gap.
    return delta if delta <= 30 else 0


async def study_session(session, uid, item_id, session_id, *, active=True, note=None, complete=False, now=None):
    now = now or datetime.now(UTC)
    item = await get_learning_item(session, uid, item_id)
    if item is None:
        raise NotFoundException("LearningItem")
    if not item.source_url:
        card = (await session.execute(select(WorkspaceKnowledgeCard).where(WorkspaceKnowledgeCard.user_id == uid,
            WorkspaceKnowledgeCard.workspace_id == item.workspace_id, WorkspaceKnowledgeCard.learning_item_id == item.id,
            WorkspaceKnowledgeCard.archived_at.is_(None)).limit(1))).scalar_one_or_none()
        if card is None or not (card.content or card.source_url):
            raise ValidationException("请先提供原始学习资源；系统不会对没有资源的页面记录学习时间")
    # Serialize all study tabs for the same account, including finishing and replay.
    await session.scalar(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int.from_bytes(uid.bytes[:8], "big", signed=True)})
    row = await session.get(LearningSession, session_id)
    if row is not None and (row.user_id != uid or row.learning_item_id != item_id or row.workspace_id != item.workspace_id):
        raise NotFoundException("LearningSession")
    if row is not None and row.finished_at is not None:
        return row, item
    user = await session.get(User, uid)
    timezone = user_daily_timezone(user.settings)
    if row is None:
        if complete:
            raise ValidationException("请先打开学习内容")
        # Stop an older tab before the new tab starts accumulating time.
        others = (await session.execute(select(LearningSession).where(LearningSession.user_id == uid,
            LearningSession.finished_at.is_(None), LearningSession.active.is_(True)))).scalars().all()
        for other in others:
            other.active = False
        row = LearningSession(id=session_id, user_id=uid, workspace_id=item.workspace_id, learning_item_id=item.id,
            active_seconds=0, seconds_by_date={}, active=active, started_at=now, last_seen_at=now)
        session.add(row)
        from app.models.personal_work import PersonalDocument
        personal = await session.scalar(select(PersonalDocument).where(PersonalDocument.learning_item_id == item.id))
        if item.status == "queued" and personal is None:
            item.status = "in_progress"
        await append_event(session, user_id=uid, workspace_id=item.workspace_id, source_type="learning",
            source_id=item.id, event_type="learning_session_started", payload={"title": item.title, "session_id": str(row.id)})
    else:
        if active:
            # Only one visible study session per account contributes at a time.
            others = (await session.execute(select(LearningSession).where(LearningSession.user_id == uid,
                LearningSession.id != row.id, LearningSession.finished_at.is_(None), LearningSession.active.is_(True)))).scalars().all()
            for other in others:
                other.active = False
        elapsed = min(86400 - row.active_seconds, observed_seconds(row, now))
        totals = dict(row.seconds_by_date or {})
        for second in range(elapsed):
            key = (row.last_seen_at + timedelta(seconds=second + 1)).astimezone(timezone).date().isoformat()
            totals[key] = totals.get(key, 0) + 1
        row.seconds_by_date = totals
        row.active_seconds += elapsed
        row.last_seen_at, row.active = now, active
    if complete:
        if not note or not note.strip():
            raise ValidationException("请留下一条实际学习结果")
        row.finished_at, row.active, row.note = now, False, note.strip()
        from app.models.personal_work import PersonalDocument
        personal = await session.scalar(select(PersonalDocument).where(PersonalDocument.learning_item_id == item.id))
        if personal is None:
            await update_learning_progress(session, item, 100)
    # Every full observed minute is saved automatically, even if the browser closes
    # before a completion result is submitted. Midnight splits by the user's zone.
    for key, seconds in (row.seconds_by_date or {}).items():
        minutes = seconds // 60
        if not minutes:
            continue
        fact_id = uuid.uuid5(row.id, f"study:{key}")
        fact = await session.get(WorkspaceFact, fact_id)
        note_text = f"学习页面计时 · {item.title}" + (f"：{row.note}" if row.note else "；学习尚未确认完成")
        if fact is None:
            session.add(WorkspaceFact(id=fact_id, user_id=uid, workspace_id=item.workspace_id,
                kind="learning", entry_date=date.fromisoformat(key), minutes=minutes, note=note_text))
            await append_event(session, user_id=uid, workspace_id=item.workspace_id, source_type="learning",
                source_id=item.id, event_type="learning_time_recorded", payload={"title": item.title, "minutes": minutes, "session_id": str(row.id)})
        else:
            fact.minutes, fact.note = minutes, note_text
    await session.flush()
    return row, item
