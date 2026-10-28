"""Stable iCalendar events for read-only task subscriptions."""
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from app.core.deployment import public_origin


def subscription_url(base_url: str, api_prefix: str, token: str) -> str:
    """Use the configured deployment origin, never a request or browser host."""
    return f"{public_origin(base_url)}{api_prefix.rstrip('/')}/execution/calendar.ics?{urlencode({'token': token})}"


def ics_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def fold_line(value: str) -> str:
    chunks, current, size = [], "", 0
    for char in value:
        length = len(char.encode("utf-8"))
        if size + length > 75:
            chunks.append(current)
            current, size = " ", 1
        current += char
        size += length
    chunks.append(current)
    return "\r\n".join(chunks)


def task_calendar(tasks, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    stamp = lambda value: value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GrowthPilot//Tasks//ZH", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", "X-WR-CALNAME:GrowthPilot 行动"]
    for task in tasks:
        if task.due_at is None or task.deleted_at is not None:
            continue
        lines += ["BEGIN:VEVENT", f"UID:{task.id}@growthpilot", f"DTSTAMP:{stamp(now)}",
            f"LAST-MODIFIED:{stamp(task.updated_at)}", f"DTSTART:{stamp(task.due_at)}",
            f"DTEND:{stamp(task.due_at + timedelta(minutes=task.time_block or 25))}",
            f"SUMMARY:{ics_text(('✓ ' if task.status == 'done' else '') + task.title)}",
            f"DESCRIPTION:{ics_text(task.description)}", "STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold_line(line) for line in lines) + "\r\n"


def workspace_calendar(tasks, blocks=(), reviews=(), now=None, scope=None):
    """Real intervals, one-minute deadline markers and all-day review dates."""
    now = now or datetime.now(UTC)
    scope = scope or {'deadlines': True, 'blocks': True, 'reviews': True}
    stamp = lambda value: value.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GrowthPilot//Workspace//ZH',
             'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:GrowthPilot 工作与复习']
    def event(uid, title, start, end, updated, cancelled=False, description='', all_day=False, sequence=0):
        lines.extend(['BEGIN:VEVENT', f'UID:{uid}@growthpilot', f'DTSTAMP:{stamp(now)}',
            f'LAST-MODIFIED:{stamp(updated)}', f'SEQUENCE:{sequence}',
            f'DTSTART;VALUE=DATE:{start:%Y%m%d}' if all_day else f'DTSTART:{stamp(start)}',
            f'DTEND;VALUE=DATE:{end:%Y%m%d}' if all_day else f'DTEND:{stamp(end)}',
            f'SUMMARY:{ics_text(title)}', f'DESCRIPTION:{ics_text(description)}',
            'STATUS:CANCELLED' if cancelled else 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'END:VEVENT'])
    if scope.get('deadlines'):
        for t in tasks:
            if t.due_at is not None:
                event(str(t.id), f'截止 · {t.title}', t.due_at, t.due_at + timedelta(minutes=1), t.updated_at,
                    bool(t.deleted_at), '截止日期标记，不代表工作时长或实际完成。')
    if scope.get('blocks'):
        by_id = {t.id: t for t in tasks}
        for b in blocks:
            t = by_id.get(b.task_id)
            if t:
                event(f'block-{b.id}', f'安排 · {t.title}', b.starts_at, b.ends_at, b.updated_at,
                    bool(b.cancelled_at or t.deleted_at), f'安排时区：{b.timezone}；安排不代表实际完成。', sequence=b.version)
    if scope.get('reviews'):
        for r in reviews:
            event(f'review-{r["id"]}', f'复习 · {r["title"]}', r['date'], r['date'] + timedelta(days=1),
                r['updated_at'], r.get('cancelled', False), '本人已保存的下次复习日期。', all_day=True, sequence=r.get('sequence', 0))
    lines.append('END:VCALENDAR')
    return '\r\n'.join(fold_line(line) for line in lines) + '\r\n'


async def calendar_objects(session, uid, wid):
    from sqlalchemy import select
    from app.models.task import Task
    from app.models.personal_work import ScheduleBlock
    from app.models.learning_review import LearningReviewUnit, LearningReviewAttempt
    from app.models.workspace_learning_item import WorkspaceLearningItem
    tasks = list((await session.scalars(select(Task).where(Task.user_id == uid, Task.workspace_id == wid))).all())
    blocks = list((await session.scalars(select(ScheduleBlock).where(ScheduleBlock.user_id == uid, ScheduleBlock.workspace_id == wid))).all())
    rows = (await session.execute(select(LearningReviewUnit, LearningReviewAttempt, WorkspaceLearningItem)
        .join(LearningReviewAttempt, LearningReviewAttempt.unit_id == LearningReviewUnit.id)
        .join(WorkspaceLearningItem, WorkspaceLearningItem.id == LearningReviewUnit.item_id)
        .where(LearningReviewUnit.user_id == uid, LearningReviewUnit.workspace_id == wid,
            LearningReviewAttempt.user_id == uid, LearningReviewAttempt.workspace_id == wid,
            WorkspaceLearningItem.user_id == uid, WorkspaceLearningItem.workspace_id == wid,
            LearningReviewAttempt.status == 'completed')
        .order_by(LearningReviewAttempt.completed_at.desc(), LearningReviewAttempt.id.desc()))).all()
    grouped = {}
    for unit, attempt, item in rows: grouped.setdefault(unit.id, []).append((unit, attempt, item))
    reviews = []
    for group in grouped.values():
        unit, latest, item = group[0]
        scheduled = next((a for _, a, _ in group if a.next_review_date), None)
        if scheduled:
            reviews.append({'id': unit.id, 'title': unit.question[:180], 'date': latest.next_review_date or scheduled.next_review_date,
                'updated_at': max(v for v in (latest.completed_at, unit.archived_at, item.archived_at) if v is not None), 'sequence': len(group) + int(bool(unit.archived_at or item.archived_at)),
                'cancelled': bool(not latest.next_review_date or unit.archived_at or item.archived_at)})
    return tasks, blocks, reviews
