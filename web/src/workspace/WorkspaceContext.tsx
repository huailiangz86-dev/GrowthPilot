import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyOnboardingResult, createOnboardingSubmission, isolateOnboardingWorkspaces, persistOnboardingSubmission, readOnboardingSubmission, restoreOnboardingState, type OnboardingResult, type OnboardingSubmission } from './onboardingSync';
import { captureOwnerId, captureReflection, captureRequest, queueCapture, readCaptureQueue, removeQueuedCapture, restoreQueuedCaptures, type CaptureSaveResult } from './captureSync';
import {
  cloneDefaultState,
  createId,
  DEFAULT_WORKSPACE_STATE,
  loadWorkspaceState,
  normalizePrivacySources,
  STORAGE_KEY,
  type Activity,
  type CapabilitySettingsInput,
  type Capture,
  type CaptureInput,
  type FocusSession,
  type Goal,
  type GrowthPlan,
  type KnowledgeCard,
  type KnowledgeCardContextLinkInput,
  type KnowledgeCardInput,
  type KnowledgeCardSummaryDraft,
  type LearningItem,
  type OnboardingDraft,
  type OnboardingSelection,
  type PrivacyScope,
  type Reflection,
  type Task,
  type TaskStatus,
  type WorkspaceState,
} from './workspaceData';
import { DEFAULT_DAILY_PREFERENCES, localDateKey, type DailyPreferences } from './dailyPreferences.ts';
import { WorkspaceContext } from './context';
import { api } from '../api/client';
import {
  captureFromReflectionPayload,
  mapCapabilityPayload,
  mapGoalPayload,
  mapGrowthPlanPayload,
  mapKnowledgeCardPayload,
  mapLearningItemPayload,
  mapReflectionPayload,
  mapTaskPayload,
  mergeHydratedItems,
  mergeDashboardState,
  type DashboardPayload,
  type CapabilityBriefGoalPromotionPayload,
  type CapabilityBriefKnowledgePromotionPayload,
  type CapabilityBriefMemoryPromotionPayload,
  type CapabilityBriefPlanPromotionPayload,
  type CapabilityBriefTaskPromotionPayload,
  type CapabilityPayload,
  type CapabilityInvocationPayload,
  type GoalPayload,
  type GrowthPlanPayload,
  type KnowledgeCardPayload,
  type KnowledgeCardQueuePayload,
  type KnowledgeCardSummaryPreviewPayload,
  type LearningItemPayload,
  type ReflectionPayload,
  type TaskPayload,
} from './dashboardData';

function prependActivity(state: WorkspaceState, activity: Activity) {
  return [activity, ...state.activities].slice(0, 12);
}

function roundProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function applyTaskProgress(
  state: WorkspaceState,
  changedTask: Task,
  nextStatus: TaskStatus,
  timezone: string,
) {
  const nextTasks = state.tasks.map((item) => item.id === changedTask.id
    ? {
      ...item,
      status: nextStatus,
      completedDate: nextStatus === 'done' ? todayKey(timezone) : undefined,
    }
    : item);
  const updatedPlans = state.plans.map((plan) => {
    if (plan.executionEnabled) return plan;
    const relatedTasks = nextTasks.filter((item) => item.planId === plan.id);
    if (!relatedTasks.length) return plan;
    const completedCount = relatedTasks.filter((item) => item.status === 'done').length;
    return { ...plan, progress: roundProgress((completedCount / relatedTasks.length) * 100) };
  });
  const updatedGoals = state.goals.map((goal) => {
    const relatedTasks = nextTasks.filter((item) => item.goalId === goal.id);
    if (!relatedTasks.length) return goal;
    const completedCount = relatedTasks.filter((item) => item.status === 'done').length;
    return { ...goal, progress: roundProgress((completedCount / relatedTasks.length) * 100) };
  });
  const updatedProjects = state.projects.map((project) => {
    const relatedTasks = nextTasks.filter((item) => item.projectId === project.id);
    if (!relatedTasks.length) return project;
    const completedCount = relatedTasks.filter((item) => item.status === 'done').length;
    return { ...project, progress: roundProgress((completedCount / relatedTasks.length) * 100) };
  });
  return { tasks: nextTasks, plans: updatedPlans, goals: updatedGoals, projects: updatedProjects };
}

function todayKey(timezone: string) {
  return localDateKey(timezone);
}

interface DailyPreferencesPayload {
  timezone: string;
  morning_time: string;
  evening_time: string;
  notification_enabled: boolean;
}

interface PrivacyScopeSourcePayload {
  key: PrivacyScope['enabledSources'][number];
  label: string;
  description: string;
  enabled: boolean;
}

interface PrivacyScopePayload {
  enabled_sources: string[];
  sources: PrivacyScopeSourcePayload[];
}

function mapDailyPreferences(payload: DailyPreferencesPayload): DailyPreferences {
  return {
    timezone: payload.timezone,
    morningTime: payload.morning_time,
    eveningTime: payload.evening_time,
    notificationEnabled: payload.notification_enabled,
  };
}

function mapPrivacyScope(payload: PrivacyScopePayload): PrivacyScope {
  return { enabledSources: normalizePrivacySources(payload.enabled_sources) };
}

function knowledgeCardTitle(input: KnowledgeCardInput) {
  const title = input.title?.trim();
  if (title) return title.slice(0, 240);
  if (input.sourceType === 'url' && input.sourceUrl) {
    try {
      return new URL(input.sourceUrl).host.slice(0, 240);
    } catch {
      return input.sourceUrl.slice(0, 240);
    }
  }
  return input.content?.trim().split(/\r?\n/, 1)[0].slice(0, 240) ?? '';
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [onboardingSubmission, setOnboardingSubmission] = useState<OnboardingSubmission | null>(() => {
    try {return readOnboardingSubmission(localStorage, captureOwnerId(localStorage.getItem('gp_token')));} catch {return null;}
  });
  const onboardingRef = useRef(onboardingSubmission);
  const onboardingRequests = useRef(new Map<string, Promise<OnboardingSubmission>>());
  const [state, setState] = useState<WorkspaceState>(() => {
    const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
    const loaded = isolateOnboardingWorkspaces(loadWorkspaceState(), ownerId);
    try {
      const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
      const captures = restoreQueuedCaptures(loaded.captures, readCaptureQueue(window.localStorage, ownerId), ownerId);
      const known = new Set(loaded.reflections.map(item => item.clientRequestId));
      const restored = {...loaded, captures, reflections: [...captures.filter(item => item.clientRequestId && !known.has(item.clientRequestId) && item.syncState !== 'synced').map(captureReflection), ...loaded.reflections]};
      return onboardingSubmission && !onboardingSubmission.saved ? restoreOnboardingState(restored, onboardingSubmission) : restored;
    } catch { return loaded; }
  });
  const [hydrationStatus, setHydrationStatus] = useState<'loading' | 'ready' | 'partial' | 'error' | 'empty'>('loading');
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const retryHydration = useCallback(() => setHydrationAttempt(value => value + 1), []);
  const captureRequests = useRef(new Map<string, Promise<CaptureSaveResult>>());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
      state.captures.filter(item => item.clientRequestId && item.syncState === 'synced' && item.ownerId === ownerId).forEach(item => {
        removeQueuedCapture(window.localStorage, ownerId, item.clientRequestId!);
      });
    } catch {
      // Keep the durable queue until the workspace cache can be saved.
    }
  }, [state]);

  useEffect(() => {
    if (!window.localStorage.getItem('gp_token')) return;
    let cancelled = false;
    setHydrationStatus('loading');
    const hydrate = async () => {
      let hydrationSubmission = onboardingRef.current;
      try {
        const pending = onboardingRef.current;
        if (pending && !pending.saved) {
          try {
            const result = await api.get<OnboardingResult>(`/onboarding/context/submissions/${pending.requestId}`);
            if (cancelled || onboardingRef.current !== pending || captureOwnerId(localStorage.getItem('gp_token')) !== pending.ownerId) return;
            const recovered = applyOnboardingResult(pending, result);
            persistOnboardingSubmission(localStorage, recovered);
            onboardingRef.current = recovered;
            hydrationSubmission = recovered;
            setOnboardingSubmission(recovered);
            setState(current => restoreOnboardingState(current, recovered));
          } catch {
            // Without a save receipt, remote IDs cannot be matched safely to pending local objects.
            if (!cancelled) setHydrationStatus('error');
            return;
          }
        }
        const workspaces = await api.get<Array<{ id: string }>>('/workspaces');
        const confirmedWorkspaceId = onboardingRef.current?.objects.find(item => item.key === 'workspace')?.id;
        const preferredId = confirmedWorkspaceId ?? loadWorkspaceState().activeWorkspaceId;
        const workspaceId = workspaces.find(item => item.id === preferredId)?.id ?? workspaces[0]?.id;
        if (cancelled) return;
        if (!workspaceId) {setHydrationStatus('empty'); return;}
        const dashboard = await api.get<DashboardPayload>('/dashboard/command-center', { workspace_id: workspaceId });
        const [dailyPreferencesResponse, privacyScopeResponse] = await Promise.all([
          api.get<DailyPreferencesPayload>('/onboarding/daily-preferences').catch(() => null),
          api.get<PrivacyScopePayload>('/onboarding/privacy-scope').catch(() => null),
        ]);
        const dailyPreferences = dailyPreferencesResponse
          ? mapDailyPreferences(dailyPreferencesResponse)
          : {
            ...DEFAULT_DAILY_PREFERENCES,
            timezone: dashboard.daily_timezone ?? DEFAULT_DAILY_PREFERENCES.timezone,
          };
        const [tasksResult, goalsResult, plansResult, reflectionsResult, learningResult, knowledgeCardsResult, capabilitiesResult] = await Promise.allSettled([
          api.get<TaskPayload[]>('/tasks', { workspace_id: workspaceId }),
          api.get<GoalPayload[]>('/goals', { workspace_id: workspaceId }),
          api.get<GrowthPlanPayload[]>('/growth-plans', { workspace_id: workspaceId }),
          api.get<ReflectionPayload[]>('/reflections', { workspace_id: workspaceId }),
          api.get<LearningItemPayload[]>('/learning-items', { workspace_id: workspaceId }),
          api.get<KnowledgeCardPayload[]>('/knowledge-cards', { workspace_id: workspaceId }),
          api.get<CapabilityPayload[]>('/capabilities', { workspace_id: workspaceId }),
        ]);
        if (!cancelled && onboardingRef.current === hydrationSubmission) {
          setHydrationStatus([tasksResult, goalsResult, plansResult, reflectionsResult, learningResult, knowledgeCardsResult, capabilitiesResult].every(result => result.status === 'fulfilled') && dailyPreferencesResponse && privacyScopeResponse ? 'ready' : 'partial');
          const reflections = reflectionsResult.status === 'fulfilled' ? reflectionsResult.value : null;
          setState((current) => {
            if (onboardingRef.current !== hydrationSubmission) return current;
            const mergedDashboard = mergeDashboardState(current, dashboard);
            const hydrated = {
            ...mergedDashboard,
            workspaces: [{...mergedDashboard.workspaces[0], ownerId: captureOwnerId(localStorage.getItem('gp_token'))}],
            dailyPreferences,
            ...(privacyScopeResponse ? { privacyScope: mapPrivacyScope(privacyScopeResponse) } : {}),
            ...(tasksResult.status === 'fulfilled' ? { tasks: tasksResult.value.map((item) => mapTaskPayload(item, dailyPreferences.timezone)) } : {}),
            ...(goalsResult.status === 'fulfilled' ? { goals: goalsResult.value.map(mapGoalPayload) } : {}),
            ...(plansResult.status === 'fulfilled' ? { plans: plansResult.value.map(mapGrowthPlanPayload) } : {}),
            ...(reflections ? {
              reflections: mergeHydratedItems(
                reflections.map(mapReflectionPayload),
                current.reflections,
                workspaceId,
                'reflection-',
              ),
              captures: mergeHydratedItems(
                reflections.map(captureFromReflectionPayload).filter((item): item is Capture => item !== null).map(item => ({...item, ownerId: captureOwnerId(window.localStorage.getItem('gp_token')) ?? undefined})),
                current.captures,
                workspaceId,
                'capture-',
              ),
            } : {}),
            ...(learningResult.status === 'fulfilled' ? {
              learningItems: mergeHydratedItems(
                learningResult.value.map(mapLearningItemPayload),
                current.learningItems,
                workspaceId,
                'learning-',
              ),
            } : {}),
            ...(knowledgeCardsResult.status === 'fulfilled' ? {
              knowledgeCards: mergeHydratedItems(
                knowledgeCardsResult.value.map(mapKnowledgeCardPayload),
                current.knowledgeCards,
                workspaceId,
                'knowledge-',
              ),
            } : {}),
            ...(capabilitiesResult.status === 'fulfilled' ? {
              capabilities: capabilitiesResult.value.map(mapCapabilityPayload),
            } : {}),
          };
            const submission = onboardingRef.current;
            return submission && !submission.saved ? restoreOnboardingState(hydrated, submission) : hydrated;
          });
        }
      } catch {
        // Keep the local workspace when cloud hydration is unavailable.
        if (!cancelled) setHydrationStatus('error');
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [hydrationAttempt, onboardingSubmission?.saved]);

  const setActiveWorkspace = useCallback((workspaceId: string) => {
    setState((current) => current.workspaces.some((workspace) => workspace.id === workspaceId)
      ? { ...current, activeWorkspaceId: workspaceId }
      : current);
  }, []);

  const addTask = useCallback((title: string, options: Partial<Pick<Task, 'description' | 'priority' | 'dueLabel' | 'projectId' | 'goalId' | 'planId' | 'source'>> = {}) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const localTaskId = createId('task');
    const workspaceId = state.activeWorkspaceId;
    const taskInput = {
      title: cleanTitle,
      description: options.description ?? '由快捷输入创建。',
      priority: options.priority ?? 'medium',
      project_id: options.projectId ?? null,
      goal_id: options.goalId ?? null,
      plan_id: options.planId ?? null,
      due_at: options.dueLabel && options.dueLabel !== '待安排' ? dueAtForLabel(options.dueLabel) : null,
    };
    setState((current) => {
      const task: Task = {
        id: localTaskId,
        workspaceId,
        title: taskInput.title,
        description: taskInput.description,
        status: 'todo',
        priority: taskInput.priority,
        dueLabel: options.dueLabel ?? '待安排',
        dueAt: taskInput.due_at ?? undefined,
        projectId: options.projectId,
        goalId: options.goalId,
        planId: options.planId,
        source: options.source ?? 'user',
        recommendedReason: options.source === 'ai' ? '来自你的当前工作上下文。' : undefined,
      };
      return {
        ...current,
        tasks: [task, ...current.tasks],
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'task',
          title: `创建任务「${cleanTitle}」`,
          detail: '已加入当前 Workspace 的待办',
          timeLabel: '刚刚',
          tone: 'orange',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post<TaskPayload>('/tasks', { workspace_id: workspaceId, ...taskInput }).then((created) => {
        setState((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === localTaskId ? mapTaskPayload(created, current.dailyPreferences.timezone) : task),
        }));
      }).catch(() => {
        // Keep the local task when cloud creation is unavailable.
      });
    }
  }, [state.activeWorkspaceId]);

  const addGoal = useCallback(async (input: Pick<Goal, 'title'> & Partial<Pick<Goal, 'description' | 'dueAt' | 'importance' | 'projectId'>> & {requestId?: string}) => {
    const title = input.title.trim();
    const token = window.localStorage.getItem('gp_token');
    if (!title || !token) return false;
    const workspaceId = state.activeWorkspaceId;
    try {
      const created = await api.post<GoalPayload>('/goals', {
        workspace_id: workspaceId,
        ...(input.requestId ? {request_id: input.requestId} : {}),
        title,
        description: input.description?.trim() ?? '',
        due_at: input.dueAt ?? null,
        importance: input.importance ?? null,
        project_id: input.projectId ?? null,
      });
      if (window.localStorage.getItem('gp_token') !== token) return false;
      setState(current => ({
        ...current,
        goals: [mapGoalPayload(created), ...current.goals.filter(goal => goal.id !== created.id)],
        activities: current.goals.some(goal => goal.id === created.id) ? current.activities : prependActivity(current, {
          id: createId('activity'), workspaceId, type: 'plan', title: `创建目标「${title}」`,
          detail: '已保存到当前 Workspace 的成长方向', timeLabel: '刚刚', tone: 'teal',
        }),
      }));
      return true;
    } catch (error) {
      if (input.requestId) throw error;
      return false;
    }
  }, [state.activeWorkspaceId]);

  const addGrowthPlan = useCallback(async (input: Pick<GrowthPlan, 'goalId' | 'title'> & Partial<Pick<GrowthPlan, 'description' | 'projectId' | 'periodType' | 'totalWeeks' | 'milestones'>> & {requestId?: string}) => {
    const title = input.title.trim();
    const token = window.localStorage.getItem('gp_token');
    if (!title || !input.goalId || !token) return false;
    const workspaceId = state.activeWorkspaceId;
    try {
      const created = await api.post<GrowthPlanPayload>('/growth-plans', {
        workspace_id: workspaceId,
        ...(input.requestId ? {request_id: input.requestId} : {}),
        goal_id: input.goalId,
        title,
        description: input.description?.trim() ?? '',
        project_id: input.projectId ?? null,
        period_type: input.periodType ?? 'weekly',
        total_weeks: input.totalWeeks ?? null,
        milestones: (input.milestones ?? []).map(item => item.trim()).filter(Boolean).slice(0, 12),
      });
      if (window.localStorage.getItem('gp_token') !== token) return false;
      setState(current => ({
        ...current,
        plans: [mapGrowthPlanPayload(created), ...current.plans.filter(plan => plan.id !== created.id)],
        goals: current.goals.map(goal => goal.id === input.goalId ? {...goal, planId: created.id} : goal),
        activities: current.plans.some(plan => plan.id === created.id) ? current.activities : prependActivity(current, {
          id: createId('activity'), workspaceId, type: 'plan', title: `创建计划「${title}」`,
          detail: '已保存并连接到当前目标', timeLabel: '刚刚', tone: 'teal',
        }),
      }));
      return true;
    } catch (error) {
      if (input.requestId) throw error;
      return false;
    }
  }, [state.activeWorkspaceId]);

  const addLearningItem = useCallback(async (input: Pick<LearningItem, 'title'> & Partial<Pick<LearningItem, 'summary' | 'kind' | 'durationMinutes' | 'relatedGoalId' | 'projectId' | 'sourceUrl'>>) => {
    const title = input.title.trim();
    if (!title) return false;
    const localLearningId = createId('learning');
    const workspaceId = state.activeWorkspaceId;
    const payload = {
      title,
      summary: input.summary?.trim() ?? '',
      kind: input.kind ?? 'note',
      source_url: input.sourceUrl?.trim() || null,
      duration_minutes: input.durationMinutes ?? null,
      goal_id: input.relatedGoalId ?? null,
      project_id: input.projectId ?? null,
    };
    setState((current) => {
      const learning: LearningItem = {
        id: localLearningId,
        workspaceId,
        title: payload.title,
        kind: payload.kind,
        status: 'queued',
        progress: 0,
        durationLabel: payload.duration_minutes ? `${payload.duration_minutes} 分钟` : '时长待安排',
        durationMinutes: payload.duration_minutes ?? undefined,
        relatedGoalId: payload.goal_id ?? undefined,
        projectId: payload.project_id ?? undefined,
        summary: payload.summary,
        sourceUrl: payload.source_url ?? undefined,
      };
      return {
        ...current,
        learningItems: [learning, ...current.learningItems],
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'learning',
          title: `创建学习入口「${title}」`,
          detail: '已加入当前 Workspace 的学习队列',
          timeLabel: '刚刚',
          tone: 'blue',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      return api.post<LearningItemPayload>('/learning-items', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          learningItems: current.learningItems.map((item) => item.id === localLearningId ? mapLearningItemPayload(created) : item),
        }));
        return true;
      }).catch(() => false);
    }
    return false;
  }, [state.activeWorkspaceId]);

  const addKnowledgeCard = useCallback((input: KnowledgeCardInput): Promise<boolean> => {
    const title = knowledgeCardTitle(input);
    const content = input.content?.trim() || undefined;
    const sourceUrl = input.sourceUrl?.trim() || undefined;
    if (!title || (input.sourceType === 'text' && !content) || (input.sourceType === 'url' && !sourceUrl)) {
      return Promise.resolve(false);
    }
    const localCardId = createId('knowledge');
    const workspaceId = state.activeWorkspaceId;
    const payload = {
      title: input.title?.trim() || '',
      source_type: input.sourceType,
      source_url: sourceUrl ?? null,
      content: content ?? null,
      project_id: input.projectId ?? null,
      goal_id: input.goalId ?? null,
    };
    setState((current) => {
      const card: KnowledgeCard = {
        id: localCardId,
        workspaceId,
        title,
        sourceType: input.sourceType,
        sourceUrl,
        content,
        status: 'captured',
        aiStatus: 'not_requested',
        aiConcepts: [],
        aiTags: [],
        projectId: input.projectId,
        goalId: input.goalId,
        createdLabel: '刚刚',
      };
      return {
        ...current,
        knowledgeCards: [card, ...current.knowledgeCards],
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'learning',
          title: `保存知识卡片「${title}」`,
          detail: input.sourceType === 'url' ? '已保留网页地址，等待处理' : '已保留原始文本，等待处理',
          timeLabel: '刚刚',
          tone: 'blue',
        }),
      };
    });
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(true);
    return api.post<KnowledgeCardPayload>('/knowledge-cards', { workspace_id: workspaceId, ...payload }).then((created) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((card) => card.id === localCardId ? mapKnowledgeCardPayload(created) : card),
      }));
      return true;
    }).catch(() => false);
  }, [state.activeWorkspaceId]);

  const retryKnowledgeCard = useCallback((cardId: string): Promise<boolean> => {
    const card = state.knowledgeCards.find((item) => item.id === cardId);
    if (!card || !card.id.startsWith('knowledge-')) return Promise.resolve(false);
    return api.post<KnowledgeCardPayload>('/knowledge-cards', {
      workspace_id: card.workspaceId,
      title: card.title,
      source_type: card.sourceType,
      source_url: card.sourceUrl ?? null,
      content: card.content ?? null,
      project_id: card.projectId ?? null,
      goal_id: card.goalId ?? null,
    }).then((created) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === cardId ? mapKnowledgeCardPayload(created) : item),
      }));
      return true;
    }).catch(() => false);
  }, [state.knowledgeCards]);

  const addKnowledgeCardToLearning = useCallback((cardId: string): Promise<boolean> => {
    const card = state.knowledgeCards.find((item) => item.id === cardId);
    const pendingLearningId = card?.learningItemId?.startsWith('learning-') ? card.learningItemId : undefined;
    if (!card || (card.learningItemId && !pendingLearningId)) return Promise.resolve(Boolean(card));
    const localLearningId = pendingLearningId ?? createId('learning');
    const learning: LearningItem = {
      id: localLearningId,
      workspaceId: card.workspaceId,
      title: card.title,
      kind: card.sourceType === 'url' ? 'article' : 'note',
      status: 'queued',
      progress: 0,
      durationLabel: '时长待安排',
      relatedGoalId: card.goalId,
      projectId: card.projectId,
      summary: card.content ?? card.sourceUrl ?? '',
    };
    if (!pendingLearningId) {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === cardId
          ? { ...item, status: 'queued', learningItemId: localLearningId }
          : item),
        learningItems: [learning, ...current.learningItems],
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: card.workspaceId,
          type: 'learning',
          title: `将知识卡片加入学习「${card.title}」`,
          detail: '已创建一个可推进的学习入口',
          timeLabel: '刚刚',
          tone: 'blue',
        }),
      }));
    }
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(true);
    if (card.id.startsWith('knowledge-')) {
      return api.post<LearningItemPayload>('/learning-items', {
        workspace_id: card.workspaceId,
        title: card.title,
        summary: learning.summary,
        kind: learning.kind,
        project_id: card.projectId ?? null,
        goal_id: card.goalId ?? null,
      }).then((created) => {
        setState((current) => ({
          ...current,
          learningItems: current.learningItems.map((item) => item.id === localLearningId ? mapLearningItemPayload(created) : item),
        }));
        return true;
      }).catch(() => false);
    }
    return api.post<KnowledgeCardQueuePayload>(`/knowledge-cards/${card.id}/add-to-learning`).then((result) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === card.id ? mapKnowledgeCardPayload(result.card) : item),
        learningItems: current.learningItems.map((item) => item.id === localLearningId ? mapLearningItemPayload(result.learning_item) : item),
      }));
      return true;
    }).catch(() => false);
  }, [state.knowledgeCards]);

  const previewKnowledgeCardSummary = useCallback((cardId: string): Promise<KnowledgeCardSummaryDraft | null> => {
    const card = state.knowledgeCards.find((item) => item.id === cardId);
    if (!card || card.sourceType !== 'text' || !card.content || card.id.startsWith('knowledge-') || !window.localStorage.getItem('gp_token')) {
      return Promise.resolve(null);
    }
    return api.post<KnowledgeCardSummaryPreviewPayload>(`/knowledge-cards/${card.id}/summary-preview`).then((result) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === card.id ? mapKnowledgeCardPayload(result.card) : item),
      }));
      if (!result.ai_generated || !result.suggestion) return null;
      return {
        summary: result.suggestion.summary,
        concepts: result.suggestion.concepts,
        tags: result.suggestion.tags,
      };
    }).catch(() => null);
  }, [state.knowledgeCards]);

  const confirmKnowledgeCardSummary = useCallback((cardId: string, draft: KnowledgeCardSummaryDraft): Promise<boolean> => {
    const card = state.knowledgeCards.find((item) => item.id === cardId);
    const summary = draft.summary.trim();
    const concepts = Array.from(new Set(draft.concepts.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
    const tags = Array.from(new Set(draft.tags.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
    if (!card || !summary) return Promise.resolve(false);
    if (card.id.startsWith('knowledge-') || !window.localStorage.getItem('gp_token')) {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === cardId ? {
          ...item,
          aiStatus: 'confirmed',
          aiSummary: summary,
          aiConcepts: concepts,
          aiTags: tags,
          aiProcessedAt: new Date().toISOString(),
        } : item),
      }));
      return Promise.resolve(true);
    }
    return api.post<KnowledgeCardPayload>(`/knowledge-cards/${card.id}/summary`, { summary, concepts, tags }).then((updated) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === card.id ? mapKnowledgeCardPayload(updated) : item),
      }));
      return true;
    }).catch(() => false);
  }, [state.knowledgeCards]);

  const updateKnowledgeCardContextLinks = useCallback((cardId: string, input: KnowledgeCardContextLinkInput): Promise<boolean> => {
    const card = state.knowledgeCards.find((item) => item.id === cardId);
    if (!card || card.aiStatus !== 'confirmed') return Promise.resolve(false);
    const goalId = input.goalId || undefined;
    const taskId = input.taskId || undefined;
    if (card.id.startsWith('knowledge-') || !window.localStorage.getItem('gp_token')) {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === cardId ? { ...item, goalId, taskId } : item),
      }));
      return Promise.resolve(true);
    }
    return api.post<KnowledgeCardPayload>(`/knowledge-cards/${card.id}/context-links`, {
      goal_id: goalId ?? null,
      task_id: taskId ?? null,
    }).then((updated) => {
      setState((current) => ({
        ...current,
        knowledgeCards: current.knowledgeCards.map((item) => item.id === card.id ? mapKnowledgeCardPayload(updated) : item),
      }));
      return true;
    }).catch(() => false);
  }, [state.knowledgeCards]);

  const updateCapabilitySettings = useCallback((capabilityId: string, input: CapabilitySettingsInput): Promise<boolean> => {
    const workspaceId = state.activeWorkspaceId;
    const permissions = [...new Set(input.permissions.map((item) => item.trim()).filter(Boolean))];
    const applySelection = (syncState: 'confirmed' | 'local', updated?: CapabilityPayload) => {
      setState((current) => ({
        ...current,
        capabilities: current.capabilities.map((item) => {
          if (item.id !== capabilityId) return item;
          if (updated) return mapCapabilityPayload(updated);
          return {
            ...item,
            permissions,
            settingStatus: input.status,
            settingsSyncState: syncState,
            status: input.status === 'disabled' ? 'disabled' : (item.blockedReason ? 'blocked' : 'available'),
          };
        }),
      }));
    };
    applySelection('local');
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(false);
    return api.post<CapabilityPayload>(`/capabilities/${capabilityId}/settings`, {
      workspace_id: workspaceId,
      status: input.status,
      permissions,
    }).then((updated) => {
      applySelection('confirmed', updated);
      return true;
    }).catch(() => false);
  }, [state.activeWorkspaceId]);

  const createCapabilityInvocationPreview = useCallback((
    capabilityId: string,
    inputSummary: string,
    projectId?: string,
  ): Promise<CapabilityInvocationPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityInvocationPayload>(`/capabilities/${capabilityId}/invocation-preview`, {
      workspace_id: state.activeWorkspaceId,
      input_summary: inputSummary.trim(),
      project_id: projectId || null,
    }).catch(() => null);
  }, [state.activeWorkspaceId]);

  const decideCapabilityInvocation = useCallback((
    capabilityRunId: string,
    decision: 'confirm' | 'plan' | 'reject',
  ): Promise<CapabilityInvocationPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityInvocationPayload>(`/capabilities/runs/${capabilityRunId}/decision`, { decision })
      .catch(() => null);
  }, []);

  const executeCapabilityInvocation = useCallback((
    capabilityRunId: string,
  ): Promise<CapabilityInvocationPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityInvocationPayload>(`/capabilities/runs/${capabilityRunId}/execute`)
      .catch(() => null);
  }, []);

  const createTaskFromBriefFact = useCallback((
    capabilityRunId: string,
    eventId: string,
    title: string,
  ): Promise<CapabilityBriefTaskPromotionPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityBriefTaskPromotionPayload>(
      `/capabilities/runs/${capabilityRunId}/brief-facts/${eventId}/tasks`,
      { title: title.trim() },
    ).then((result) => {
      setState((current) => {
        if (current.tasks.some((task) => task.id === result.task.id)) return current;
        const task = mapTaskPayload(result.task, current.dailyPreferences.timezone);
        return {
          ...current,
          tasks: [task, ...current.tasks],
          activities: prependActivity(current, {
            id: createId('activity'),
            workspaceId: task.workspaceId,
            type: 'task',
            title: `从简报创建任务「${task.title}」`,
            detail: '已保留简报事实来源',
            timeLabel: '刚刚',
            tone: 'orange',
          }),
        };
      });
      return result;
    }).catch(() => null);
  }, []);

  const createGoalFromBriefFact = useCallback((capabilityRunId: string, eventId: string, title: string): Promise<CapabilityBriefGoalPromotionPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityBriefGoalPromotionPayload>(`/capabilities/runs/${capabilityRunId}/brief-facts/${eventId}/goals`, { title: title.trim() }).then((result) => {
      setState((current) => {
        if (current.goals.some((goal) => goal.id === result.goal.id)) return current;
        const goal = mapGoalPayload(result.goal);
        return { ...current, goals: [goal, ...current.goals] };
      });
      return result;
    }).catch(() => null);
  }, []);

  const createGrowthPlanFromBriefFact = useCallback((
    capabilityRunId: string,
    eventId: string,
    goalId: string,
    title: string,
    periodType: 'weekly' | 'monthly' | 'quarterly',
  ): Promise<CapabilityBriefPlanPromotionPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityBriefPlanPromotionPayload>(
      `/capabilities/runs/${capabilityRunId}/brief-facts/${eventId}/plans`,
      { goal_id: goalId, title: title.trim(), period_type: periodType },
    ).then((result) => {
      setState((current) => {
        if (current.plans.some((plan) => plan.id === result.plan.id)) return current;
        const plan = mapGrowthPlanPayload(result.plan);
        return {
          ...current,
          plans: [plan, ...current.plans],
          goals: current.goals.map((goal) => goal.id === plan.goalId ? { ...goal, planId: plan.id } : goal),
          activities: prependActivity(current, {
            id: createId('activity'),
            workspaceId: plan.workspaceId,
            type: 'plan',
            title: `从简报创建计划「${plan.title}」`,
            detail: '已保留简报事实来源',
            timeLabel: '刚刚',
            tone: 'teal',
          }),
        };
      });
      return result;
    }).catch(() => null);
  }, []);

  const createKnowledgeCardFromBriefFact = useCallback((
    capabilityRunId: string,
    eventId: string,
    title: string,
    content: string,
    goalId?: string,
  ): Promise<CapabilityBriefKnowledgePromotionPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityBriefKnowledgePromotionPayload>(
      `/capabilities/runs/${capabilityRunId}/brief-facts/${eventId}/knowledge-cards`,
      { title: title.trim(), content: content.trim(), goal_id: goalId || null },
    ).then((result) => {
      setState((current) => {
        if (current.knowledgeCards.some((card) => card.id === result.knowledge_card.id)) return current;
        const card = mapKnowledgeCardPayload(result.knowledge_card);
        return {
          ...current,
          knowledgeCards: [card, ...current.knowledgeCards],
          activities: prependActivity(current, {
            id: createId('activity'),
            workspaceId: card.workspaceId,
            type: 'learning',
            title: `从简报创建知识卡「${card.title}」`,
            detail: '已保留简报事实来源',
            timeLabel: '刚刚',
            tone: 'blue',
          }),
        };
      });
      return result;
    }).catch(() => null);
  }, []);

  const createMemoryFromBriefFact = useCallback((
    capabilityRunId: string,
    eventId: string,
    content: string,
    memoryType: string,
    importance: number,
    tags: string[],
  ): Promise<CapabilityBriefMemoryPromotionPayload | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.post<CapabilityBriefMemoryPromotionPayload>(
      `/capabilities/runs/${capabilityRunId}/brief-facts/${eventId}/memories`,
      { content: content.trim(), memory_type: memoryType.trim(), importance, tags },
    ).then((result) => {
      setState((current) => ({
        ...current,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: current.activeWorkspaceId,
          type: 'capture',
          title: '从简报保存一条 Memory',
          detail: '已保留简报事实来源',
          timeLabel: '刚刚',
          tone: 'blue',
        }),
      }));
      return result;
    }).catch(() => null);
  }, []);

  const updateDailyPreferences = useCallback((
    input: Pick<DailyPreferences, 'timezone' | 'morningTime' | 'eveningTime'>,
  ): Promise<boolean> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(false);
    return api.put<DailyPreferencesPayload>('/onboarding/daily-preferences', {
      timezone: input.timezone.trim(),
      morning_time: input.morningTime,
      evening_time: input.eveningTime,
    }).then((result) => {
      setState((current) => ({
        ...current,
        dailyPreferences: mapDailyPreferences(result),
      }));
      return true;
    }).catch(() => false);
  }, []);

  const updatePrivacyScope = useCallback((
    enabledSources: PrivacyScope['enabledSources'],
  ): Promise<boolean> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(false);
    const normalized = normalizePrivacySources(enabledSources);
    return api.put<PrivacyScopePayload>('/onboarding/privacy-scope', {
      enabled_sources: normalized,
    }).then((result) => {
      setState((current) => ({
        ...current,
        privacyScope: mapPrivacyScope(result),
      }));
      return true;
    }).catch(() => false);
  }, []);

  const listCapabilityInvocations = useCallback((
    capabilityId: string,
  ): Promise<CapabilityInvocationPayload[] | null> => {
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(null);
    return api.get<CapabilityInvocationPayload[]>('/capabilities/runs', {
      workspace_id: state.activeWorkspaceId,
      capability_id: capabilityId,
      limit: 5,
    }).catch(() => null);
  }, [state.activeWorkspaceId]);

  const updateTaskStatus = useCallback((taskId: string, status: TaskStatus) => {
    setState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || task.status === status) return current;
      const action = status === 'done' ? '完成任务' : status === 'doing' ? '开始任务' : status === 'blocked' ? '标记任务阻塞' : '将任务放回待办';
      const progress = applyTaskProgress(current, task, status, current.dailyPreferences.timezone);
      return {
        ...current,
        ...progress,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: task.workspaceId,
          type: 'task',
          title: `${action}「${task.title}」`,
          detail: '已记录为 Workspace Event',
          timeLabel: '刚刚',
          tone: status === 'done' ? 'green' : 'orange',
        }),
      };
    });
    if (status === 'done' && window.localStorage.getItem('gp_token')) {
      void api.post(`/tasks/${taskId}/complete`).catch(() => {
        // Keep the optimistic local completion when cloud sync is unavailable.
      });
    }
    if (status === 'blocked' && window.localStorage.getItem('gp_token')) {
      void api.post(`/tasks/${taskId}/block`, { reason: '用户将任务标记为阻塞' }).catch(() => {
        // Keep the optimistic local status when cloud sync is unavailable.
      });
    }
  }, []);

  const updateTaskDue = useCallback((taskId: string, dueLabel: string) => {
    const cleanDue = dueLabel.trim();
    if (!cleanDue) return;
    setState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || task.dueLabel === cleanDue) return current;
      return {
        ...current,
        tasks: current.tasks.map((item) => item.id === taskId ? { ...item, dueLabel: cleanDue, status: item.status === 'blocked' ? 'todo' : item.status } : item),
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: task.workspaceId,
          type: 'task',
          title: `调整任务「${task.title}」的时间`,
          detail: `已安排到${cleanDue}`,
          timeLabel: '刚刚',
          tone: 'gray',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post(`/tasks/${taskId}/defer`, {
        reason: `用户将任务安排到${cleanDue}`,
        due_at: dueAtForLabel(cleanDue),
      }).catch(() => {
        // Keep the optimistic local schedule when cloud sync is unavailable.
      });
    }
  }, []);

  const updateLearningProgress = useCallback((learningId: string, progress: number) => {
    const nextProgress = roundProgress(progress);
    setState((current) => {
      const learning = current.learningItems.find((item) => item.id === learningId);
      if (!learning || learning.progress === nextProgress) return current;
      const nextStatus = nextProgress >= 100 ? 'completed' : nextProgress > 0 ? 'in_progress' : 'queued';
      const action = nextStatus === 'completed'
        ? `完成学习「${learning.title}」`
        : learning.status === 'queued'
          ? `开始学习「${learning.title}」`
          : `更新学习进度「${learning.title}」`;
      return {
        ...current,
        learningItems: current.learningItems.map((item) => item.id === learningId
          ? { ...item, progress: nextProgress, status: nextStatus, progressUpdatedDate: todayKey(current.dailyPreferences.timezone) }
          : item),
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: learning.workspaceId,
          type: 'learning',
          title: action,
          detail: `学习进度 ${learning.progress}% -> ${nextProgress}%`,
          timeLabel: '刚刚',
          tone: nextStatus === 'completed' ? 'green' : 'blue',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.patch<LearningItemPayload>(`/learning-items/${learningId}/progress`, { progress: nextProgress }).then((updated) => {
        setState((current) => ({
          ...current,
          learningItems: current.learningItems.map((item) => item.id === learningId ? mapLearningItemPayload(updated) : item),
        }));
      }).catch(() => {
        // Keep the optimistic local learning progress when cloud sync is unavailable.
      });
    }
  }, []);

  const startFocus = useCallback((taskId: string, targetSeconds = 25 * 60) => {
    setState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || task.status === 'done' || current.focusSession) return current;
      const progress = task.status === 'doing'
        ? { tasks: current.tasks, plans: current.plans, goals: current.goals, projects: current.projects }
        : applyTaskProgress(current, task, 'doing', current.dailyPreferences.timezone);
      const focusSession: FocusSession = {
        id: createId('focus'),
        workspaceId: task.workspaceId,
        taskId,
        targetSeconds,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        status: 'active',
      };
      return {
        ...current,
        ...progress,
        focusSession,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: task.workspaceId,
          type: 'task',
          title: `开始 Focus「${task.title}」`,
          detail: '已进入专注执行态 · 25 分钟',
          timeLabel: '刚刚',
          tone: 'orange',
        }),
      };
    });
  }, []);

  const pauseFocus = useCallback(() => {
    setState((current) => {
      const session = current.focusSession;
      if (!session || session.status !== 'active') return current;
      return {
        ...current,
        focusSession: {
          ...session,
          startedAt: undefined,
          elapsedSeconds: getFocusElapsed(session),
          status: 'paused',
        },
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: session.workspaceId,
          type: 'task',
          title: '暂停 Focus',
          detail: '专注时间已保留，可以稍后继续',
          timeLabel: '刚刚',
          tone: 'gray',
        }),
      };
    });
  }, []);

  const resumeFocus = useCallback(() => {
    setState((current) => {
      const session = current.focusSession;
      if (!session || session.status !== 'paused') return current;
      return {
        ...current,
        focusSession: { ...session, startedAt: Date.now(), status: 'active' },
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: session.workspaceId,
          type: 'task',
          title: '继续 Focus',
          detail: '回到当前任务的专注执行态',
          timeLabel: '刚刚',
          tone: 'orange',
        }),
      };
    });
  }, []);

  const completeFocus = useCallback(() => {
    setState((current) => {
      const session = current.focusSession;
      if (!session) return current;
      const task = current.tasks.find((item) => item.id === session.taskId);
      if (!task) return { ...current, focusSession: null };
      const progress = applyTaskProgress(current, task, 'done', current.dailyPreferences.timezone);
      const elapsed = getFocusElapsed(session);
      return {
        ...current,
        ...progress,
        focusSession: null,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: session.workspaceId,
          type: 'task',
          title: `完成 Focus「${task.title}」`,
          detail: `任务已完成 · 专注 ${formatFocusMinutes(elapsed)}`,
          timeLabel: '刚刚',
          tone: 'green',
        }),
      };
    });
  }, []);

  const exitFocus = useCallback(() => {
    setState((current) => {
      const session = current.focusSession;
      if (!session) return current;
      const task = current.tasks.find((item) => item.id === session.taskId);
      return {
        ...current,
        focusSession: null,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId: session.workspaceId,
          type: 'task',
          title: '退出 Focus',
          detail: task ? `已保留任务「${task.title}」的进行中状态` : '专注时间已结束',
          timeLabel: '刚刚',
          tone: 'gray',
        }),
      };
    });
  }, []);

  const saveMorning = useCallback((input: Pick<Reflection, 'energy' | 'intention'> & { isMakeup?: boolean }) => {
    const workspaceId = state.activeWorkspaceId;
    const day = todayKey(state.dailyPreferences.timezone);
    const localReflectionId = state.reflections.find((reflection) => reflection.workspaceId === workspaceId && reflection.type === 'morning' && reflection.reflectionDate === day)?.id ?? createId('reflection');
    const payload = {
      reflection_type: 'morning' as const,
      reflection_date: day,
      energy: input.energy,
      intention: input.intention?.trim() || null,
      is_makeup: Boolean(input.isMakeup),
    };
    setState((current) => {
      const existingIndex = current.reflections.findIndex((reflection) => reflection.workspaceId === workspaceId && reflection.type === 'morning' && reflection.reflectionDate === day);
      const reflection: Reflection = {
        id: localReflectionId,
        workspaceId,
        type: 'morning',
        reflectionDate: day,
        energy: payload.energy,
        intention: payload.intention ?? undefined,
        isMakeup: payload.is_makeup,
        createdLabel: '刚刚',
      };
      const reflections = existingIndex >= 0 ? current.reflections.map((item, index) => index === existingIndex ? reflection : item) : [reflection, ...current.reflections];
      return {
        ...current,
        reflections,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'reflection',
          title: input.isMakeup ? '补记晨间启动' : '完成晨间启动',
          detail: `能量 ${input.energy ?? 3}/5${reflection.intention ? ` · 今天想先${reflection.intention}` : ''}`,
          timeLabel: '刚刚',
          tone: 'teal',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post<ReflectionPayload>('/reflections', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          reflections: current.reflections.map((reflection) => reflection.id === localReflectionId ? mapReflectionPayload(created) : reflection),
        }));
      }).catch(() => {
        // Keep the local reflection when cloud sync is unavailable.
      });
    }
  }, [state.activeWorkspaceId, state.dailyPreferences.timezone, state.reflections]);

  const saveEvening = useCallback((input: Pick<Reflection, 'completion' | 'wins' | 'friction' | 'adjustment' | 'mood'> & { isMakeup?: boolean }) => {
    const workspaceId = state.activeWorkspaceId;
    const day = todayKey(state.dailyPreferences.timezone);
    const localReflectionId = state.reflections.find((reflection) => reflection.workspaceId === workspaceId && reflection.type === 'evening' && reflection.reflectionDate === day)?.id ?? createId('reflection');
    const payload = {
      reflection_type: 'evening' as const,
      reflection_date: day,
      completion: input.completion,
      wins: input.wins?.trim() || null,
      friction: input.friction?.trim() || null,
      adjustment: input.adjustment?.trim() || null,
      mood: input.mood ?? null,
      is_makeup: Boolean(input.isMakeup),
    };
    setState((current) => {
      const existingIndex = current.reflections.findIndex((reflection) => reflection.workspaceId === workspaceId && reflection.type === 'evening' && reflection.reflectionDate === day);
      const reflection: Reflection = {
        id: localReflectionId,
        workspaceId,
        type: 'evening',
        reflectionDate: day,
        completion: payload.completion,
        wins: payload.wins ?? undefined,
        friction: payload.friction ?? undefined,
        adjustment: payload.adjustment ?? undefined,
        mood: payload.mood ?? undefined,
        isMakeup: payload.is_makeup,
        createdLabel: '刚刚',
      };
      const reflections = existingIndex >= 0 ? current.reflections.map((item, index) => index === existingIndex ? reflection : item) : [reflection, ...current.reflections];
      return {
        ...current,
        reflections,
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'reflection',
          title: input.isMakeup ? '补记晚间复盘' : '完成晚间复盘',
          detail: `完成度 ${input.completion ?? 0}%${input.adjustment?.trim() ? ` · 明天调整：${input.adjustment.trim()}` : ''}`,
          timeLabel: '刚刚',
          tone: 'green',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post<ReflectionPayload>('/reflections', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          reflections: current.reflections.map((reflection) => reflection.id === localReflectionId ? mapReflectionPayload(created) : reflection),
        }));
      }).catch(() => {
        // Keep the local reflection when cloud sync is unavailable.
      });
    }
  }, [state.activeWorkspaceId, state.dailyPreferences.timezone, state.reflections]);

  const syncQueuedCapture = useCallback((capture: Capture): Promise<CaptureSaveResult> => {
    const requestId = capture.clientRequestId!;
    const existing = captureRequests.current.get(requestId);
    if (existing) return existing;
    const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
    if (!ownerId || ownerId !== capture.ownerId) {
      return Promise.resolve({captureId: capture.id, syncState: 'local', error: '这条记录属于原保存账户，不会自动上传。'});
    }
    if (!/^[0-9a-f-]{36}$/i.test(capture.workspaceId)) {
      return Promise.resolve({captureId: capture.id, syncState: 'pending', error: '先完成工作空间同步，再同步这条记录。'});
    }
    const promise = (async (): Promise<CaptureSaveResult> => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12000);
      setState(current => ({...current, captures: current.captures.map(item => item.clientRequestId === requestId ? {...item, syncState: 'syncing', syncError: undefined} : item)}));
      try {
        const created = await api.post<ReflectionPayload>('/reflections', captureRequest(capture, todayKey(state.dailyPreferences.timezone)), {signal: controller.signal});
        const remote = captureFromReflectionPayload(created);
        if (!remote || created.client_request_id !== requestId || remote.workspaceId !== capture.workspaceId) throw new Error('保存结果未匹配这条记录，原文仍保留，可重试确认。');
        const synced: Capture = {...remote, ownerId: capture.ownerId};
        setState(current => ({
          ...current,
          captures: [synced, ...current.captures.filter(item => item.clientRequestId !== requestId && item.id !== synced.id)],
          reflections: [mapReflectionPayload(created), ...current.reflections.filter(item => item.clientRequestId !== requestId && item.id !== created.id)],
          activities: current.activities.map(item => item.id === `capture-activity-${requestId}` ? {...item, detail: '原始记录已同步，服务端已保存成长事实。'} : item),
        }));
        return {captureId: synced.id, syncState: 'synced'};
      } catch (error) {
        const message = error instanceof Error && error.name !== 'AbortError' && error.name !== 'TypeError'
          ? error.message : '网络暂不可用，原文已保留，可以稍后重试。';
        const failed: Capture = {...capture, syncState: 'failed', syncError: message};
        try {queueCapture(window.localStorage, failed);} catch { /* The original queued copy remains available. */ }
        setState(current => ({...current, captures: current.captures.map(item => item.clientRequestId === requestId ? failed : item)}));
        return {captureId: capture.id, syncState: 'failed', error: message};
      } finally {
        window.clearTimeout(timer);
        captureRequests.current.delete(requestId);
      }
    })();
    captureRequests.current.set(requestId, promise);
    return promise;
  }, [state.dailyPreferences.timezone]);

  const retryCapture = useCallback((captureId: string): Promise<CaptureSaveResult> => {
    const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
    const queue = readCaptureQueue(window.localStorage, ownerId);
    const capture = queue.find(item => item.id === captureId) ?? state.captures.find(item => item.id === captureId);
    if (!capture) return Promise.reject(new Error('未找到这条待同步记录。'));
    if (capture.syncState === 'synced' || !capture.clientRequestId) return Promise.resolve({captureId, syncState: capture.syncState ?? 'local'});
    return syncQueuedCapture(capture);
  }, [state.captures, syncQueuedCapture]);

  const addCapture = useCallback((input: string | CaptureInput): Promise<CaptureSaveResult> => {
    const details = typeof input === 'string' ? {content: input} : input;
    const cleanContent = details.content.trim();
    if (!cleanContent) return Promise.reject(new Error('请先留下一点内容。'));
    const ownerId = captureOwnerId(window.localStorage.getItem('gp_token'));
    const clientRequestId = details.clientRequestId ?? crypto.randomUUID();
    const existing = readCaptureQueue(window.localStorage, ownerId).find(item => item.clientRequestId === clientRequestId);
    if (existing) return syncQueuedCapture(existing);
    const capture: Capture = {
      id: `capture-${clientRequestId}`, clientRequestId, ownerId: ownerId ?? undefined,
      workspaceId: state.activeWorkspaceId, type: details.type ?? 'idea', status: details.status ?? 'noted',
      content: cleanContent, capturedDate: todayKey(state.dailyPreferences.timezone),
      projectId: details.projectId, goalId: details.goalId, taskId: details.taskId,
      createdLabel: '刚刚', syncState: ownerId ? 'pending' : 'local',
    };
    queueCapture(window.localStorage, capture);
    setState(current => ({
      ...current,
      captures: [capture, ...current.captures],
      reflections: [captureReflection(capture), ...current.reflections],
      activities: prependActivity(current, {
        id: `capture-activity-${clientRequestId}`, workspaceId: capture.workspaceId, type: 'capture',
        title: `${captureTypeLabel(capture.type)}：${cleanContent.slice(0, 28)}${cleanContent.length > 28 ? '...' : ''}`,
        detail: ownerId ? '原始记录已保留在本地，等待服务端同步。' : '原始记录仅保存在此浏览器。',
        timeLabel: '刚刚', tone: capture.type === 'emotion' ? 'orange' : capture.type === 'learning' ? 'blue' : 'green',
      }),
    }));
    return ownerId ? syncQueuedCapture(capture) : Promise.resolve({captureId: capture.id, syncState: 'local'});
  }, [state.activeWorkspaceId, state.dailyPreferences.timezone, syncQueuedCapture]);

  const syncOnboarding = useCallback((submission: OnboardingSubmission): Promise<OnboardingSubmission> => {
    const existing = onboardingRequests.current.get(submission.requestId);
    if (existing) return existing;
    const ownerId = captureOwnerId(localStorage.getItem('gp_token'));
    if (ownerId !== submission.ownerId) return Promise.reject(new Error('请回到确认这份方案的账户后重试。'));
    const publish = (next: OnboardingSubmission) => {
      persistOnboardingSubmission(localStorage, next);
      onboardingRef.current = next;
      setOnboardingSubmission(next);
      setState(current => restoreOnboardingState(current, next));
    };
    if (!ownerId) {
      const next = {...submission, error: '方案仅保存在此浏览器。请使用登录账户建立可同步的工作空间。'};
      publish(next);
      return Promise.resolve(next);
    }
    const syncing = {...submission, error: undefined, objects: submission.objects.map(item => item.status === 'synced' ? item : {...item, status: 'syncing' as const, error: null})};
    publish(syncing);
    const promise = (async () => {
      try {
        const result = await api.post<OnboardingResult>('/onboarding/context/complete', submission.payload);
        if (captureOwnerId(localStorage.getItem('gp_token')) !== ownerId) throw new Error('账户已变化，请回到原账户查看保存结果。');
        const next = applyOnboardingResult(submission, result);
        publish(next);
        return next;
      } catch (error) {
        const next = {...submission, saved: false, error: error instanceof Error ? error.message : '同步未完成，原话和方案仍在，请重试。', objects: submission.objects.map(item => item.status === 'synced' ? item : {...item, status: 'failed' as const, error: null})};
        if (captureOwnerId(localStorage.getItem('gp_token')) === ownerId) {
          try {persistOnboardingSubmission(localStorage, next);} catch { /* Earlier durable confirmation is retained. */ }
          onboardingRef.current = next;
          setOnboardingSubmission(next);
          setState(current => restoreOnboardingState(current, next));
        }
        return next;
      } finally {onboardingRequests.current.delete(submission.requestId);}
    })();
    onboardingRequests.current.set(submission.requestId, promise);
    return promise;
  }, []);

  const applyOnboarding = useCallback((draft: OnboardingDraft, selected: OnboardingSelection, rawInput: string): Promise<OnboardingSubmission> => {
    const ownerId = captureOwnerId(localStorage.getItem('gp_token'));
    const pending = onboardingRef.current ?? readOnboardingSubmission(localStorage, ownerId);
    if (pending && !pending.saved) return syncOnboarding(pending);
    if (pending?.saved && pending.ownerId === ownerId && pending.rawInput === rawInput.trim() && JSON.stringify(pending.draft) === JSON.stringify(draft) && JSON.stringify(pending.selected) === JSON.stringify(selected)) {
      onboardingRef.current = pending;
      setOnboardingSubmission(pending);
      setState(current => restoreOnboardingState(current, pending));
      return Promise.resolve(pending);
    }
    const submission = createOnboardingSubmission(draft, selected, rawInput, ownerId, state.dailyPreferences.timezone);
    // Fail before changing the UI or making any request if durable local storage is unavailable.
    persistOnboardingSubmission(localStorage, submission);
    onboardingRef.current = submission;
    setOnboardingSubmission(submission);
    setState(current => restoreOnboardingState(current, submission));
    return syncOnboarding(submission);
  }, [state.dailyPreferences.timezone, syncOnboarding]);

  const retryOnboarding = useCallback(() => {
    const submission = onboardingRef.current;
    if (!submission) return Promise.reject(new Error('没有可重试的确认方案。'));
    return syncOnboarding(submission);
  }, [syncOnboarding]);

  const skipOnboarding = useCallback(() => {
    setState((current) => ({ ...current, onboardingCompleted: true }));
  }, []);

  const resetWorkspaceData = useCallback(() => {
    setState(cloneDefaultState());
  }, []);

  const acceptAgentTask = useCallback((payload: TaskPayload) => {
    setState(current => {
      const existing = current.tasks.find(task => task.id === payload.id);
      const mapped = mapTaskPayload(payload,current.dailyPreferences.timezone);
      if (existing) return {...current,tasks:current.tasks.map(task => task.id === payload.id ? {...mapped,source:task.source,agentSource:mapped.agentSource ?? task.agentSource}:task)};
      const task: Task = {...mapped, source: payload.agent_source ? 'ai' : 'user'};
      return {...current, tasks: [task, ...current.tasks], activities: prependActivity(current, {
        id: `agent-action-${task.id}`, workspaceId: task.workspaceId, type: 'task', title: `${task.status === 'done' ? '记录行动结果' : '确认行动'}「${task.title}」`, detail: task.status === 'done' ? '已保存完成结果原文' : '已保留个人 Agent 对话与来源', timeLabel: '刚刚', tone: 'green',
      })};
    });
  }, []);
  const activeWorkspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? DEFAULT_WORKSPACE_STATE.workspaces[0];
  const activeProjects = useMemo(() => state.projects.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.projects, state.activeWorkspaceId]);
  const activeGoals = useMemo(() => state.goals.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.goals, state.activeWorkspaceId]);
  const activePlans = useMemo(() => state.plans.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.plans, state.activeWorkspaceId]);
  const activeTasks = useMemo(() => state.tasks.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.tasks, state.activeWorkspaceId]);
  const activeLearning = useMemo(() => state.learningItems.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.learningItems, state.activeWorkspaceId]);
  const activeKnowledgeCards = useMemo(() => state.knowledgeCards.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.knowledgeCards, state.activeWorkspaceId]);
  const activeActivities = useMemo(() => state.activities.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.activities, state.activeWorkspaceId]);
  const activeInsights = useMemo(() => state.insights.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.insights, state.activeWorkspaceId]);
  const activeCaptures = useMemo(() => state.captures.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.captures, state.activeWorkspaceId]);
  const activeReflections = useMemo(() => state.reflections.filter((item) => item.workspaceId === state.activeWorkspaceId), [state.reflections, state.activeWorkspaceId]);
  const activeFocus = state.focusSession?.workspaceId === state.activeWorkspaceId ? state.focusSession : null;

  const refreshExecutionData = useCallback(async () => {
    const workspaceId = state.activeWorkspaceId;
    if (!window.localStorage.getItem('gp_token')) return;
    const [tasks, plans, learning] = await Promise.all([
      api.get<TaskPayload[]>('/tasks', { workspace_id: workspaceId }),
      api.get<GrowthPlanPayload[]>('/growth-plans', { workspace_id: workspaceId }),
      api.get<LearningItemPayload[]>('/learning-items', { workspace_id: workspaceId }),
    ]);
    setState(current => current.activeWorkspaceId !== workspaceId ? current : ({
      ...current,
      tasks: mergeHydratedItems(tasks.map(item => mapTaskPayload(item, current.dailyPreferences.timezone)), current.tasks, workspaceId, 'task-'),
      plans: mergeHydratedItems(plans.map(mapGrowthPlanPayload), current.plans, workspaceId, 'plan-'),
      learningItems: mergeHydratedItems(learning.map(mapLearningItemPayload), current.learningItems, workspaceId, 'learning-'),
    }));
  }, [state.activeWorkspaceId]);

  const value = useMemo(() => ({
    state,
    hydrationStatus,
    retryHydration,
    refreshExecutionData,
    activeWorkspace,
    activeProjects,
    activeGoals,
    activePlans,
    activeTasks,
    activeLearning,
    activeKnowledgeCards,
    activeActivities,
    activeInsights,
    activeCaptures,
    activeReflections,
    activeFocus,
    dailyPreferences: state.dailyPreferences,
    privacyScope: state.privacyScope,
    setActiveWorkspace,
    addTask,
    acceptAgentTask,
    addGoal,
    addGrowthPlan,
    addLearningItem,
    addKnowledgeCard,
    retryKnowledgeCard,
    addKnowledgeCardToLearning,
    previewKnowledgeCardSummary,
    confirmKnowledgeCardSummary,
    updateKnowledgeCardContextLinks,
    updateCapabilitySettings,
    createCapabilityInvocationPreview,
    decideCapabilityInvocation,
    executeCapabilityInvocation,
    createTaskFromBriefFact,
    createGoalFromBriefFact,
    createGrowthPlanFromBriefFact,
    createKnowledgeCardFromBriefFact,
    createMemoryFromBriefFact,
    updateDailyPreferences,
    updatePrivacyScope,
    listCapabilityInvocations,
    updateTaskStatus,
    updateTaskDue,
    updateLearningProgress,
    saveMorning,
    saveEvening,
    addCapture,
    retryCapture,
    onboardingSubmission,
    applyOnboarding,
    retryOnboarding,
    skipOnboarding,
    resetWorkspaceData,
    startFocus,
    pauseFocus,
    resumeFocus,
    completeFocus,
    exitFocus,
  }), [state, hydrationStatus, retryHydration, refreshExecutionData, activeWorkspace, activeProjects, activeGoals, activePlans, activeTasks, activeLearning, activeKnowledgeCards, activeActivities, activeInsights, activeCaptures, activeReflections, activeFocus, setActiveWorkspace, addTask, acceptAgentTask, addGoal, addGrowthPlan, addLearningItem, addKnowledgeCard, retryKnowledgeCard, addKnowledgeCardToLearning, previewKnowledgeCardSummary, confirmKnowledgeCardSummary, updateKnowledgeCardContextLinks, updateCapabilitySettings, createCapabilityInvocationPreview, decideCapabilityInvocation, executeCapabilityInvocation, createTaskFromBriefFact, createGoalFromBriefFact, createGrowthPlanFromBriefFact, createKnowledgeCardFromBriefFact, createMemoryFromBriefFact, updateDailyPreferences, updatePrivacyScope, listCapabilityInvocations, updateTaskStatus, updateTaskDue, updateLearningProgress, startFocus, pauseFocus, resumeFocus, completeFocus, exitFocus, saveMorning, saveEvening, addCapture, retryCapture, onboardingSubmission, applyOnboarding, retryOnboarding, skipOnboarding, resetWorkspaceData]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function captureTypeLabel(type: CaptureInput['type']) {
  if (type === 'progress') return '记录进展';
  if (type === 'decision') return '记录决定';
  if (type === 'emotion') return '记录状态';
  if (type === 'learning') return '记录学习';
  return '记录想法';
}

function getFocusElapsed(session: FocusSession) {
  if (session.status !== 'active' || !session.startedAt) return session.elapsedSeconds;
  return session.elapsedSeconds + Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
}

function formatFocusMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} 分 ${remainder} 秒`;
}

function dueAtForLabel(label: string) {
  const date = new Date();
  date.setDate(date.getDate() + (label.includes('下周') ? 7 : label.includes('今天') ? 0 : 1));
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}
