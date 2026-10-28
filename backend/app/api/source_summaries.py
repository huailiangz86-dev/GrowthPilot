"""Selected personal sources -> cited AI preview -> durable, reusable adoption."""
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Query
from pydantic import Field, StrictBool, StrictInt, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import llm_service
from app.ai.prompt_router import get_variant
from app.api.personal_sources import lock_owner, owned_version
from app.api.personal_work import Strict, conflict
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.source_summary import validate_summary
from app.models.source_summary import SourceSummary
from app.schemas.common import ApiResponse

router = APIRouter(prefix='/source-summaries', tags=['source-summaries'])
logger = structlog.get_logger()


class Selection(Strict):
    source_id: uuid.UUID
    version: StrictInt = Field(ge=1, le=100)
    checksum: str = Field(pattern=r'^[a-f0-9]{64}$')
    chunk_id: str = Field(min_length=1, max_length=40)


class Generate(Strict):
    request_id: uuid.UUID
    consent: StrictBool
    question: str = Field(default='', max_length=2000)
    selections: list[Selection] = Field(min_length=1, max_length=10)

    @model_validator(mode='after')
    def explicit_scope(self):
        if not self.consent:
            raise ValueError('请明确允许 AI 处理本次选定片段与关注点')
        identities = {(s.source_id, s.version, s.chunk_id) for s in self.selections}
        if len(identities) != len(self.selections):
            raise ValueError('同一资料版本片段只能选择一次')
        return self


class Save(Strict):
    title: str = Field(min_length=1, max_length=240)
    notes: str = Field(default='', max_length=10000)

    @field_validator('title')
    @classmethod
    def label(cls, value):
        if not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError('请填写有效的总结标题')
        return value.strip()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


async def evidence(session, uid, selections):
    rows = []
    for index, s in enumerate(selections):
        v = await owned_version(session, uid, s.source_id, s.version)
        if v.status != 'ready' or v.kind == 'link' or v.checksum != s.checksum:
            raise ValidationException('资料正文暂不可用或版本校验值不符，请重新核对所选原版本')
        extraction = v.extraction or {}
        chunk = next((c for c in extraction.get('chunks', []) if c['id'] == s.chunk_id), None)
        if not chunk or not chunk['text'].strip() or extraction.get('text', '')[chunk['start']:chunk['end']] != chunk['text']:
            raise ValidationException('选定片段无法在已保存正文中核对，请重新选择')
        rows.append({'key': f'S{index+1}', 'source_version_id': str(v.id),
            'source_id': str(v.source_id), 'version': v.version, 'checksum': v.checksum,
            'chunk_id': chunk['id'], 'title': v.title, 'category': v.category, 'source_url': v.source_url,
            'text': chunk['text'], 'start': chunk['start'], 'end': chunk['end'], 'page': chunk.get('page'),
            'parser_version': v.parser_version})
    if sum(len(r['text']) for r in rows) > 10000:
        raise ValidationException('本次选定正文最多 10000 字，请减少片段')
    return rows


async def source_available(session, row):
    try:
        current = await evidence(session, row.user_id, [Selection.model_validate(s) for s in row.input['selections']])
        return current == row.source
    except AppException:
        return False


async def row_data(session, row):
    available = await source_available(session, row)
    expired = row.status == 'processing' and row.lease_until <= datetime.now(UTC)
    return {'request_id': str(row.request_id), 'status': 'failed' if expired else row.status,
        'error': '原文暂时无法核对，请回到资料库重新读取。' if not available else
            '上次处理已中断，原提交仍保留，可以重试。' if expired else row.error,
        'question': row.input['question'] if available else '', 'source': row.source if available else [],
        'result': row.result if available else None, 'saved': row.saved if available else None,
        'saved_at': row.saved_at.isoformat() if row.saved_at else None,
        'created_at': row.created_at.isoformat(), 'prompt_version': row.prompt_version}


async def owned(session, uid, rid):
    row = await session.scalar(select(SourceSummary).where(SourceSummary.user_id == uid,
        SourceSummary.request_id == rid).execution_options(populate_existing=True))
    if row is None:
        raise NotFoundException('资料总结')
    return row


async def generate_summary(session, uid, payload):
    await lock_owner(session, uid)
    fingerprint = digest(payload.model_dump(mode='json'))
    row = await session.scalar(select(SourceSummary).where(SourceSummary.user_id == uid,
        SourceSummary.request_id == payload.request_id).execution_options(populate_existing=True))
    if row:
        if row.fingerprint != fingerprint:
            conflict('同一总结请求的范围已固定，请重试原提交或开始新总结')
        if row.status == 'completed' or (row.status == 'processing' and row.lease_until > datetime.now(UTC)):
            await session.commit()
            return await row_data(session, row)
    source = await evidence(session, uid, payload.selections)
    if row and source != row.source:
        conflict('原片段已变化，请核对后开始新总结')
    now = datetime.now(UTC)
    if await session.scalar(select(SourceSummary.id).where(SourceSummary.user_id == uid,
            SourceSummary.status == 'processing', SourceSummary.lease_until > now,
            SourceSummary.request_id != payload.request_id)):
        conflict('上一份总结仍在处理，请稍后再试')
    count = await session.scalar(select(func.count()).select_from(SourceSummary).where(SourceSummary.user_id == uid))
    if not row and count >= 1000:
        raise ValidationException('个人总结请求已达到 1000 份上限，可继续查看和复用已保存总结')
    variant = await get_variant(str(uid), 'source_summary')
    attempt = uuid.uuid4()
    if not row:
        row = SourceSummary(id=uuid.uuid5(uid, f'summary:{payload.request_id}'), user_id=uid,
            request_id=payload.request_id, fingerprint=fingerprint, input=payload.model_dump(mode='json'),
            source=source, saved=None, saved_at=None, created_at=now)
        session.add(row)
    row.status, row.result, row.error = 'processing', None, None
    row.attempt_id, row.lease_until, row.prompt_version = attempt, now + timedelta(minutes=5), variant.version
    await session.commit()  # Persist the precise scope before any model request.
    try:
        bounded = variant.data.get('evidence_selection', False)
        model_source = source
        if bounded:
            from app.engines.bounded_learning import prepare_model_source
            model_source = prepare_model_source('source_summary', source)
        raw = await llm_service.structured_output(session, str(uid), 'source_summary',
            {'source': json.dumps(model_source, ensure_ascii=False), 'question': payload.question}, variant)
        result = validate_summary(raw, source, require_bounded=bounded)
        failure = None
    except Exception as exc:
        logger.warning('source_summary_failed', request_id=str(payload.request_id), error_type=type(exc).__name__)
        await session.rollback()
        result, failure = None, 'AI 未能完成可核对的总结，原提交已保留，可以重试。'
    await lock_owner(session, uid)
    row = await owned(session, uid, payload.request_id)
    if row.attempt_id == attempt:
        if not await source_available(session, row):
            result, failure = None, '处理期间原片段已变化，请核对后开始新总结。'
        row.result, row.error, row.status = result, failure, 'failed' if failure else 'completed'
    await session.commit()
    return await row_data(session, row)


@router.post('')
async def generate(payload: Generate, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    return ApiResponse(success=True, data=await generate_summary(session, uuid.UUID(user_id), payload))


@router.get('')
async def listing(q: str = Query('', max_length=120), page: int = Query(1, ge=1, le=1000),
        user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    statement = select(SourceSummary).where(SourceSummary.user_id == uuid.UUID(user_id), SourceSummary.saved_at.is_not(None))
    if q.strip():
        literal = '%' + q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        points = func.jsonb_array_elements(SourceSummary.result['points']).table_valued('value').alias('summary_points')
        sources = func.jsonb_array_elements(SourceSummary.source).table_valued('value').alias('summary_sources')
        point_match = select(1).select_from(points).where(points.c.value.op('->>')('text').ilike(literal, escape='\\')).exists()
        source_match = select(1).select_from(sources).where(or_(*(sources.c.value.op('->>')(key).ilike(literal, escape='\\')
            for key in ('title', 'text', 'source_url')))).exists()
        statement = statement.where(or_(SourceSummary.saved['title'].astext.ilike(literal, escape='\\'),
            SourceSummary.saved['notes'].astext.ilike(literal, escape='\\'), point_match, source_match))
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (await session.scalars(statement.order_by(SourceSummary.saved_at.desc(), SourceSummary.id)
        .offset((page-1)*20).limit(20))).all()
    return ApiResponse(success=True, data={'total': total, 'items': [await row_data(session, r) for r in rows]})


@router.get('/{request_id}')
async def read(request_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    return ApiResponse(success=True, data=await row_data(session, await owned(session, uuid.UUID(user_id), request_id)))


@router.post('/{request_id}/save')
async def save(request_id: uuid.UUID, payload: Save, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await lock_owner(session, uid)
    row = await owned(session, uid, request_id)
    if row.status != 'completed' or not row.result or not await source_available(session, row):
        raise ValidationException('这份总结尚未完成或原文无法核对，请先重新读取处理状态')
    adopted = payload.model_dump(mode='json')
    if row.saved is not None:
        if row.saved != adopted:
            conflict('这份总结已按另一份确认内容保存，请重新读取已保存结果')
    else:
        row.saved, row.saved_at = adopted, datetime.now(UTC)
    await session.commit()
    return ApiResponse(success=True, data=await row_data(session, row))

