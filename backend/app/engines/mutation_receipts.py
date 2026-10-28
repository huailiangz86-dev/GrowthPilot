"""Atomic request receipts for workspace mutations, shared by browser and server."""
import hashlib
import json
import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException, NotFoundException
from app.models.personal_work import PersonalCommandReceipt
from app.models.workspace import Workspace


async def prepare_mutation(session: AsyncSession, uid: uuid.UUID, wid: uuid.UUID,
                           request_id: uuid.UUID | None, action: str, payload: BaseModel):
    if request_id is None:
        return None, None
    # Serialize against all other mutations of the same workspace. The lock is
    # held through object + event + receipt commit, including concurrent replays.
    locked = await session.scalar(select(Workspace.id).where(Workspace.id == wid, Workspace.user_id == uid,
                                                           Workspace.archived_at.is_(None)).with_for_update())
    if locked is None:
        raise NotFoundException("Workspace")
    fingerprint = hashlib.sha256(json.dumps({"action": action, "payload": payload.model_dump(mode="json", exclude={"request_id"})},
                                           sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    receipt = await session.scalar(select(PersonalCommandReceipt).where(PersonalCommandReceipt.user_id == uid,
                                   PersonalCommandReceipt.workspace_id == wid, PersonalCommandReceipt.request_id == request_id))
    if receipt is not None:
        if receipt.fingerprint != fingerprint:
            raise AppException("CREATE_REQUEST_CONFLICT", "同一保存标识对应不同内容。原提交已保留，请先核对已有结果。", 409)
        return fingerprint, receipt.result
    return fingerprint, None


def record_mutation(session: AsyncSession, uid: uuid.UUID, wid: uuid.UUID, request_id: uuid.UUID | None,
                    fingerprint: str | None, result: BaseModel):
    if request_id is not None:
        session.add(PersonalCommandReceipt(user_id=uid, workspace_id=wid, request_id=request_id,
                                          fingerprint=fingerprint, result=result.model_dump(mode="json")))
