"""User-directed uploads and public snapshots with immutable excerpt provenance."""
import base64
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote
from fastapi import APIRouter, Depends, Request, Response
from pydantic import Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.personal_work import Resource, Strict, conflict, owned, scope
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.material_parser import MAX_BYTES, PARSER_VERSION, MaterialError, parse_material
from app.engines.web_material import WEB_PARSER_VERSION, fetch_webpage, public_url
from app.models.learning_material import LearningMaterial, LearningMaterialExcerpt
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/learning-materials", tags=["learning-materials"])
MAX_BODY = 3 * 1024 * 1024


class MaterialUpload(Strict):
    request_id: uuid.UUID
    title: str = Field(min_length=1, max_length=240)
    kind: Literal["text", "txt", "md", "pdf"]
    filename: str = Field(default="粘贴正文.txt", min_length=1, max_length=240)
    source_url: str | None = Field(default=None, max_length=2000)
    text: str | None = Field(default=None, max_length=200000)
    data_base64: str | None = Field(default=None, max_length=2796204)

    @field_validator("title", "filename")
    @classmethod
    def safe_label(cls, value):
        if not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError("请填写不含控制字符的资料标题与文件名")
        return value.strip()

    @field_validator("source_url")
    @classmethod
    def safe_source_url(cls, value):
        return Resource.safe_url(value) if value else None

    @model_validator(mode="after")
    def unambiguous_source(self):
        if self.kind == "text":
            if not self.text or not self.text.strip() or self.data_base64 is not None:
                raise ValueError("请粘贴非空正文")
        elif self.text is not None or not self.data_base64:
            raise ValueError("请选择资料文件")
        elif not self.filename.lower().endswith("." + self.kind):
            raise ValueError("文件扩展名需与资料类型一致")
        self.raw_bytes()
        return self

    def raw_bytes(self):
        try:
            raw = self.text.encode("utf-8") if self.kind == "text" else base64.b64decode(self.data_base64, validate=True)
        except (ValueError, UnicodeError) as exc:
            raise ValueError("资料编码无效，请重新选择文件") from exc
        if not raw or len(raw) > MAX_BYTES:
            raise ValueError("单份资料最大 2 MB")
        return raw


class WebMaterialUpload(Strict):
    request_id: uuid.UUID
    title: str = Field(min_length=1, max_length=240)
    source_url: str = Field(min_length=1, max_length=2000)

    @field_validator("title")
    @classmethod
    def title_required(cls, value):
        return MaterialUpload.safe_label(value)

    @field_validator("source_url")
    @classmethod
    def public_source(cls, value):
        return public_url(value.strip())


async def ingest_webpage(session, uid, wid, iid, payload):
    fingerprint = hashlib.sha256(json.dumps({"type": "public_web", "workspace": str(wid), "item": str(iid),
        **payload.model_dump(mode="json", exclude={"request_id"})}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    async def existing_source():
        row = await session.scalar(select(LearningMaterial).where(LearningMaterial.user_id == uid,
            LearningMaterial.request_id == payload.request_id))
        if row and row.fingerprint != fingerprint:
            conflict("这次网页导入标识已有不同内容，请重试原提交或另添一份资料。")
        return row

    await item_scope(session, uid, wid, iid)
    row = await existing_source()
    if row:
        return material_data(row, True)
    await session.commit()  # Never hold a database lock while fetching a remote page.
    try:
        raw, extraction = await fetch_webpage(payload.source_url)
    except MaterialError as exc:
        raise ValidationException(str(exc)) from exc
    # Recheck ownership and the stable receipt after network access, under the workspace lock.
    await item_scope(session, uid, wid, iid, lock=True)
    row = await existing_source()
    if row:
        return material_data(row, True)
    count, size = (await session.execute(select(func.count(), func.coalesce(func.sum(LearningMaterial.byte_count), 0))
        .where(LearningMaterial.user_id == uid, LearningMaterial.item_id == iid))).one()
    if count >= 30 or size + len(raw) > 20 * 1024 * 1024:
        raise ValidationException("每个学习页最多 30 份资料、原文件合计 20 MB。可另建学习页继续。")
    now = datetime.now(UTC)
    extension = "html" if "html" in extraction["web"]["content_type"].lower() else "txt"
    row = LearningMaterial(id=uuid.uuid5(uid, f"material:{payload.request_id}"), user_id=uid,
        workspace_id=wid, item_id=iid, request_id=payload.request_id, fingerprint=fingerprint,
        checksum=hashlib.sha256(raw).hexdigest(), title=payload.title, kind="web", filename=f"网页快照.{extension}",
        source_url=payload.source_url, byte_count=len(raw), original=raw, extraction=extraction,
        status="ready", error=None, attempts=1, attempt_id=uuid.uuid4(), lease_until=now,
        parser_version=WEB_PARSER_VERSION, created_at=now, updated_at=now)
    session.add(row)
    await session.commit()
    return material_data(row, True)


def material_data(row, detail=False):
    extraction = row.extraction or {}
    result = {"id": str(row.id), "request_id": str(row.request_id), "title": row.title, "kind": row.kind,
        "filename": row.filename, "source_url": row.source_url, "checksum": row.checksum,
        "bytes": row.byte_count, "status": row.status, "error": row.error, "attempts": row.attempts,
        "parser_version": row.parser_version, "characters": extraction.get("characters"),
        "page_count": extraction.get("page_count"), "chunks_count": len(extraction.get("chunks", [])),
        "warnings": extraction.get("warnings", []), "created_at": row.created_at.isoformat()}
    if "web" in extraction:
        result["web"] = extraction["web"]
    if detail:
        result["extraction"] = row.extraction
    return result


async def item_scope(session, uid, wid, iid, lock=False):
    workspace = await scope(session, uid, wid, lock=lock)
    await owned(session, WorkspaceLearningItem, uid, wid, iid)
    return workspace


async def material_owned(session, uid, wid, iid, mid, lock=False):
    await item_scope(session, uid, wid, iid, lock)
    row = await session.scalar(select(LearningMaterial).where(LearningMaterial.id == mid,
        LearningMaterial.user_id == uid, LearningMaterial.workspace_id == wid, LearningMaterial.item_id == iid))
    if row is None:
        raise NotFoundException("LearningMaterial")
    return row


async def finish_parse(session, row, uid, wid, iid, raw):
    mid, attempt = row.id, row.attempt_id
    kind = row.kind
    await session.commit()  # Preserve original source before processing; release workspace lock.
    try:
        result, error = await parse_material(raw, kind), None
    except TimeoutError:
        result, error = None, "PDF 提取超时，请拆分资料或重试原文件。"
    except MaterialError as exc:
        result, error = None, str(exc)
    except Exception:
        result, error = None, "资料提取暂时失败，原文件已保留，可以重试。"
    row = await material_owned(session, uid, wid, iid, mid, lock=True)
    await session.refresh(row)
    if row.attempt_id == attempt and row.status == "processing":
        row.extraction, row.error = result, error
        row.status = "ready" if result else "failed"
        row.updated_at = datetime.now(UTC)
    await session.commit()
    return material_data(row, True)


async def ingest(session, uid, wid, iid, payload):
    await item_scope(session, uid, wid, iid, lock=True)
    raw = payload.raw_bytes()
    checksum = hashlib.sha256(raw).hexdigest()
    canonical = {"workspace": str(wid), "item": str(iid), "checksum": checksum,
                 **payload.model_dump(mode="json", exclude={"text", "data_base64", "request_id"})}
    fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    existing = await session.scalar(select(LearningMaterial).where(LearningMaterial.user_id == uid,
        LearningMaterial.request_id == payload.request_id))
    now = datetime.now(UTC)
    if existing:
        if existing.fingerprint != fingerprint:
            conflict("这次上传标识已有不同内容，请核对后作为新资料提交。")
        if existing.status == "ready" or (existing.status == "processing" and existing.lease_until > now):
            return material_data(existing, True)
        row = existing
    else:
        count, size = (await session.execute(select(func.count(), func.coalesce(func.sum(LearningMaterial.byte_count), 0))
            .where(LearningMaterial.user_id == uid, LearningMaterial.item_id == iid))).one()
        if count >= 30 or size + len(raw) > 20 * 1024 * 1024:
            raise ValidationException("每个学习页最多 30 份资料、原文件合计 20 MB。可另建学习页继续。")
        row = LearningMaterial(id=uuid.uuid5(uid, f"material:{payload.request_id}"), user_id=uid,
            workspace_id=wid, item_id=iid, request_id=payload.request_id, fingerprint=fingerprint,
            checksum=checksum, title=payload.title, kind=payload.kind, filename=payload.filename,
            source_url=payload.source_url, byte_count=len(raw), original=raw, extraction=None,
            status="processing", error=None, attempts=0, created_at=now, updated_at=now,
            parser_version=PARSER_VERSION)
        session.add(row)
    row.status, row.error, row.attempts = "processing", None, row.attempts + 1
    row.attempt_id, row.lease_until = uuid.uuid4(), now + timedelta(seconds=45)
    await session.flush()
    return await finish_parse(session, row, uid, wid, iid, raw)


@router.post("/{wid}/{iid}")
async def upload(wid: uuid.UUID, iid: uuid.UUID, request: Request,
                 user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    # Count streamed bytes too: content-length alone does not bound chunked uploads.
    body = bytearray()
    async for block in request.stream():
        if len(body) + len(block) > MAX_BODY:
            raise ValidationException("上传请求过大，单份资料最大 2 MB。")
        body.extend(block)
    try:
        payload = MaterialUpload.model_validate_json(body)
    except ValidationError as exc:
        raise ValidationException(str(exc.errors()[0]["msg"])) from exc
    try:
        result = await ingest(session, uuid.UUID(user_id), wid, iid, payload)
    except IntegrityError:
        await session.rollback()
        conflict("上传标识已有内容，请重试原提交或核对后新建。")
    return ApiResponse(success=True,data=result)


@router.post("/{wid}/{iid}/webpage")
async def webpage(wid: uuid.UUID, iid: uuid.UUID, payload: WebMaterialUpload,
                  user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    try:
        result = await ingest_webpage(session, uuid.UUID(user_id), wid, iid, payload)
    except IntegrityError:
        await session.rollback()
        conflict("导入标识已有内容，请重试原提交。")
    return ApiResponse(success=True, data=result)


@router.get("/{wid}/{iid}")
async def listing(wid: uuid.UUID, iid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await item_scope(session, uid, wid, iid)
    rows = (await session.scalars(select(LearningMaterial).where(LearningMaterial.user_id == uid,
        LearningMaterial.workspace_id == wid, LearningMaterial.item_id == iid).order_by(LearningMaterial.created_at.desc()))).all()
    return ApiResponse(success=True,data=[material_data(row) for row in rows])


@router.get("/{wid}/{iid}/{mid}")
async def detail(wid: uuid.UUID, iid: uuid.UUID, mid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    row = await material_owned(session, uid, wid, iid, mid)
    result = material_data(row, True)
    excerpts = (await session.scalars(select(LearningMaterialExcerpt).where(LearningMaterialExcerpt.user_id == uid,
        LearningMaterialExcerpt.material_id == mid).order_by(LearningMaterialExcerpt.created_at.desc()))).all()
    result["excerpts"] = [{"id": str(e.id), "revision_id": str(e.revision_id), **e.content} for e in excerpts]
    return ApiResponse(success=True,data=result)


@router.post("/{wid}/{iid}/{mid}/retry")
async def retry(wid: uuid.UUID, iid: uuid.UUID, mid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid, now = uuid.UUID(user_id), datetime.now(UTC)
    row = await material_owned(session, uid, wid, iid, mid, lock=True)
    if row.status == "ready" or (row.status == "processing" and row.lease_until > now):
        return ApiResponse(success=True,data=material_data(row, True))
    raw = await session.scalar(select(LearningMaterial.original).where(LearningMaterial.id == mid))
    row.status, row.error, row.attempts = "processing", None, row.attempts + 1
    row.attempt_id, row.lease_until = uuid.uuid4(), now + timedelta(seconds=45)
    return ApiResponse(success=True,data=await finish_parse(session, row, uid, wid, iid, raw))


@router.get("/{wid}/{iid}/{mid}/original")
async def original(wid: uuid.UUID, iid: uuid.UUID, mid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    row = await material_owned(session, uuid.UUID(user_id), wid, iid, mid)
    raw = await session.scalar(select(LearningMaterial.original).where(LearningMaterial.id == mid))
    return Response(content=raw, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename=source.{row.kind if row.kind != 'text' else 'txt'}; filename*=UTF-8''{quote(row.filename, safe='')}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})
