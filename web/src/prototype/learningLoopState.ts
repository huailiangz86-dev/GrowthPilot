export const LOOP_KEY = 'gp-learning-loop-prototype-v1';
export type Stage = 'home' | 'setup' | 'recall' | 'check' | 'practice' | 'schedule';
export type Assistance = 'independent' | 'source' | 'ai';
export interface SourceSnapshot { version: number; title: string; text: string }
export interface LoopAttempt {
  id: string; question: string; source: SourceSnapshot; startedOn: string;
  answer: string; noRecall: boolean; assistance: Assistance; hintSeen: boolean; answerSaved: boolean;
  selfCheck: '' | 'missing' | 'included' | 'uncertain'; result: string; checked: boolean;
  schedule: 'suggested' | 'manual' | 'none'; nextDate: string; completedOn: string | null;
}
export interface LoopState {
  version: 1; clock: string; stage: Stage; goal: string; sourceSelected: boolean;
  sourceVersion: number; current: LoopAttempt | null; attempts: LoopAttempt[];
}
export const SOURCES: Record<number, SourceSnapshot> = {
  1: {version: 1, title: '一次 AI 整理工具的试用记录 · 虚构资料', text: '20 名自愿参与者试用了一款 AI 整理工具，其中 12 人自报整理更快。\n这次试用没有记录实际耗时，也没有对照组。\n这些记录可以说明部分参与者的感受，尚不能证明工具带来了效率提升，也不能推广到所有人。'},
  2: {version: 2, title: '一次 AI 整理工具的试用记录 · 虚构资料', text: '20 名自愿参与者试用了一款 AI 整理工具，其中 12 人自报整理更快。\n这次试用没有记录实际耗时，也没有对照组。\n修订说明：后续若要验证效率，应先明确任务与实际耗时的记录方法；当前仍没有新增实验结果。'},
};
const QUESTIONS = ['这份记录能支持“工具一定提升效率”吗？请说明依据与限制。', '同事据此建议全公司立即采用这款工具。你会怎样回应，还需要核对什么？'];
export function freshLoop(clock: string): LoopState {
  return {version: 1, clock, stage: 'home', goal: '', sourceSelected: false, sourceVersion: 1, current: null, attempts: []};
}
export function addDays(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validAttempt(value: unknown): value is LoopAttempt {
  if (!value || typeof value !== 'object') return false;
  const a = value as LoopAttempt;
  return typeof a.id === 'string' && typeof a.question === 'string' && validDate(a.startedOn)
    && !!a.source && [1, 2].includes(a.source.version) && typeof a.source.text === 'string' && typeof a.source.title === 'string'
    && [a.answer, a.result, a.nextDate].every(v => typeof v === 'string')
    && [a.noRecall, a.hintSeen, a.answerSaved, a.checked].every(v => typeof v === 'boolean')
    && ['independent', 'source', 'ai'].includes(a.assistance) && ['', 'missing', 'included', 'uncertain'].includes(a.selfCheck)
    && ['suggested', 'manual', 'none'].includes(a.schedule) && (a.completedOn === null || validDate(a.completedOn));
}
export function readLoop(raw: string | null, clock: string): LoopState {
  if (raw === null) return freshLoop(clock);
  const value = JSON.parse(raw) as LoopState;
  if (!value || value.version !== 1 || !validDate(value.clock)
    || !['home', 'setup', 'recall', 'check', 'practice', 'schedule'].includes(value.stage)
    || typeof value.goal !== 'string' || typeof value.sourceSelected !== 'boolean' || ![1, 2].includes(value.sourceVersion)
    || !Array.isArray(value.attempts) || !value.attempts.every(a => validAttempt(a) && !!a.completedOn)
    || (value.current !== null && !validAttempt(value.current))
    || (['recall', 'check', 'practice', 'schedule'].includes(value.stage) && !value.current)) {
    throw Error('旧草稿无法读取，原内容未覆盖。');
  }
  return value;
}
export function startAttempt(state: LoopState, id: string): LoopState {
  if (!state.sourceSelected || !state.goal.trim()) throw Error('请先选择资料和一个应用目标。');
  return {...state, stage: 'recall', current: {id, source: {...SOURCES[state.sourceVersion]}, question: QUESTIONS[state.attempts.length % QUESTIONS.length],
    startedOn: state.clock, answer: '', noRecall: false, assistance: 'independent', hintSeen: false, answerSaved: false,
    selfCheck: '', result: '', checked: false, schedule: 'suggested', nextDate: '', completedOn: null}};
}
export function saveAnswer(state: LoopState): LoopState {
  const a = state.current;
  if (!a || (!a.noRecall && !a.answer.trim())) throw Error('先留下自己的回答，或选择这次没能想起。');
  return {...state, current: {...a, answer: a.noRecall ? '' : a.answer, answerSaved: true}};
}
export function finishAttempt(state: LoopState): LoopState {
  const a = state.current;
  if (!a || !a.answerSaved || !a.selfCheck || !a.result.trim() || !a.checked) throw Error('先保存作答、本人核对与实际练习结果。');
  const nextDate = a.schedule === 'suggested' ? addDays(state.clock, 2) : a.schedule === 'none' ? '' : a.nextDate;
  if (a.schedule !== 'none' && (!validDate(nextDate) || nextDate <= state.clock)) throw Error('请选择示例今天之后的回访日期。');
  const finished = {...a, nextDate, completedOn: state.clock};
  return {...state, stage: 'home', current: null, attempts: state.attempts.some(old => old.id === a.id) ? state.attempts : [...state.attempts, finished]};
}
export function suggestedAction(a: LoopAttempt) {
  if (a.noRecall || a.selfCheck === 'uncertain') return {why: '你还不确定，先用原文建立一份可核对的回答。', action: '用自己的话写出记录里的一个事实和一个限制，再各标出一句原文依据。', check: '事实保留“自报”的性质；限制至少说明未记录实际耗时或没有对照组。'};
  if (a.selfCheck === 'missing') return {why: '你自己核对后发现遗漏了限制，下一步补齐验证方法。', action: '给同事写一段采用建议：说明已有证据的限制，并提出一次实际耗时对比的办法。', check: '区分参与者的感受与实际耗时，不宣称已证明因果；写清准备怎样比较。'};
  return {why: '你认为已写明限制，可以换一个工作情境再用一次。', action: '给团队写一段试用建议：哪些结论可以保留，哪些还需验证，下一步怎样小范围尝试。', check: '建议有资料依据、适用限制和可观察的验证结果；不能把试用感受写成全面推广的证明。'};
}
