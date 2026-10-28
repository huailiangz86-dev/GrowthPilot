"""Durable review work runs on the server, independently of open pages."""
import asyncio
import hashlib
import json
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from pydantic import Field
from sqlalchemy import or_, select

from app.ai import llm_service
from app.ai.prompt_router import get_variant
from app.api.personal_life import Strict, access_payload, fitness_source_allowed
from app.core.database import async_session_factory
from app.core.config import settings
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.expert_skills import fitness_skill
from app.engines.fitness_context import context_suggestion, profile_payload
from app.models.fitness_expert import FitnessArrangement, FitnessReview, FitnessReviewRule
from app.models.personal_life import LifeRecord, LifeRevision, PersonalHabit
from app.models.user import User

logger = logging.getLogger(__name__)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class Observation(Strict):
    text: str = Field(min_length=1, max_length=3000)
    record_ids: list[uuid.UUID] = Field(min_length=1, max_length=12)


class Suggestion(Strict):
    title: str = Field(min_length=1, max_length=240)
    detail: str = Field(min_length=1, max_length=3000)
    record_ids: list[uuid.UUID] = Field(min_length=1, max_length=12)


class ReviewResult(Strict):
    observations: list[Observation] = Field(min_length=1, max_length=6)
    limitation: str = Field(min_length=1, max_length=3000)
    suggestion: Suggestion


def validate_result(raw, source):
    value = ReviewResult.model_validate(raw)
    allowed = {r['id'] for r in source['records']}
    for part in [*value.observations, value.suggestion]:
        text_valid = bool(part.text.strip()) if isinstance(part, Observation) else bool(part.title.strip() and part.detail.strip())
        if not all(str(i) in allowed for i in part.record_ids) or not text_valid:
            raise ValueError('回顾需要有效的原记录引用及正文')
    result = value.model_dump(mode='json')
    if source.get('expert_skill'):
        # Execution receipt comes from the server, never from the model.
        result['skill'] = source['expert_skill']
        context = source['expert_skill'].get('tools', {}).get('personal_context')
        if context:
            result['context'] = context
            result['suggestion'] = context_suggestion(context, source)
    return result


async def lock_user(session, uid):
    user = await session.scalar(select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True))
    if not user:
        raise NotFoundException('User')
    return user


async def build_source(session, uid, start, end):
    user = await session.scalar(select(User).where(User.id == uid).execution_options(populate_existing=True))
    if not user or not fitness_source_allowed(user):
        raise AppException('EXPERT_SCOPE', '健身专家读取范围已关闭，请先在数据范围中选择。', 403)
    rows = list((await session.scalars(select(LifeRecord).where(LifeRecord.user_id == uid,
        LifeRecord.domain == 'fitness', LifeRecord.occurred_on >= start, LifeRecord.occurred_on <= end)
        .order_by(LifeRecord.occurred_on, LifeRecord.id).limit(301).execution_options(populate_existing=True))).all())
    if len(rows) > 300:
        raise ValidationException('本次超过 300 条记录，请缩小日期范围后回顾。')
    habit = await session.scalar(select(PersonalHabit).where(PersonalHabit.user_id == uid, PersonalHabit.domain == 'fitness'))
    revisions = list((await session.scalars(select(LifeRevision).where(LifeRevision.user_id == uid,
        LifeRevision.habit_id == habit.id).order_by(LifeRevision.version))).all()) if habit else []
    before = [r for r in revisions if r.content['effective_from'] < start.isoformat()]
    effective = [max(before, key=lambda r: (r.content['effective_from'], r.version))] if before else []
    effective += [r for r in revisions if start.isoformat() <= r.content['effective_from'] <= end.isoformat()]
    ids = [r.id for r in rows]
    plans = list((await session.scalars(select(FitnessArrangement).where(FitnessArrangement.user_id == uid,
        FitnessArrangement.feedback_record_id.in_(ids)).order_by(FitnessArrangement.id).execution_options(populate_existing=True))).all()) if ids else []
    source = {'start': start.isoformat(), 'end': end.isoformat(), 'access_version': access_payload(user)['version'],
        'profile': profile_payload(user, for_expert=True),
        'records': [{'id': str(r.id), 'version': r.version, 'content': r.content} for r in rows],
        'habits': [{'version': r.version, 'content': r.content} for r in effective],
        'feedback': [{'plan_id': str(p.id), 'plan_version': p.version, 'arrangement': p.content,
                      'record_id': str(p.feedback_record_id)} for p in plans]}
    if len(json.dumps(source, ensure_ascii=False)) > 80000:
        raise ValidationException('本次资料过多，请缩小日期范围后回顾。')
    source['digest'] = digest(source)
    return source


async def source_current(session, row):
    try:
        context = row.source.get('expert_skill', {}).get('tools', {}).get('personal_context') or {}
        if context.get('valid_until') and datetime.now(UTC).date().isoformat() > context['valid_until']:
            return False
        if row.rule_id:
            rule = await session.scalar(select(FitnessReviewRule).where(FitnessReviewRule.id == row.rule_id,
                FitnessReviewRule.user_id == row.user_id).execution_options(populate_existing=True))
            if not rule or not rule.content['enabled'] or rule.version != row.input.get('rule_version'):
                return False
        source = await build_source(session, row.user_id, date.fromisoformat(row.input['start']), date.fromisoformat(row.input['end']))
        if 'profile' not in row.source and source['profile']['version'] == 0:
            # Legacy results stay readable until actual background is supplied.
            source.pop('digest')
            source.pop('profile')
            source['digest'] = digest(source)
        return source['digest'] == row.source.get('digest')
    except AppException:
        return False


async def review_data(session, row):
    valid = await source_current(session, row)
    return {'id': str(row.id), 'request_id': str(row.request_id), 'input': row.input, 'status': row.status,
        'source': row.source if valid else None, 'result': row.result if valid else None, 'redacted': not valid,
        'error': row.error if valid or row.source.get('digest') is None else '原记录、习惯、个人背景或读取范围已改变，或近期条件已过期，旧解读与建议已隐藏。请基于当前范围重新回顾。',
        'attempts': row.attempts, 'created_at': row.created_at.isoformat(), 'updated_at': row.updated_at.isoformat()}


async def enqueue_review(session, uid, payload, *, rule=None, now=None):
    await lock_user(session, uid)
    now = now or datetime.now(UTC)
    value = payload.model_dump(mode='json')
    if rule:
        value['rule_version'] = rule.version
    fingerprint = digest(value)
    existing = await session.scalar(select(FitnessReview).where(FitnessReview.user_id == uid,
        FitnessReview.request_id == payload.request_id).execution_options(populate_existing=True))
    if existing:
        if existing.fingerprint != fingerprint:
            raise AppException('EXPERT_CONFLICT', '同一请求的日期范围已固定，请保留原请求或发起新回顾。', 409)
        return existing
    source = await build_source(session, uid, payload.start, payload.end)
    source['expert_skill'] = fitness_skill(source)
    row = FitnessReview(id=uuid.uuid5(uid, f'fitness-review:{payload.request_id}'), user_id=uid,
        request_id=payload.request_id, rule_id=rule.id if rule else None, fingerprint=fingerprint, input=value,
        source=source, result=None, status='pending' if source['records'] else 'blocked',
        error=None if source['records'] else '这个范围还没有实际记录。可先记录或重新选择范围。', attempts=0,
        next_run_at=now, created_at=now, updated_at=now)
    session.add(row)
    await session.flush()
    return row


async def process_review(session_factory, review_id, now=None):
    now = now or datetime.now(UTC)
    async with session_factory() as session:
        row = await session.get(FitnessReview, review_id)
        if row is None:
            return
        await lock_user(session, row.user_id)
        await session.refresh(row)
        if row.status not in ('pending', 'processing') or row.next_run_at > now or (row.lease_until and row.lease_until > now):
            return
        if not await source_current(session, row):
            row.status, row.error, row.updated_at = 'blocked', '依据已改变或范围已撤销，请重新回顾。', now
            row.lease_until = None
            await session.commit()
            return
        attempt, uid, source = uuid.uuid4(), row.user_id, row.source
        if 'expert_skill' not in source:
            try:
                source = {**source, 'expert_skill': fitness_skill(source)}
            except ValidationException as exc:
                row.status, row.error, row.lease_until = 'blocked', exc.message, None
                await session.commit()
                return
            row.source = source
        row.attempt_id, row.status, row.lease_until = attempt, 'processing', now + timedelta(minutes=5)
        row.attempts += 1
        row.error, row.updated_at = None, now
        variant = await get_variant(str(uid), 'fitness_review')
        row.prompt_version = variant.version
        await session.commit()
        try:
            raw = await llm_service.structured_output(session, str(uid), 'fitness_review',
                {'source': json.dumps(source, ensure_ascii=False)}, variant)
            result, failure = validate_result(raw, source), None
        except Exception as exc:
            logger.warning('Fitness review failed: %s (%s)', review_id, type(exc).__name__, exc_info=False)
            await session.rollback()
            result, failure = None, 'AI 暂时无法完成回顾，系统会重试，原记录与安排仍保留。'
        await lock_user(session, uid)
        row = await session.get(FitnessReview, review_id, populate_existing=True)
        if row.attempt_id != attempt:
            await session.commit()
            return
        row.lease_until, row.updated_at = None, datetime.now(UTC)
        if not await source_current(session, row):
            row.status, row.result, row.error = 'blocked', None, '处理期间依据或读取范围发生变化，请重新回顾。'
        elif failure:
            row.status = 'pending' if row.attempts < 3 else 'failed'
            row.result, row.error = None, failure if row.attempts < 3 else 'AI 回顾重试后仍未完成，可手动重试，原记录仍保留。'
            row.next_run_at = now + timedelta(seconds=15 * 2 ** row.attempts)
        else:
            row.status, row.result, row.error = 'completed', result, None
        await session.commit()


async def schedule_rules(session_factory, now):
    from app.api.fitness_expert import ReviewRequest
    async with session_factory() as session:
        ids = list((await session.scalars(select(FitnessReviewRule.id))).all())
    for rule_id in ids:
        async with session_factory() as session:
            rule = await session.get(FitnessReviewRule, rule_id)
            user = await lock_user(session, rule.user_id)
            await session.refresh(rule)
            # Revocation/regrant does not silently reactivate an old authorization.
            if not rule.content['enabled'] or not fitness_source_allowed(user) or rule.content['access_version'] != access_payload(user)['version']:
                continue
            end = rule.next_start + timedelta(days=rule.content['period_days'] - 1)
            if end >= now.astimezone(ZoneInfo(rule.content['timezone'])).date():
                continue
            request_id = uuid.uuid5(rule.id, f"cycle:{rule.version}:{rule.next_start}")
            request = ReviewRequest(request_id=request_id, start=rule.next_start, end=end,
                timezone=rule.content['timezone'], consent=True)
            try:
                await enqueue_review(session, rule.user_id, request, rule=rule, now=now)
            except ValidationException as exc:
                # A large cycle must not starve other people or silently truncate sources.
                value = {**request.model_dump(mode='json'), 'rule_version': rule.version}
                session.add(FitnessReview(id=uuid.uuid5(rule.user_id, f'fitness-review:{request_id}'),
                    user_id=rule.user_id, request_id=request_id, rule_id=rule.id, fingerprint=digest(value),
                    input=value, source={'records': [], 'digest': None}, status='blocked', error=exc.message,
                    attempts=0, next_run_at=now, created_at=now, updated_at=now))
            rule.next_start = end + timedelta(days=1)
            await session.commit()


async def expert_tick(session_factory=async_session_factory, now=None):
    now = now or datetime.now(UTC)
    await schedule_rules(session_factory, now)
    async with session_factory() as session:
        ids = list((await session.scalars(select(FitnessReview.id).where(
            FitnessReview.status.in_(['pending', 'processing']), FitnessReview.next_run_at <= now,
            or_(FitnessReview.lease_until.is_(None), FitnessReview.lease_until <= now))
            .order_by(FitnessReview.next_run_at).limit(10))).all())
    for review_id in ids:
        try:
            await process_review(session_factory, review_id, now)
        except Exception:
            logger.exception('Fitness review worker failed: %s', review_id)


async def expert_loop():
    while True:
        try:
            await expert_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception('Personal fitness review tick failed')
        await asyncio.sleep(max(1, settings.EXECUTION_POLL_SECONDS))
