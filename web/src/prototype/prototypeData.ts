export type Screen = 'today' | 'data' | 'agent' | 'analysis' | 'mine';
export type EntryKind = '工作' | '学习' | '状态';
export interface Entry {
  id: string; date: string; time: string; kind: EntryKind; title: string; content: string;
  minutes?: number; energy?: number; goal: string;
  syncState?: 'local' | 'syncing' | 'failed' | 'synced';
}
export interface Action {
  id: string; title: string; date: string; done: boolean; minutes: number; source: string;
}
export interface Message {
  id: string; role: 'user' | 'agent'; content: string; sourceIds?: string[]; suggestion?: string;
}
export interface PrototypeState {
  version: 1; entries: Entry[]; actions: Action[]; messages: Message[]; sources: string[];
}
export const DEMO_DATE = '2026-10-07';
export const STORAGE_KEY = 'gp_mobile_design_prototype_v1';
export const SCREENS: Array<{id: Screen; name: string; english: string; purpose: string; details: string[]}> = [
  {id: 'today', name: '今日', english: 'Today', purpose: '每次打开，都知道从哪里开始。', details: ['一个主要记录入口，减少选择负担。', '行动完成后自动留下结果，回到数据时间线。', '只呈现一条有依据的 Agent 提示。']},
  {id: 'data', name: '数据', english: 'Your story', purpose: '留下的每条事实，都能再次被理解。', details: ['按日期和类型整理原始记录。', '原文与同步状态可回看，失败后重试同一条。', '一键携带记录进入 Agent 对话。']},
  {id: 'agent', name: 'Agent', english: 'Your companion', purpose: '对话有上下文，建议有去处。', details: ['引用卡可以展开原始记录。', '建议先审阅，再确认加入行动。', '会话在原型中可刷新恢复。']},
  {id: 'analysis', name: '分析', english: 'See the pattern', purpose: '先看清发生了什么，再讨论为什么。', details: ['统计直接来自这版原型中的事实。', '时间范围、单位与覆盖天数可见。', '带着报告继续对话，确认新的行动。']},
  {id: 'mine', name: '我的', english: 'Your space', purpose: '数据范围和使用节奏，由自己决定。', details: ['个人数据与偏好集中管理。', '原型数据和真实账户分开。', '可重置示例，重新体验完整闭环。']},
];
export const REFERENCES = [
  {name: 'Rosebud', type: '直接竞品', focus: '对话式记录 + 长期理解', url: 'https://www.rosebud.app/', evidence: 'https://help.rosebud.app/ai-analysis/weekly-report', fact: 'AI 日记将记录与持续对话结合，周报告回顾写作、情绪与主题。', take: '把记录视为对话起点；让周回顾能继续讨论。', visual: '清楚的记录入口、历史列表与个人洞察层级。'},
  {name: 'Mindsera', type: '直接竞品', focus: '个人记录 + AI 洞察', url: 'https://mindsera.com/', evidence: 'https://mindsera.com/help/getting-started/dashboard', fact: '支持文字、语音、扫描记录，提供晨晚流程、日记问答和分析入口。', take: '低负担采集；从已有记录进入带上下文的对话。', visual: '大留白、简洁编辑器、采集与洞察分层。'},
  {name: 'Exist', type: '相邻竞品', focus: '个人数据 + 行为分析', url: 'https://exist.io/', evidence: 'https://exist.io/', fact: '结合手动记录与外部服务同步，展示趋势、统计关系和周摘要。', take: '明确指标口径与数据覆盖；区分相关性和原因。', visual: '简洁数值、趋势视图和具体的数据来源。'},
  {name: 'Day One', type: '采集 UI 参考', focus: '记录与回看', url: 'https://dayoneapp.com/', evidence: 'https://dayoneapp.com/guides/day-one-for-mac/journal-views-in-day-one-for-macos/', fact: '通过时间线、日历、媒体和地图提供不同的记录回看视角。', take: '用时间线组织事实；原始内容始终可以展开。', visual: '日期分组、阅读留白与轻量记录详情。'},
  {name: 'Oura Advisor', type: '分析与对话参考', focus: '数据驱动的个人助手', url: 'https://go.ouraring.com/madeformembers/', evidence: 'https://ouraringhelp.zendesk.com/hc/en-us/articles/39512345699219-Oura-Advisor', fact: '围绕个人健康数据提供对话式解释与支持，连接指标和个人目标。', take: '从分析直接发起上下文对话；再形成小步调整。', visual: '指标摘要、建议问题和分析到对话的入口。'},
  {name: 'Linear Mobile', type: '行动 UI 参考', focus: '手机上的轻量执行', url: 'https://linear.app/changelog/2024-09-19-introducing-linear-mobile', evidence: 'https://linear.app/docs/inbox', fact: '移动端支持查看更新、创建事项和处理需要关注的工作。', take: '确认建议后得到清楚的行动卡与完成反馈。', visual: '克制的图标、行式列表和就地操作。'},
];

export function makeSeed(): PrototypeState {
  const learningMinutes = [20, 45, 30, 25, 35, 30, 25];
  const notes = [
    ['确定这一周的主线', '这一周先做完产品的核心流程，不同时开启太多支线。'],
    ['今天有点累，想把节奏放慢', '下午的能量不高。做完最小的一步之后，早点收尾。'],
    ['几件事来回切换', '上午在三个任务间来回切换，最终没有完成首页草图。'],
    ['先关掉消息，再做一个小任务', '留出一个不看消息的时段，做完了记录页的第一版。'],
    ['把最重要的事放在前面', '先做清楚的数据入口，再想扩展能力，推进起来更顺。'],
    ['发现分析需要更多原始依据', '只看数字不够，还是要能回到当时的记录，理解发生了什么。'],
    ['今天留出一点专注时间', '今天想先完成一个小步骤，不给自己安排太满。'],
  ];
  const entries: Entry[] = [];
  for (let index = 0; index < 7; index++) {
    const date = `2026-10-0${index + 1}`;
    entries.push({id: `note-${index + 1}`, date, time: '14:20', kind: index === 1 ? '状态' : '工作', title: notes[index][0], content: notes[index][1], energy: [4, 2, 3, 4, 4, 3, 4][index], goal: '产品交付'});
    entries.push({id: `learning-${index + 1}`, date, time: '09:40', kind: '学习', title: ['读一章，记住一个方法', '学习如何组织访谈问题', '留下今天的阅读笔记', '理解一个用户研究案例', '整理这周学到的方法', '读完一段产品设计资料', '阅读 25 分钟，记下一点收获'][index], content: `今天学习了 ${learningMinutes[index]} 分钟。把有用的方法记下来，准备在下一次产品设计中试试。`, minutes: learningMinutes[index], goal: '稳定学习'});
  }
  const titles = ['整理用户访谈笔记', '画一版记录页', '留下一条晚间复盘'];
  const actions: Action[] = Array.from({length: 18}, (_, index) => ({
    id: `action-${index}`, title: index >= 15 ? ['整理今天的学习笔记', '确认记录页的核心流程', '留出 25 分钟专注时间'][index - 15] : titles[index % 3],
    date: index >= 15 ? DEMO_DATE : `2026-10-0${Math.floor(index / 3) + 1}`, done: index < 10 || index === 15 || index === 16,
    minutes: 25, source: '用户确认',
  }));
  return {version: 1, entries: entries.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)), actions, messages: [], sources: ['工作', '学习', '状态']};
}

export function loadPrototype(): PrototypeState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) as PrototypeState : null;
    if (data?.version === 1 && Array.isArray(data.entries) && Array.isArray(data.actions) && Array.isArray(data.messages) && Array.isArray(data.sources)) return {...data, entries: data.entries.map(entry => entry.syncState === 'syncing' ? {...entry, syncState: 'local'} : entry)};
  } catch { /* A damaged demo never prevents opening the design. */ }
  return makeSeed();
}

export function makeId() { return globalThis.crypto.randomUUID(); }
