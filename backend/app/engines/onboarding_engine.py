"""Resume a confirmed object graph without recreating successful objects."""

import hashlib
import json
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, NotFoundException
from app.engines.learning_engine import create_learning_item
from app.engines.memory_engine import create_from_source
from app.engines.task_engine import create_task
from app.engines.workspace_engine import append_event, create_project, create_workspace, get_project, get_workspace
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.onboarding_submission import OnboardingSubmission
from app.models.user import User

logger = structlog.get_logger()


async def _create_object(session, key, values, ids, workspace, uid):
    if key == "workspace":
        return await create_workspace(session, user_id=uid, **values)
    if key == "project":
        return await create_project(session, workspace=workspace, **values, status="active", priority="high", progress=0, due_at=None)
    links = {"user_id": uid, "workspace_id": workspace.id, "project_id": uuid.UUID(ids["project"]) if ids.get("project") else None}
    if key == "goal":
        goal = Goal(id=uuid.uuid4(), **links, **values)
        session.add(goal)
        await append_event(session, user_id=uid, workspace_id=workspace.id, project_id=goal.project_id,
                           event_type="goal_created", source_type="goal", source_id=goal.id, payload={"title": goal.title})
        return goal
    goal_id = uuid.UUID(ids["goal"]) if ids.get("goal") else None
    if key == "plan":
        plan = GrowthPlan(id=uuid.uuid4(), **links, goal_id=goal_id, **values, current_week=1, progress=0, status="active")
        session.add(plan)
        await append_event(session, user_id=uid, workspace_id=workspace.id, project_id=plan.project_id,
                           event_type="growth_plan_created", source_type="growth_plan", source_id=plan.id,
                           payload={"title": plan.title, "goal_id": str(goal_id)})
        return plan
    values = {**values, "project_id": links["project_id"], "goal_id": goal_id}
    if key.startswith("task-"):
        if values.get("due_at") is not None:
            values["due_at"] = datetime.fromisoformat(values["due_at"])
        return await create_task(session, workspace=workspace, values={**values, "status": "todo", "plan_id": uuid.UUID(ids["plan"]) if ids.get("plan") else None})
    return await create_learning_item(session, workspace=workspace, values={**values, "status": "queued", "progress": 0})


async def save_onboarding_graph(session: AsyncSession, *, uid: uuid.UUID, payload: dict) -> dict:
    # Lock an existing parent row: even two first requests cannot race to create a receipt.
    user = (await session.execute(select(User).where(User.id == uid).with_for_update())).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    request_id = uuid.UUID(payload["client_request_id"])
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    receipt = (await session.execute(select(OnboardingSubmission).where(
        OnboardingSubmission.user_id == uid, OnboardingSubmission.client_request_id == request_id,
    ))).scalar_one_or_none()
    if receipt is not None:
        if receipt.request_hash != fingerprint:
            raise AppException("ONBOARDING_REQUEST_CONFLICT", "这次确认的内容已固定，请保留原方案并重试", 409)
        if receipt.result.get("saved"):
            return dict(receipt.result)
        result = dict(receipt.result)
    else:
        memory = await create_from_source(session, uid, "onboarding", payload["raw_input"], source_id=request_id,
                                          summary=payload["raw_input"][:300], tags=["onboarding", "personal_context"], importance=5)
        result = {"client_request_id": str(request_id), "memory_id": str(memory.id), "profile": payload["profile"], "saved": False, "objects": []}
        receipt = OnboardingSubmission(id=uuid.uuid4(), user_id=uid, client_request_id=request_id, request_hash=fingerprint, result=result)
        session.add(receipt)
        await session.flush()

    definitions = [(key, payload[key]) for key in ("workspace", "project", "goal", "plan") if payload.get(key) is not None]
    definitions += [(task["client_key"], {key: value for key, value in task.items() if key != "client_key"}) for task in payload["tasks"]]
    if payload.get("learning") is not None:
        definitions.append(("learning", payload["learning"]))
    previous = {item["key"]: item for item in result["objects"]}
    ids = {key: item["id"] for key, item in previous.items() if item["status"] == "synced"}
    selected = {key for key, _ in definitions}
    workspace = await get_workspace(session, uid, uuid.UUID(ids["workspace"])) if ids.get("workspace") else None
    if ids.get("workspace") and workspace is None:
        raise AppException("ONBOARDING_WORKSPACE_UNAVAILABLE", "工作空间已归档或不可用，请先恢复它再重试", 409)
    if ids.get("project") and await get_project(session, uid, uuid.UUID(ids["project"])) is None:
        raise AppException("ONBOARDING_SOURCE_UNAVAILABLE", "关联项目已归档或不可用，请先恢复它再重试", 409)
    for key, model in (("goal", Goal), ("plan", GrowthPlan)):
        if ids.get(key):
            source = await session.get(model, uuid.UUID(ids[key]))
            if source is None or source.user_id != uid or source.workspace_id != workspace.id or source.archived_at is not None:
                raise AppException("ONBOARDING_SOURCE_UNAVAILABLE", "关联对象已归档或不可用，请先恢复它再重试", 409)
    objects = []
    for key, values in definitions:
        if key in ids:
            objects.append(previous[key])
            continue
        dependencies = [] if key == "workspace" else ["workspace"]
        if key not in {"workspace", "project"} and "project" in selected:
            dependencies.append("project")
        if (key == "plan" or key == "learning" or key.startswith("task-")) and "goal" in selected:
            dependencies.append("goal")
        if key.startswith("task-") and "plan" in selected:
            dependencies.append("plan")
        missing = [dependency for dependency in dependencies if dependency not in ids]
        if missing:
            objects.append({"key": key, "id": None, "status": "blocked", "error": "等待关联对象保存"})
            continue
        try:
            # Each object and its event succeed together; a failed child cannot undo its saved siblings.
            async with session.begin_nested():
                item = await _create_object(session, key, values, ids, workspace, uid)
                await session.flush()
            ids[key] = str(item.id)
            if key == "workspace":
                workspace = item
            objects.append({"key": key, "id": str(item.id), "status": "synced", "error": None})
        except Exception as error:
            logger.warning("onboarding_object_save_failed", key=key, error_type=type(error).__name__)
            objects.append({"key": key, "id": None, "status": "failed", "error": "保存未完成，请重试"})

    saved = all(item["status"] == "synced" for item in objects)
    result = {**result, "objects": objects, "saved": saved, "workspace_id": ids.get("workspace"), "project_id": ids.get("project")}
    receipt.result = result
    if ids.get("project"):
        workspace.active_project_id = uuid.UUID(ids["project"])
        if ids.get("goal"):
            project = await get_project(session, uid, uuid.UUID(ids["project"]))
            project.goal_id = uuid.UUID(ids["goal"])
    if saved:
        await append_event(session, user_id=uid, workspace_id=workspace.id, project_id=uuid.UUID(ids["project"]) if ids.get("project") else None,
                           event_type="onboarding_confirmed", source_type="onboarding", source_id=workspace.id,
                           payload={"raw_input": payload["raw_input"], "client_request_id": str(request_id), "confirmed_objects": [key for key, _ in definitions]})
    settings = dict(user.settings or {})
    settings["profile"] = payload["profile"]
    settings["personal_context"] = {**settings.get("personal_context", {}), "completed": saved, "memory_id": result["memory_id"],
                                     "workspace_id": ids.get("workspace"), "project_id": ids.get("project"), "completed_at": datetime.now(UTC).isoformat() if saved else None}
    user.settings = settings
    await session.commit()
    return result
