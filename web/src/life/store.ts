import {EQUIPMENT, RECOVERY, type Equipment} from './fitnessContext.ts';
export interface Exercise {name: string; weight: number; unit: 'kg'; sets: number; reps: number; equipment?: Equipment | null}
export interface WorkoutContent {title: string; occurred_on: string; timezone: string; outcome: 'completed' | 'skipped'; actual_minutes: number | null; exercises: Exercise[]; note: string; source: 'manual' | 'reuse' | 'ai'; original: string; confirmed: true; reused_from: string | null; habit_id: string | null; help_request_id?: string | null; expert_plan_id?: string | null; effort?: number | null; recovery?: 'ready' | 'tired' | 'pain_or_unwell' | null}
export interface HabitContent {enabled: boolean; days: number[]; time: string; timezone: string; effective_from: string}
export interface Entity<T = Record<string, unknown>> {id: string; version: number; content: T; updated_at?: string; created_at?: string; change?: {action: Action; workspace_name?: string | null} | null}
export interface Access {id: string; version: number; fitness_expert_enabled: boolean}
export interface Reference {record_id: string; workspace_id: string; linked_at: string; revoked_at: string | null}
export interface Snapshot {records: Entity<WorkoutContent>[]; total: number; habit: Entity<HabitContent | null>; access: Access; references: Reference[]}
export interface RecordForm {title: string; occurred_on: string; timezone: string; outcome: WorkoutContent['outcome']; minutes: string; exercises: {name: string; weight: string; sets: string; reps: string; equipment?: Equipment | ''}[]; note: string; source: WorkoutContent['source']; original: string; reused_from: string | null; habit_id: string | null; help_request_id?: string | null; expert_plan_id?: string | null; aiText?: string; aiTimezone?: string; aiOutcomeUnknown?: boolean; effort?: string; recovery?: WorkoutContent['recovery'] | ''}
export type Kind = 'record' | 'habit' | 'access' | 'reference';
export type Action = 'create_record' | 'save_record' | 'save_habit' | 'save_access' | 'link_record' | 'unlink_record';
export interface Draft {id: string; kind: Kind; baseVersion: number; data: Record<string, unknown>; conflict?: boolean; error?: string}
export interface Command {request_id: string; entity_id: string; action: Action; base_version: number; data: Record<string, unknown>}
export interface Queued {command: Command; draft: Draft; error?: string; conflict?: boolean}
export type Result = {kind: 'record' | 'reference'; entity: Entity<WorkoutContent>; references?: Reference[]} | {kind: 'habit'; entity: Entity<HabitContent>} | {kind: 'access'; entity: Access};
export interface Journal {version: 1; snapshot: Snapshot | null; drafts: Record<string, Draft>; queue: Queued[]; backups: Draft[]}
export const emptyJournal = (): Journal => ({version: 1, snapshot: null, drafts: {}, queue: [], backups: []});
export function readLifeJournal(storage: Pick<Storage, 'getItem'>, key: string): Journal {
  const raw = storage.getItem(key);
  if (!raw) return emptyJournal();
  const j = JSON.parse(raw) as Journal;
  const validDraft = (d: Draft) => d && typeof d.id === 'string' && ['record', 'habit', 'access', 'reference'].includes(d.kind)
    && Number.isInteger(d.baseVersion) && d.baseVersion >= 0 && d.data && typeof d.data === 'object'
    && (d.kind !== 'record' || (typeof d.data.title === 'string' && typeof d.data.occurred_on === 'string'
      && typeof d.data.timezone === 'string' && typeof d.data.minutes === 'string' && Array.isArray(d.data.exercises)
      && (d.data.effort === undefined || typeof d.data.effort === 'string')
      && (d.data.recovery === undefined || d.data.recovery === null || d.data.recovery === '' || Object.hasOwn(RECOVERY,String(d.data.recovery)))
      && d.data.exercises.every(e => e && ['name', 'weight', 'sets', 'reps'].every(k => typeof e[k] === 'string') && (e.equipment === undefined || e.equipment === '' || Object.hasOwn(EQUIPMENT,e.equipment)))));
  if (j?.version !== 1 || !j.drafts || Array.isArray(j.drafts) || !Array.isArray(j.queue) || !Array.isArray(j.backups)
    || Object.values(j.drafts).some(d => !validDraft(d)) || j.backups.some(d => !validDraft(d))
    || (j.snapshot !== null && (!Array.isArray(j.snapshot?.records) || !Array.isArray(j.snapshot?.references) || !j.snapshot?.habit || !j.snapshot.access
      || j.snapshot.records.some(r => !r?.content || !Array.isArray(r.content.exercises) || typeof r.content.occurred_on !== 'string')))
    || j.queue.some(q => !q?.command?.request_id || !q.command.entity_id || !validDraft(q.draft))) throw new Error('健身草稿无法读取，请保留当前页面及原存储。');
  return {...j, queue: j.queue.map(q => q.conflict ? q : {...q, error: undefined})};
}
export function localDate(timezone: string, instant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(instant);
}
export function recordForm(content?: WorkoutContent, timezone = 'Asia/Shanghai'): RecordForm {
  return content ? {title: content.title, occurred_on: content.occurred_on, timezone: content.timezone, outcome: content.outcome,
    minutes: content.actual_minutes === null ? '' : String(content.actual_minutes), exercises: content.exercises.map(e => ({name: e.name, weight: String(e.weight), sets: String(e.sets), reps: String(e.reps), equipment:e.equipment ?? ''})),
    effort: content.effort == null ? '' : String(content.effort), recovery:content.recovery ?? '', note: content.note, source: content.source, original: content.original, reused_from: content.reused_from, habit_id: content.habit_id, help_request_id: content.help_request_id ?? null, expert_plan_id: content.expert_plan_id ?? null}
    : {title: '', occurred_on: localDate(timezone), timezone, outcome: 'completed', minutes: '', effort:'', recovery:'', exercises: [], note: '', source: 'manual', original: '', reused_from: null, habit_id: null};
}
export function reusedForm(record: Entity<WorkoutContent>, timezone = 'Asia/Shanghai'): RecordForm {
  const fields = recordForm(record.content);
  return {...recordForm(undefined, timezone), title: fields.title, exercises: fields.exercises, source: 'reuse', reused_from: record.id};
}
function number(value: string, label: string, max: number, integer = false, zero = false) {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n) || n < (zero ? 0 : 1) || n > max || (integer && !Number.isInteger(n))) throw new Error(`请核对${label}；未知值可暂不填写动作。`);
  return n;
}
export function recordContent(form: RecordForm): WorkoutContent {
  if (form.aiOutcomeUnknown) throw new Error('原话的实际结果不明确，请先选择已完成或明确未执行。');
  if (!form.title.trim()) throw new Error('请填写活动名称。');
  const instant = new Date(`${form.occurred_on}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurred_on) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== form.occurred_on || form.occurred_on > localDate(form.timezone)) throw new Error('请核对实际发生日期与时区，不能记录未来活动。');
  const skipped = form.outcome === 'skipped';
  const exercises = skipped ? [] : form.exercises.map(e => {
    if (!e.name.trim()) throw new Error('请填写动作名称，或移除这条空动作。');
    return {name: e.name.trim(), weight: number(e.weight, '重量', 1000, false, true), unit: 'kg' as const, equipment:e.equipment || null,
      sets: number(e.sets, '组数', 100, true), reps: number(e.reps, '每组次数', 1000, true)};
  });
  const original = form.original || [form.title, form.occurred_on, form.timezone, skipped ? '本人声明未执行' : form.minutes ? `${form.minutes}分钟` : '实际时长未知',
    ...(!skipped ? form.exercises.map(e => `${e.name} ${e.weight}kg ${e.sets}组 ${e.reps}次${e.equipment ? ` · ${EQUIPMENT[e.equipment]}` : ''}`) : []),
    ...(!skipped ? [form.effort ? `本人努力程度 ${form.effort}/10` : '', form.recovery ? RECOVERY[form.recovery] : ''] : []), form.note].filter(Boolean).join('\n');
  return {title: form.title.trim(), occurred_on: form.occurred_on, timezone: form.timezone, outcome: form.outcome,
    actual_minutes: skipped || !form.minutes.trim() ? null : number(form.minutes, '实际分钟', 1440, true), exercises, note: form.note,
    effort:skipped || !form.effort?.trim() ? null : number(form.effort,'努力程度',10,true), recovery:skipped ? null : form.recovery || null,
    source: form.source, original, confirmed: true, reused_from: form.reused_from, habit_id: form.habit_id, help_request_id: form.help_request_id ?? null, expert_plan_id: form.expert_plan_id ?? null};
}
export function freezeLifeCommand(draft: Draft, requestId: string, action?: Action): Queued {
  const data = draft.kind === 'record' ? recordContent(draft.data as unknown as RecordForm) : structuredClone(draft.data);
  return {draft: structuredClone(draft), command: {request_id: requestId, entity_id: draft.id,
    action: action ?? (draft.kind === 'record' ? draft.baseVersion ? 'save_record' : 'create_record' : draft.kind === 'habit' ? 'save_habit' : 'save_access'),
    base_version: draft.baseVersion, data: data as unknown as Record<string, unknown>}};
}
export function mergeLifeSnapshot(previous: Snapshot | null, incoming: Snapshot): Snapshot {
  if (!previous) return incoming;
  // Older pages remain available after a first-page refresh; facts have no delete command.
  return {...incoming, records: [...incoming.records.map(r => {const old = previous.records.find(v => v.id === r.id); return old && old.version > r.version ? old : r;}),
    ...previous.records.filter(r => !incoming.records.some(v => v.id === r.id))],
    references: [...incoming.references.filter(ref => !previous.records.some(r => r.id === ref.record_id && r.version > (incoming.records.find(v => v.id === r.id)?.version ?? 0))),
      ...previous.references.filter(ref => !incoming.records.some(r => r.id === ref.record_id && r.version >= (previous.records.find(v => v.id === r.id)?.version ?? 0)))],
    habit: previous.habit.version > incoming.habit.version ? previous.habit : incoming.habit,
    access: previous.access.version > incoming.access.version ? previous.access : incoming.access};
}
export function acknowledgeLife(journal: Journal, queued: Queued, result: Result): Journal {
  const snapshot = journal.snapshot ? {...journal.snapshot} : null;
  const drafts = {...journal.drafts}, draft = drafts[queued.draft.id];
  if (snapshot) {
    if (result.kind === 'record' || result.kind === 'reference') {
      const existing = snapshot.records.find(r => r.id === result.entity.id);
      if (!existing || existing.version <= result.entity.version) snapshot.records = [result.entity, ...snapshot.records.filter(r => r.id !== result.entity.id)].sort((a, b) => b.content.occurred_on.localeCompare(a.content.occurred_on) || a.id.localeCompare(b.id));
      if (!existing && result.kind === 'record' && queued.command.action === 'create_record') snapshot.total++;
      if (result.kind === 'reference' && (!existing || existing.version <= result.entity.version)) snapshot.references = [...snapshot.references.filter(r => r.record_id !== result.entity.id), ...(result.references ?? [])];
    } else if (result.kind === 'habit' && snapshot.habit.version <= result.entity.version) snapshot.habit = result.entity;
    else if (result.kind === 'access' && snapshot.access.version <= result.entity.version) snapshot.access = result.entity;
  }
  if (draft && JSON.stringify(draft.data) === JSON.stringify(queued.draft.data)) delete drafts[draft.id];
  else if (draft) {
    const knownVersion = snapshot ? draft.kind === 'record' || draft.kind === 'reference' ? snapshot.records.find(r => r.id === draft.id)?.version : draft.kind === 'habit' ? snapshot.habit.version : snapshot.access.version : undefined;
    // Continued typing started from the submitted version, not from a later remote edit.
    drafts[draft.id] = {...draft, baseVersion: result.entity.version, conflict: (knownVersion ?? 0) > result.entity.version,
      data: draft.kind === 'record' && (result.kind === 'record' || result.kind === 'reference') ? {...draft.data, original: result.entity.content.original} : draft.data};
  }
  return {...journal, snapshot, drafts, queue: journal.queue.filter(q => q.command.request_id !== queued.command.request_id)};
}
export function habitRuleForDay(history: Entity<HabitContent>[], day: string) {
  return [...history].filter(r => r.content.effective_from <= day).sort((a, b) => b.content.effective_from.localeCompare(a.content.effective_from) || b.version - a.version)[0]?.content ?? null;
}
