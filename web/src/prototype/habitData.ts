// D0 is an isolated, dated demo. These facts never enter a signed-in workspace.
export const HABIT_DEMO_KEY = 'growthpilot:prototype:habits:v1';
export const DEMO_TODAY = '2026-10-08';
export type Exercise = { name: string; kg: number; sets: number; reps: number };
export type ExerciseInput = { name: string; kg: string; sets: string; reps: string };
export type Workout = {
  id: string; version: number; date: string; title: string; outcome: 'completed' | 'skipped';
  minutes: number | null; exercises: Exercise[]; note: string;
  source: 'manual' | 'assisted' | 'reuse'; original: string; planId?: string;
  revisions: { version: number; date: string; title: string; minutes: number | null; exercises: Exercise[]; note: string }[];
};
export type WorkoutDraft = {
  id: string; baseVersion: number; date: string; title: string; outcome: Workout['outcome'];
  minutes: string; exercises: ExerciseInput[]; note: string; source: Workout['source']; original: string; planId?: string;
};
export type Plan = { id: string; date: string; title: string; minutes: number; sourceIds: string[] };
export type CoachReview = { id: string; from: string; to: string; records: Workout[]; summary: string; suggestion: string };
export type LearningDemo = {
  title: string; url: string; excerpt: string; question: string; notes: string; answer: string; application: string;
  explanation: string; feedback: string; explainedSource: string; feedbackSource: string;
};
export type HabitDemo = {
  version: 1; records: Workout[]; plans: Plan[]; habit: { enabled: boolean; days: number[]; time: string };
  draft: WorkoutDraft | null; raw: string; candidate: WorkoutDraft | null; pending: Workout | null;
  review: CoachReview | null; learning: LearningDemo;
  reviewHistory?: CoachReview[];
  reviewRules?: {enabled: boolean; days: number; version: number}[];
};
export type Range = { from: string; to: string };
export function uid() { return crypto.randomUUID(); }
export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function blankDraft(date = DEMO_TODAY): WorkoutDraft {
  return { id: uid(), baseVersion: 0, date, title: '', outcome: 'completed', minutes: '', exercises: [], note: '', source: 'manual', original: '' };
}
export function draftOf(record: Workout): WorkoutDraft {
  return { ...record, baseVersion: record.version, minutes: record.minutes === null ? '' : String(record.minutes),
    exercises: record.exercises.map(e => ({ name: e.name, kg: String(e.kg), sets: String(e.sets), reps: String(e.reps) })) };
}
export function reuseWorkout(record: Workout, date = DEMO_TODAY): WorkoutDraft {
  return { ...blankDraft(date), title: record.title, exercises: draftOf(record).exercises, source: 'reuse' };
}
function numeric(value: string, label: string, max: number, integer = false, allowZero = false) {
  if (!value.trim()) throw new Error(`请填写${label}；未知值可以先移除这一动作。`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < (allowZero ? 0 : 1) || n > max || (integer && !Number.isInteger(n))) throw new Error(`${label}的格式或范围不正确。`);
  return n;
}
export function freezeWorkout(draft: WorkoutDraft, records: Workout[]): Workout {
  if (!validDate(draft.date) || draft.date > DEMO_TODAY) throw new Error('实际发生日期不能晚于示例今天 10 月 8 日。');
  if (!draft.title.trim()) throw new Error('请填写本次活动名称。');
  const previous = records.find(r => r.id === draft.id);
  if (previous && previous.version !== draft.baseVersion) throw new Error('这条记录已有更新，请重新打开后纠正。');
  const skipped = draft.outcome === 'skipped';
  const exercises = skipped ? [] : draft.exercises.map(e => {
    if (!e.name.trim()) throw new Error('请填写动作名称，或移除空动作。');
    return { name: e.name.trim(), kg: numeric(e.kg, '重量', 1000, false, true),
      sets: numeric(e.sets, '组数', 100, true), reps: numeric(e.reps, '每组次数', 1000, true) };
  });
  const minutes = skipped || !draft.minutes.trim() ? null : numeric(draft.minutes, '实际分钟', 1440, true);
  const original = previous?.original || draft.original || [draft.title, draft.date, draft.minutes ? `${draft.minutes} 分钟` : '未填写时长',
    ...draft.exercises.map(e => `${e.name} ${e.kg}kg ${e.sets}组 ${e.reps}次`), draft.note].filter(Boolean).join('\n');
  const history = previous ? [...previous.revisions, { version: previous.version, date: previous.date, title: previous.title,
    minutes: previous.minutes, exercises: previous.exercises, note: previous.note }] : [];
  return { id: draft.id, version: (previous?.version ?? 0) + 1, date: draft.date, title: draft.title.trim(), outcome: draft.outcome,
    minutes, exercises, note: draft.note.trim(), source: previous?.source ?? draft.source, original, planId: draft.planId, revisions: history };
}
export function commitWorkout(state: HabitDemo, record: Workout): HabitDemo {
  const existing = state.records.find(r => r.id === record.id);
  if (existing && existing.version >= record.version) return { ...state, pending: null, draft: null };
  if (record.planId && state.records.some(r => r.planId === record.planId && r.id !== record.id)) throw new Error('这个安排已有实际反馈，请纠正原记录。');
  return { ...state, records: [...state.records.filter(r => r.id !== record.id), record], draft: null, pending: null };
}
export function recordsInRange(records: Workout[], range: Range) {
  return records.filter(r => r.date >= range.from && r.date <= range.to).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function rangeSummary(records: Workout[]) {
  const done = records.filter(r => r.outcome === 'completed');
  return { count: done.length, skipped: records.filter(r => r.outcome === 'skipped').length,
    minutes: done.reduce((n, r) => n + (r.minutes ?? 0), 0), knownMinutes: done.filter(r => r.minutes !== null).length };
}
export function movementTrend(records: Workout[], name: string) {
  const byDay = new Map<string, { date: string; kg: number; recordIds: string[] }>();
  for (const r of records.filter(r => r.outcome === 'completed')) {
    const entries = r.exercises.filter(e => e.name === name);
    if (!entries.length) continue;
    const kg = Math.max(...entries.map(e => e.kg));
    const old = byDay.get(r.date);
    byDay.set(r.date, { date: r.date, kg: Math.max(old?.kg ?? 0, kg), recordIds: [...(old?.recordIds ?? []), r.id] });
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function monthDays(month: string) {
  const first = `${month}-01`, weekDay = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = shiftDate(first, -((weekDay + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}
export function habitDates(habit: HabitDemo['habit'], range: Range) {
  if (!habit.enabled || !validDate(range.from) || !validDate(range.to) || range.from > range.to) return [];
  const result: string[] = [];
  for (let date = range.from; date <= range.to; date = shiftDate(date, 1)) {
    if (habit.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) result.push(date);
    if (result.length > 370) break;
  }
  return result;
}
// A deliberately limited mock extractor: unmatched values stay unknown for manual correction.
export function candidateFromText(raw: string): WorkoutDraft {
  if (!raw.trim()) throw new Error('先写一句发生了什么，也可以直接手动记录。');
  const draft = blankDraft();
  const duration = raw.match(/(\d+)\s*(?:分钟|min)/i)?.[1] ?? '';
  const date = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? DEMO_TODAY;
  const matches = [...raw.matchAll(/(深蹲|卧推|硬拉|划船|肩推)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)\s*(\d+)\s*组\s*(\d+)\s*次/gi)];
  const exercises = matches.map(m => ({ name: m[1], kg: m[2], sets: m[3], reps: m[4] }));
  return { ...draft, date, title: exercises.length ? '力量训练' : '', minutes: duration, exercises, note: raw,
    original: raw, source: 'assisted' };
}
export function createReview(records: Workout[], range: Range): CoachReview {
  const sources = recordsInRange(records, range), summary = rangeSummary(sources);
  if (!summary.count) throw new Error('当前范围没有已完成的训练记录。先记录一次活动，或扩大日期范围。');
  return { id: uid(), ...range, records: structuredClone(sources),
    summary: `这段时间记录了 ${summary.count} 次训练、${summary.skipped} 次明确未执行。${summary.knownMinutes ? `其中 ${summary.knownMinutes} 次填写了时长，合计 ${summary.minutes} 分钟。` : '尚未填写实际时长。'}未记录的日子无法判断是否训练，也不能由记录重量判断体能提升。`,
    suggestion: '下次沿用最近一次的动作结构，核对并记录实际重量、组数、次数和感受，再回看安排是否适合自己。' };
}
export function reviewIsCurrent(review: CoachReview | null, records: Workout[]) {
  return !!review && review.records.every(source => records.some(r => r.id === source.id && JSON.stringify(r) === JSON.stringify(source)));
}
export function learningFingerprint(learning: LearningDemo) { return JSON.stringify([learning.title, learning.url, learning.excerpt, learning.question]); }
export function feedbackFingerprint(learning: LearningDemo) { return JSON.stringify([learningFingerprint(learning), learning.answer]); }
export function safeUrl(value: string) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function seedHabitDemo(empty = false): HabitDemo {
  const entries = [['2026-09-21', 35, 30], ['2026-09-24', 35, 35], ['2026-09-28', 40, 35], ['2026-10-01', 40, 30], ['2026-10-05', 40, 35]] as const;
  const records: Workout[] = entries.map(([date, kg, minutes], index) => ({ id: `sample-${index}`, version: 1, date,
    title: '下班后的力量训练', outcome: 'completed', minutes,
    exercises: [{ name: '深蹲', kg, sets: 3, reps: 8 }, { name: '划船', kg: 20, sets: 3, reps: 10 }],
    note: index === 4 ? '今天按自己的节奏完成。希望下次继续留下完整记录。' : '实际完成了记录的动作。', source: 'manual',
    original: `${date} 力量训练 ${minutes}分钟，深蹲${kg}kg 3组8次，划船20kg 3组10次。`, revisions: [] }));
  records.push({ id: 'sample-skip', version: 1, date: '2026-09-30', title: '原计划的训练', outcome: 'skipped', minutes: null,
    exercises: [], note: '临时加班，明确没有训练。', source: 'manual', original: '临时加班，今天没有训练。', revisions: [] });
  return { version: 1, records: empty ? [] : records, plans: [], habit: { enabled: !empty, days: [1, 4], time: '18:30' },
    draft: null, raw: '', candidate: null, pending: null, review: null,
    learning: { title: empty ? '' : '把一个概念用到自己的项目里', url: '',
      excerpt: empty ? '' : '学习后先合上资料，用自己的话说出关键概念，再完成一个具体例子。遇到不确定的地方回到原文核对；下次练习时先尝试回忆，再查看笔记。',
      question: '我看懂了，但该怎么开始应用？', notes: '', answer: '', application: '', explanation: '', feedback: '', explainedSource: '', feedbackSource: '' } };
}
export function loadHabitDemo(storage: Pick<Storage, 'getItem'>): { state: HabitDemo; error: string } {
  try {
    const raw = storage.getItem(HABIT_DEMO_KEY);
    if (!raw) return { state: seedHabitDemo(), error: '' };
    const state: HabitDemo = JSON.parse(raw);
    if (state.version !== 1 || !Array.isArray(state.records) || !Array.isArray(state.plans) || !state.habit || !Array.isArray(state.habit.days)
      || typeof state.learning?.excerpt !== 'string' || !state.records.every(r => validDate(r.date) && Array.isArray(r.exercises) && Array.isArray(r.revisions))) throw new Error('invalid demo');
    return { state, error: '' };
  } catch { return { state: seedHabitDemo(true), error: '浏览器中的原型内容无法读取。请先导出当前内容；存储恢复前不要刷新。' }; }
}
