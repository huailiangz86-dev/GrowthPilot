"""Growth Engine — daily tasks, check-in, achievements, progress."""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.growth import Achievement, CheckIn, DailyTask
from app.models.record import Record
from app.models.review import Review

logger = structlog.get_logger()

ACHIEVEMENTS = {
    "first_record": {"label": "初次记录", "desc": "记录第一笔交易"},
    "first_review": {"label": "初次复盘", "desc": "完成第一次复盘"},
    "streak_7": {"label": "连续 7 天", "desc": "连续签到 7 天"},
    "trades_10": {"label": "10 笔达人", "desc": "累计 10 笔记录"},
    "trades_50": {"label": "50 笔达人", "desc": "累计 50 笔记录"},
    "trades_100": {"label": "百笔达人", "desc": "累计 100 笔记录"},
    "first_analysis": {"label": "AI 初体验", "desc": "首次查看 AI 分析"},
    "persona_unlock": {"label": "性格觉醒", "desc": "首次生成性格分析"},
}


async def get_daily_tasks(session: AsyncSession, user_id: str) -> dict:
    uid = uuid.UUID(user_id)
    today = datetime.now(UTC).date()

    result = await session.execute(
        select(DailyTask).where(DailyTask.user_id == uid, DailyTask.task_date == today)
    )
    task = result.scalar_one_or_none()
    if task is None:
        task = DailyTask(id=uuid.uuid4(), user_id=uid, task_date=today)
        session.add(task)
        await session.commit()

    completed = sum([task.recorded, task.reviewed, task.analyzed])
    return {
        "recorded": task.recorded,
        "reviewed": task.reviewed,
        "analyzed": task.analyzed,
        "completed": completed,
        "total": 3,
        "progress": round(completed / 3 * 100),
    }


async def complete_task(session: AsyncSession, user_id: str, task_type: str) -> dict:
    uid = uuid.UUID(user_id)
    today = datetime.now(UTC).date()

    result = await session.execute(
        select(DailyTask).where(DailyTask.user_id == uid, DailyTask.task_date == today)
    )
    task = result.scalar_one_or_none()
    if task is None:
        task = DailyTask(id=uuid.uuid4(), user_id=uid, task_date=today)
        session.add(task)

    if task_type == "recorded":
        task.recorded = True
    elif task_type == "reviewed":
        task.reviewed = True
    elif task_type == "analyzed":
        task.analyzed = True

    await session.commit()
    return await get_daily_tasks(session, user_id)


async def check_in(session: AsyncSession, user_id: str) -> dict:
    uid = uuid.UUID(user_id)
    today = datetime.now(UTC).date()

    existing = await session.execute(
        select(CheckIn).where(CheckIn.user_id == uid, CheckIn.check_date == today)
    )
    if existing.scalar_one_or_none():
        return {"already_checked": True, "date": str(today)}

    # Calculate streak
    yesterday = today - timedelta(days=1)
    prev = await session.execute(
        select(CheckIn).where(CheckIn.user_id == uid, CheckIn.check_date == yesterday)
    )
    prev_checkin = prev.scalar_one_or_none()
    streak = (prev_checkin.streak + 1) if prev_checkin else 1

    ci = CheckIn(id=uuid.uuid4(), user_id=uid, check_date=today, streak=streak)
    session.add(ci)
    await session.commit()

    # Check streak achievement
    if streak >= 7:
        await _unlock(session, user_id, "streak_7")

    return {"checked": True, "date": str(today), "streak": streak}


async def get_achievements(session: AsyncSession, user_id: str) -> list[dict]:
    uid = uuid.UUID(user_id)
    result = await session.execute(select(Achievement).where(Achievement.user_id == uid))
    unlocked = {a.achievement_type: a.unlocked_at.isoformat() for a in result.scalars().all()}

    return [
        {"type": t, "label": info["label"], "desc": info["desc"],
         "unlocked": t in unlocked, "unlocked_at": unlocked.get(t)}
        for t, info in ACHIEVEMENTS.items()
    ]


async def get_progress(session: AsyncSession, user_id: str) -> dict:
    uid = uuid.UUID(user_id)
    records = (await session.execute(select(func.count()).select_from(Record).where(Record.user_id == uid, Record.deleted_at.is_(None)))).scalar_one()
    reviews = (await session.execute(select(func.count()).select_from(Review).where(Review.user_id == uid))).scalar_one()
    achievements = (await session.execute(select(func.count()).select_from(Achievement).where(Achievement.user_id == uid))).scalar_one()

    # Progress: milestones completed / total milestones
    milestones = [records >= 1, records >= 10, records >= 50, reviews >= 1, achievements >= 3]
    progress = sum(milestones) / len(milestones) * 100

    return {"records": records, "reviews": reviews, "achievements": achievements, "progress": round(progress)}


async def _unlock(session: AsyncSession, user_id: str, atype: str) -> bool:
    uid = uuid.UUID(user_id)
    existing = await session.execute(
        select(Achievement).where(Achievement.user_id == uid, Achievement.achievement_type == atype)
    )
    if existing.scalar_one_or_none():
        return False
    session.add(Achievement(user_id=uid, achievement_type=atype))
    await session.commit()
    logger.info("achievement_unlocked", user_id=user_id, type=atype)
    return True
