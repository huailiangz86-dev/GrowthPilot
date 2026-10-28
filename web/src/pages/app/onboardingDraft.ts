import type { OnboardingDraft, OnboardingSelection } from '../../workspace/workspaceData';

export interface OnboardingPreview {
  raw_input?: string;
  profile?: {
    identity?: string;
    current_project?: string;
    goals?: string[];
    work_rhythm?: string;
  };
  workspace?: OnboardingDraft['workspace'];
  project?: OnboardingDraft['project'];
  goal?: OnboardingDraft['goal'];
  plan?: OnboardingDraft['plan'];
  tasks?: OnboardingDraft['tasks'];
  learning?: OnboardingDraft['learning'];
  ai_generated?: boolean;
}

export interface OnboardingCompletionPayload {
  client_request_id?: string;
  raw_input: string;
  profile: OnboardingPreview['profile'];
  workspace?: {
    name: string;
    description: string;
    workspace_type: 'personal';
  };
  project?: {
    name: string;
    description: string;
    next_action: string;
  };
  goal?: {title: string; description: string; target_metric: {horizon_label: string}};
  plan?: {title: string; description: string; period_type: 'weekly'; total_weeks: number; milestones: string[]};
  tasks?: Array<{client_key: string; title: string; description: string; priority: string; due_at: string | null}>;
  learning?: {title: string; summary: string; kind: string; duration_minutes: number | null};
}

function extractFocus(rawInput: string) {
  const normalized = rawInput.replace(/\s+/g, ' ').trim();
  const firstClause = normalized.split(/[，。；;,.!?！？]/)[0] ?? '';
  const focus = firstClause.replace(/^(我正在|我想要?|我希望|希望|目前|现在|最近|计划)\s*/, '').trim();
  return (focus || normalized || '当前最重要的方向').slice(0, 28);
}

export function createOnboardingSelection(taskCount: number): OnboardingSelection {
  return {
    workspace: true,
    project: true,
    goal: true,
    plan: true,
    tasks: Array.from({ length: Math.min(3, Math.max(0, taskCount)) }, () => true),
    learning: true,
  };
}

export function createOnboardingCompletionPayload(
  draft: OnboardingDraft,
  selected: OnboardingSelection,
  rawInput: string,
  requestId?: string,
  dueDates: Array<string | null> = [],
): OnboardingCompletionPayload {
  const profile = {
    identity: draft.project.description.slice(0, 200),
    current_project: selected.project ? draft.project.name.slice(0, 300) : '',
    goals: selected.goal ? [draft.goal.title] : [],
    work_rhythm: selected.plan && selected.goal ? draft.plan.description.slice(0, 300) : '',
  };
  const payload: OnboardingCompletionPayload = {
    raw_input: rawInput.trim(),
    profile,
  };

  if (!selected.workspace) return payload;

  payload.workspace = {
    name: draft.workspace.name,
    description: draft.workspace.description,
    workspace_type: 'personal',
  };
  if (selected.project) {
    payload.project = {
      name: draft.project.name,
      description: draft.project.description,
      next_action: draft.project.nextAction,
    };
  }
  if (requestId) {
    payload.client_request_id = requestId;
    if (selected.goal) payload.goal = {title: draft.goal.title, description: draft.goal.description, target_metric: {horizon_label: draft.goal.horizon}};
    if (selected.plan && selected.goal) payload.plan = {title: draft.plan.title, description: draft.plan.description, period_type: 'weekly', total_weeks: draft.plan.totalWeeks, milestones: draft.plan.milestones};
    payload.tasks = draft.tasks.flatMap((task, index) => selected.tasks[index] ? [{client_key: `task-${index}`, title: task.title, description: task.description, priority: task.priority, due_at: dueDates[index] ?? null}] : []);
    const minutes = /^\s*(\d+)\s*分钟\s*$/.exec(draft.learning.durationLabel);
    if (selected.learning) payload.learning = {title: draft.learning.title, summary: draft.learning.summary, kind: draft.learning.kind, duration_minutes: minutes && Number(minutes[1]) <= 1440 && Number(minutes[1]) > 0 ? Number(minutes[1]) : null};
  }
  return payload;
}

export function inferOnboardingDraft(rawInput: string, preview?: OnboardingPreview): OnboardingDraft {
  const profile = preview?.profile;
  const focus = extractFocus(rawInput);
  const projectName = preview?.project?.name || profile?.current_project || focus;
  const identity = profile?.identity || `正在推进「${focus}」的实践者`;
  const goalTitle = preview?.goal?.title || profile?.goals?.[0] || `让「${focus}」形成可持续进展`;
  const firstAction = preview?.project?.nextAction || `明确「${focus}」的完成标准`;

  return {
    workspace: preview?.workspace || {
      name: '我的成长工作台',
      description: `围绕「${focus}」组织工作、学习和下一步`,
      color: '#1f5d5c',
    },
    project: preview?.project || {
      name: projectName,
      description: `围绕「${projectName}」持续推进，把当前表达变成实际产出。`,
      nextAction: firstAction,
      accent: '#1f5d5c',
    },
    goal: preview?.goal || {
      title: goalTitle,
      description: `把${identity}正在面对的方向，拆成可以持续执行和回看的行动。`,
      horizon: '未来 90 天',
    },
    plan: preview?.plan || {
      title: '第一周：从表达走到行动',
      description: profile?.work_rhythm || `先围绕「${focus}」建立一个低负担、可回看的推进节奏。`,
      totalWeeks: 4,
      milestones: ['明确完成标准', '完成三次 Focus 执行', '留下两条学习记录', '完成一次晚间复盘'],
    },
    tasks: preview?.tasks?.length ? preview.tasks.slice(0, 3) : [
      {
        title: firstAction,
        description: '先定义这条主线的完成标准和边界。',
        dueLabel: '今天',
        priority: 'high',
        recommendedReason: '明确终点后，后续行动才不会漂移。',
      },
      {
        title: `完成「${focus}」今天最小可交付的一步`,
        description: '选择一个能在一次专注时段内完成并看见结果的动作。',
        dueLabel: '今天',
        priority: 'high',
        recommendedReason: '先建立真实进展，再继续拆解。',
      },
      {
        title: '记录一个阻塞或新发现',
        description: '把执行中的事实留下来，作为下一次调整的依据。',
        dueLabel: '明天',
        priority: 'medium',
        recommendedReason: '真实反馈会让后续建议更贴近你的处境。',
      },
    ],
    learning: preview?.learning || {
      title: `理解「${focus}」所需的关键知识`,
      summary: '先收集一份与当前主线直接相关的资料，留下摘要和自己的判断。',
      kind: 'article',
      durationLabel: '12 分钟',
    },
  };
}
