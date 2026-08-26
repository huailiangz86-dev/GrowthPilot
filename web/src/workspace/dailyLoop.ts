import type { Capture, LearningItem, Reflection, Task } from './workspaceData';

export type DailyLoopStepId = 'morning' | 'tasks' | 'learning' | 'capture' | 'evening';

export interface DailyLoopStep {
  id: DailyLoopStepId;
  label: string;
  detail: string;
  completed: boolean;
  to: string;
}

export interface DailyNextAction {
  label: string;
  detail: string;
  to: string;
}

export interface DailyLoop {
  steps: DailyLoopStep[];
  nextAction: DailyNextAction;
  todayTasks: Task[];
  completedTaskCount: number;
}

export function buildDailyLoop({
  tasks,
  learningItems,
  captures,
  reflections,
  today,
}: {
  tasks: Task[];
  learningItems: LearningItem[];
  captures: Capture[];
  reflections: Reflection[];
  today: string;
}): DailyLoop {
  const morning = reflections.find((reflection) => reflection.type === 'morning' && reflection.reflectionDate === today);
  const evening = reflections.find((reflection) => reflection.type === 'evening' && reflection.reflectionDate === today);
  const todayTasks = tasks.filter((task) => task.dueLabel.includes('今天') || task.completedDate === today);
  const completedTaskCount = todayTasks.filter((task) => task.status === 'done').length;
  const highPriorityTasks = todayTasks.filter((task) => task.priority === 'high' && task.status !== 'done');
  const currentLearning = learningItems.find((item) => item.status === 'in_progress');
  const learningUpdatedToday = learningItems.some((item) => item.progressUpdatedDate === today);
  const todayCaptures = captures.filter((capture) => capture.capturedDate === today);

  const steps: DailyLoopStep[] = [
    {
      id: 'morning',
      label: '晨间启动',
      detail: morning ? `能量 ${morning.energy ?? 3}/5${morning.intention ? ' · 已定意图' : ''}` : '还未确认今天的推进方式',
      completed: Boolean(morning),
      to: '/app/morning',
    },
    {
      id: 'tasks',
      label: '任务推进',
      detail: todayTasks.length ? `已完成 ${completedTaskCount}/${todayTasks.length} 个今日任务` : '今天还没有安排任务',
      completed: todayTasks.length > 0 && completedTaskCount === todayTasks.length,
      to: '/app/tasks',
    },
    {
      id: 'learning',
      label: '学习进展',
      detail: currentLearning ? `${currentLearning.title} · ${currentLearning.progress}%` : learningItems.length ? '学习队列等待继续' : '还没有学习入口',
      completed: learningUpdatedToday,
      to: '/app/knowledge',
    },
    {
      id: 'capture',
      label: '快速记录',
      detail: todayCaptures.length ? `今天留下 ${todayCaptures.length} 条事实` : '还没有留下今天的事实',
      completed: todayCaptures.length > 0,
      to: '/app?capture=1',
    },
    {
      id: 'evening',
      label: '晚间复盘',
      detail: evening ? `完成感 ${evening.completion ?? 0}%${evening.adjustment ? ' · 已留下调整' : ''}` : '晚上再回看今天的推进',
      completed: Boolean(evening),
      to: '/app/evening',
    },
  ];

  const nextAction = !morning
    ? { label: '先完成晨间启动', detail: '今天还没有确认能量和推进意图。', to: '/app/morning' }
    : highPriorityTasks[0]
      ? { label: `推进「${highPriorityTasks[0].title}」`, detail: `今天还有 ${highPriorityTasks.length} 个高优任务未完成。`, to: '/app/tasks' }
      : currentLearning
        ? { label: `继续学习「${currentLearning.title}」`, detail: `当前学习进度 ${currentLearning.progress}%，下一段可以直接推进。`, to: '/app/knowledge' }
        : todayCaptures.length === 0
          ? { label: '留下一条快速记录', detail: '今天还没有留下进展、决定或学习事实。', to: '/app?capture=1' }
          : !evening
            ? { label: '完成晚间复盘', detail: '今天的事实已经积累，可以留下明天的调整。', to: '/app/evening' }
            : { label: '今天的闭环已完成', detail: '任务、记录与复盘已留下事实，明天可以从当前上下文继续。', to: '/app/workspace' };

  return { steps, nextAction, todayTasks, completedTaskCount };
}
