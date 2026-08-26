import type { Goal, GrowthPlan, LearningItem, Reflection, Task } from './workspaceData';

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
