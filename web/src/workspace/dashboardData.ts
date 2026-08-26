import { localDateKey, shiftLocalDateKey } from './dailyPreferences.ts';
import type { Activity, Capability, Capture, Goal, GrowthPlan, KnowledgeCard, KnowledgeCardAiStatus, Project, Reflection, Task, WorkspaceState } from './workspaceData';

export interface TaskPayload {
  id: string;
  workspace_id: string;
  project_id: string | null;
  goal_id: string | null;
  plan_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  energy_required: number | null;
  time_block: number | null;
  due_at: string | null;
  completed_at: string | null;
}

export interface GoalPayload {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string;
  dimension: string | null;
  goal_type: string | null;
  due_at: string | null;
  importance: number | null;
  target_metric: Record<string, unknown> | null;
  progress: number;
  status: string;
}

export interface GrowthPlanPayload {
  id: string;
  workspace_id: string;
  goal_id: string;
  project_id: string | null;
  title: string;
  description: string;
  period_type: 'weekly' | 'monthly' | 'quarterly';
  total_weeks: number | null;
  current_week: number | null;
  milestones: string[];
  progress: number;
  status: string;
}

export interface ReflectionPayload {
  id: string;
  workspace_id: string;
  project_id: string | null;
  goal_id: string | null;
  task_id: string | null;
  reflection_type: 'morning' | 'micro' | 'evening';
  reflection_date: string;
  energy: number | null;
  intention: string | null;
  completion: number | null;
  wins: string | null;
  friction: string | null;
  adjustment: string | null;
  mood: string | null;
  micro_type: 'progress' | 'decision' | 'emotion' | 'idea' | 'learning' | null;
  micro_status: 'moving' | 'done' | 'blocked' | 'decided' | 'noted' | 'calm' | 'energized' | 'tired' | null;
  content: string | null;
  is_makeup: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningItemPayload {
  id: string;
  workspace_id: string;
  project_id: string | null;
  goal_id: string | null;
  title: string;
  summary: string;
  kind: 'article' | 'course' | 'note' | 'book';
  status: 'queued' | 'in_progress' | 'completed';
  progress: number;
  duration_minutes: number | null;
  progress_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeCardPayload {
  id: string;
  workspace_id: string;
  project_id: string | null;
  goal_id: string | null;
  task_id: string | null;
  learning_item_id: string | null;
  title: string;
  source_type: 'text' | 'url';
  source_url: string | null;
  content: string | null;
  status: 'captured' | 'queued';
  ai_status: KnowledgeCardAiStatus;
  ai_summary: string | null;
  ai_concepts: string[];
  ai_tags: string[];
  ai_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeCardQueuePayload {
  card: KnowledgeCardPayload;
  learning_item: LearningItemPayload;
}

export interface KnowledgeCardSummaryPreviewPayload {
  card: KnowledgeCardPayload;
  suggestion: {
    summary: string;
    concepts: string[];
    tags: string[];
    source_reference: { type: 'knowledge_card_content'; card_id: string; title: string };
  } | null;
  ai_generated: boolean;
}

export interface CapabilityPayload {
  id: string;
  capability_type: Capability['kind'];
  name: string;
  slug: string;
  description: string;
  source: string;
  version: string;
  status: Capability['status'];
  dependencies: string[];
  permissions: string[];
  available_permissions: string[];
  workspace_scope: string;
  workspace_ids: string[];
  entrypoint: string | null;
  configurable: boolean;
  setting_status: Capability['settingStatus'];
  blocked_reason: string | null;
}

export interface CapabilityInvocationPayload {
  id: string;
  agent_run_id: string | null;
  capability_id: string;
  capability_name: string;
  capability_type: Capability['kind'];
  workspace_id: string;
  project_id: string | null;
  input_summary: string;
  permission_snapshot: string[];
  access_scope: string;
  expected_output: string;
  side_effect_level: string;
  status: 'awaiting_confirmation' | 'confirmed' | 'planned' | 'rejected' | 'completed';
  decision: 'confirm' | 'plan' | 'reject' | null;
  execution_state: 'not_started' | 'completed' | 'failed';
  brief: CapabilityBriefPayload | null;
  created_at: string;
  completed_at: string | null;
}

export interface CapabilityBriefPayload {
  title: string;
  summary: string;
  facts: Array<{
    event_id: string;
    event_type: string;
    occurred_at: string;
    summary: string;
  }>;
  fact_actions: Record<string, {
    task_id: string;
    created_at: string;
  }>;
  fact_goal_actions: Record<string, {
    goal_id: string;
    created_at: string;
  }>;
  fact_plan_actions: Record<string, {
    plan_id: string;
    created_at: string;
  }>;
  fact_knowledge_actions: Record<string, {
    knowledge_card_id: string;
    created_at: string;
  }>;
  fact_memory_actions: Record<string, {
    memory_id: string;
    created_at: string;
  }>;
}

export interface CapabilityBriefTaskPromotionPayload {
  invocation: CapabilityInvocationPayload;
  task: TaskPayload;
}

export interface CapabilityBriefGoalPromotionPayload {
  invocation: CapabilityInvocationPayload;
  goal: GoalPayload;
}

export interface CapabilityBriefPlanPromotionPayload {
  invocation: CapabilityInvocationPayload;
  plan: GrowthPlanPayload;
}

export interface CapabilityBriefKnowledgePromotionPayload {
  invocation: CapabilityInvocationPayload;
  knowledge_card: KnowledgeCardPayload;
}

export interface MemoryPayload {
  id: string;
  content: string;
  summary: string | null;
  memory_type: string;
  source: string;
  tags: string[];
  derived_status: Record<string, string>;
  importance: number;
  confidence: number;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface CapabilityBriefMemoryPromotionPayload {
  invocation: CapabilityInvocationPayload;
  memory: MemoryPayload;
}

export interface DashboardPayload {
  workspace: { id: string; name: string; description: string; status: string };
  daily_timezone?: string;
  current_date?: string;
  projects: Array<{ id: string; name: string; description: string; status: string; progress: number; next_action: string | null }>;
  goals: Array<{ id: string; title: string; description: string; progress: number; status: string; due_at: string | null }>;
  plans: Array<{ id: string; goal_id: string; title: string; description: string; progress: number; milestones: string[] }>;
  tasks: TaskPayload[];
  today_completed_tasks?: TaskPayload[];
  learning_items?: LearningItemPayload[];
  daily_reflections?: ReflectionPayload[];
  recent_events: Array<{ id: string; event_type: string; source_type: string; source_id: string | null; payload: Record<string, unknown>; occurred_at: string | null }>;
}

function goalHorizon(value: string | null) {
  return value ? `截止 ${value.slice(0, 10)}` : '周期待补充';
}

function dueLabel(value: string | null, timezone = 'Asia/Shanghai') {
  if (!value) return '待安排';
  const day = value.slice(0, 10);
  const today = localDateKey(timezone);
  const tomorrow = shiftLocalDateKey(timezone, 1);
  const nextWeek = shiftLocalDateKey(timezone, 7);
  if (day === today) return '今天';
  if (day === tomorrow) return '明天';
  if (day === nextWeek) return '下周';
  return day;
}

function activityTone(type: string): Activity['tone'] {
  if (type.includes('task')) return 'orange';
  if (type.includes('goal') || type.includes('plan')) return 'teal';
  return 'gray';
}

export function mapTaskPayload(item: TaskPayload, timezone = 'Asia/Shanghai'): Task {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    title: item.title,
    description: item.description,
    status: item.status as Task['status'],
    priority: item.priority as Task['priority'],
    dueLabel: dueLabel(item.due_at, timezone),
    dueAt: item.due_at ?? undefined,
    energyRequired: item.energy_required ?? undefined,
    timeBlock: item.time_block ?? undefined,
    projectId: item.project_id ?? undefined,
    goalId: item.goal_id ?? undefined,
    planId: item.plan_id ?? undefined,
    source: 'user',
    completedDate: item.completed_at?.slice(0, 10),
  };
}

export function mapGoalPayload(item: GoalPayload): Goal {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    title: item.title,
    description: item.description,
    progress: item.progress,
    horizon: goalHorizon(item.due_at),
    dueAt: item.due_at ?? undefined,
    importance: item.importance ?? undefined,
    projectId: item.project_id ?? undefined,
  };
}

export function mapGrowthPlanPayload(item: GrowthPlanPayload): GrowthPlan {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    title: item.title,
    description: item.description,
    currentWeek: item.current_week ?? 1,
    totalWeeks: item.total_weeks ?? 1,
    progress: item.progress,
    goalId: item.goal_id,
    milestones: item.milestones,
    projectId: item.project_id ?? undefined,
    periodType: item.period_type,
  };
}

export function mapReflectionPayload(item: ReflectionPayload): Reflection {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    type: item.reflection_type,
    reflectionDate: item.reflection_date,
    energy: item.energy ?? undefined,
    intention: item.intention ?? undefined,
    completion: item.completion ?? undefined,
    wins: item.wins ?? undefined,
    friction: item.friction ?? undefined,
    adjustment: item.adjustment ?? undefined,
    mood: item.mood ?? undefined,
    captureId: item.reflection_type === 'micro' ? item.id : undefined,
    microType: item.micro_type ?? undefined,
    microStatus: item.micro_status ?? undefined,
    content: item.content ?? undefined,
    projectId: item.project_id ?? undefined,
    goalId: item.goal_id ?? undefined,
    taskId: item.task_id ?? undefined,
    isMakeup: item.is_makeup,
    createdLabel: item.updated_at.slice(0, 16).replace('T', ' '),
  };
}

export function captureFromReflectionPayload(item: ReflectionPayload): Capture | null {
  if (item.reflection_type !== 'micro' || !item.content || !item.micro_type || !item.micro_status) return null;
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    type: item.micro_type,
    status: item.micro_status,
    content: item.content,
    capturedDate: item.reflection_date,
    projectId: item.project_id ?? undefined,
    goalId: item.goal_id ?? undefined,
    taskId: item.task_id ?? undefined,
    createdLabel: item.updated_at.slice(0, 16).replace('T', ' '),
  };
}

export function mapLearningItemPayload(item: LearningItemPayload) {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    title: item.title,
    kind: item.kind,
    status: item.status,
    progress: item.progress,
    durationLabel: item.duration_minutes ? `${item.duration_minutes} 分钟` : '时长待安排',
    durationMinutes: item.duration_minutes ?? undefined,
    relatedGoalId: item.goal_id ?? undefined,
    projectId: item.project_id ?? undefined,
    summary: item.summary,
    progressUpdatedDate: item.progress_updated_at?.slice(0, 10),
  };
}

export function mapKnowledgeCardPayload(item: KnowledgeCardPayload): KnowledgeCard {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    title: item.title,
    sourceType: item.source_type,
    sourceUrl: item.source_url ?? undefined,
    content: item.content ?? undefined,
    status: item.status,
    aiStatus: item.ai_status,
    aiSummary: item.ai_summary ?? undefined,
    aiConcepts: item.ai_concepts ?? [],
    aiTags: item.ai_tags ?? [],
    aiProcessedAt: item.ai_processed_at ?? undefined,
    learningItemId: item.learning_item_id ?? undefined,
    projectId: item.project_id ?? undefined,
    goalId: item.goal_id ?? undefined,
    taskId: item.task_id ?? undefined,
    createdLabel: item.updated_at.slice(0, 16).replace('T', ' '),
  };
}

function capabilityAccent(kind: Capability['kind']) {
  if (kind === 'connection') return '#3e74cc';
  if (kind === 'plugin') return '#6f836c';
  if (kind === 'skill') return '#bd7045';
  if (kind === 'agent') return '#5576a6';
  return '#202725';
}

export function mapCapabilityPayload(item: CapabilityPayload): Capability {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    kind: item.capability_type,
    description: item.description,
    status: item.status,
    scope: item.workspace_scope === 'all' ? '所有 Workspace' : '当前 Workspace',
    source: item.source === 'builtin' ? '内置目录' : item.source,
    version: item.version,
    dependencies: item.dependencies ?? [],
    permissions: item.permissions ?? [],
    availablePermissions: item.available_permissions ?? [],
    configurable: item.configurable,
    settingStatus: item.setting_status ?? null,
    settingsSyncState: 'confirmed',
    blockedReason: item.blocked_reason ?? null,
    icon: item.name.slice(0, 1),
    accent: capabilityAccent(item.capability_type),
  };
}

export function mergeHydratedItems<T extends { id: string; workspaceId: string }>(
  remoteItems: T[],
  currentItems: T[],
  workspaceId: string,
  localIdPrefix: string,
) {
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const localDrafts = currentItems.filter((item) => (
    item.workspaceId === workspaceId
    && item.id.startsWith(localIdPrefix)
    && !remoteIds.has(item.id)
  ));
  return [...remoteItems, ...localDrafts];
}

export function mergeDashboardState(state: WorkspaceState, payload: DashboardPayload): WorkspaceState {
  const workspace = {
    id: payload.workspace.id,
    name: payload.workspace.name,
    description: payload.workspace.description,
    color: '#1f5d5c',
    updatedLabel: '刚刚同步',
  };
  const projects: Project[] = payload.projects.map((item) => ({
    id: item.id,
    workspaceId: workspace.id,
    name: item.name,
    description: item.description,
    status: item.status === 'completed' ? 'complete' : item.status as Project['status'],
    progress: item.progress,
    nextAction: item.next_action ?? '下一步待补充',
    accent: '#1f5d5c',
  }));
  const goals: Goal[] = payload.goals.map((item) => ({
    id: item.id,
    workspaceId: workspace.id,
    title: item.title,
    description: item.description,
    progress: item.progress,
    horizon: goalHorizon(item.due_at),
  }));
  const plans: GrowthPlan[] = payload.plans.map((item) => ({
    id: item.id,
    workspaceId: workspace.id,
    title: item.title,
    description: item.description,
    currentWeek: 1,
    totalWeeks: 1,
    progress: item.progress,
    goalId: item.goal_id,
    milestones: item.milestones,
  }));
  const taskIds = new Set(payload.tasks.map((item) => item.id));
  const tasks = [
    ...payload.tasks,
    ...(payload.today_completed_tasks ?? []).filter((item) => !taskIds.has(item.id)),
  ].map((item) => mapTaskPayload(item, payload.daily_timezone ?? 'Asia/Shanghai'));
  const activities: Activity[] = payload.recent_events.map((item) => ({
    id: item.id,
    workspaceId: workspace.id,
    type: item.source_type === 'task' ? 'task' : item.source_type === 'goal' ? 'plan' : 'workspace',
    title: item.event_type,
    detail: String(item.payload?.title ?? item.payload?.reason ?? '已记录真实 Workspace Event'),
    timeLabel: item.occurred_at ? item.occurred_at.slice(0, 16).replace('T', ' ') : '刚刚',
    tone: activityTone(item.event_type),
  }));
  const learningItems = payload.learning_items
    ? mergeHydratedItems(
      payload.learning_items.map(mapLearningItemPayload),
      state.learningItems,
      workspace.id,
      'learning-',
    )
    : undefined;
  const reflections = payload.daily_reflections
    ? mergeHydratedItems(
      payload.daily_reflections.map(mapReflectionPayload),
      state.reflections,
      workspace.id,
      'reflection-',
    )
    : undefined;
  const captures = payload.daily_reflections
    ? mergeHydratedItems(
      payload.daily_reflections
        .map(captureFromReflectionPayload)
        .filter((item): item is Capture => item !== null),
      state.captures,
      workspace.id,
      'capture-',
    )
    : undefined;
  return {
    ...state,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace],
    projects,
    goals,
    plans,
    tasks,
    activities,
    ...(learningItems ? { learningItems } : {}),
    ...(reflections ? { reflections } : {}),
    ...(captures ? { captures } : {}),
  };
}
