"""Self-reported background and bounded, source-preserving next-session options."""
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from pydantic import Field, StrictBool, StrictInt, model_validator

from app.api.personal_life import Strict

Equipment = Literal['bodyweight', 'dumbbell', 'barbell', 'machine', 'band']
EQUIPMENT = {'bodyweight': '自重', 'dumbbell': '哑铃', 'barbell': '杠铃', 'machine': '固定器械', 'band': '弹力带'}


class ProfileContent(Strict):
    goal: Literal['consistency', 'strength', 'muscle', 'general'] | None = None
    experience: Literal['beginner', 'returning', 'experienced'] | None = None
    equipment: list[Equipment] = Field(default_factory=list, max_length=5)
    days_per_week: StrictInt | None = Field(default=None, ge=1, le=7)
    session_minutes: StrictInt | None = Field(default=None, ge=5, le=240)
    population: Literal['unknown', 'healthy_adult', 'needs_guidance'] = 'unknown'
    limitations: Literal['unknown', 'none', 'reported'] = 'unknown'
    limitation_notes: str = Field(default='', max_length=2000)
    share_with_expert: StrictBool = False
    confirmed: StrictBool

    @model_validator(mode='after')
    def checked(self):
        if not self.confirmed or len(set(self.equipment)) != len(self.equipment):
            raise ValueError('背景需要本人核对，器械不能重复。')
        return self


def profile_payload(user, *, for_expert=False):
    stored = (user.settings or {}).get('fitness_profile', {})
    content = stored.get('content')
    return {'id': str(uuid.uuid5(user.id, 'fitness-profile')), 'version': stored.get('version', 0),
            'content': content if not for_expert or (content and content.get('share_with_expert') is True) else None,
            'updated_at': stored.get('updated_at')}


def fitness_context(source):
    """These are conservative product eligibility rules, not medical thresholds.

    Never infer equipment, resolve symptoms, impute feedback, select convenient
    rows from one date or calculate an increase. Only repeat an exact logged
    structure when its context is explicitly reported and recent in the range.
    """
    profile = source.get('profile') or {}
    p = profile.get('content') or {}
    result = {'mode': 'gather_context', 'reasons': [], 'profile_version': profile.get('version', 0),
              'record_id': None, 'record_version': None, 'session': None}
    missing = result['reasons']
    if not p:
        missing.append('先填写并单独允许专家使用本人健身背景。')
    else:
        for key, label in [('goal', '目标'), ('experience', '经验'), ('equipment', '可用器械'),
                           ('days_per_week', '每周可用天数'), ('session_minutes', '单次可用时间')]:
            if not p.get(key):
                missing.append(f'请补充本人{label}。')
        if p.get('population', 'unknown') == 'unknown' or p.get('limitations', 'unknown') == 'unknown':
            missing.append('请核对适用情况和活动限制。')
        if p.get('population') == 'needs_guidance' or p.get('limitations') == 'reported' or p.get('limitation_notes', '').strip():
            result['mode'] = 'review_limits'
            missing.append('存在需核对的适用情况或限制，先获得适合本人的专业指导。')
    completed = [r for r in source['records'] if r['content']['outcome'] == 'completed']
    if not completed:
        missing.append('还没有已完成活动，可先记录实际情况。')
        return result
    last_day = max(r['content']['occurred_on'] for r in completed)
    latest = [r for r in completed if r['content']['occurred_on'] == last_day]
    if len(latest) != 1:
        missing.append('最近一天有多条活动，请逐条核对后再决定下一次结构。')
        return result
    record = latest[0]
    result.update(record_id=record['id'], record_version=record['version'])
    c = record['content']
    reference_day = max(date.fromisoformat(source['end']), datetime.now(UTC).date())
    if (reference_day - date.fromisoformat(last_day)).days > 7:
        missing.append('最近记录已超过 7 天，请补充近期实际活动和反馈。')
    if c.get('effort') is None or c.get('recovery') is None:
        missing.append('最近活动还缺少本人努力程度或当时恢复反馈。')
    if c.get('recovery') in ('tired', 'pain_or_unwell') or (c.get('effort') or 0) >= 9:
        result['mode'] = 'review_limits'
        missing.append('最近反馈有疲劳、不适或很高努力程度，请先核对当前状态，不自动沿用结构。')
    if not c['exercises'] or any(not e.get('equipment') for e in c['exercises']):
        missing.append('最近活动还缺少动作或本人确认的器械。')
    elif p and any(e['equipment'] not in p.get('equipment', []) for e in c['exercises']):
        missing.append('最近动作使用的器械与当前可用器械不一致。')
    if c.get('actual_minutes') is None:
        missing.append('最近活动时长未知，无法核对单次可用时间。')
    elif p.get('session_minutes') and c['actual_minutes'] > p['session_minutes']:
        missing.append('最近活动用时超过当前单次可用时间，请先调整并核对。')
    if missing:
        return result
    result['mode'] = 'repeat_logged_structure'
    result['valid_until'] = (date.fromisoformat(last_day) + timedelta(days=7)).isoformat()
    result['session'] = {'title': '核对后沿用已记录的训练结构',
        'exercises': [{k: e[k] for k in ('name', 'weight', 'sets', 'reps', 'equipment')} for e in c['exercises']],
        'conditions': ['这只是一次候选安排；训练前重新核对当天状态、器械和动作条件。',
                       '历史反馈不代表当天已恢复。有疼痛、不适或疲劳时暂停并先核对，不自动加重。'],
        'feedback_prompts': ['活动后记录实际动作、用时、努力程度（1–10）和当时恢复感受。',
                             '与安排不一致时保存实际情况，下一次回顾使用真实反馈。']}
    return result


def context_suggestion(context, source):
    ids = [context['record_id'] or source['records'][0]['id']]
    if context['session']:
        s = context['session']
        lines = [f"{e['name']} · {EQUIPMENT[e['equipment']]} · {e['weight']} kg · {e['sets']} × {e['reps']}" for e in s['exercises']]
        return {'title': s['title'], 'detail': '\n'.join([*lines, *s['conditions'], *s['feedback_prompts']]), 'record_ids': ids}
    return {'title': '先核对背景与真实反馈', 'detail': '\n'.join(context['reasons']), 'record_ids': ids}
