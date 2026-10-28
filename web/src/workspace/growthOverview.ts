import type { Goal, GrowthPlan, LearningItem, Reflection, Task } from './workspaceData';
import { shiftLocalDateKey } from './dailyPreferences.ts';

export function recentReflectionDays(reflections: Pick<Reflection, 'type' | 'reflectionDate'>[], timezone: string, now = new Date()) {
  const recorded = new Set(reflections.filter(item => item.type === 'morning' || item.type === 'evening').map(item => item.reflectionDate));
  return Array.from({length: 7}, (_, index) => {
    const date = shiftLocalDateKey(timezone, index - 6, now);
    return {date, label: new Intl.DateTimeFormat('zh-CN', {weekday: 'short', timeZone: 'UTC'}).format(new Date(`${date}T12:00:00Z`)), recorded: recorded.has(date)};
  });
}

export interface GrowthOverview {
  goalProgress: number | null;
  planProgress: number | null;
  taskCompletionRate: number | null;
  completedTaskCount: number;
  learningProgress: number | null;
  reflectionDays: number;
  milestoneCount: number;
}

function averageProgress(items: Array<{ progress: number }>) {
  if (!items.length) return null;
  return Math.round(items.reduce((total, item) => total + item.progress, 0) / items.length);
}

export function buildGrowthOverview({
  goals,
  plans,
  tasks,
  learningItems,
  reflections,
}: {
  goals: Goal[];
  plans: GrowthPlan[];
  tasks: Task[];
  learningItems: LearningItem[];
  reflections: Reflection[];
}): GrowthOverview {
  const completedTaskCount = tasks.filter((task) => task.status === 'done').length;
  const reflectionDays = new Set(
    reflections
      .filter((reflection) => reflection.type === 'morning' || reflection.type === 'evening')
      .map((reflection) => reflection.reflectionDate),
  ).size;

  return {
    goalProgress: averageProgress(goals),
    planProgress: averageProgress(plans),
    taskCompletionRate: tasks.length ? Math.round((completedTaskCount / tasks.length) * 100) : null,
    completedTaskCount,
    learningProgress: averageProgress(learningItems),
    reflectionDays,
    milestoneCount: plans.reduce((total, plan) => total + plan.milestones.length, 0),
  };
}
