export interface Resource { id: string; title: string; url: string }
export interface TaskContent {
  title: string; body: string; criterion: string; resources: Resource[]; outcome: string;
  status: 'todo' | 'doing' | 'done' | 'blocked'; due_at: string | null;
}
export interface LearningEntry {id:string;date:string;kind:'note'|'insight';title:string;body:string;advice_request_id?:string|null;advice_index?:number|null}
export interface LearningContent {
  title: string; aim: string; resources: Resource[]; notes: string; questions: string; exercise: string;
  content?:string;insights?:string;journal?:LearningEntry[];
  outcome: string; stage: 'queued' | 'in_progress' | 'practice' | 'applied'; task_id: string | null;
  minutes_by_date: Record<string, number>;
}
export interface ReviewContent {date: string; reason: string; feeling: string; next: string}
export interface Document {id: string | null; version: number; content: Record<string, unknown>; updated_at: string | null}
export interface WorkTask {id: string; title: string; description: string; status: TaskContent['status']; due_at: string | null;
  updated_at: string | null; project_id?: string | null; goal_id?: string | null; plan_id?: string | null; document: Document}
export interface Learning {id: string; title: string; summary: string; source_url: string | null; status: string; updated_at: string | null; document: Document; observed_seconds?: number}
export interface Schedule {id: string; task_id: string; starts_at: string; ends_at: string; timezone: string; version: number; cancelled_at: string | null}
export interface SchedulePreferences {id:string;version:number;daily_minutes:number|null;available_start:string;available_end:string}
export interface Snapshot {workspace_id: string; tasks: WorkTask[]; learning: Learning[]; schedules: Schedule[];preferences?:SchedulePreferences}
export interface Evidence {id: string; revision_id: string | null; version: number; kind: 'task' | 'learning' | 'learning_review'; unit_id?:string;attempt_id?:string; entity_id: string; title: string; fields: string[]; excerpt: string; saved_at: string}
export interface Review extends ReviewContent {id: string; updated_at: string | null; document: Document; evidence: Evidence[]; saved_evidence: Evidence[]}
export interface Revision {id: string; version: number; content: Record<string, unknown>; source: string; created_at: string}
export type Kind = 'task' | 'learning' | 'schedule' | 'review' | 'preferences';
export type Action = 'create_task' | 'save_task' | 'restore_task' | 'save_schedule' | 'cancel_schedule' | 'create_learning' | 'save_learning' | 'append_material' | 'create_application' | 'adopt_learning_advice' | 'save_review' | 'save_preferences';
export interface Command {request_id: string; entity_id: string; action: Action; base_version: number; expected_updated_at: string | null; data: Record<string, unknown>}
export interface Draft {kind: Kind; entityId: string; data: Record<string, unknown>; baseVersion: number; updatedAt: string | null; create: boolean; error?: string; conflict?: boolean}
export interface Queued {command: Command; kind: Kind; error?: string; conflict?: boolean}
export interface Result {kind: Kind; entity: WorkTask | Learning | Schedule | SchedulePreferences | {id: string; date: string; updated_at: string; document: Document}; application?: WorkTask; appended_excerpt?: string}
export interface Journal {snapshot: Snapshot | null; drafts: Record<string, Draft>; queue: Queued[]; backups: Draft[]; reviews: Record<string, Review>}
export const emptyJournal = (): Journal => ({snapshot: null, drafts: {}, queue: [], backups: [], reviews: {}});
export function readJournal(storage: Pick<Storage, 'getItem'>, key: string): Journal {
  const raw = storage.getItem(key);
  if (!raw) return emptyJournal();
  const value = JSON.parse(raw) as Journal;
  if (!value || !value.drafts || !Array.isArray(value.queue) || !Array.isArray(value.backups)) throw new Error('草稿存储暂时无法读取，请保留当前页面。');
  return {...value, reviews: value.reviews ?? {}, queue: value.queue.map(q => q.conflict ? q : {...q, error: undefined})};
}
export function taskContent(task: WorkTask): TaskContent {
  const c = task.document.content;
  return {title: task.title, status: task.status, due_at: task.due_at, body: String(c.body ?? ''),
    criterion: String(c.criterion ?? ''), resources: (c.resources as Resource[]) ?? [], outcome: String(c.outcome ?? '')};
}
export function learningContent(item: Learning): LearningContent {
  const c = item.document.content;
  return {title: item.title, content:String(c.content??''),insights:String(c.insights??''),journal:(c.journal as LearningEntry[])??[],aim: String(c.aim ?? item.summary), notes: String(c.notes ?? ''), questions: String(c.questions ?? ''),
    exercise: String(c.exercise ?? ''), outcome: String(c.outcome ?? ''), stage: (c.stage as LearningContent['stage']) ??
      (item.status === 'queued' ? 'queued' : 'in_progress'), task_id: (c.task_id as string | null) ?? null,
    resources: (c.resources as Resource[]) ?? (item.source_url ? [{id: item.id, title: item.title, url: item.source_url}] : []),
    minutes_by_date: (c.minutes_by_date as Record<string, number>) ?? {}};
}
function upsert<T extends {id: string}>(items: T[], item: T) {return [item, ...items.filter(value => value.id !== item.id)];}
export function acknowledge(journal: Journal, queued: Queued, result: Result): Journal {
  const snapshot = journal.snapshot ? {...journal.snapshot} : null;
  if (snapshot) {
    if (result.kind === 'task') snapshot.tasks = upsert(snapshot.tasks, result.entity as WorkTask);
    if (result.kind === 'learning') {
      const incoming=result.entity as Learning,known=snapshot.learning.find(l=>l.id===incoming.id);
      const latest=known && (known.document.version>incoming.document.version || Date.parse(known.updated_at??'')>Date.parse(incoming.updated_at??'')) ? known : incoming;
      snapshot.learning = upsert(snapshot.learning, latest);
    }
    if (result.kind === 'schedule') snapshot.schedules = upsert(snapshot.schedules, result.entity as Schedule);
    if (result.kind === 'preferences') snapshot.preferences = result.entity as SchedulePreferences;
    if (result.application) snapshot.tasks = upsert(snapshot.tasks, result.application);
  }
  const drafts = {...journal.drafts}, id = queued.command.entity_id, draft = drafts[id];
  const acknowledgedEntity=result.kind==='learning' ? snapshot?.learning.find(l=>l.id===id)??result.entity : result.entity;
  if (draft) {
    if (queued.command.action === 'append_material' && result.appended_excerpt && 'document' in result.entity &&
        draft.baseVersion < result.entity.document.version && !String(draft.data.notes??'').includes(result.appended_excerpt) &&
        journal.queue.some(q=>q.command.request_id===queued.command.request_id)) {
      // Append to text typed while the source was being confirmed as well.
      drafts[id] = {...draft,data:{...draft.data,notes:[String(draft.data.notes??''),result.appended_excerpt].filter(Boolean).join('\n\n')}};
    }
    if (queued.command.action === 'adopt_learning_advice' && 'document' in result.entity &&
        draft.baseVersion < result.entity.document.version && journal.queue.some(q=>q.command.request_id===queued.command.request_id)) {
      // Preserve the adopted source-linked entry alongside writing continued during the save.
      const adopted=(result.entity.document.content.journal as LearningEntry[]|undefined)?.find(e=>
        e.advice_request_id===queued.command.data.help_request_id && e.advice_index===queued.command.data.suggestion_index);
      const entries=(drafts[id].data.journal as LearningEntry[]|undefined)??[];
      if(adopted&&!entries.some(e=>e.id===adopted.id))drafts[id]={...drafts[id],data:{...drafts[id].data,journal:[structuredClone(adopted),...entries]}};
    }
    // The request is frozen. Text typed during the request must survive its acknowledgement.
    if (JSON.stringify(draft.data) === JSON.stringify(queued.command.data)) delete drafts[id];
    else if ('document' in acknowledgedEntity) drafts[id] = {...drafts[id], baseVersion: acknowledgedEntity.document.version,
      updatedAt: acknowledgedEntity.updated_at, create: false, error: undefined, conflict: false};
    else if (result.kind==='preferences') drafts[id]={...draft,baseVersion:(result.entity as SchedulePreferences).version,error:undefined,conflict:false};
  }
  return {...journal, snapshot, drafts, queue: journal.queue.filter(item => item.command.request_id !== queued.command.request_id)};
}
export function frozenCommand(draft: Draft, requestId: string): Queued {
  const actions: Record<Kind, Action> = {task: draft.create ? 'create_task' : 'save_task', learning: draft.create ? 'create_learning' : 'save_learning', schedule: 'save_schedule', review: 'save_review', preferences:'save_preferences'};
  return {kind: draft.kind, command: {request_id: requestId, entity_id: draft.entityId, action: actions[draft.kind],
    base_version: draft.baseVersion, expected_updated_at: draft.updatedAt, data: structuredClone(draft.data)}};
}
export function safeResourceUrl(value: string) {
  try {const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;} catch {return null;}
}
export function dateInZone(instant: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function scheduleOnDay(block: Schedule, day: string, timezone: string) {
  const first = dateInZone(block.starts_at, timezone), last = dateInZone(new Date(new Date(block.ends_at).getTime() - 1), timezone);
  return !block.cancelled_at && first <= day && day <= last;
}
export function scheduledMinutes(blocks:Schedule[],day:string,timezone:string) {
  const next=new Date(`${day}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
  const start=Date.parse(zonedInstant(`${day}T00:00`,timezone)),end=Date.parse(zonedInstant(`${next.toISOString().slice(0,10)}T00:00`,timezone));
  return blocks.filter(b=>!b.cancelled_at).reduce((sum,b)=>sum+Math.max(0,Math.min(end,Date.parse(b.ends_at))-Math.max(start,Date.parse(b.starts_at)))/60000,0);
}
// Convert wall time in an IANA zone without silently accepting DST gaps or ambiguity.
export function zonedInstant(value: string, timezone: string): string {
  const wall = Date.parse(value + ':00Z');
  if (!Number.isFinite(wall)) throw new Error('请填写有效日期和时间');
  const format = (time: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(time);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  };
  const matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const guess = wall - offset * 60000;
    if (format(guess) === value) matches.push(guess);
  }
  if (matches.length !== 1) throw new Error('此时区时间不存在或处于夏令时重复时段，请换一个时间');
  return new Date(matches[0]).toISOString();
}
export function wallTime(instant: string, timezone: string) {
  const date = dateInZone(instant, timezone);
  return `${date}T${new Intl.DateTimeFormat('en-GB', {timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle:'h23'}).format(new Date(instant))}`;
}
