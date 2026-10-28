import { createOnboardingCompletionPayload, type OnboardingCompletionPayload } from '../pages/app/onboardingDraft.ts';
import { localDateKey } from './dailyPreferences.ts';
import type { OnboardingDraft, OnboardingSelection, WorkspaceState } from './workspaceData.ts';

export type OnboardingObjectStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'blocked';
export interface OnboardingObject {
  key: string;
  id: string | null;
  status: OnboardingObjectStatus;
  error?: string | null;
}
export interface OnboardingResult {
  client_request_id: string;
  memory_id: string;
  workspace_id: string | null;
  project_id: string | null;
  saved: boolean;
  objects: OnboardingObject[];
}
export interface OnboardingSubmission {
  requestId: string;
  ownerId: string | null;
  rawInput: string;
  draft: OnboardingDraft;
  selected: OnboardingSelection;
  payload: OnboardingCompletionPayload;
  objects: OnboardingObject[];
  saved: boolean;
  error?: string;
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export const ONBOARDING_STATUS_LABELS: Record<OnboardingObjectStatus, string> = {pending: '本地待同步', syncing: '保存中', synced: '已保存', failed: '保存失败', blocked: '等待关联对象'};
export function onboardingStorageKey(ownerId: string | null) {return `gp_onboarding_submission_v1:${ownerId ?? 'local'}`;}
export function onboardingInputKey(ownerId: string | null) {return `gp_onboarding_input_draft:${ownerId ?? 'local'}`;}

export function isolateOnboardingWorkspaces(state: WorkspaceState, ownerId: string | null): WorkspaceState {
  const hidden = new Set(state.workspaces.filter(item => item.ownerId !== undefined && item.ownerId !== ownerId).map(item => item.id));
  if (!hidden.size) return state;
  const workspaces = state.workspaces.filter(item => !hidden.has(item.id));
  const visible = <T extends {workspaceId: string}>(items: T[]) => items.filter(item => !hidden.has(item.workspaceId));
  return {...state, workspaces, activeWorkspaceId: hidden.has(state.activeWorkspaceId) ? workspaces[0]?.id ?? 'workspace-growth' : state.activeWorkspaceId,
    onboardingCompleted: false, projects: visible(state.projects), goals: visible(state.goals), plans: visible(state.plans), tasks: visible(state.tasks),
    learningItems: visible(state.learningItems), captures: visible(state.captures), reflections: visible(state.reflections), knowledgeCards: visible(state.knowledgeCards),
    activities: visible(state.activities), insights: visible(state.insights), focusSession: state.focusSession && hidden.has(state.focusSession.workspaceId) ? null : state.focusSession};
}

export function readOnboardingSubmission(storage: StorageAccess, ownerId: string | null): OnboardingSubmission | null {
  const raw = storage.getItem(onboardingStorageKey(ownerId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as OnboardingSubmission;
    if (value.ownerId !== ownerId || !value.requestId || !value.rawInput || !value.payload?.workspace || !value.draft?.workspace || !Array.isArray(value.objects)) throw new Error('Invalid submission');
    return {...value, objects: value.objects.map(item => ({...item, status: item.status === 'syncing' ? 'pending' : item.status}))};
  } catch (cause) {throw new Error('无法读取已确认方案，请保留当前原话后重试。', {cause});}
}

export function persistOnboardingSubmission(storage: StorageAccess, submission: OnboardingSubmission) {
  try {storage.setItem(onboardingStorageKey(submission.ownerId), JSON.stringify(submission));}
  catch (cause) {throw new Error('浏览器无法保存这份方案，原话仍在；请稍后重试。', {cause});}
}

// Resolve the reviewed relative labels once, using the user's timezone; retries keep the same dates.
function dueAt(label: string, timezone: string, now: Date): string | null {
  if (label !== '今天' && label !== '明天') return null;
  const date = new Date(`${localDateKey(timezone, now)}T12:00:00Z`);
  if (label === '明天') date.setUTCDate(date.getUTCDate() + 1);
  const offset = new Intl.DateTimeFormat('en-US', {timeZone: timezone, timeZoneName: 'shortOffset'}).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
  const match = offset?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  const minutes = match ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1) : 0;
  return new Date(date.getTime() - minutes * 60000).toISOString();
}

export function createOnboardingSubmission(draft: OnboardingDraft, selected: OnboardingSelection, rawInput: string, ownerId: string | null, timezone: string, requestId = crypto.randomUUID(), now = new Date()): OnboardingSubmission {
  if (!selected.workspace || !rawInput.trim()) throw new Error('请先确认工作空间和原话。');
  const payload = createOnboardingCompletionPayload(draft, selected, rawInput, requestId, draft.tasks.map(task => dueAt(task.dueLabel, timezone, now)));
  const keys = ['workspace', ...(payload.project ? ['project'] : []), ...(payload.goal ? ['goal'] : []), ...(payload.plan ? ['plan'] : []), ...(payload.tasks ?? []).map(task => task.client_key), ...(payload.learning ? ['learning'] : [])];
  // Snapshot the confirmation so later input edits cannot change a retry.
  return JSON.parse(JSON.stringify({requestId, ownerId, draft, selected, rawInput: rawInput.trim(), payload, objects: keys.map(key => ({key, id: null, status: 'pending'})), saved: false}));
}

export function applyOnboardingResult(submission: OnboardingSubmission, result: OnboardingResult): OnboardingSubmission {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (result?.client_request_id !== submission.requestId || !Array.isArray(result.objects) || result.objects.length !== submission.objects.length) throw new Error('保存结果不完整，原方案仍在，请重试。');
  const expected = new Set(submission.objects.map(item => item.key));
  for (const item of result.objects) {
    if (!expected.delete(item.key) || !['synced', 'failed', 'blocked'].includes(item.status) || item.status === 'synced' && !uuid.test(item.id ?? '')) throw new Error('保存结果不完整，原方案仍在，请重试。');
    const previous = submission.objects.find(row => row.key === item.key);
    if (previous?.status === 'synced' && (item.status !== 'synced' || item.id !== previous.id)) throw new Error('已保存对象的结果不一致，请保留方案后重试。');
  }
  const saved = result.objects.every(item => item.status === 'synced');
  if (saved !== result.saved) throw new Error('保存结果不完整，原方案仍在，请重试。');
  return {...submission, objects: result.objects, saved, error: saved ? undefined : '部分内容尚未保存。已完成的对象会保留，只重试未完成项。'};
}

export function onboardingRows(submission: Pick<OnboardingSubmission, 'draft' | 'objects'>) {
  const {draft} = submission;
  const details = [
    {key: 'workspace', label: '工作空间', title: draft.workspace.name, detail: draft.workspace.description},
    {key: 'project', label: '项目', title: draft.project.name, detail: `${draft.project.description}\n下一步：${draft.project.nextAction}`},
    {key: 'goal', label: '目标', title: draft.goal.title, detail: `${draft.goal.description}\n范围：${draft.goal.horizon}`},
    {key: 'plan', label: '计划', title: draft.plan.title, detail: `${draft.plan.description}\n${draft.plan.totalWeeks} 周 · ${draft.plan.milestones.join(' → ')}`},
    ...draft.tasks.map((task, index) => ({key: `task-${index}`, label: '任务', title: task.title, detail: `${task.description}\n安排：${task.dueLabel}\n${task.recommendedReason ?? ''}`})),
    {key: 'learning', label: '学习入口', title: draft.learning.title, detail: `${draft.learning.summary}\n预计时长：${draft.learning.durationLabel}`},
  ];
  return details.flatMap(row => {const status = submission.objects.find(item => item.key === row.key); return status ? [{...row, ...status}] : [];});
}

export function restoreOnboardingState(state: WorkspaceState, submission: OnboardingSubmission): WorkspaceState {
  const localId = (key: string) => `${key.split('-')[0]}-onboarding-${submission.requestId}${key.startsWith('task-') ? `-${key.slice(5)}` : ''}`;
  const ids = new Map(submission.objects.map(item => [localId(item.key), item.id ?? localId(item.key)]));
  const id = (key: string) => submission.objects.find(item => item.key === key)?.id ?? localId(key);
  const exists = (key: string) => submission.objects.some(item => item.key === key);
  const projectId = exists('project') ? id('project') : undefined;
  const goalId = exists('goal') ? id('goal') : undefined;
  const planId = exists('plan') ? id('plan') : undefined;
  const workspaceId = id('workspace');
  const {draft} = submission;
  const rewrite = <T extends object>(item: T): T => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' && (key === 'id' || key.endsWith('Id')) ? ids.get(value) ?? value : value])) as T;
  const merge = <T extends {id: string}>(current: T[], additions: T[]): T[] => {
    const mapped = current.map(rewrite);
    const unique = new Map(mapped.map(item => [item.id, item]));
    // Existing server facts retain current progress/status when hydration runs during a retry.
    for (const item of additions) if (!unique.has(item.id)) unique.set(item.id, item);
    return [...unique.values()];
  };
  return {
    ...state, activeWorkspaceId: workspaceId, onboardingCompleted: submission.saved,
    workspaces: merge(state.workspaces, [{id: workspaceId, ownerId: submission.ownerId, ...draft.workspace, updatedLabel: submission.saved ? '刚刚同步' : '首次方案待同步'}]),
    projects: merge(state.projects, projectId ? [{id: projectId, workspaceId, ...draft.project, status: 'active', progress: 0, goalId}] : []),
    goals: merge(state.goals, goalId ? [{id: goalId, workspaceId, ...draft.goal, progress: 0, projectId, planId}] : []),
    plans: merge(state.plans, planId && goalId ? [{id: planId, workspaceId, ...draft.plan, goalId, projectId, currentWeek: 1, progress: 0, periodType: 'weekly'}] : []),
    tasks: merge(state.tasks, draft.tasks.flatMap((task, index) => exists(`task-${index}`) ? [{id: id(`task-${index}`), workspaceId, ...task, status: 'todo', source: 'ai', projectId, goalId, planId, dueAt: submission.payload.tasks?.find(item => item.client_key === `task-${index}`)?.due_at ?? undefined}] : [])),
    learningItems: merge(state.learningItems, exists('learning') ? [{id: id('learning'), workspaceId, ...draft.learning, projectId, relatedGoalId: goalId, status: 'queued', progress: 0, durationMinutes: submission.payload.learning?.duration_minutes ?? undefined}] : []),
    captures: state.captures.map(rewrite), reflections: state.reflections.map(rewrite), knowledgeCards: state.knowledgeCards.map(rewrite), activities: state.activities.map(rewrite), insights: state.insights.map(rewrite), focusSession: state.focusSession ? rewrite(state.focusSession) : null,
  };
}
