import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const [state, setState] = useState<WorkspaceState>(loadWorkspaceState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!window.localStorage.getItem('gp_token')) return;
    let cancelled = false;
    const hydrate = async () => {
      try {
        const workspaces = await api.get<Array<{ id: string }>>('/workspaces');
        const workspaceId = workspaces[0]?.id;
        if (!workspaceId || cancelled) return;
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
        if (!cancelled) {
          const reflections = reflectionsResult.status === 'fulfilled' ? reflectionsResult.value : null;
          setState((current) => ({
            ...mergeDashboardState(current, dashboard),
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
                reflections.map(captureFromReflectionPayload).filter((item): item is Capture => item !== null),
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
          }));
        }
      } catch {
        // Keep the local workspace when cloud hydration is unavailable.
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, []);

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
      description: options.description ?? '由全局 AI Command Bar 快速创建。',
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

  const addGoal = useCallback((input: Pick<Goal, 'title'> & Partial<Pick<Goal, 'description' | 'dueAt' | 'importance' | 'projectId'>>) => {
    const title = input.title.trim();
    if (!title) return;
    const localGoalId = createId('goal');
    const workspaceId = state.activeWorkspaceId;
    const payload = {
      title,
      description: input.description?.trim() ?? '',
      due_at: input.dueAt ?? null,
      importance: input.importance ?? null,
      project_id: input.projectId ?? null,
    };
    setState((current) => {
      const goal: Goal = {
        id: localGoalId,
        workspaceId,
        title: payload.title,
        description: payload.description,
        progress: 0,
        horizon: payload.due_at ? `截止 ${payload.due_at.slice(0, 10)}` : '周期待补充',
        dueAt: payload.due_at ?? undefined,
        importance: payload.importance ?? undefined,
        projectId: payload.project_id ?? undefined,
      };
      return {
        ...current,
        goals: [goal, ...current.goals],
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'plan',
          title: `创建目标「${title}」`,
          detail: '已加入当前 Workspace 的成长方向',
          timeLabel: '刚刚',
          tone: 'teal',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post<GoalPayload>('/goals', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          goals: current.goals.map((goal) => goal.id === localGoalId ? mapGoalPayload(created) : goal),
        }));
      }).catch(() => {
        // Keep the local goal when cloud creation is unavailable.
      });
    }
  }, [state.activeWorkspaceId]);

  const addGrowthPlan = useCallback((input: Pick<GrowthPlan, 'goalId' | 'title'> & Partial<Pick<GrowthPlan, 'description' | 'projectId' | 'periodType' | 'totalWeeks' | 'milestones'>>) => {
    const title = input.title.trim();
    if (!title || !input.goalId) return;
    const localPlanId = createId('plan');
    const workspaceId = state.activeWorkspaceId;
    const payload = {
      goal_id: input.goalId,
      title,
      description: input.description?.trim() ?? '',
      project_id: input.projectId ?? null,
      period_type: input.periodType ?? 'weekly',
      total_weeks: input.totalWeeks ?? null,
      milestones: (input.milestones ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 12),
    };
    setState((current) => {
      const plan: GrowthPlan = {
        id: localPlanId,
        workspaceId,
        title: payload.title,
        description: payload.description,
        currentWeek: payload.total_weeks ? 1 : 1,
        totalWeeks: payload.total_weeks ?? 1,
        progress: 0,
        goalId: payload.goal_id,
        milestones: payload.milestones,
        projectId: payload.project_id ?? undefined,
        periodType: payload.period_type,
      };
      return {
        ...current,
        plans: [plan, ...current.plans],
        goals: current.goals.map((goal) => goal.id === input.goalId ? { ...goal, planId: localPlanId } : goal),
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'plan',
          title: `创建计划「${title}」`,
          detail: '已连接到当前目标',
          timeLabel: '刚刚',
          tone: 'teal',
        }),
      };
    });
    if (window.localStorage.getItem('gp_token')) {
      void api.post<GrowthPlanPayload>('/growth-plans', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          plans: current.plans.map((plan) => plan.id === localPlanId ? mapGrowthPlanPayload(created) : plan),
          goals: current.goals.map((goal) => goal.planId === localPlanId ? { ...goal, planId: created.id } : goal),
        }));
      }).catch(() => {
        // Keep the local growth plan when cloud creation is unavailable.
      });
    }
  }, [state.activeWorkspaceId]);

  const addLearningItem = useCallback((input: Pick<LearningItem, 'title'> & Partial<Pick<LearningItem, 'summary' | 'kind' | 'durationMinutes' | 'relatedGoalId' | 'projectId'>>) => {
    const title = input.title.trim();
    if (!title) return;
    const localLearningId = createId('learning');
    const workspaceId = state.activeWorkspaceId;
    const payload = {
      title,
      summary: input.summary?.trim() ?? '',
      kind: input.kind ?? 'note',
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
      void api.post<LearningItemPayload>('/learning-items', { workspace_id: workspaceId, ...payload }).then((created) => {
        setState((current) => ({
          ...current,
          learningItems: current.learningItems.map((item) => item.id === localLearningId ? mapLearningItemPayload(created) : item),
        }));
      }).catch(() => {
        // Keep the local learning item when cloud creation is unavailable.
      });
    }
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

  const addCapture = useCallback((input: string | CaptureInput): Promise<boolean> => {
    const details = typeof input === 'string' ? { content: input } : input;
    const cleanContent = details.content.trim();
    if (!cleanContent) return Promise.resolve(false);
    const workspaceId = state.activeWorkspaceId;
    const localCaptureId = createId('capture');
    const localReflectionId = createId('reflection');
    const payload = {
      reflection_type: 'micro' as const,
      reflection_date: todayKey(state.dailyPreferences.timezone),
      micro_type: details.type ?? 'idea',
      micro_status: details.status ?? 'noted',
      content: cleanContent,
      project_id: details.projectId ?? null,
      goal_id: details.goalId ?? null,
      task_id: details.taskId ?? null,
      is_makeup: false,
    };
    setState((current) => {
      const capture: Capture = {
        id: localCaptureId,
        workspaceId,
        type: payload.micro_type,
        status: payload.micro_status,
        content: payload.content,
        capturedDate: payload.reflection_date,
        projectId: payload.project_id ?? undefined,
        goalId: payload.goal_id ?? undefined,
        taskId: payload.task_id ?? undefined,
        createdLabel: '刚刚',
      };
      const reflection: Reflection = {
        id: localReflectionId,
        workspaceId,
        type: 'micro',
        reflectionDate: capture.capturedDate,
        captureId: capture.id,
        microType: capture.type,
        microStatus: capture.status,
        content: capture.content,
        projectId: capture.projectId,
        goalId: capture.goalId,
        taskId: capture.taskId,
        isMakeup: false,
        createdLabel: '刚刚',
      };
      return {
        ...current,
        captures: [capture, ...current.captures].slice(0, 40),
        reflections: [reflection, ...current.reflections].slice(0, 60),
        activities: prependActivity(current, {
          id: createId('activity'),
          workspaceId,
          type: 'capture',
          title: `${captureTypeLabel(capture.type)}：${cleanContent.slice(0, 28)}${cleanContent.length > 28 ? '...' : ''}`,
          detail: `已关联${capture.taskId ? '任务' : capture.goalId ? '目标' : capture.projectId ? '项目' : '当前工作空间'}，写入 Workspace Event`,
          timeLabel: '刚刚',
          tone: capture.type === 'emotion' ? 'orange' : capture.type === 'learning' ? 'blue' : 'green',
        }),
      };
    });
    if (!window.localStorage.getItem('gp_token')) return Promise.resolve(true);
    return api.post<ReflectionPayload>('/reflections', { workspace_id: workspaceId, ...payload }).then((created) => {
        const capture = captureFromReflectionPayload(created);
        if (!capture) return false;
        setState((current) => ({
          ...current,
          reflections: current.reflections.map((reflection) => reflection.id === localReflectionId ? mapReflectionPayload(created) : reflection),
          captures: current.captures.map((item) => item.id === localCaptureId ? capture : item),
        }));
        return true;
      }).catch(() => {
        // Keep the local capture and its draft recovery path when cloud sync is unavailable.
        return false;
      });
  }, [state.activeWorkspaceId, state.dailyPreferences.timezone]);

  const applyOnboarding = useCallback((draft: OnboardingDraft, selected: OnboardingSelection, rawInput: string, onlyCapture = false) => {
    setState((current) => {
      const cleanRawInput = rawInput.trim();
      if (!cleanRawInput) return current;
      if (onlyCapture) {
        const capture = {
          id: createId('capture'),
          workspaceId: current.activeWorkspaceId,
          type: 'idea' as const,
          status: 'noted' as const,
          content: cleanRawInput,
          capturedDate: todayKey(current.dailyPreferences.timezone),
          createdLabel: '刚刚',
        };
        const reflection: Reflection = {
          id: createId('reflection'),
          workspaceId: current.activeWorkspaceId,
          type: 'micro',
          reflectionDate: capture.capturedDate,
          captureId: capture.id,
          microType: capture.type,
          microStatus: capture.status,
          content: capture.content,
          isMakeup: false,
          createdLabel: '刚刚',
        };
        const next = {
          ...current,
          captures: [capture, ...current.captures].slice(0, 40),
          reflections: [reflection, ...current.reflections].slice(0, 60),
        };
        return {
          ...next,
          activities: prependActivity(next, {
            id: createId('activity'),
            workspaceId: current.activeWorkspaceId,
            type: 'capture',
            title: '保存首次表达',
            detail: '原话已记录，之后可以从工作台继续整理',
            timeLabel: '刚刚',
            tone: 'green',
          }),
        };
      }

      if (!selected.workspace) return current;
      const workspaceId = createId('workspace');
      const workspace = { id: workspaceId, ...draft.workspace, updatedLabel: '刚刚创建' };
      const projectId = selected.project ? createId('project') : undefined;
      const goalId = selected.goal ? createId('goal') : undefined;
      const planId = selected.plan && selected.goal ? createId('plan') : undefined;
      const project = projectId ? { id: projectId, workspaceId, ...draft.project, status: 'active' as const, progress: 8, goalId, accent: draft.project.accent || workspace.color } : undefined;
      const goal = goalId ? { id: goalId, workspaceId, ...draft.goal, progress: 0, planId } : undefined;
      const plan = planId && goalId ? { id: planId, workspaceId, ...draft.plan, currentWeek: 1, progress: 0, goalId } : undefined;
      const tasks = draft.tasks
        .filter((_, index) => selected.tasks[index])
        .map((task) => ({
          id: createId('task'),
          workspaceId,
          ...task,
          status: 'todo' as const,
          source: 'ai' as const,
          projectId: project?.id,
          goalId: goal?.id,
          planId: plan?.id,
        }));
      const learning = selected.learning ? {
        id: createId('learning'),
        workspaceId,
        ...draft.learning,
        status: 'queued' as const,
        progress: 0,
        relatedGoalId: goal?.id,
      } : undefined;
      const next = {
        ...current,
        activeWorkspaceId: workspaceId,
        onboardingCompleted: true,
        workspaces: [workspace, ...current.workspaces],
        projects: project ? [project, ...current.projects] : current.projects,
        goals: goal ? [goal, ...current.goals] : current.goals,
        plans: plan ? [plan, ...current.plans] : current.plans,
        tasks: [...tasks, ...current.tasks],
        learningItems: learning ? [learning, ...current.learningItems] : current.learningItems,
      };
      return {
        ...next,
        activities: prependActivity(next, {
          id: createId('activity'),
          workspaceId,
          type: 'workspace',
          title: `AI 建立「${draft.workspace.name}」工作空间`,
          detail: `原始表达已保留 · ${project ? '1 个项目 · ' : ''}${goal ? '1 个目标 · ' : ''}${plan ? '1 个计划 · ' : ''}${tasks.length} 个任务${learning ? ' · 1 个学习入口' : ''}`,
          timeLabel: '刚刚',
          tone: 'teal',
        }),
      };
    });
  }, []);

  const skipOnboarding = useCallback(() => {
    setState((current) => ({ ...current, onboardingCompleted: true }));
  }, []);

  const resetWorkspaceData = useCallback(() => {
    setState(cloneDefaultState());
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

  const value = useMemo(() => ({
    state,
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
    applyOnboarding,
    skipOnboarding,
    resetWorkspaceData,
    startFocus,
    pauseFocus,
    resumeFocus,
    completeFocus,
    exitFocus,
  }), [state, activeWorkspace, activeProjects, activeGoals, activePlans, activeTasks, activeLearning, activeKnowledgeCards, activeActivities, activeInsights, activeCaptures, activeReflections, activeFocus, setActiveWorkspace, addTask, addGoal, addGrowthPlan, addLearningItem, addKnowledgeCard, retryKnowledgeCard, addKnowledgeCardToLearning, previewKnowledgeCardSummary, confirmKnowledgeCardSummary, updateKnowledgeCardContextLinks, updateCapabilitySettings, createCapabilityInvocationPreview, decideCapabilityInvocation, executeCapabilityInvocation, createTaskFromBriefFact, createGoalFromBriefFact, createGrowthPlanFromBriefFact, createKnowledgeCardFromBriefFact, createMemoryFromBriefFact, updateDailyPreferences, updatePrivacyScope, listCapabilityInvocations, updateTaskStatus, updateTaskDue, updateLearningProgress, startFocus, pauseFocus, resumeFocus, completeFocus, exitFocus, saveMorning, saveEvening, addCapture, applyOnboarding, skipOnboarding, resetWorkspaceData]);

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
