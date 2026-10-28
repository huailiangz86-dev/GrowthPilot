"""Explicit scoped reviews, editable arrangements and recurring assistance."""
import uuid
from datetime import UTC, date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import Field, StrictBool, StrictInt, ValidationError, field_validator, model_validator
from sqlalchemy import select

from app.api.personal_life import Strict, access_payload, entity_payload, fitness_source_allowed, valid_timezone
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.fitness_expert import digest, enqueue_review, lock_user, review_data, source_current
from app.engines.fitness_context import ProfileContent, profile_payload
from app.engines.workspace_engine import append_event
from app.models.fitness_expert import FitnessArrangement, FitnessExpertRevision, FitnessReview, FitnessReviewRule
from app.models.personal_life import LifeCommandReceipt, LifeRecord
from app.schemas.common import ApiResponse

router = APIRouter(prefix='/fitness-expert', tags=['fitness-expert'])


class ReviewRequest(Strict):
    request_id: uuid.UUID
    start: date
    end: date
    timezone: str = Field(default='Asia/Shanghai', max_length=64)
    consent: StrictBool
    _zone = field_validator('timezone')(valid_timezone)

    @model_validator(mode='after')
    def range_valid(self):
        if not self.consent or self.start > self.end or (self.end - self.start).days > 365:
            raise ValueError('请明确选择正确的回顾范围，最多 366 天。')
        if self.end > datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError('回顾范围不能包含未来日期。')
        return self


class ArrangementContent(Strict):
    title: str = Field(min_length=1, max_length=240)
    detail: str = Field(min_length=1, max_length=5000)
    scheduled_on: date
    time: str = Field(default='18:30', pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    timezone: str = Field(default='Asia/Shanghai', max_length=64)
    planned_minutes: StrictInt | None = Field(default=None, ge=1, le=1440)
    cancelled: StrictBool = False
    _zone = field_validator('timezone')(valid_timezone)

    @model_validator(mode='after')
    def valid_arrangement(self):
        if not self.title.strip() or not self.detail.strip():
            raise ValueError('请填写具体安排和预期记录内容。')
        if not self.cancelled and self.scheduled_on < datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError('新安排或改期从今天或之后开始。')
        return self


class RuleContent(Strict):
    enabled: StrictBool
    period_days: Literal[7, 14, 28]
    start_on: date
    timezone: str = Field(default='Asia/Shanghai', max_length=64)
    consent: StrictBool
    _zone = field_validator('timezone')(valid_timezone)

    @model_validator(mode='after')
    def rule_consent(self):
        if self.enabled and not self.consent:
            raise ValueError('持续回顾需要本人明确选择。')
        if self.enabled and self.start_on < datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError('新规则从今天或之后生效，历史规则保留。')
        return self


class ExpertCommand(Strict):
    request_id: uuid.UUID
    action: Literal['adopt_plan', 'save_plan', 'save_rule', 'save_profile']
    entity_id: uuid.UUID
    base_version: StrictInt = Field(default=0, ge=0)
    data: dict


async def owned(session, model, uid, eid):
    row = await session.scalar(select(model).where(model.id == eid, model.user_id == uid).execution_options(populate_existing=True))
    if not row:
        raise NotFoundException('健身专家内容')
    return row


async def plan_data(session, row):
    fact = await session.scalar(select(LifeRecord).where(LifeRecord.id == row.feedback_record_id, LifeRecord.user_id == row.user_id)) if row.feedback_record_id else None
    return {**entity_payload(row), 'review_id': str(row.review_id),
        'feedback': entity_payload(fact) if fact else None}


async def apply_expert_command(session, uid, command):
    user = await lock_user(session, uid)
    fingerprint = digest({'namespace': 'fitness-expert', **command.model_dump(mode='json')})
    receipt = await session.scalar(select(LifeCommandReceipt).where(LifeCommandReceipt.user_id == uid, LifeCommandReceipt.request_id == command.request_id))
    if receipt:
        if receipt.fingerprint != fingerprint:
            raise AppException('EXPERT_CONFLICT', '原提交已固定，请恢复原内容重试。', 409)
        return receipt.result
    now = datetime.now(UTC)
    if command.action == 'save_profile':
        current = profile_payload(user)
        if str(command.entity_id) != current['id']:
            raise NotFoundException('健身背景')
        if command.base_version != current['version']:
            raise AppException('EXPERT_CONFLICT', '健身背景已有新版本，草稿保留，请比较后保存。', 409)
        content = ProfileContent.model_validate(command.data).model_dump(mode='json')
        value = {**current, 'version': current['version'] + 1, 'content': content, 'updated_at': now.isoformat()}
        user.settings = {**(user.settings or {}), 'fitness_profile': value}
        session.add(FitnessExpertRevision(user_id=uid, entity_id=command.entity_id, kind='profile',
                                        version=value['version'], content=content))
        result = {'kind': 'profile', 'entity': value}
        session.add(LifeCommandReceipt(user_id=uid, request_id=command.request_id, fingerprint=fingerprint, result=result))
        await append_event(session, user_id=uid, workspace_id=None, event_type='fitness_expert_save_profile',
            source_type='fitness_expert', source_id=command.entity_id,
            payload={'version': value['version'], 'request_id': str(command.request_id)})
        await session.flush()
        return result
    if command.action == 'save_rule':
        content = RuleContent.model_validate(command.data)
        if command.entity_id != uuid.uuid5(uid, 'fitness-review-rule'):
            raise NotFoundException('回顾规则')
        row = await session.scalar(select(FitnessReviewRule).where(FitnessReviewRule.user_id == uid))
        if command.base_version != (row.version if row else 0):
            raise AppException('EXPERT_CONFLICT', '规则已有新版本，草稿保留，请读取当前版本后核对。', 409)
        if content.enabled and not fitness_source_allowed(user):
            raise AppException('EXPERT_SCOPE', '先选择健身专家读取范围，再启用持续回顾。', 403)
        if row and content.enabled and content.start_on.isoformat() < row.content['start_on']:
            raise ValidationException('新规则的生效日不能早于上一版。')
        if not row:
            row = FitnessReviewRule(id=command.entity_id, user_id=uid, version=0)
            session.add(row)
        row.content = {**content.model_dump(mode='json'), 'access_version': access_payload(user)['version']}
        row.next_start = content.start_on
        kind = 'rule'
    else:
        content = ArrangementContent.model_validate(command.data)
        if command.action == 'adopt_plan':
            review = await owned(session, FitnessReview, uid, command.entity_id)
            if review.status != 'completed' or not review.result or not await source_current(session, review):
                raise AppException('EXPERT_STALE', '建议的来源不可用，请先基于当前记录重新回顾。', 409)
            # One arrangement per review, even with another request identity.
            row = await session.scalar(select(FitnessArrangement).where(FitnessArrangement.user_id == uid, FitnessArrangement.review_id == review.id))
            if row:
                result = {'kind': 'plan', 'entity': await plan_data(session, row)}
                session.add(LifeCommandReceipt(user_id=uid, request_id=command.request_id, fingerprint=fingerprint, result=result))
                await session.flush()
                return result
            if command.base_version != 0:
                raise ValidationException('首次采用需要版本 0。')
            row = FitnessArrangement(id=uuid.uuid5(review.id, 'arrangement'), user_id=uid, review_id=review.id, version=0)
            session.add(row)
        else:
            row = await owned(session, FitnessArrangement, uid, command.entity_id)
            if command.base_version != row.version:
                raise AppException('EXPERT_CONFLICT', '安排已有新版本，草稿保留，请读取当前版本后核对。', 409)
            if row.feedback_record_id:
                raise ValidationException('已有实际反馈的安排保留历史。需要新活动时请采用下一周期建议。')
        row.content = content.model_dump(mode='json')
        kind = 'plan'
    row.version += 1
    row.updated_at = now
    await session.flush()
    session.add(FitnessExpertRevision(user_id=uid, entity_id=row.id, kind=kind, version=row.version, content=row.content))
    result = {'kind': kind, 'entity': await plan_data(session, row) if kind == 'plan' else entity_payload(row)}
    session.add(LifeCommandReceipt(user_id=uid, request_id=command.request_id, fingerprint=fingerprint, result=result))
    await append_event(session, user_id=uid, workspace_id=None, event_type=f'fitness_expert_{command.action}',
        source_type='fitness_expert', source_id=row.id, payload={'version': row.version, 'request_id': str(command.request_id)})
    await session.flush()
    return result


@router.get('')
async def snapshot(user_id: str = Depends(get_current_user_id), session=Depends(get_db), offset: int = Query(0, ge=0)):
    uid = uuid.UUID(user_id)
    user = await lock_user(session, uid)
    reviews = list((await session.scalars(select(FitnessReview).where(FitnessReview.user_id == uid)
        .order_by(FitnessReview.created_at.desc(), FitnessReview.id).offset(offset).limit(20))).all())
    plans = list((await session.scalars(select(FitnessArrangement).where(FitnessArrangement.user_id == uid).order_by(FitnessArrangement.updated_at.desc()))).all())
    rule = await session.scalar(select(FitnessReviewRule).where(FitnessReviewRule.user_id == uid))
    active = bool(rule and rule.content['enabled'] and fitness_source_allowed(user) and rule.content['access_version'] == access_payload(user)['version'])
    return ApiResponse(success=True, data={'access': access_payload(user), 'profile': profile_payload(user), 'reviews': [await review_data(session, r) for r in reviews],
        'plans': [await plan_data(session, p) for p in plans], 'rule_active': active,
        'rule': {**entity_payload(rule), 'next_start': rule.next_start.isoformat()} if rule else {'id': str(uuid.uuid5(uid, 'fitness-review-rule')), 'version': 0, 'content': None}})


@router.post('/reviews')
async def request_review(payload: ReviewRequest, user_id: str = Depends(get_current_user_id), session=Depends(get_db)):
    row = await enqueue_review(session, uuid.UUID(user_id), payload)
    await session.commit()
    return ApiResponse(success=True, data=await review_data(session, row))


@router.get('/reviews/{review_id}')
async def read_review(review_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session=Depends(get_db)):
    return ApiResponse(success=True, data=await review_data(session, await owned(session, FitnessReview, uuid.UUID(user_id), review_id)))


@router.post('/reviews/{review_id}/retry')
async def retry_review(review_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session=Depends(get_db)):
    uid = uuid.UUID(user_id)
    await lock_user(session, uid)
    row = await owned(session, FitnessReview, uid, review_id)
    if not await source_current(session, row):
        raise AppException('EXPERT_STALE', '依据已经变化，请重新选择范围回顾。', 409)
    if row.status == 'failed':
        row.status, row.attempts, row.error, row.next_run_at = 'pending', 0, None, datetime.now(UTC)
    await session.commit()
    return ApiResponse(success=True, data=await review_data(session, row))


@router.post('/commands')
async def command(payload: ExpertCommand, user_id: str = Depends(get_current_user_id), session=Depends(get_db)):
    try:
        result = await apply_expert_command(session, uuid.UUID(user_id), payload)
        await session.commit()
    except ValidationError as exc:
        await session.rollback()
        raise ValidationException(exc.errors()[0]['msg']) from exc
    return ApiResponse(success=True, data=result)


@router.get('/history/{kind}/{entity_id}')
async def history(kind: Literal['plan', 'rule', 'profile'], entity_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session=Depends(get_db)):
    uid = uuid.UUID(user_id)
    if kind == 'profile':
        user = await lock_user(session, uid)
        if str(entity_id) != profile_payload(user)['id']:
            raise NotFoundException('健身背景')
    else:
        await owned(session, FitnessArrangement if kind == 'plan' else FitnessReviewRule, uid, entity_id)
    rows = list((await session.scalars(select(FitnessExpertRevision).where(FitnessExpertRevision.user_id == uid,
        FitnessExpertRevision.entity_id == entity_id, FitnessExpertRevision.kind == kind).order_by(FitnessExpertRevision.version.desc()))).all())
    return ApiResponse(success=True, data=[{'id': str(r.id), 'version': r.version, 'content': r.content, 'created_at': r.created_at.isoformat()} for r in rows])
