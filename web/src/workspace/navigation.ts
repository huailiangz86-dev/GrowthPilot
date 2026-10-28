export const CORE_NAV = [
  { to: '/app', label: '今日', icon: '⌂', end: true },
  { to: '/app/tasks', label: '工作', icon: '▤', end: false },
  { to: '/app/learning', label: '学习', icon: '✳', end: false },
  { to: '/app/growth', label: '成长', icon: '◌', end: false },
  { to: '/app/mine', label: '我的', icon: '◎', end: false },
];
export const NAV_GROUPS = [
  { label: '个人成长', items: CORE_NAV },
  { label: '工作与行动', items: [
    { to: '/app/execution', label: '执行与应用', icon: '↻', end: false },
    { to: '/app/workspace', label: '工作台', icon: '▦', end: false },
    { to: '/app/data', label: '记录', icon: '▤', end: false },
    { to: '/app/agent', label: 'AI 助手', icon: '✳', end: false },
    { to: '/app/evening', label: '日复盘', icon: '↗', end: false },
    { to: '/app/insights', label: '成长分析', icon: '◌', end: false },
    { to: '/app/knowledge', label: '知识库', icon: '▤', end: false },
  ] },
  { label: '能力', items: [
    { to: '/app/apps', label: '应用中心', icon: '⊞', end: false },
    { to: '/app/extensions', label: '扩展能力', icon: '✦', end: false },
  ] },
  { label: '生活与习惯', items: [
    { to: '/app/fitness', label: '健身档案', icon: '↗', end: false },
  ] },
];
