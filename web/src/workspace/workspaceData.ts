import { DEFAULT_DAILY_PREFERENCES, type DailyPreferences } from './dailyPreferences.ts';

export const PRIVACY_SOURCE_KEYS = ['tasks', 'goals', 'plans', 'learning', 'knowledge_cards', 'reflections', 'memories'] as const;
export type PrivacySourceKey = typeof PRIVACY_SOURCE_KEYS[number];

export interface PrivacyScope {
  enabledSources: PrivacySourceKey[];
}

export const DEFAULT_PRIVACY_SCOPE: PrivacyScope = {
  enabledSources: [...PRIVACY_SOURCE_KEYS],
};

export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked';
export type TaskPriority = 'high' | 'medium' | 'low';
export type ReflectionType = 'morning' | 'evening' | 'micro';
export type CaptureType = 'progress' | 'decision' | 'emotion' | 'idea' | 'learning';
export type CaptureStatus = 'moving' | 'done' | 'blocked' | 'decided' | 'noted' | 'calm' | 'energized' | 'tired';
export type KnowledgeCardAiStatus = 'not_requested' | 'preview_ready' | 'confirmed' | 'failed';

export interface Workspace {
  id: string;
  ownerId?: string | null;
  name: string;
  description: string;
  color: string;
  updatedLabel: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'complete';
  progress: number;
  nextAction: string;
  goalId?: string;
  accent: string;
}

export interface Goal {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  progress: number;
  horizon: string;
  dueAt?: string;
  importance?: number;
  projectId?: string;
  planId?: string;
}

export interface GrowthPlan {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  currentWeek: number;
  totalWeeks: number;
  progress: number;
  goalId: string;
  milestones: string[];
  projectId?: string;
  periodType?: 'weekly' | 'monthly' | 'quarterly';
  executionEnabled?: boolean;
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueLabel: string;
  dueAt?: string;
  energyRequired?: number;
  timeBlock?: number;
  projectId?: string;
  goalId?: string;
  planId?: string;
  source: 'ai' | 'user' | 'capture';
  agentSource?: {conversationId: string; turnId: string};
  recommendedReason?: string;
  completedDate?: string;
}

export interface FocusSession {
  id: string;
  workspaceId: string;
  taskId: string;
  targetSeconds: number;
  startedAt?: number;
  elapsedSeconds: number;
  status: 'active' | 'paused';
}

export interface LearningItem {
  id: string;
  workspaceId: string;
  title: string;
  kind: 'article' | 'course' | 'note' | 'book';
  status: 'queued' | 'in_progress' | 'completed';
  progress: number;
  durationLabel: string;
  relatedGoalId?: string;
  projectId?: string;
  durationMinutes?: number;
  summary: string;
  progressUpdatedDate?: string;
  sourceUrl?: string;
}

export interface KnowledgeCard {
  id: string;
  workspaceId: string;
  title: string;
  sourceType: 'text' | 'url';
  sourceUrl?: string;
  content?: string;
  status: 'captured' | 'queued';
  aiStatus: KnowledgeCardAiStatus;
  aiSummary?: string;
  aiConcepts: string[];
  aiTags: string[];
  aiProcessedAt?: string;
  learningItemId?: string;
  projectId?: string;
  goalId?: string;
  taskId?: string;
  createdLabel: string;
}

export interface KnowledgeCardSummaryDraft {
  summary: string;
  concepts: string[];
  tags: string[];
}

export interface KnowledgeCardContextLinkInput {
  goalId?: string;
  taskId?: string;
}

export interface KnowledgeCardInput {
  title?: string;
  sourceType: KnowledgeCard['sourceType'];
  sourceUrl?: string;
  content?: string;
  projectId?: string;
  goalId?: string;
}

export interface Activity {
  id: string;
  workspaceId: string;
  type: 'task' | 'plan' | 'learning' | 'capture' | 'reflection' | 'insight' | 'workspace';
  title: string;
  detail: string;
  timeLabel: string;
  tone: 'teal' | 'orange' | 'blue' | 'green' | 'gray';
}

export interface Reflection {
  id: string;
  clientRequestId?: string;
  workspaceId: string;
  type: ReflectionType;
  reflectionDate: string;
  energy?: number;
  intention?: string;
  completion?: number;
  wins?: string;
  friction?: string;
  adjustment?: string;
  mood?: string;
  captureId?: string;
  microType?: CaptureType;
  microStatus?: CaptureStatus;
  content?: string;
  projectId?: string;
  goalId?: string;
  taskId?: string;
  isMakeup: boolean;
  createdLabel: string;
}

export interface Capture {
  id: string;
  clientRequestId?: string;
  ownerId?: string;
  syncState?: import('./captureSync.ts').CaptureSyncState;
  syncError?: string;
  workspaceId: string;
  type: CaptureType;
  status: CaptureStatus;
  content: string;
  capturedDate: string;
  projectId?: string;
  goalId?: string;
  taskId?: string;
  createdLabel: string;
}

export interface CaptureInput {
  content: string;
  clientRequestId?: string;
  type?: CaptureType;
  status?: CaptureStatus;
  projectId?: string;
  goalId?: string;
  taskId?: string;
}

export interface Insight {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  evidence: string[];
  actionLabel: string;
  tone: 'focus' | 'momentum' | 'learning';
}

export interface Capability {
  id: string;
  slug?: string;
  name: string;
  kind: 'app' | 'connection' | 'plugin' | 'skill' | 'agent';
  description: string;
  status: 'available' | 'needs_setup' | 'enabled' | 'disabled' | 'blocked' | 'revoked';
  scope: string;
  source: string;
  version: string;
  dependencies: string[];
  permissions: string[];
  availablePermissions: string[];
  configurable: boolean;
  settingStatus: 'enabled' | 'disabled' | null;
  settingsSyncState?: 'confirmed' | 'local';
  blockedReason: string | null;
  icon: string;
  accent: string;
}

export interface CapabilitySettingsInput {
  status: 'enabled' | 'disabled';
  permissions: string[];
}

export interface WorkspaceState {
  activeWorkspaceId: string;
  dailyPreferences: DailyPreferences;
  privacyScope: PrivacyScope;
  workspaces: Workspace[];
  projects: Project[];
  goals: Goal[];
  plans: GrowthPlan[];
  tasks: Task[];
  learningItems: LearningItem[];
  knowledgeCards: KnowledgeCard[];
  activities: Activity[];
  insights: Insight[];
  capabilities: Capability[];
  captures: Capture[];
  reflections: Reflection[];
  focusSession: FocusSession | null;
  onboardingCompleted: boolean;
}

export interface OnboardingDraft {
  workspace: Pick<Workspace, 'name' | 'description' | 'color'>;
  project: Pick<Project, 'name' | 'description' | 'nextAction' | 'accent'>;
  goal: Pick<Goal, 'title' | 'description' | 'horizon'>;
  plan: Pick<GrowthPlan, 'title' | 'description' | 'totalWeeks' | 'milestones'>;
  tasks: Array<Pick<Task, 'title' | 'description' | 'dueLabel' | 'priority' | 'recommendedReason'>>;
  learning: Pick<LearningItem, 'title' | 'summary' | 'kind' | 'durationLabel'>;
}

export interface OnboardingSelection {
  workspace: boolean;
  project: boolean;
  goal: boolean;
  plan: boolean;
  tasks: boolean[];
  learning: boolean;
}

export const STORAGE_KEY = 'gp_workspace_state_v2';

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  activeWorkspaceId: 'workspace-growth',
  dailyPreferences: DEFAULT_DAILY_PREFERENCES,
  privacyScope: DEFAULT_PRIVACY_SCOPE,
  workspaces: [
    {
      id: 'workspace-growth',
      name: '个人成长计划',
      description: '把工作、学习与成长放在同一条行动链上',
      color: '#1f5d5c',
      updatedLabel: '刚刚更新',
    },
    {
      id: 'workspace-lab',
      name: '产品实验室',
      description: '正在验证的产品、想法与研究资料',
      color: '#bd7045',
      updatedLabel: '昨天更新',
    },
  ],
  projects: [
    {
      id: 'project-workspace',
      workspaceId: 'workspace-growth',
      name: '成长工作台 v1',
      description: '把想法、工作、学习和复盘串成可以持续推进的系统。',
      status: 'active',
      progress: 42,
      nextAction: '确定首页第一版的行动入口',
      goalId: 'goal-system',
      accent: '#1f5d5c',
    },
    {
      id: 'project-learning',
      workspaceId: 'workspace-growth',
      name: 'AI 产品能力',
      description: '通过真实项目学习 AI 产品设计与 Agent 工作流。',
      status: 'active',
      progress: 28,
      nextAction: '完成一篇 Agent 工作流拆解',
      goalId: 'goal-system',
      accent: '#5576a6',
    },
    {
      id: 'project-lab',
      workspaceId: 'workspace-lab',
      name: '下一条产品线索',
      description: '收集并验证值得继续投入的方向。',
      status: 'active',
      progress: 16,
      nextAction: '整理本周的用户观察',
      accent: '#bd7045',
    },
  ],
  goals: [
    {
      id: 'goal-system',
      workspaceId: 'workspace-growth',
      title: '建立可持续的个人成长系统',
      description: '让每天的工作和学习都能留下事实，并逐渐变成更好的下一步。',
      progress: 36,
      horizon: '未来 90 天',
      planId: 'plan-first-week',
    },
  ],
  plans: [
    {
      id: 'plan-first-week',
      workspaceId: 'workspace-growth',
      title: '第一周：让行动有迹可循',
      description: '先建立一个低负担的节奏，让重要的事情每天向前一点。',
      currentWeek: 1,
      totalWeeks: 4,
      progress: 34,
      goalId: 'goal-system',
      milestones: ['确定当前主线', '完成三次 Focus 执行', '留下两条学习记录', '完成一次晚间复盘'],
    },
  ],
  tasks: [
    {
      id: 'task-home-action',
      workspaceId: 'workspace-growth',
      title: '确定首页第一版的行动入口',
      description: '让打开工作台的人第一眼知道现在进行什么、下一步做什么。',
      status: 'doing',
      priority: 'high',
      dueLabel: '今天',
      projectId: 'project-workspace',
      goalId: 'goal-system',
      planId: 'plan-first-week',
      source: 'ai',
      recommendedReason: '它会直接决定工作台能不能开始工作。',
    },
    {
      id: 'task-object-map',
      workspaceId: 'workspace-growth',
      title: '把 Workspace、Project、Plan 关系画清楚',
      description: '确认每个对象负责什么，避免后续数据又回到资料字段里。',
      status: 'todo',
      priority: 'high',
      dueLabel: '今天',
      projectId: 'project-workspace',
      goalId: 'goal-system',
      planId: 'plan-first-week',
      source: 'ai',
      recommendedReason: '这是今天最值得先完成的基础判断。',
    },
    {
      id: 'task-learning-note',
      workspaceId: 'workspace-growth',
      title: '完成一篇 Agent 工作流拆解',
      description: '看完材料后留下三条可以用于当前产品的判断。',
      status: 'todo',
      priority: 'medium',
      dueLabel: '明天',
      projectId: 'project-learning',
      goalId: 'goal-system',
      planId: 'plan-first-week',
      source: 'ai',
      recommendedReason: '把学习直接连接到正在推进的产品里。',
    },
    {
      id: 'task-review',
      workspaceId: 'workspace-growth',
      title: '完成今天的晚间复盘',
      description: '记录一个完成、一个卡点和明天的第一步。',
      status: 'todo',
      priority: 'medium',
      dueLabel: '今天 20:30',
      goalId: 'goal-system',
      planId: 'plan-first-week',
      source: 'user',
      recommendedReason: '让今天的事实成为明天建议的依据。',
    },
  ],
  learningItems: [
    {
      id: 'learning-agent-workflow',
      workspaceId: 'workspace-growth',
      title: 'Agent 工作流：从意图到行动',
      kind: 'article',
      status: 'in_progress',
      progress: 62,
      durationLabel: '12 分钟',
      relatedGoalId: 'goal-system',
      summary: '把自然语言、对象生成、执行反馈和长期上下文连成一个闭环。',
    },
    {
      id: 'learning-focus',
      workspaceId: 'workspace-growth',
      title: '低负担 Focus 节奏',
      kind: 'note',
      status: 'queued',
      progress: 0,
      durationLabel: '8 分钟',
      relatedGoalId: 'goal-system',
      summary: '用更少的计划维护，换来更稳定的每日推进。',
    },
    {
      id: 'learning-product',
      workspaceId: 'workspace-lab',
      title: '发现值得投入的产品线索',
      kind: 'book',
      status: 'queued',
      progress: 18,
      durationLabel: '25 分钟',
      summary: '从真实观察中筛出值得验证的方向。',
    },
  ],
  activities: [
    {
      id: 'activity-plan',
      workspaceId: 'workspace-growth',
      type: 'plan',
      title: '建立第一周成长计划',
      detail: '4 周计划 · 目标「建立可持续的个人成长系统」',
      timeLabel: '今天 09:12',
      tone: 'teal',
    },
    {
      id: 'activity-task',
      workspaceId: 'workspace-growth',
      type: 'task',
      title: '开始推进首页第一版的行动入口',
      detail: '来自 AI 建议 · 成长工作台 v1',
      timeLabel: '今天 09:24',
      tone: 'orange',
    },
    {
      id: 'activity-learning',
      workspaceId: 'workspace-growth',
      type: 'learning',
      title: '学习「Agent 工作流：从意图到行动」',
      detail: '已完成 62% · 预计还需 5 分钟',
      timeLabel: '昨天 21:08',
      tone: 'blue',
    },
    {
      id: 'activity-capture',
      workspaceId: 'workspace-growth',
      type: 'capture',
      title: '记录：工作台需要承载真实行动',
      detail: '已写入 Workspace Event，等待整理为长期上下文',
      timeLabel: '昨天 20:46',
      tone: 'green',
    },
  ],
  insights: [
    {
      id: 'insight-focus',
      workspaceId: 'workspace-growth',
      title: '你现在最需要的是收敛，而不是增加入口',
      body: '最近的活动都围绕成长工作台展开。先把首页、任务和计划跑通，比同时整理所有资料更能让系统获得真实反馈。',
      evidence: ['3 个进行中任务都关联成长工作台', '本周已完成 2 次产品判断'],
      actionLabel: '聚焦当前项目',
      tone: 'focus',
    },
    {
      id: 'insight-momentum',
      workspaceId: 'workspace-growth',
      title: '你的行动已经有连续性',
      body: '过去 7 天里，你在工作和学习之间保持了 4 天的连接。把晚间复盘补上，这条节奏会更容易持续。',
      evidence: ['7 天内 4 天有工作台活动', '学习队列已有 1 项进行中'],
      actionLabel: '安排晚间复盘',
      tone: 'momentum',
    },
  ],
  capabilities: [
    {
      id: 'cap-notion',
      name: 'Notion',
      kind: 'app',
      description: '打开知识库、项目资料与会议记录。',
      status: 'available',
      scope: '所有 Workspace',
      source: '内置目录',
      version: '1.0',
      dependencies: [],
      permissions: ['仅显示入口'],
      availablePermissions: ['仅显示入口'],
      configurable: false,
      settingStatus: null,
      blockedReason: null,
      icon: 'N',
      accent: '#202725',
    },
    {
      id: 'cap-calendar',
      name: '日历连接',
      kind: 'connection',
      description: '准备将日程读入当前工作空间；尚未请求授权或同步数据。',
      status: 'needs_setup',
      scope: '当前 Workspace',
      source: '内置目录',
      version: '1.0',
      dependencies: ['日历授权'],
      permissions: ['读取日历（待授权）'],
      availablePermissions: ['读取日历（待授权）'],
      configurable: true,
      settingStatus: null,
      blockedReason: '此连接仍需完成授权或设置，当前不能启用。',
      icon: '日',
      accent: '#3e74cc',
    },
    {
      id: 'cap-research',
      name: 'Research Skill',
      kind: 'skill',
      description: '将资料整理成摘要、判断和可执行的学习卡片。',
      status: 'blocked',
      scope: '当前 Workspace',
      source: '内置目录',
      version: '1.0',
      dependencies: ['Knowledge Card'],
      permissions: [],
      availablePermissions: ['读取用户确认的知识卡片'],
      configurable: true,
      settingStatus: null,
      blockedReason: '当前 Workspace 缺少依赖：Knowledge Card。请先记录相关事实后再启用。',
      icon: 'R',
      accent: '#bd7045',
    },
    {
      id: 'cap-coach',
      name: '成长教练',
      kind: 'agent',
      description: '基于目标、任务和真实活动给出下一步。',
      status: 'blocked',
      scope: '当前 Workspace',
      source: '内置目录',
      version: '1.0',
      dependencies: ['Goal', 'Task', 'Workspace Event'],
      permissions: [],
      availablePermissions: ['读取当前 Workspace 事实'],
      configurable: true,
      settingStatus: null,
      blockedReason: '当前 Workspace 缺少依赖：Goal。请先记录相关事实后再启用。',
      icon: '✦',
      accent: '#5576a6',
    },
    {
      id: 'cap-brief',
      name: 'Weekly Brief Plugin',
      kind: 'plugin',
      description: '每周生成工作进展、学习输入和成长风险摘要。',
      status: 'available',
      scope: '当前 Workspace',
      source: '内置目录',
      version: '1.0',
      dependencies: ['Workspace Event'],
      permissions: [],
      availablePermissions: ['读取当前 Workspace 事实'],
      configurable: true,
      settingStatus: null,
      blockedReason: null,
      icon: 'W',
      accent: '#6f836c',
    },
  ],
  knowledgeCards: [],
  captures: [],
  reflections: [],
  focusSession: null,
  onboardingCompleted: false,
};

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cloneDefaultState(): WorkspaceState {
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_STATE)) as WorkspaceState;
}

export function normalizePrivacySources(value: unknown): PrivacySourceKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_PRIVACY_SCOPE.enabledSources];
  return value.filter(
    (source, index): source is PrivacySourceKey => typeof source === 'string'
      && PRIVACY_SOURCE_KEYS.includes(source as PrivacySourceKey)
      && value.indexOf(source) === index,
  );
}

export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === 'undefined') return cloneDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return {
      ...cloneDefaultState(),
      ...parsed,
      dailyPreferences: {
        ...DEFAULT_DAILY_PREFERENCES,
        ...parsed.dailyPreferences,
      },
      privacyScope: {
        ...DEFAULT_PRIVACY_SCOPE,
        ...parsed.privacyScope,
        enabledSources: normalizePrivacySources(parsed.privacyScope?.enabledSources),
      },
      workspaces: parsed.workspaces?.length ? parsed.workspaces : cloneDefaultState().workspaces,
      projects: parsed.projects ?? cloneDefaultState().projects,
      goals: parsed.goals ?? cloneDefaultState().goals,
      plans: parsed.plans ?? cloneDefaultState().plans,
      tasks: parsed.tasks ?? cloneDefaultState().tasks,
      learningItems: parsed.learningItems ?? cloneDefaultState().learningItems,
      knowledgeCards: parsed.knowledgeCards ?? cloneDefaultState().knowledgeCards,
      activities: parsed.activities ?? cloneDefaultState().activities,
      insights: parsed.insights ?? cloneDefaultState().insights,
      capabilities: normalizeCapabilities(parsed.capabilities),
      captures: normalizeCaptures(parsed.captures, parsed.activeWorkspaceId ?? DEFAULT_WORKSPACE_STATE.activeWorkspaceId),
      reflections: parsed.reflections ?? [],
      focusSession: parsed.focusSession ?? null,
    };
  } catch {
    return cloneDefaultState();
  }
}

function normalizeCapabilities(value: Capability[] | undefined): Capability[] {
  if (!value?.length) return cloneDefaultState().capabilities;
  return value.map((item) => ({
    ...item,
    kind: item.kind === 'connection' ? 'connection' : item.kind,
    status: item.status === ('connected' as Capability['status']) ? 'available' : item.status,
    scope: item.scope || '所有 Workspace',
    source: item.source || '本地目录',
    version: item.version || '1.0',
    dependencies: item.dependencies ?? [],
    permissions: item.permissions ?? [],
    availablePermissions: item.availablePermissions ?? item.permissions ?? [],
    configurable: item.configurable ?? item.kind !== 'app',
    settingStatus: item.settingStatus ?? null,
    blockedReason: item.blockedReason ?? null,
  }));
}

function normalizeCaptures(captures: unknown, workspaceId: string): Capture[] {
  if (!Array.isArray(captures)) return [];
  return captures.reduce<Capture[]>((normalized, capture, index) => {
    if (typeof capture === 'string') {
      normalized.push({
        id: `legacy-capture-${index}`,
        workspaceId,
        type: 'idea',
        status: 'noted',
        content: capture,
        capturedDate: '',
        createdLabel: '此前记录',
      });
      return normalized;
    }
    if (!capture || typeof capture !== 'object') return normalized;
    const item = capture as Partial<Capture>;
    if (!item.id || !item.content) return normalized;
    normalized.push({
      id: item.id,
      workspaceId: item.workspaceId ?? workspaceId,
      type: item.type ?? 'idea',
      status: item.status ?? 'noted',
      content: item.content,
      capturedDate: item.capturedDate ?? '',
      projectId: item.projectId,
      goalId: item.goalId,
      taskId: item.taskId,
      createdLabel: item.createdLabel ?? '此前记录',
      clientRequestId: item.clientRequestId,
      ownerId: item.ownerId,
      syncState: item.syncState === 'syncing' ? 'pending' : item.syncState,
      syncError: item.syncError,
    });
    return normalized;
  }, []);
}
