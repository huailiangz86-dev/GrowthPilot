"""Local preparation is independent of credentials; cloud actions are explicit and gated."""
import hashlib
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field, StrictBool, StrictInt, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.bailian_knowledge import owner
from app.api.personal_sources import lock_owner, owned_version
from app.api.personal_work import Strict, conflict
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, ForbiddenException, NotFoundException, ValidationException
from app.engines.bailian_knowledge import IDENTIFIER, KnowledgeConfig
from app.engines.source_pipeline import CloudPipeline, exact_matches, job_state, upload_content, verify_file
from app.models.personal_source import PersonalSourceVersion
from app.models.source_pipeline import SourcePipeline
from app.schemas.common import ApiResponse

router = APIRouter(prefix='/source-pipeline', tags=['source-pipeline'])


class Prepare(Strict):
    request_id: uuid.UUID
    source_id: uuid.UUID
    version: StrictInt = Field(ge=1, le=100)
    mode: Literal['original', 'extracted']


class Destination(Strict):
    index_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,160}$')
    category_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,160}$')


class Consent(Strict):
    consent: StrictBool = False


class Reconcile(Strict):
    file_id: str | None = Field(default=None, pattern=r'^[A-Za-z0-9_-]{1,160}$')
    job_id: str | None = Field(default=None, pattern=r'^[A-Za-z0-9_-]{1,160}$')


class Retrieve(Consent):
    query: str = Field(min_length=1, max_length=500)

    @field_validator('query')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('请填写检索问题。')
        return value.strip()


async def owned(session, uid, rid):
    row = await session.scalar(select(SourcePipeline).where(SourcePipeline.id == rid,
        SourcePipeline.user_id == uid).execution_options(populate_existing=True))
    if row is None:
        raise NotFoundException('资料导入清单')
    return row


async def source_for(session, uid, row):
    source = await session.scalar(select(PersonalSourceVersion).where(PersonalSourceVersion.id == row.source_version_id,
        PersonalSourceVersion.user_id == uid))
    if source is None:
        raise NotFoundException('资料原版本')
    return source


def row_data(row, source):
    state, error = row.state, row.error
    if state in ('registering', 'submitting') and row.lease_until and row.lease_until <= datetime.now(UTC):
        state, error = 'uncertain', '上次云端写入回执待核对，请从控制台核对编号；不会重复提交。'
    return {'id': str(row.id), 'source_id': str(source.source_id), 'source_version': source.version,
        'title': source.title, 'mode': row.mode, 'source_checksum': row.source_checksum,
        'payload_checksum': row.payload_checksum, 'bytes': row.byte_count, 'filename': row.filename,
        'endpoint': row.endpoint, 'workspace_id': row.workspace_id, 'index_id': row.index_id,
        'category_id': row.category_id, 'state': state, 'file_id': row.file_id, 'job_id': row.job_id,
        'error': error, 'receipts': row.receipts, 'updated_at': row.updated_at.isoformat()}


def cloud(row, uid, *, write=False):
    owner(uid)
    if not row.index_id:
        raise ValidationException('请先创建个人测试库并保存目的地。')
    config = KnowledgeConfig.load()
    if (row.endpoint, row.workspace_id) != (config.endpoint, config.workspace_id):
        raise ForbiddenException('连接业务空间或服务地址已改变，请重新核对原目的地。')
    if row.index_id == config.index_id:
        raise ForbiddenException('现有参考库保留只读，请选择独立个人测试库。')
    if write and not settings.BAILIAN_PERSONAL_IMPORT_ENABLED:
        raise ForbiddenException('本机当前仅准备本地流程。创建测试库后，再启用个人资料上传。')
    return CloudPipeline(replace(config, index_id=row.index_id))


@router.post('/prepare')
async def prepare(payload: Prepare, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await lock_owner(session, uid)
    existing = await session.scalar(select(SourcePipeline).where(SourcePipeline.user_id == uid,
        SourcePipeline.request_id == payload.request_id))
    source = await owned_version(session, uid, payload.source_id, payload.version)
    if existing:
        if existing.source_version_id != source.id or existing.mode != payload.mode:
            conflict('同一清单提交已有不同内容，请恢复原选择。')
        return ApiResponse(success=True, data=row_data(existing, source))
    raw = await session.scalar(select(PersonalSourceVersion.original).where(PersonalSourceVersion.id == source.id))
    content, extension = upload_content(source, payload.mode, raw)
    count = await session.scalar(select(func.count()).select_from(SourcePipeline).where(SourcePipeline.user_id == uid))
    if count >= 1000:
        raise ValidationException('本地导入清单已达 1000 份，请先处理已有清单。')
    # Reuse the same immutable source/mode while it still awaits a destination.
    existing = await session.scalar(select(SourcePipeline).where(SourcePipeline.user_id == uid,
        SourcePipeline.source_version_id == source.id, SourcePipeline.mode == payload.mode,
        SourcePipeline.index_id.is_(None)))
    if existing:
        return ApiResponse(success=True, data=row_data(existing, source))
    rid = uuid.uuid4()
    row = SourcePipeline(id=rid, user_id=uid, source_version_id=source.id, request_id=payload.request_id,
        mode=payload.mode, source_checksum=source.checksum, payload_checksum=hashlib.sha256(content).hexdigest(),
        byte_count=len(content), filename=f'growthpilot-{rid.hex}-v{source.version}.{extension}',
        state='prepared', receipts=[], updated_at=datetime.now(UTC))
    session.add(row)
    await session.commit()
    return ApiResponse(success=True, data=row_data(row, source))


@router.get('')
async def listing(page: int = Query(1, ge=1, le=10000), user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    rows = (await session.execute(select(SourcePipeline, PersonalSourceVersion).join(PersonalSourceVersion,
        PersonalSourceVersion.id == SourcePipeline.source_version_id).where(SourcePipeline.user_id == uid,
        PersonalSourceVersion.user_id == uid).order_by(SourcePipeline.updated_at.desc(), SourcePipeline.id)
        .offset((page - 1) * 20).limit(20))).all()
    return ApiResponse(success=True, data=[row_data(row, source) for row, source in rows])


@router.get('/{rid}')
async def detail(rid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    row = await owned(session, uid, rid)
    return ApiResponse(success=True, data=row_data(row, await source_for(session, uid, row)))


@router.post('/{rid}/destination')
async def destination(rid: uuid.UUID, payload: Destination, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    owner(uid)
    config = KnowledgeConfig.load()  # Reads credentials only; no cloud request.
    if payload.index_id == config.index_id:
        raise ForbiddenException('现有参考库保留只读，请选择独立个人测试库。')
    await lock_owner(session, uid)
    row = await owned(session, uid, rid)
    if row.index_id:
        if (row.index_id, row.category_id, row.workspace_id, row.endpoint) != (payload.index_id, payload.category_id, config.workspace_id, config.endpoint):
            conflict('此清单已冻结目的地，请另建清单，不改写已有来源映射。')
    elif row.state != 'prepared':
        conflict('此清单已经开始处理，不能更换目的地。')
    else:
        duplicate = await session.scalar(select(SourcePipeline).where(SourcePipeline.user_id == uid,
            SourcePipeline.source_version_id == row.source_version_id, SourcePipeline.mode == row.mode,
            SourcePipeline.index_id == payload.index_id, SourcePipeline.category_id == payload.category_id,
            SourcePipeline.workspace_id == config.workspace_id, SourcePipeline.endpoint == config.endpoint))
        if duplicate:
            return ApiResponse(success=True, data=row_data(duplicate, await source_for(session, uid, duplicate)))
        row.index_id, row.category_id, row.workspace_id, row.endpoint = payload.index_id, payload.category_id, config.workspace_id, config.endpoint
        row.updated_at = datetime.now(UTC)
        await session.commit()
    return ApiResponse(success=True, data=row_data(row, await source_for(session, uid, row)))


def receipt(row, step, request_id, status=None):
    # Only whitelisted receipt metadata is stored. Signed URLs/headers never persist.
    row.receipts = [*row.receipts[-99:], {'step': step, 'request_id': request_id if isinstance(request_id, str) and IDENTIFIER.fullmatch(request_id) else None,
        'at': datetime.now(UTC).isoformat(), 'status': status if isinstance(status, str) and IDENTIFIER.fullmatch(status) else None}]


async def advance_row(session, uid, row, consent):
    if not consent:
        raise ForbiddenException('请先允许将这份冻结资料发送到所选百炼测试库。')
    adapter = cloud(row, uid, write=True)
    now = datetime.now(UTC)
    await lock_owner(session, uid)
    row = await owned(session, uid, row.id)
    source = await source_for(session, uid, row)
    if row.operation_id and row.lease_until and row.lease_until > now:
        return row_data(row, source)
    if row.state in ('registering', 'submitting', 'uncertain'):
        row.state, row.error = 'uncertain', '云端写入回执待核对，请核对实际编号，不会重复提交。'
        row.operation_id, row.lease_until = None, None
        await session.commit()
        return row_data(row, source)
    if row.state == 'ready':
        return row_data(row, source)
    state = row.state
    if state == 'indexing' and row.receipts and row.receipts[-1].get('step') == 'index_checked' and now - row.updated_at < timedelta(seconds=3):
        return row_data(row, source)
    if state == 'failed':
        state = 'indexing' if row.job_id else 'parsing' if row.file_id else 'prepared'
    operation = uuid.uuid4()
    row.operation_id, row.lease_until = operation, now + timedelta(seconds=300)
    row.state = {'prepared': 'uploading', 'uploading': 'uploading', 'uploaded': 'registering', 'parsed': 'submitting'}.get(state, state)
    row.error, row.updated_at = None, now
    raw = await session.scalar(select(PersonalSourceVersion.original).where(PersonalSourceVersion.id == source.id))
    content, _ = upload_content(source, row.mode, raw)
    if hashlib.sha256(content).hexdigest() != row.payload_checksum or source.checksum != row.source_checksum:
        conflict('冻结内容校验不符，未访问云端。')
    await session.commit()  # The write marker is durable before every side effect.
    result, failure = None, None
    try:
        if state in ('prepared', 'uploading'):
            result = await adapter.upload(row, content)
        elif state == 'uploaded':
            result = await adapter.register(row)
        elif state == 'parsed':
            result = await adapter.submit(row)
        elif state == 'parsing':
            result = await adapter.describe(row)
            verify_file(row, result[0], row.file_id)
        elif state == 'indexing':
            result = await adapter.job(row)
            job_state(row, result[0], row.job_id)
        else:
            raise ValidationException('当前步骤不可继续。')
    except AppException as exc:
        failure = exc
    except Exception:
        failure = AppException('BAILIAN_TRANSPORT', '本次处理回执暂未取得，请重新核对当前步骤。', 502)
    await lock_owner(session, uid)
    row = await owned(session, uid, row.id)
    if row.operation_id != operation:
        return row_data(row, source)
    row.operation_id, row.lease_until, row.updated_at = None, None, datetime.now(UTC)
    if failure:
        row.state = ('uncertain' if failure.code != 'BAILIAN_REMOTE' else state) if state in ('uploaded', 'parsed') else 'prepared' if state in ('prepared', 'uploading') else state
        row.error = failure.message
    elif state in ('prepared', 'uploading'):
        row.lease_id, row.state = result['lease_id'], 'uploaded'
        receipt(row, 'uploaded', result['request_id'])
    elif state == 'uploaded':
        row.file_id, row.state = result['file_id'], 'parsing'
        receipt(row, 'registered', result['request_id'])
    elif state == 'parsed':
        row.job_id, row.state = result['job_id'], 'indexing'
        receipt(row, 'index_submitted', result['request_id'])
    elif state == 'parsing':
        status = result[0].get('Status')
        row.state = 'parsed' if status == 'PARSE_SUCCESS' else 'failed' if status == 'PARSE_FAILED' else 'parsing'
        receipt(row, 'parse_checked', result[1], status)
        if row.state == 'failed':
            row.error = '百炼文件解析失败，原资料与文件编号已保留，请先在控制台处理。'
    elif state == 'indexing':
        row.state = job_state(row, result[0], row.job_id)
        receipt(row, 'index_checked', result[1], result[0].get('Status'))
        if row.state == 'failed':
            row.error = '百炼索引处理失败，文件与任务编号已保留，请先在控制台处理。'
    await session.commit()
    return row_data(row, source)


@router.post('/{rid}/advance')
async def advance(rid: uuid.UUID, payload: Consent, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    return ApiResponse(success=True, data=await advance_row(session, uid, await owned(session, uid, rid), payload.consent))


@router.post('/{rid}/reset-upload')
async def reset_upload(rid: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await lock_owner(session, uid)
    row = await owned(session, uid, rid)
    # Only a definitive registration rejection permits replacing a temporary
    # upload. Unknown remote writes must always reconcile first.
    if row.state != 'uploaded' or not row.error or row.file_id or row.operation_id:
        conflict('当前状态不能重新上传；不确定的登记回执须先核对。')
    row.state, row.lease_id, row.error, row.updated_at = 'prepared', None, None, datetime.now(UTC)
    receipt(row, 'upload_reset', None)
    await session.commit()
    return ApiResponse(success=True, data=row_data(row, await source_for(session, uid, row)))


@router.post('/{rid}/reconcile')
async def reconcile(rid: uuid.UUID, payload: Reconcile, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    row = await owned(session, uid, rid)
    adapter = cloud(row, uid)
    await session.commit()
    if row_data(row, await source_for(session, uid, row))['state'] != 'uncertain':
        conflict('当前回执不需要人工核对。')
    if not row.file_id and payload.file_id and not payload.job_id:
        data, request_id = await adapter.describe(row, payload.file_id)
        verify_file(row, data, payload.file_id)
        field, value, state = 'file_id', payload.file_id, 'parsing'
    elif row.file_id and payload.job_id and not payload.file_id:
        data, request_id = await adapter.job(row, payload.job_id)
        state = job_state(row, data, payload.job_id)
        field, value = 'job_id', payload.job_id
    else:
        raise ValidationException('请填写当前缺失的实际云端文件或索引任务编号。')
    await lock_owner(session, uid)
    row = await owned(session, uid, rid)
    if row_data(row, await source_for(session, uid, row))['state'] != 'uncertain':
        conflict('该回执已被处理，请刷新清单。')
    setattr(row, field, value)
    row.state, row.error, row.operation_id, row.lease_until = state, None, None, None
    row.updated_at = datetime.now(UTC)
    receipt(row, 'reconciled', request_id)
    await session.commit()
    return ApiResponse(success=True, data=row_data(row, await source_for(session, uid, row)))


async def ready_row(session, uid, rid):
    row = await owned(session, uid, rid)
    if row.state != 'ready':
        raise ValidationException('请先取得本文件的索引完成回执，再读取切片。')
    source = await source_for(session, uid, row)
    return row, source, cloud(row, uid)


def traced(data, row, source):
    items = [{**c, 'local_matches': exact_matches(c['text'], source.extraction)} for c in data['items'] if c['document_id'] == row.file_id]
    return {**data, 'items': items, 'retrieved_at': datetime.now(UTC).isoformat(), 'manifest': row_data(row, source)}


@router.get('/{rid}/chunks')
async def chunks(rid: uuid.UUID, page: int = Query(1, ge=1, le=10000), user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    row, source, adapter = await ready_row(session, uuid.UUID(user_id), rid)
    return ApiResponse(success=True, data=traced(await adapter.chunks(row.file_id, page), row, source))


@router.post('/{rid}/retrieve')
async def retrieve(rid: uuid.UUID, payload: Retrieve, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    if not payload.consent:
        raise ForbiddenException('请允许将本次问题发送给百炼。')
    row, source, adapter = await ready_row(session, uuid.UUID(user_id), rid)
    return ApiResponse(success=True, data=traced(await adapter.retrieve(payload.query), row, source))
