import {validProfile, type FitnessProfile, type FitnessContext} from './fitnessContext.ts';
import type {Access, Entity, WorkoutContent} from './store';
import type {ExpertSkill} from '../help/expertSkillData';
export interface Range {start: string; end: string}
export interface ReviewRequest extends Range {request_id: string; timezone: string; consent: true}
export interface Arrangement {title: string; detail: string; scheduled_on: string; time: string; timezone: string; planned_minutes: number | null; cancelled: boolean}
export interface Plan extends Entity<Arrangement> {review_id: string; feedback: Entity<WorkoutContent> | null}
export interface Rule {enabled: boolean; period_days: 7 | 14 | 28; start_on: string; timezone: string; consent: boolean; access_version?: number}
export interface Review {id: string; request_id: string; input: ReviewRequest & {rule_version?: number}; status: string; redacted: boolean; error: string | null;
  source: {profile?: Entity<FitnessProfile | null>; records: Entity<WorkoutContent>[]; feedback: {plan_id: string; record_id: string}[]} | null;
  result: {observations: {text: string; record_ids: string[]}[]; limitation: string; suggestion: {title: string; detail: string; record_ids: string[]}; skill?: ExpertSkill; context?: FitnessContext} | null;
  created_at: string; updated_at: string; attempts: number}
export interface ExpertSnapshot {access: Access; profile: Entity<FitnessProfile | null>; reviews: Review[]; plans: Plan[]; rule: Entity<Rule | null> & {next_start?: string}; rule_active: boolean}
export interface ExpertCommand {request_id: string; action: 'adopt_plan' | 'save_plan' | 'save_rule' | 'save_profile'; entity_id: string; base_version: number; data: Arrangement | Rule | FitnessProfile}
export interface PlanDraft {entityId: string; version: number; action: 'adopt_plan' | 'save_plan'; data: Arrangement}
export interface ExpertJournal {version: 1; range: Range; request: ReviewRequest | null; command: ExpertCommand | null; plan: PlanDraft | null; rule: Rule | null; ruleBaseVersion?: number; profile?: FitnessProfile | null; profileBaseVersion?: number}
export function dateRange(end: string, days = 7): Range {
  const start = new Date(`${end}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - days + 1);
  return {start: start.toISOString().slice(0,10), end};
}
const validDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0,10) === value;
};
export function validateRange(range: Range) {
  if (!validDate(range.start) || !validDate(range.end) || range.start > range.end || (Date.parse(range.end) - Date.parse(range.start)) / 86400000 > 365) throw new Error('请选择正确的日期范围，最多 366 天。');
  return range;
}
export function restoreExpert(storage: Pick<Storage,'getItem'>, key: string, today: string): ExpertJournal {
  const raw = storage.getItem(key);
  if (!raw) return {version: 1, range: dateRange(today), request: null, command: null, plan: null, rule: null};
  const value = JSON.parse(raw) as ExpertJournal;
  const uuid = (id: unknown) => typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
  const arrangement = (p: Arrangement) => p && ['title','detail','scheduled_on','time','timezone'].every(k => typeof p[k as keyof Arrangement] === 'string') && typeof p.cancelled === 'boolean' && (p.planned_minutes === null || typeof p.planned_minutes === 'number' && Number.isFinite(p.planned_minutes));
  const rule = (r: Rule) => r && typeof r.enabled === 'boolean' && typeof r.consent === 'boolean' && [7,14,28].includes(r.period_days) && typeof r.start_on === 'string' && typeof r.timezone === 'string';
  if (value?.version !== 1 || !value.range || !('request' in value) || !('command' in value) || !('plan' in value) || !('rule' in value)
    || (value.request && (!uuid(value.request.request_id) || value.request.consent !== true || typeof value.request.timezone !== 'string'))
    || (value.command && (!uuid(value.command.request_id) || !uuid(value.command.entity_id) || !['adopt_plan','save_plan','save_rule','save_profile'].includes(value.command.action) || !Number.isInteger(value.command.base_version) || value.command.base_version < 0 || !(value.command.action === 'save_profile' ? validProfile(value.command.data as FitnessProfile) : value.command.action === 'save_rule' ? rule(value.command.data as Rule) : arrangement(value.command.data as Arrangement))))
    || (value.plan && (!uuid(value.plan.entityId) || !['adopt_plan','save_plan'].includes(value.plan.action) || !Number.isInteger(value.plan.version) || !arrangement(value.plan.data)))
    || (value.rule && !rule(value.rule)) || (value.ruleBaseVersion !== undefined && (!Number.isInteger(value.ruleBaseVersion) || value.ruleBaseVersion < 0))) throw new Error('专家草稿无法读取，原存储已保留。');
  if ((value.profile && !validProfile(value.profile, true)) || (value.profileBaseVersion !== undefined && (!Number.isInteger(value.profileBaseVersion) || value.profileBaseVersion < 0))) throw new Error('健身背景草稿无法读取，原存储已保留。');
  if (typeof value.range.start !== 'string' || typeof value.range.end !== 'string') throw new Error('专家日期草稿无法读取。');
  if (value.request) validateRange(value.request);
  return value;
}
export function freezeExpert(draft: Omit<ExpertCommand,'request_id'>, requestId: string): ExpertCommand {
  return structuredClone({...draft, request_id: requestId});
}
export function feedbackForm(plan: Plan, today: string) {
  return {title: plan.content.title, occurred_on: today, expert_plan_id: plan.id};
}
