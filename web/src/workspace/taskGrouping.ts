import type { Task } from './workspaceData';

export type TaskGroupMode = 'time' | 'energy';

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

function timeGroup(task: Task) {
  if (!task.timeBlock) return { key: 'unscheduled', label: '未安排时间' };
  if (task.timeBlock <= 30) return { key: 'short', label: '短时块 · 30 分钟内' };
  if (task.timeBlock <= 90) return { key: 'medium', label: '标准块 · 31–90 分钟' };
  return { key: 'deep', label: '深度块 · 90 分钟以上' };
}

function energyGroup(task: Task) {
  if (!task.energyRequired) return { key: 'unscheduled', label: '未安排能量' };
  if (task.energyRequired <= 2) return { key: 'light', label: '低能量 · 1–2' };
  if (task.energyRequired <= 4) return { key: 'steady', label: '稳定能量 · 3–4' };
  return { key: 'high', label: '高能量 · 5' };
}

export function groupTasks(tasks: Task[], mode: TaskGroupMode): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const group = mode === 'time' ? timeGroup(task) : energyGroup(task);
    const current = groups.get(group.key);
    if (current) current.tasks.push(task);
    else groups.set(group.key, { ...group, tasks: [task] });
  }
  return [...groups.values()];
}
