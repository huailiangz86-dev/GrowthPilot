"""Workspace capability catalog and explicit authorization settings API."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.capability_engine import (
    CONFIGURABLE_CAPABILITY_TYPES,
    EffectiveCapability,
    capability_blocked_reason,
    effective_capability,
    get_capability,
    get_workspace_capability_setting,
    list_capabilities,
    save_workspace_capability_setting,
)
from app.engines.workspace_engine import get_workspace
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/capabilities", tags=["capabilities"])


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class CapabilityResponse(BaseModel):
    id: str
    capability_type: str
    name: str
    slug: str
    description: str
    source: str
    version: str
    status: str
    dependencies: list[str]
    permissions: list[str]
    available_permissions: list[str]
    workspace_scope: str
    workspace_ids: list[str]
    entrypoint: str | None
    configurable: bool
    setting_status: str | None
    blocked_reason: str | None


class CapabilitySettingUpdateRequest(BaseModel):
    workspace_id: str
    status: Literal["enabled", "disabled"]
    permissions: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("permissions")
    @classmethod
    def normalize_permissions(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            permission = value.strip()
            if permission and permission not in normalized:
                normalized.append(permission[:160])
        return normalized


def _response(item: EffectiveCapability, workspace_id: uuid.UUID) -> CapabilityResponse:
    capability = item.capability
    workspace_scope = "current" if item.configurable else capability.workspace_scope
    workspace_ids = [str(workspace_id)] if item.configurable else (capability.workspace_ids or [])
    return CapabilityResponse(
        id=str(capability.id),
        capability_type=capability.capability_type,
        name=capability.name,
        slug=capability.slug,
        description=capability.description,
        source=capability.source,
        version=capability.version,
        status=item.status,
        dependencies=capability.dependencies or [],
        permissions=item.permissions,
        available_permissions=item.available_permissions,
        workspace_scope=workspace_scope,
        workspace_ids=workspace_ids,
        entrypoint=capability.entrypoint,
        configurable=item.configurable,
        setting_status=item.setting.status if item.setting else None,
        blocked_reason=item.blocked_reason,
    )


@router.get("", response_model=ApiResponse[list[CapabilityResponse]])
async def list_capabilities_endpoint(
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[CapabilityResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    capabilities = await list_capabilities(session, user_id=uid, workspace_id=workspace.id)
    resolved = [
        await effective_capability(
            session,
            capability=item,
            user_id=uid,
            workspace_id=workspace.id,
        )
        for item in capabilities
    ]
    return ApiResponse(success=True, data=[_response(item, workspace.id) for item in resolved])


@router.get("/{capability_id}", response_model=ApiResponse[CapabilityResponse])
async def get_capability_endpoint(
    capability_id: str,
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=_uuid(capability_id, "Capability"),
    )
    if capability is None:
        raise NotFoundException("Capability")
    resolved = await effective_capability(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=workspace.id,
    )
    return ApiResponse(success=True, data=_response(resolved, workspace.id))


@router.post("/{capability_id}/settings", response_model=ApiResponse[CapabilityResponse])
async def update_capability_settings_endpoint(
    capability_id: str,
    payload: CapabilitySettingUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=_uuid(capability_id, "Capability"),
    )
    if capability is None:
        raise NotFoundException("Capability")
    if capability.capability_type not in CONFIGURABLE_CAPABILITY_TYPES:
        raise ValidationException("App 入口不能在此处启停")
    allowed_permissions = set(capability.permissions or [])
    if any(permission not in allowed_permissions for permission in payload.permissions):
        raise ValidationException("只能确认该能力声明的权限")
    if payload.status == "enabled" and allowed_permissions and not payload.permissions:
        raise ValidationException("启用前请至少确认一项权限")
    blocked_reason = await capability_blocked_reason(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=workspace.id,
    )
    if payload.status == "enabled" and blocked_reason:
        raise ValidationException(blocked_reason)
    existing = await get_workspace_capability_setting(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=capability.id,
    )
    await save_workspace_capability_setting(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=workspace.id,
        status=payload.status,
        permissions=payload.permissions,
        existing=existing,
    )
    await session.commit()
    resolved = await effective_capability(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=workspace.id,
    )
    return ApiResponse(success=True, data=_response(resolved, workspace.id))
