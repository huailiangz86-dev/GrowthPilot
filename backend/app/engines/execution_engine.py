"""Server-owned execution. No browser, page visit or button is required for a tick."""

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.engines.daily_preferences import user_daily_timezone
from app.engines.task_engine import complete_task
from app.engines.learning_resources import match_learning_resource
from app.engines.workspace_analysis import build_report
from app.engines.workspace_engine import append_event
from app.models.execution import ExecutionHeartbeat, ExecutionJob
from app.models.growth_plan import GrowthPlan
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard

logger = logging.getLogger(__name__)


def milestone_task_id(plan_id: uuid.UUID, index: int, title: str) -> uuid.UUID:
    return uuid.uuid5(plan_id, f"milestone:{index}:{title.strip()}")


def retry_delay(attempts: int) -> int:
    return min(3600, 15 * 2 ** min(max(attempts - 1, 0), 8))


async def _job(session: AsyncSession, workspace: Workspace, kind: str, resource_id: uuid.UUID, title: str, now: datetime):
    job_id = uuid.uuid5(workspace.id, f"execution:{kind}:{resource_id}")
    job = await session.get(ExecutionJob, job_id)
    if job is None:
        job = ExecutionJob(id=job_id, user_id=workspace.user_id, workspace_id=workspace.id,
            kind=kind, resource_id=resource_id, title=title[:240], next_run_at=now, result={}, status="pending", attempts=0)
        session.add(job)
        await session.flush()
    return job


async def _advance_plan(session: AsyncSession, workspace: Workspace, plan: GrowthPlan, now: datetime):
    if not plan.execution_enabled or plan.status not in {"active", "completed"}:
        return "paused", {"summary": "后台推进已暂停；已生成的任务保留。"}
    if not plan.milestones:
        return "blocked", {"summary": "计划缺少具体步骤，请补充每一步的可交付结果。", "steps": []}
    ids = [milestone_task_id(plan.id, i, title) for i, title in enumerate(plan.milestones)]
    tasks = {t.id: t for t in (await session.execute(select(Task).where(
        Task.id.in_(ids), Task.user_id == workspace.user_id, Task.workspace_id == workspace.id,
        Task.plan_id == plan.id))).scalars().all()}
    done = sum(t.status == "done" and t.deleted_at is None for t in tasks.values())
    plan.progress = round(done / len(ids) * 100)
    steps = [{"title": title, "task_id": str(task_id),
        "status": tasks[task_id].status if task_id in tasks and tasks[task_id].deleted_at is None else "pending"}
        for task_id, title in zip(ids, plan.milestones)]
    if done == len(ids):
        return "completed", {"summary": "全部步骤已有完成结果，计划进度已自动回写。", "steps": steps, "progress": 100}
    index = next(i for i, task_id in enumerate(ids) if task_id not in tasks or tasks[task_id].status != "done" or tasks[task_id].deleted_at is not None)
    current = tasks.get(ids[index])
    if current is not None and (current.status == "blocked" or current.deleted_at is not None):
        return "blocked", {"summary": f"步骤「{plan.milestones[index]}」已阻塞或移除，请处理后继续。", "steps": steps, "progress": plan.progress}
    if current is None:
        learning = list((await session.execute(select(WorkspaceLearningItem).where(
            WorkspaceLearningItem.user_id == workspace.user_id, WorkspaceLearningItem.workspace_id == workspace.id,
            WorkspaceLearningItem.goal_id == plan.goal_id, WorkspaceLearningItem.archived_at.is_(None),
            WorkspaceLearningItem.source_url.is_not(None)).order_by(WorkspaceLearningItem.created_at).limit(3))).scalars().all())
        resources = "\n".join(f"学习资料：{item.title} {item.source_url}" for item in learning)
        current = Task(id=ids[index], user_id=workspace.user_id, workspace_id=workspace.id,
            project_id=plan.project_id, goal_id=plan.goal_id, plan_id=plan.id,
            title=plan.milestones[index][:240], description=f"后台排程 · {plan.title} · 第 {index + 1}/{len(ids)} 步\n{resources}".strip(),
            priority="medium", status="todo", due_at=now + timedelta(days=1), time_block=25)
        session.add(current)
        await session.flush()
        await append_event(session, user_id=workspace.user_id, workspace_id=workspace.id, project_id=plan.project_id,
            event_type="plan_action_scheduled", source_type="execution", source_id=plan.id,
            payload={"title": f"已排程：{current.title}", "task_id": str(current.id), "plan_id": str(plan.id)})
        steps[index]["status"] = "todo"
    return "waiting", {"summary": f"已安排第 {index + 1} 步：{current.title}。完成后后台自动安排下一步。",
        "steps": steps, "progress": plan.progress, "task_id": str(current.id), "application": "GrowthPilot 待办"}


async def _refresh_analysis(session: AsyncSession, workspace: Workspace, now: datetime):
    user = await session.get(User, workspace.user_id)
    if user is None:
        raise RuntimeError("工作空间账户不存在")
    today = now.astimezone(user_daily_timezone(user.settings)).date()
    report, _ = await build_report(session, user.id, workspace.id, user.settings, "week", today, now=now)
    # Stable comparison prevents repeated output events for an unchanged report.
    report.pop("generated_at", None)
    digest = hashlib.sha256(json.dumps(report, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    metrics = report["metrics"]
    overdue = list((await session.execute(select(Task).where(Task.user_id == user.id,
        Task.workspace_id == workspace.id, Task.deleted_at.is_(None), Task.status.in_(["todo", "doing"]),
        Task.due_at < now).order_by(Task.due_at).limit(20))).scalars().all())
    return "completed", {"summary": f"本周已完成 {metrics['completed_tasks']} 项行动，学习记录 {metrics['learning_minutes']} 分钟。",
        "report": report, "digest": digest, "overdue": [{"id": str(t.id), "title": t.title} for t in overdue],
        "application": "GrowthPilot 分析"}


async def _prepare_learning(session: AsyncSession, workspace: Workspace, item: WorkspaceLearningItem, now: datetime):
    from app.models.personal_work import PersonalDocument
    personal = await session.scalar(select(PersonalDocument).where(
        PersonalDocument.learning_item_id == item.id, PersonalDocument.user_id == workspace.user_id,
        PersonalDocument.workspace_id == workspace.id))
    if personal is not None:
        # C1 applications are explicit user work. Reading, timing or marking learning
        # applied must never complete a work task or manufacture a second task.
        return "waiting", {"summary": "笔记与练习已独立保存；应用任务由本人关联并确认实际成果。",
                           "learning_item_id": str(item.id), "task_id": personal.content.get("task_id")}
    from app.models.learning_review import LearningReviewUnit
    sourced = await session.scalar(select(LearningReviewUnit).where(
        LearningReviewUnit.user_id == workspace.user_id, LearningReviewUnit.workspace_id == workspace.id,
        LearningReviewUnit.item_id == item.id, LearningReviewUnit.archived_at.is_(None),
        LearningReviewUnit.source['flow_version'].as_integer() == 1).limit(1))
    if sourced is not None:
        return "waiting", {"summary": "原版本与问题已保存，请在完整学习流程中作答、核对并记录实际应用。",
                           "learning_item_id": str(item.id), "unit_id": str(sourced.id)}
    task_id = uuid.uuid5(item.id, "learning-action")
    task = await session.get(Task, task_id)
    if item.status == "completed":
        if task is not None and task.user_id == workspace.user_id and task.deleted_at is None:
            await complete_task(session, task)
        return "completed", {"summary": "学习结果已保存，关联行动已自动回写。", "learning_item_id": str(item.id)}
    card = (await session.execute(select(WorkspaceKnowledgeCard).where(WorkspaceKnowledgeCard.user_id == workspace.user_id,
        WorkspaceKnowledgeCard.workspace_id == workspace.id, WorkspaceKnowledgeCard.learning_item_id == item.id,
        WorkspaceKnowledgeCard.archived_at.is_(None)).order_by(WorkspaceKnowledgeCard.created_at).limit(1))).scalar_one_or_none()
    source = item.source_url or (card.source_url if card else None)
    content = card.content if card else None
    if not source and not content:
        resource = match_learning_resource(item.title, item.summary)
        if resource is not None:
            source = item.source_url = resource["url"]
            await append_event(session, user_id=workspace.user_id, workspace_id=workspace.id,
                event_type="learning_resource_matched", source_type="execution", source_id=item.id,
                payload={"title": f"已匹配学习资料：{resource['title']}", "source_url": source})
    if not source and not content:
        return "blocked", {"summary": "缺少可打开的学习资源。补充原始链接或关联知识原文后，后台会自动安排学习行动。", "learning_item_id": str(item.id)}
    if task is None:
        task = Task(id=task_id, user_id=workspace.user_id, workspace_id=workspace.id, project_id=item.project_id,
            goal_id=item.goal_id, title=f"学习：{item.title}"[:240], description=f"后台安排 · 阅读来源并留下实际应用结果。\n{source or '原文已保存在知识卡片中。'}",
            status="todo", priority="medium", due_at=now+timedelta(days=1), time_block=min(720,max(5,item.duration_minutes or 25)))
        session.add(task)
        await session.flush()
        await append_event(session, user_id=workspace.user_id, workspace_id=workspace.id,
            event_type="learning_action_scheduled", source_type="execution", source_id=item.id,
            payload={"title": f"已安排学习：{item.title}", "task_id": str(task.id)})
    elif task.user_id == workspace.user_id and task.workspace_id == workspace.id and task.deleted_at is None:
        task.description = f"后台安排 · 阅读来源并留下实际应用结果。\n{source or '原文已保存在知识卡片中。'}"
    return "waiting", {"summary": "学习资源已就绪，已安排到真实待办。阅读过程自动保存计时，提交结果后回写行动。",
        "learning_item_id": str(item.id), "task_id": str(task.id), "application": "GrowthPilot 学习与待办"}


async def execute_workspace(session: AsyncSession, workspace: Workspace, now: datetime):
    # A transaction lock protects both task creation and job output in multi-process servers.
    lock = int.from_bytes(workspace.id.bytes[:8], "big", signed=True)
    if not await session.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": lock}):
        return
    plans = list((await session.execute(select(GrowthPlan).where(GrowthPlan.user_id == workspace.user_id,
        GrowthPlan.workspace_id == workspace.id, GrowthPlan.archived_at.is_(None)))).scalars().all())
    actions = [("plan", plan.id, plan.title, plan) for plan in plans if plan.execution_enabled]
    # Paused existing jobs must also stop polling their old plan.
    for plan in plans:
        if not plan.execution_enabled:
            existing = await session.get(ExecutionJob, uuid.uuid5(workspace.id, f"execution:plan:{plan.id}"))
            if existing is not None:
                existing.status = "paused"
                existing.result = {"summary": "后台推进已暂停；已生成的任务保留。"}
    actions.append(("analysis", workspace.id, "每周事实汇总与到期检查", None))
    learning = list((await session.execute(select(WorkspaceLearningItem).where(WorkspaceLearningItem.user_id == workspace.user_id,
        WorkspaceLearningItem.workspace_id == workspace.id, WorkspaceLearningItem.archived_at.is_(None)))).scalars().all())
    actions = [("learning", item.id, item.title, item) for item in learning] + actions
    for kind, resource_id, title, plan in actions:
        job = await _job(session, workspace, kind, resource_id, title, now)
        if job.next_run_at > now:
            continue
        before = (job.status, job.result)
        job_id = job.id
        try:
            async with session.begin_nested():
                if kind == "learning":
                    status, result = await _prepare_learning(session, workspace, plan, now)
                elif kind == "plan":
                    status, result = await _advance_plan(session, workspace, plan, now)
                else:
                    status, result = await _refresh_analysis(session, workspace, now)
                job.title, job.status, job.result = title[:240], status, result
                job.error, job.attempts = None, 0
                job.last_run_at = now
                job.next_run_at = now + timedelta(seconds=settings.EXECUTION_POLL_SECONDS)
                if before != (status, result):
                    await append_event(session, user_id=workspace.user_id, workspace_id=workspace.id,
                        event_type="background_execution_updated", source_type="execution", source_id=job.id,
                        payload={"title": title, "status": status, "summary": result["summary"]})
                await session.flush()
        except Exception:
            logger.exception("Background job failed: %s", job_id)
            await session.refresh(job)
            job.status = "failed"
            job.error = "本次后台处理失败，系统将自动重试。"
            job.attempts += 1
            job.last_run_at = now
            job.next_run_at = now + timedelta(seconds=retry_delay(job.attempts))


async def execution_tick(session_factory=async_session_factory, now: datetime | None = None):
    now = now or datetime.now(UTC)
    async with session_factory() as session:
        workspaces = list((await session.execute(select(Workspace).where(
            Workspace.archived_at.is_(None), Workspace.status == "active"))).scalars().all())
    for workspace in workspaces:
        async with session_factory() as session:
            try:
                # Recheck after acquiring the workspace lock to avoid acting on archived data.
                current = await session.get(Workspace, workspace.id)
                if current is not None and current.archived_at is None and current.status == "active":
                    await execute_workspace(session, current, now)
                    await session.commit()
            except Exception:
                logger.exception("Background workspace failed: %s", workspace.id)
    async with session_factory() as session:
        from sqlalchemy.dialects.postgresql import insert
        await session.execute(insert(ExecutionHeartbeat).values(name="execution", last_seen_at=now)
            .on_conflict_do_update(index_elements=["name"], set_={"last_seen_at": now}))
        await session.commit()


async def execution_loop():
    while True:
        try:
            await execution_tick()
            from app.engines.reminder_engine import reminder_tick
            await reminder_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Execution worker tick failed")
        await asyncio.sleep(max(1, settings.EXECUTION_POLL_SECONDS))
