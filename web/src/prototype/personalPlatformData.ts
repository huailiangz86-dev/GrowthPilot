export type PersonalScreen = 'today' | 'work' | 'learn' | 'growth' | 'mine';
export type TaskTemplate = '方案' | '写作' | '研究' | '学习实践';
export type RunStatus = 'waiting' | 'running' | 'ready' | 'error' | 'paused';
export interface DemoTask {
  id: string;
  title: string;
  template: TaskTemplate;
  criterion: string;
  dueDate?: string;
  body: string;
  status: 'doing' | 'todo' | 'done';
  steps: Array<{ id: string; title: string; owner: '我' | 'AI' | '共同'; done: boolean }>;
  ai: { enabled: boolean; status: RunStatus; draft: string };
  revisions: Array<{ body: string; label: string }>;
}
export interface DemoSchedule {
  id: string; taskId: string; date: string; start: string; end: string;
  sync: 'local' | 'simulated' | 'failed';
}
export interface DemoLearning {
  id: string; title: string; url: string; aim: string; notes: string; practice: string;
  status: '待学' | '学习中' | '待实践' | '已应用'; taskId: string; minutes: number;
}
export interface PersonalDemo {
  version: 1;
  goal: string;
  tasks: DemoTask[];
  schedules: DemoSchedule[];
  learning: DemoLearning[];
  reviews: Array<{ date: string; note: string; next: string }>;
  reflectionNote: string;
  reflectionNext: string;
  planVersion: number;
  adjustments: string[];
  connection: { connected: boolean; calendar: boolean; documents: boolean };
  preferences: { learningTime: string; reviewTime: string; capacity: number };
}
export const PERSONAL_DEMO_KEY = 'growthpilot.personal-platform.prototype.v1';
export const TODAY = '2026-10-08';
export const WEEK = [
  { date: '2026-10-05', day: '周一', number: '05' },
  { date: '2026-10-06', day: '周二', number: '06' },
  { date: '2026-10-07', day: '周三', number: '07' },
  { date: TODAY, day: '周四', number: '08' },
  { date: '2026-10-09', day: '周五', number: '09' },
  { date: '2026-10-10', day: '周六', number: '10' },
  { date: '2026-10-11', day: '周日', number: '11' },
];
export const PERSONAL_NAV: Array<{ id: PersonalScreen; label: string; detail: string }> = [
  { id: 'today', label: '今日', detail: '重点与时间' },
  { id: 'work', label: '工作', detail: '内容与成果' },
  { id: 'learn', label: '学习', detail: '理解与实践' },
  { id: 'growth', label: '成长', detail: '计划与复盘' },
  { id: 'mine', label: '我的', detail: '偏好与能力' },
];
export const APP_DRAFT = '个人 AI 学习助手 · 方案草稿\n\n要解决的问题\n学习资料分散，读完后很难把知识用于自己的项目。\n\n最小使用流程\n1. 用户保存一条资料链接，并说明想学会什么。\n2. 助手基于可读取的原文准备提纲和一个练习。\n3. 用户完成练习，把结果放回自己的任务页面。\n\n首版范围\n只做链接、笔记和一次练习，不同时加入自动推荐、全网搜索和复杂知识图谱。\n\n待验证\n找一份真实资料，检查提纲是否有出处，练习是否能帮助完成自己的方案。';

export function newTask(title: string, template: TaskTemplate, criterion: string): DemoTask {
  return {
    id: crypto.randomUUID(), title, template, criterion: criterion || '完成一份可以回看和继续使用的成果。',
    body: `${title}\n\n我希望完成什么\n\n资料与思考\n\n${template === '学习实践' ? '我的练习与应用结果' : '工作内容'}\n\n下一步\n`,
    status: 'todo',
    steps: [
      { id: 'prepare', title: '整理资料，准备内容草稿', owner: 'AI', done: false },
      { id: 'work', title: '补充自己的内容与判断', owner: '我', done: false },
      { id: 'review', title: '检查成果与完成标准', owner: '共同', done: false },
    ],
    ai: { enabled: false, status: 'waiting', draft: '' }, revisions: [],
  };
}
export function seedPersonalDemo(empty = false): PersonalDemo {
  const task: DemoTask = {
    id: 'application', title: '做出个人 AI 学习助手的应用方案', template: '方案',
    criterion: '一份明确问题、使用流程和首版范围的方案，并用一份学习资料验证。',
    status: 'doing', dueDate: '2026-10-11',
    body: '个人 AI 学习助手\n\n为什么做这件事\n我希望把每天读到的 AI 资料，用到一个可以持续使用的小工具里。\n\n服务谁\n先服务我自己：每天保存资料、做一个练习，回到正在做的项目。\n\n今天要定下的事情\n选定第一个使用场景，写出从保存链接到完成练习的最小流程。\n\n我的取舍\n先保证资料、练习和成果能连起来，再考虑自动推荐更多内容。',
    steps: [
      { id: 'read', title: '理解资料中的基本概念', owner: '我', done: true },
      { id: 'prepare', title: '准备最小应用方案草稿', owner: 'AI', done: true },
      { id: 'work', title: '明确我的使用场景与取舍', owner: '我', done: false },
      { id: 'review', title: '用一份真实资料验证方案', owner: '共同', done: false },
    ],
    ai: { enabled: true, status: 'ready', draft: APP_DRAFT }, revisions: [],
  };
  const practice = { ...newTask('用一篇资料验证学习助手流程', '学习实践', '保存资料、回答一个问题，留下实际练习和改进记录。'), id: 'practice',
    body: '学习助手 · 一次资料验证计划\n\n验证对象\n选择我保存的一份 AI 入门资料，只检验一个概念，不同时加入更多资源。\n\n准备的输入\n资料链接、我想解决的问题，以及当前应用方案里的一个使用场景。\n\n期望输出\n一份能够回到原文的提纲，以及一个用于修改应用方案的小练习。\n\n验证方法\n1. 检查提纲的结论是否有实际资料依据。\n2. 用自己的话解释输入与输出。\n3. 把练习结果写入应用方案，记录还不清楚的地方。\n\n当前阶段\n这是待执行的验证计划，完成练习后再记录实际结果。' };
  const summary = { ...newTask('整理本周学习与应用成果', '写作', '总结一件已用上的知识和一个需要调整的地方。'), id: 'summary',
    body: '本周期学习与应用回顾\n\n本周希望做出的成果\n明确一个个人使用场景，写出应用方案，并用一份资料验证它。\n\n回看的依据\n应用方案正文、学习笔记、实际练习与本人记录的卡点。时长单独回看，不直接代表掌握程度。\n\n要讨论的问题\n1. 哪个知识已经用到我的方案里？\n2. 哪一步耗费最多时间，原因是什么？\n3. 哪些部分值得保留，哪些功能可以先推迟？\n\n下周期调整原则\n先完成一次资料验证，保证每个新步骤都有明确成果，再决定是否扩展功能。\n\n当前阶段\n这是回顾提纲，真实结论在实践后补充。' };
  return {
    version: 1, goal: empty ? '我的个人成长目标' : '两周学会使用 AI，并做出自己的应用方案',
    tasks: empty ? [] : [task, practice, summary],
    schedules: empty ? [] : [
      { id: 'slot-1', taskId: 'application', date: TODAY, start: '10:00', end: '10:45', sync: 'local' },
      { id: 'slot-2', taskId: 'practice', date: TODAY, start: '18:30', end: '19:00', sync: 'local' },
      { id: 'slot-3', taskId: 'application', date: '2026-10-09', start: '10:00', end: '10:45', sync: 'local' },
      { id: 'slot-4', taskId: 'summary', date: '2026-10-11', start: '20:30', end: '21:00', sync: 'local' },
      { id: 'slot-5', taskId: 'practice', date: '2026-10-10', start: '18:30', end: '19:00', sync: 'local' },
    ],
    learning: empty ? [] : [{
      id: 'ai-course', title: '从 AI 基础到一个可用的应用',
      url: 'https://github.com/microsoft/generative-ai-for-beginners',
      aim: '能说明一个 AI 应用的输入、输出和需要验证的部分。',
      notes: '我先理解最小使用流程，不急着接入很多工具。\n输入应该有明确资料，输出应该能用于我的实际工作。',
      practice: '', status: '学习中', taskId: 'application', minutes: 25,
    }],
    reviews: [], reflectionNote: '', reflectionNext: '', planVersion: 1,
    adjustments: [], connection: { connected: false, calendar: false, documents: false },
    preferences: { learningTime: '18:30', reviewTime: '21:00', capacity: 3 },
  };
}
export function safeResourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function loadPersonalDemo(): PersonalDemo {
  try {
    const raw = localStorage.getItem(PERSONAL_DEMO_KEY);
    const data: PersonalDemo | null = raw ? JSON.parse(raw) : null;
    if (data?.version === 1 && typeof data.goal === 'string' && Array.isArray(data.tasks) && Array.isArray(data.schedules)
      && Array.isArray(data.learning) && Array.isArray(data.reviews) && data.connection && data.preferences
      && data.tasks.every(task => typeof task.body === 'string' && Array.isArray(task.steps) && task.ai && Array.isArray(task.revisions))) {
      return { ...data, tasks: data.tasks.map(task => task.ai.status === 'running'
        ? { ...task, ai: { ...task.ai, status: 'waiting' } } : task) };
    }
  } catch { /* Corrupt or inaccessible demo storage does not prevent opening. */ }
  return seedPersonalDemo();
}
export function minuteOfDay(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
export function scheduleDuration(slot: DemoSchedule) { return minuteOfDay(slot.end) - minuteOfDay(slot.start); }
export function calendarWeekDays(offset: number) {
  return WEEK.map(day => {
    const date = new Date(`${day.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    const iso = date.toISOString().slice(0, 10);
    return { ...day, date: iso, number: iso.slice(8) };
  });
}
export function scheduleConflict(slots: DemoSchedule[], date: string, start: string, end: string, exclude = '') {
  return slots.find(slot => slot.id !== exclude && slot.date === date && minuteOfDay(start) < minuteOfDay(slot.end) && minuteOfDay(end) > minuteOfDay(slot.start));
}
