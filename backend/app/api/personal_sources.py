"""Independent personal library, stable imports, immutable originals and source versions."""
import base64
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from pydantic import Field, StrictInt, ValidationError, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.learning_materials import MAX_BODY, MaterialUpload
from app.api.personal_work import Resource, Strict, conflict
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.material_parser import MAX_BYTES, MaterialError
from app.engines.source_parser import SOURCE_PARSER_VERSION, parse_source
from app.engines.web_material import WEB_PARSER_VERSION, fetch_webpage, public_url
from app.models.personal_source import PersonalSource, PersonalSourceVersion
from app.models.user import User
from app.schemas.common import ApiResponse

router = APIRouter(prefix='/personal-sources', tags=['personal-sources'])
Category = Literal['note', 'email', 'book', 'link']


class SourceUpload(Strict):
    request_id: uuid.UUID
    source_id: uuid.UUID
    base_version: StrictInt = Field(ge=0, le=100)
    title: str = Field(min_length=1, max_length=240)
    category: Category
    kind: Literal['text', 'txt', 'md', 'pdf', 'eml', 'link', 'web']
    filename: str = Field(min_length=1, max_length=240)
    source_url: str | None = Field(default=None, max_length=2000)
    text: str | None = Field(default=None, max_length=200000)
    data_base64: str | None = Field(default=None, max_length=2796204)

    _labels = field_validator('title', 'filename')(MaterialUpload.safe_label.__func__)

    @field_validator('source_url')
    @classmethod
    def safe_source(cls, value):
        return Resource.safe_url(value) if value else None

    @model_validator(mode='after')
    def source_contract(self):
        if self.kind in ('link', 'web'):
            if self.category != 'link' or not self.source_url or self.text is not None or self.data_base64 is not None:
                raise ValueError('链接资料需要原地址，不能同时提交正文或文件。')
            if self.kind == 'web':
                self.source_url = public_url(self.source_url)
        elif self.text is not None:
            if self.kind not in ('text', 'eml') or not self.text.strip() or self.data_base64 is not None:
                raise ValueError('请填写非空原文，正文与文件需要分别提交。')
        elif not self.data_base64 or not self.filename.lower().endswith('.' + self.kind):
            raise ValueError('请选择与类型一致的原文件。')
        if self.kind == 'eml' and self.category != 'email':
            raise ValueError('EML 原件请选择邮件类型。')
        if self.category == 'email' and self.kind not in ('eml', 'text'):
            raise ValueError('邮件请提供 EML 原件或粘贴原文。')
        self.raw_bytes()
        return self

    def raw_bytes(self):
        if self.kind == 'web':
            return None
        try:
            raw = self.source_url.encode('utf-8') if self.kind == 'link' else self.text.encode('utf-8') if self.text is not None else base64.b64decode(self.data_base64, validate=True)
        except (ValueError, UnicodeError) as exc:
            raise ValueError('原件编码无效，请重新提供。') from exc
        if not raw or len(raw) > MAX_BYTES:
            raise ValueError('单份原件最大 2 MB。')
        return raw


def version_data(row):
    return {'id': str(row.id), 'source_id': str(row.source_id), 'version': row.version,
        'title': row.title, 'category': row.category, 'kind': row.kind, 'filename': row.filename,
        'source_url': row.source_url, 'checksum': row.checksum, 'bytes': row.byte_count,
        'status': row.status, 'error': row.error, 'attempts': row.attempts,
        'parser_version': row.parser_version, 'created_at': row.created_at.isoformat(),
        'extraction': row.extraction or {'text': '', 'chunks': [], 'warnings': [], 'page_count': None}}


async def lock_owner(session, uid):
    if await session.scalar(select(User).where(User.id == uid).with_for_update()) is None:
        raise NotFoundException('User')


async def owned_source(session, uid, sid):
    row = await session.scalar(select(PersonalSource).where(PersonalSource.id == sid,
        PersonalSource.user_id == uid).execution_options(populate_existing=True))
    if row is None:
        raise NotFoundException('个人资料')
    return row


async def owned_version(session, uid, sid, version=None):
    source = await owned_source(session, uid, sid)
    row = await session.scalar(select(PersonalSourceVersion).where(PersonalSourceVersion.source_id == sid,
        PersonalSourceVersion.user_id == uid, PersonalSourceVersion.version == (version or source.version))
        .execution_options(populate_existing=True))
    if row is None:
        raise NotFoundException('资料版本')
    return row


async def finish_parse(session, uid, row, raw):
    sid, version, attempt, kind = row.source_id, row.version, row.attempt_id, row.kind
    await session.commit()  # The raw version is durable before any PDF processing.
    try:
        extraction, error = await parse_source(raw, kind), None
    except (MaterialError, TimeoutError) as exc:
        extraction, error = None, str(exc) or '原件提取超时，可重试或另存文字版本。'
    except Exception:
        extraction, error = None, '原件已保留，正文提取暂时失败，请重试。'
    await lock_owner(session, uid)
    row = await owned_version(session, uid, sid, version)
    if row.status == 'processing' and row.attempt_id == attempt:
        row.status, row.extraction, row.error = ('ready' if extraction else 'failed'), extraction, error
    await session.commit()
    return version_data(row)


async def ingest(session, uid, payload):
    fingerprint = hashlib.sha256(json.dumps(payload.model_dump(mode='json', exclude={'request_id'}),
        sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    async def replay():
        existing = await session.scalar(select(PersonalSourceVersion).where(PersonalSourceVersion.user_id == uid,
            PersonalSourceVersion.request_id == payload.request_id).execution_options(populate_existing=True))
        if existing and existing.fingerprint != fingerprint:
            conflict('同一提交标识已有不同内容，请重试原提交。')
        return existing

    await lock_owner(session, uid)
    existing = await replay()
    if existing:
        return version_data(existing)
    source = await session.scalar(select(PersonalSource).where(PersonalSource.id == payload.source_id).execution_options(populate_existing=True))
    if source and source.user_id != uid:
        raise NotFoundException('个人资料')
    if (source.version if source else 0) != payload.base_version:
        conflict('资料已有新版本，请保留草稿并核对最新原文。')
    if payload.base_version >= 100:
        raise ValidationException('每份资料最多 100 个原件版本，可另存新资料。')
    raw, extraction = payload.raw_bytes(), None
    if payload.kind == 'web':
        await session.commit()  # No person lock is held during remote fetching.
        try:
            raw, extraction = await fetch_webpage(payload.source_url)
        except MaterialError as exc:
            raise ValidationException(str(exc)) from exc
        await lock_owner(session, uid)
        existing = await replay()
        if existing:
            return version_data(existing)
        source = await session.scalar(select(PersonalSource).where(PersonalSource.id == payload.source_id).execution_options(populate_existing=True))
        if source and source.user_id != uid:
            raise NotFoundException('个人资料')
        if (source.version if source else 0) != payload.base_version:
            conflict('网页读取期间资料已有更新，原草稿已保留，请重新核对。')
    count = await session.scalar(select(func.count()).select_from(PersonalSource).where(PersonalSource.user_id == uid))
    size = await session.scalar(select(func.coalesce(func.sum(PersonalSourceVersion.byte_count), 0)).where(PersonalSourceVersion.user_id == uid))
    if (not source and count >= 300) or size + len(raw) > 100 * 1024 * 1024:
        raise ValidationException('个人资料库最多 300 份资料、所有原件版本合计 100 MB。')
    now = datetime.now(UTC)
    if not source:
        source = PersonalSource(id=payload.source_id, user_id=uid, version=0, updated_at=now)
        session.add(source)
        await session.flush()
    source.version, source.updated_at = source.version + 1, now
    if payload.kind == 'link':
        extraction = {'text': '', 'chunks': [], 'warnings': ['仅保存原地址，可另存公开正文快照。'], 'page_count': None}
    row = PersonalSourceVersion(id=uuid.uuid5(uid, f'source:{payload.request_id}'), source_id=source.id,
        user_id=uid, version=source.version, request_id=payload.request_id, fingerprint=fingerprint,
        checksum=hashlib.sha256(raw).hexdigest(), title=payload.title, category=payload.category,
        kind=payload.kind, filename=payload.filename, source_url=payload.source_url, byte_count=len(raw), original=raw,
        extraction=extraction, status='ready' if extraction is not None else 'processing', error=None,
        attempts=1, attempt_id=uuid.uuid4(), lease_until=now + timedelta(seconds=45),
        parser_version=WEB_PARSER_VERSION if payload.kind == 'web' else SOURCE_PARSER_VERSION, created_at=now)
    session.add(row)
    await session.flush()
    if extraction is not None:
        await session.commit()
        return version_data(row)
    return await finish_parse(session, uid, row, raw)


@router.post('')
async def upload(request: Request, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    body = bytearray()
    async for block in request.stream():
        if len(body) + len(block) > MAX_BODY:
            raise ValidationException('上传请求过大，单份原件最大 2 MB。')
        body.extend(block)
    try:
        payload = SourceUpload.model_validate_json(body)
    except ValidationError as exc:
        raise ValidationException(str(exc.errors()[0]['msg'])) from exc
    try:
        result = await ingest(session, uuid.UUID(user_id), payload)
    except IntegrityError:
        await session.rollback()
        conflict('资料提交发生冲突，请保留草稿并重试原提交。')
    return ApiResponse(success=True, data=result)


@router.get('')
async def listing(q: str = Query('', max_length=120), category: Literal['all', 'note', 'email', 'book', 'link'] = 'all',
        page: int = Query(1, ge=1, le=1000), user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    statement = select(PersonalSourceVersion).join(PersonalSource, PersonalSource.id == PersonalSourceVersion.source_id).where(
        PersonalSource.user_id == uid, PersonalSourceVersion.user_id == uid, PersonalSourceVersion.version == PersonalSource.version)
    if category != 'all':
        statement = statement.where(PersonalSourceVersion.category == category)
    if q.strip():
        literal = '%' + q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        statement = statement.where(or_(PersonalSourceVersion.title.ilike(literal, escape='\\'),
            PersonalSourceVersion.extraction['text'].astext.ilike(literal, escape='\\'),
            PersonalSourceVersion.source_url.ilike(literal, escape='\\')))
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (await session.scalars(statement.order_by(PersonalSource.updated_at.desc(), PersonalSource.id).offset((page - 1) * 20).limit(20))).all()
    return ApiResponse(success=True, data={'total': total, 'items': [{'id': str(r.source_id), 'version': r.version,
        'title': r.title, 'category': r.category, 'kind': r.kind, 'status': r.status, 'source_url': r.source_url,
        'preview': (r.extraction or {}).get('text', '')[:160], 'updated_at': r.created_at.isoformat()} for r in rows]})


@router.get('/{sid}')
async def detail(sid: uuid.UUID, version: int | None = Query(None, ge=1, le=100),
        user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    row = await owned_version(session, uid, sid, version)
    versions = (await session.scalars(select(PersonalSourceVersion.version).where(PersonalSourceVersion.source_id == sid,
        PersonalSourceVersion.user_id == uid).order_by(PersonalSourceVersion.version.desc()))).all()
    return ApiResponse(success=True, data={'current': version_data(row), 'versions': versions})


@router.post('/{sid}/versions/{version}/retry')
async def retry(sid: uuid.UUID, version: int = Path(ge=1, le=100), user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid, now = uuid.UUID(user_id), datetime.now(UTC)
    await lock_owner(session, uid)
    row = await owned_version(session, uid, sid, version)
    if row.status == 'ready' or (row.status == 'processing' and row.lease_until > now):
        return ApiResponse(success=True, data=version_data(row))
    raw = await session.scalar(select(PersonalSourceVersion.original).where(PersonalSourceVersion.id == row.id))
    row.status, row.error, row.attempts = 'processing', None, row.attempts + 1
    row.attempt_id, row.lease_until = uuid.uuid4(), now + timedelta(seconds=45)
    return ApiResponse(success=True, data=await finish_parse(session, uid, row, raw))


@router.get('/{sid}/versions/{version}/original')
async def original(sid: uuid.UUID, version: int = Path(ge=1, le=100), user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    row = await owned_version(session, uuid.UUID(user_id), sid, version)
    raw = await session.scalar(select(PersonalSourceVersion.original).where(PersonalSourceVersion.id == row.id))
    return Response(content=raw, media_type='application/octet-stream', headers={
        'Content-Disposition': f"attachment; filename=source.bin; filename*=UTF-8''{quote(row.filename, safe='')}",
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'})
