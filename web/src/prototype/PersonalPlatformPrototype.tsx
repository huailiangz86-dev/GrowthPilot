import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  APP_DRAFT, PERSONAL_DEMO_KEY, PERSONAL_NAV, TODAY, calendarWeekDays, loadPersonalDemo, minuteOfDay,
  newTask, safeResourceUrl, scheduleConflict, scheduleDuration, seedPersonalDemo,
  type DemoLearning, type DemoSchedule, type DemoTask, type PersonalDemo, type PersonalScreen, type TaskTemplate,
} from './personalPlatformData';
import './PersonalPlatformPrototype.css';

type IconName = PersonalScreen | 'arrow' | 'plus' | 'clock' | 'spark' | 'link' | 'close' | 'check' | 'calendar';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    today: <><path d="m3 10 9-7 9 7v10H4V10M9 21v-7h6v7" /></>,
    work: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4M16 2v4M8 11h8M8 15h6" /></>,
    learn: <><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v15" /></>,
    growth: <><path d="M4 20V4M4 20h17M8 15l4-6 4 3 5-8" /></>,
    mine: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, plus: <path d="M12 5v14M5 12h14" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />,
    link: <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />, check: <path d="m5 12 4 4L19 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
type Sheet = 'task' | 'schedule' | 'resource' | 'connect' | 'agent' | 'reset' | 'document' | null;
type Scenario = 'normal' | 'storage' | 'ai' | 'sync';
const RUN_LABELS = { waiting: '待准备', running: '正在整理 · 模拟', ready: '草稿已就绪 · 示例', error: '整理失败 · 模拟', paused: '已暂停' };
const STATUS_LABELS = { todo: '待开始', doing: '进行中', done: '已完成' };

export default function PersonalPlatformPrototype() {
  const [state, setDemoState] = useState(loadPersonalDemo);
  const stateRef = useRef(state);
  const [params, setParams] = useSearchParams();
  const requested = params.get('page');
  const screen: PersonalScreen = PERSONAL_NAV.some(item => item.id === requested) ? requested as PersonalScreen : 'today';
  const activeId = params.get('task');
  const task = state.tasks.find(item => item.id === activeId) ?? null;
  const [workView, setWorkView] = useState<'tasks' | 'calendar'>('tasks');
  const [weekOffset, setWeekOffset] = useState(0);
  const calendarDays = calendarWeekDays(weekOffset);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(TODAY);
  const activeCalendarDate = calendarDays.some(day => day.date === selectedCalendarDate) ? selectedCalendarDate : calendarDays[0].date;
  const [taskView, setTaskView] = useState<'content' | 'steps' | 'schedule'>('content');
  const [growthView, setGrowthView] = useState<'plan' | 'review' | 'week'>('plan');
  const [learningId, setLearningId] = useState('ai-course');
  const learning = state.learning.find(item => item.id === learningId) ?? state.learning[0];
  const [sheet, setSheet] = useState<Sheet>(null);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [template, setTemplate] = useState<TaskTemplate>('方案');
  const [criterion, setCriterion] = useState('');
  const [slotId, setSlotId] = useState('');
  const [slotTaskId, setSlotTaskId] = useState('application');
  const [slotDate, setSlotDate] = useState(TODAY);
  const [slotStart, setSlotStart] = useState('15:00');
  const [slotEnd, setSlotEnd] = useState('15:45');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceAim, setResourceAim] = useState('');
  const [resourceTaskId, setResourceTaskId] = useState('application');
  const [connectStep, setConnectStep] = useState(1);
  const [allowCalendar, setAllowCalendar] = useState(true);
  const [allowDocuments, setAllowDocuments] = useState(true);
  const [agentInput, setAgentInput] = useState('');
  const [agentAnswer, setAgentAnswer] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState(false);
  const [receiptTaskId, setReceiptTaskId] = useState('');
  const [resetEmpty, setResetEmpty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const isInitial = useRef(true);
  const agentTimer = useRef<number | null>(null);
  const pending = state.tasks.filter(item => item.status !== 'done');
  const focusTask = pending[0] ?? state.tasks[0];
  const readyTasks = state.tasks.filter(item => item.ai.status === 'ready' && item.ai.draft);
  const todaySlots = state.schedules.filter(item => item.date === TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const totalTodayMinutes = todaySlots.reduce((total, slot) => total + scheduleDuration(slot), 0);
  const resourceCount = state.learning.length;
  const applyCount = state.learning.filter(item => item.status === '已应用').length;

  const setState = useCallback((update: PersonalDemo | ((previous: PersonalDemo) => PersonalDemo)) => {
    const next = typeof update === 'function' ? update(stateRef.current) : update;
    stateRef.current = next;
    setDemoState(next);
    try {
      if (scenario === 'storage') throw new Error('模拟保存失败');
      localStorage.setItem(PERSONAL_DEMO_KEY, JSON.stringify(next));
      setStorageError('');
    } catch { setStorageError('内容仍在当前页面，暂未保存在浏览器。请重试后再离开。'); }
  }, [scenario]);

  useEffect(() => {
    try {
      if (scenario === 'storage') throw new Error('模拟保存失败');
      localStorage.setItem(PERSONAL_DEMO_KEY, JSON.stringify(state));
      setStorageError('');
    } catch { setStorageError('内容仍在当前页面，暂未保存在浏览器。请重试后再离开。'); }
  }, [state, scenario]);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen, activeId]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => () => { if (agentTimer.current) window.clearTimeout(agentTimer.current); }, []);

  // The prototype simulates work only while this page is open; no real AI or tool is called.
  useEffect(() => {
    const eligible = state.tasks.filter(item => item.ai.enabled && item.ai.status === 'waiting');
    if (!eligible.length) return;
    const ids = new Set(eligible.map(item => item.id));
    setState(previous => ({ ...previous, tasks: previous.tasks.map(item => ids.has(item.id)
      ? { ...item, ai: { ...item.ai, status: 'running' } } : item) }));
  }, [state.tasks, setState]);
  useEffect(() => {
    const runningIds = state.tasks.filter(item => item.ai.enabled && item.ai.status === 'running').map(item => item.id);
    if (!runningIds.length) return;
    const timer = window.setTimeout(() => {
      setState(previous => ({ ...previous, tasks: previous.tasks.map(item => !runningIds.includes(item.id) || !item.ai.enabled || item.ai.status !== 'running' ? item
        : { ...item, ai: { ...item.ai, status: scenario === 'ai' ? 'error' : 'ready', draft: scenario === 'ai' ? '' : item.id === 'application' ? APP_DRAFT
          : `${item.title} · 内容提纲（预设示例）\n\n目标\n${item.criterion}\n\n工作步骤\n1. 选取一份与当前问题有关的资料，保留出处。\n2. 写出自己的判断或完成一次练习。\n3. 对照完成标准检查结果，记录下一步。\n\n请补充你的实际内容，提纲本身不代表工作完成。` },
          steps: item.steps.map(step => step.owner === 'AI' ? { ...step, done: scenario !== 'ai' } : step) } ) }));
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [state.tasks, scenario, setState]);

  function go(page: PersonalScreen, id?: string) {
    setParams(id ? { page, task: id } : { page });
    setSheet(null);
    setTaskView('content');
  }
  function openSheet(next: Sheet) { setFormError(''); setSheet(next); }
  function updateTask(id: string, update: (item: DemoTask) => DemoTask) {
    setState(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === id ? update(item) : item) }));
  }
  function updateLearning(id: string, update: (item: DemoLearning) => DemoLearning) {
    setState(previous => ({ ...previous, learning: previous.learning.map(item => item.id === id ? update(item) : item) }));
  }
  function createTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    const created = newTask(taskTitle.trim(), template, criterion.trim());
    setState(previous => ({ ...previous, tasks: [...previous.tasks, created] }));
    setTaskTitle(''); setCriterion(''); go('work', created.id);
    setNotice('工作页面已建立，可以直接写内容。');
  }
  function openSchedule(item?: DemoSchedule, id = task?.id ?? focusTask?.id ?? '') {
    setSlotId(item?.id ?? ''); setSlotTaskId(item?.taskId ?? id);
    setSlotDate(item?.date ?? (screen === 'work' && !task && workView === 'calendar' ? activeCalendarDate : TODAY)); setSlotStart(item?.start ?? '15:00'); setSlotEnd(item?.end ?? '15:45');
    openSheet('schedule');
  }
  function saveSchedule(event: FormEvent) {
    event.preventDefault();
    if (!slotTaskId || !state.tasks.some(item => item.id === slotTaskId)) { setFormError('请先选择一件工作。'); return; }
    if (!slotDate || !slotStart || !slotEnd || minuteOfDay(slotEnd) <= minuteOfDay(slotStart)) { setFormError('结束时间需要晚于开始时间。跨日工作请拆成两个时段。'); return; }
    const conflict = scheduleConflict(state.schedules, slotDate, slotStart, slotEnd, slotId);
    if (conflict) {
      setFormError(`与 ${conflict.start}–${conflict.end} 的“${state.tasks.find(item => item.id === conflict.taskId)?.title ?? '已有安排'}”冲突，请选择另一时段。`);
      return;
    }
    const slot: DemoSchedule = { id: slotId || crypto.randomUUID(), taskId: slotTaskId, date: slotDate, start: slotStart, end: slotEnd,
      sync: state.connection.connected && state.connection.calendar ? scenario === 'sync' ? 'failed' : 'simulated' : 'local' };
    setState(previous => ({ ...previous, schedules: [...previous.schedules.filter(item => item.id !== slot.id), slot] }));
    setSheet(null); setNotice(slot.sync === 'failed' ? '本地安排已保留，飞书同步失败为模拟状态，可重试。' : '时间已安排，工作正文保持原样。');
  }
  function addResource(event: FormEvent) {
    event.preventDefault();
    if (!resourceTitle.trim()) { setFormError('请填写资料名称。'); return; }
    const url = safeResourceUrl(resourceUrl);
    if (!url) { setFormError('请填写完整的 http 或 https 资料链接。'); return; }
    const item: DemoLearning = { id: crypto.randomUUID(), title: resourceTitle.trim(), url, aim: resourceAim.trim(), notes: '', practice: '', status: '待学', taskId: resourceTaskId, minutes: 0 };
    setState(previous => ({ ...previous, learning: [...previous.learning, item] }));
    setLearningId(item.id); setResourceTitle(''); setResourceUrl(''); setResourceAim(''); go('learn');
    setNotice('资料链接已保存。原型不读取或概括你填写的网站内容。');
  }
  function adoptDraft(item: DemoTask) {
    updateTask(item.id, current => ({ ...current, body: `${current.body}\n\n—— 已采用的 AI 草稿（示例）——\n\n${current.ai.draft}`,
      revisions: [...current.revisions.slice(-7), { body: current.body, label: '加入 AI 草稿前' }], ai: { ...current.ai, draft: '' } }));
    setNotice('草稿已加入正文，之前的内容可以从版本中恢复。');
  }
  function connect() {
    if (!allowCalendar && !allowDocuments) { setFormError('请至少选择一种能力来体验。'); return; }
    setState(previous => ({ ...previous, connection: { connected: true, calendar: allowCalendar, documents: allowDocuments },
      schedules: previous.schedules.map(slot => ({ ...slot, sync: allowCalendar ? scenario === 'sync' ? 'failed' : 'simulated' : 'local' })) }));
    setSheet(null); setNotice('飞书连接流程已模拟完成，没有连接真实账号。');
  }
  function retrySync() {
    if (!state.connection.connected || !state.connection.calendar) return;
    setState(previous => ({ ...previous, schedules: previous.schedules.map(slot => slot.sync === 'failed'
      ? { ...slot, sync: scenario === 'sync' ? 'failed' : 'simulated' } : slot) }));
    setNotice(scenario === 'sync' ? '模拟同步仍失败，本地安排保留。切换为正常情境后可恢复。' : '同步已模拟恢复，安排没有重复创建。');
  }
  function askAgent(event: FormEvent) {
    event.preventDefault();
    if (!agentInput.trim() || agentBusy) return;
    setAgentBusy(true); setAgentError(false); setAgentAnswer('');
    agentTimer.current = window.setTimeout(() => {
      setAgentBusy(false);
      if (scenario === 'ai') { setAgentError(true); return; }
      const current = task ?? focusTask;
      setAgentAnswer(current ? `围绕“${current.title}”，先完成一个可验证的最小结果。\n\n当前完成标准：${current.criterion}\n\n你已经有 ${current.body.trim().length} 字工作内容、${state.learning.filter(item => item.taskId === current.id).length} 份关联资料。建议先补充自己的使用场景，再安排一次练习验证。\n\n这是一条基于原型状态的预设建议，没有调用真实模型。` : '先写下这周想完成的一件事，再保存一份学习资料，安排一个可以实际投入的时段。这是原型预设建议。');
    }, 900);
  }
  function saveReview(event: FormEvent) {
    event.preventDefault();
    setState(previous => ({ ...previous, reviews: [...previous.reviews.filter(item => item.date !== TODAY),
      { date: TODAY, note: previous.reflectionNote.trim(), next: previous.reflectionNext.trim() }] }));
    setNotice('今天的复盘已保留，已有成果直接引用，无需再抄一遍。');
  }
  function applyAdjustment() {
    setState(previous => {
      const practiceId = previous.tasks.find(item => item.id === 'practice' && item.status !== 'done')?.id
        ?? previous.tasks.find(item => item.status !== 'done')?.id;
      const future = previous.schedules.find(slot => slot.taskId === practiceId && slot.date > TODAY);
      const conflict = scheduleConflict(previous.schedules, '2026-10-12', '18:30', '19:00', future?.id);
      const schedules = practiceId && !conflict ? [...previous.schedules.filter(slot => slot.id !== future?.id),
        { id: future?.id ?? crypto.randomUUID(), taskId: practiceId, date: '2026-10-12', start: '18:30', end: '19:00',
          sync: previous.connection.connected && previous.connection.calendar ? scenario === 'sync' ? 'failed' as const : 'simulated' as const : 'local' as const }] : previous.schedules;
      return { ...previous, planVersion: previous.planVersion + 1,
        adjustments: [...previous.adjustments, `下一周期收敛到一次资料验证；${conflict ? '建议时段有冲突，时间需另行选择；' : practiceId ? '10 月 12 日 18:30 已留出练习时段；' : ''}保留学习与复盘，暂缓增加新功能。`], schedules };
    });
    setNotice('下周重点已调整，已完成内容和今天的安排都保留。');
  }
  const nav = <nav aria-label="个人平台主导航">{PERSONAL_NAV.map(item => <button key={item.id} aria-current={screen === item.id ? 'page' : undefined} className={screen === item.id ? 'active' : ''} onClick={() => go(item.id)}><Icon name={item.id} /><span>{item.label}<small>{item.detail}</small></span></button>)}</nav>;
  const saveLabel = storageError ? '暂未保存' : '已保存在此浏览器';
  const openReview = () => { setGrowthView('review'); go('growth'); };
  const slotRows = (slots: DemoSchedule[]) => slots.length ? <div className="pp-agenda">{slots.map(slot => <div className="pp-agenda-row" key={slot.id}><span className="pp-agenda-time">{slot.start}<small>{slot.end}</small></span><button className="pp-agenda-content" onClick={() => go('work', slot.taskId)}><strong>{state.tasks.find(item => item.id === slot.taskId)?.title}</strong><small>{scheduleDuration(slot)} 分钟 · {slot.date === TODAY ? '今天' : slot.date.slice(5)}{slot.sync === 'simulated' ? ' · 飞书同步示例' : slot.sync === 'failed' ? ' · 同步失败示例' : ''}</small></button><button className="pp-text-button" onClick={() => openSchedule(slot)}>改期</button></div>)}</div>
    : <div className="pp-empty"><Icon name="calendar" /><p>给这件事留一个真正可用的时间段。</p><button className="pp-secondary" onClick={() => state.tasks.length ? openSchedule() : openSheet('task')}>{state.tasks.length ? '安排时间' : '创建第一件工作'}</button></div>;

  return <div className="pp-platform">
    <a className="pp-skip" href="#pp-main">跳到内容</a>
    <aside className="pp-sidebar"><a className="pp-brand" href="/prototype/personal"><span>g.</span><strong>GrowthPilot<small>个人能力与成长</small></strong></a><div className="pp-space"><span className="pp-avatar">我</span><div>我的空间<small>专注工作，也持续成长</small></div></div>{nav}<div className="pp-sidebar-bottom"><button onClick={() => openSheet('agent')}><Icon name="spark" /> 和 AI 一起想一想</button><span>个人平台 · C0 交互原型</span><a href="/app">返回当前工作台 <Icon name="arrow" size={14} /></a></div></aside>
    <div className="pp-shell"><header className="pp-topbar"><span className="pp-mobile-brand">g.</span><div>我的空间<span>/</span><strong>{PERSONAL_NAV.find(item => item.id === screen)?.label}</strong></div><button className="pp-ai-button" onClick={() => openSheet('agent')}><Icon name="spark" size={17} /> AI 助手</button></header>
      <div className="pp-prototype-note"><span><i />交互原型 · 示例数据仅保存在当前浏览器，AI 与飞书连接为模拟。</span><details><summary>体验不同状态</summary><div className="pp-scenarios"><label>运行情境<select aria-label="运行情境" value={scenario} onChange={event => setScenario(event.target.value as Scenario)}><option value="normal">正常体验</option><option value="storage">浏览器保存失败</option><option value="ai">AI 整理失败</option><option value="sync">飞书同步失败</option></select></label><button onClick={() => { setResetEmpty(true); openSheet('reset'); }}>体验空工作台</button><button onClick={() => { setResetEmpty(false); openSheet('reset'); }}>恢复初始示例</button></div></details></div>
      {storageError && <div className="pp-error pp-storage" role="alert">{storageError}<button onClick={() => setScenario('normal')}>重试保存</button></div>}
      <main id="pp-main" className="pp-main">
        {screen === 'today' && <>
          <div className="pp-page-heading"><div><span className="pp-eyebrow">10 月 08 日，周四 · 示例日期</span><h1 ref={heading} tabIndex={-1}>今天，继续把想法做出来。</h1><p>留出时间，做出成果，再看见自己的进步。</p></div><button className="pp-primary" onClick={() => openSheet('task')}><Icon name="plus" size={17} /> 新建工作</button></div>
          {!state.tasks.length ? <div className="pp-welcome"><span className="pp-eyebrow">从一件事开始</span><h2>这周，你想完成什么？</h2><p>写一句话，建立可以继续写内容、安排时间的工作页面。</p><button className="pp-primary" onClick={() => openSheet('task')}>创建第一件工作 <Icon name="arrow" /></button></div> : <div className="pp-today-grid">
            <section className="pp-focus"><div className="pp-section-label"><span>继续上次的工作</span><span className="pp-chip">{focusTask && STATUS_LABELS[focusTask.status]}</span></div><h2>{focusTask?.title}</h2><p>{focusTask?.criterion}</p><div className="pp-focus-excerpt">{focusTask?.body.split('\n').filter(Boolean).slice(1, 4).join('\n')}</div><button className="pp-primary" onClick={() => focusTask && go('work', focusTask.id)}>进入工作正文 <Icon name="arrow" size={18} /></button><div className="pp-focus-footer"><span>关联目标</span><button onClick={() => go('growth')}>{state.goal}</button></div></section>
            <section className="pp-today-agenda"><div className="pp-section-label"><h2>今天的安排</h2><button className="pp-text-button" onClick={() => { setWorkView('calendar'); go('work'); }}>日历 <Icon name="arrow" size={14} /></button></div>{slotRows(todaySlots)}<div className="pp-capacity"><Icon name="clock" size={16} /><span>已安排 {totalTodayMinutes} 分钟，实际投入另行记录</span></div><button className="pp-text-button" onClick={() => openSchedule()}>＋ 留一个工作时段</button></section>
          </div>}
          {state.tasks.length > 0 && <><div className="pp-section-heading"><h2>今天值得推进的事</h2><span>最多 {state.preferences.capacity} 个重点</span></div><div className="pp-priority-list">{pending.slice(0, state.preferences.capacity).map((item, index) => <button key={item.id} onClick={() => go('work', item.id)}><span className="pp-number">0{index + 1}</span><div><strong>{item.title}</strong><small>{item.template} · {item.steps.filter(step => step.done).length}/{item.steps.length} 个步骤已有结果</small></div><Icon name="arrow" size={17} /></button>)}</div>
          <div className="pp-bottom-grid"><section className="pp-learning-nudge"><span className="pp-eyebrow">把学习用起来</span><h3>{learning?.title ?? '从一份资料开始'}</h3><p>{learning?.aim ?? '填写链接，留一段笔记，再安排一次实践。'}</p><button className="pp-text-button" onClick={() => go('learn')}>继续学习与实践 <Icon name="arrow" size={15} /></button></section><section className="pp-review-nudge"><span className="pp-eyebrow">今晚的复盘</span><h3>成果已在这里，补一句自己的感受。</h3><p>{readyTasks.length} 份 AI 草稿示例 · {state.tasks.filter(item => item.status === 'done').length} 件完成工作 · {applyCount} 次学习应用</p><button className="pp-text-button" onClick={openReview}>进入日复盘 <Icon name="arrow" size={15} /></button></section></div></>}
        </>}

        {screen === 'work' && !task && <>
          <div className="pp-page-heading"><div><span className="pp-eyebrow">工作内容与实际成果</span><h1 ref={heading} tabIndex={-1}>每件事，都有继续工作的地方。</h1><p>打开正文、处理步骤，或为它留出时间。</p></div><button className="pp-primary" onClick={() => openSheet('task')}><Icon name="plus" size={17} /> 新建工作</button></div>
          <div className="pp-tabs" aria-label="工作视图"><button aria-pressed={workView === 'tasks'} className={workView === 'tasks' ? 'active' : ''} onClick={() => setWorkView('tasks')}>任务与内容</button><button aria-pressed={workView === 'calendar'} className={workView === 'calendar' ? 'active' : ''} onClick={() => setWorkView('calendar')}><Icon name="calendar" size={16} /> 周日历</button></div>
          {workView === 'tasks' ? <><div className="pp-work-summary"><span className="pp-eyebrow">当前个人项目</span><h2>{state.goal}</h2><p>{pending.length} 件待推进 · {resourceCount} 份学习资料 · 内容与时间共同服务于这个目标</p></div><div className="pp-work-list">{state.tasks.map(item => <button className="pp-work-row" key={item.id} onClick={() => go('work', item.id)}><span className={`pp-task-mark ${item.status === 'done' ? 'done' : ''}`}>{item.status === 'done' ? <Icon name="check" /> : <Icon name="work" />}</span><div><strong>{item.title}</strong><p>{item.criterion}</p><small>{item.template} · {item.body.trim().length} 字正文 · {state.schedules.filter(slot => slot.taskId === item.id).length} 个工作时段</small></div><span className="pp-chip">{STATUS_LABELS[item.status]}</span><Icon name="arrow" size={17} /></button>)}</div>{!state.tasks.length && <div className="pp-empty"><h2>先建立一件工作。</h2><p>写一句话就可以开始，不需要先配置项目。</p><button className="pp-primary" onClick={() => openSheet('task')}>新建工作</button></div>}</>
            : <><div className="pp-calendar-heading"><div><h2>{calendarDays[0].date} – {calendarDays[6].date}</h2><p>示例周 · {state.schedules.filter(slot => calendarDays.some(day => day.date === slot.date)).length} 个已安排时段 · 时区 Asia/Shanghai</p></div><div className="pp-calendar-actions"><button className="pp-icon-button" aria-label="上一周" onClick={() => setWeekOffset(value => value - 1)}>←</button><button className="pp-text-button" onClick={() => setWeekOffset(0)}>本周</button><button className="pp-icon-button" aria-label="下一周" onClick={() => setWeekOffset(value => value + 1)}>→</button><button className="pp-secondary" onClick={() => state.tasks.length ? openSchedule() : openSheet('task')}>安排时间</button></div></div><div className="pp-week-calendar" aria-label="本周工作时间安排">{calendarDays.map(day => <section key={day.date} className={day.date === TODAY ? 'current' : ''}><header><span>{day.day}</span><strong>{day.number}</strong></header><div>{state.schedules.filter(slot => slot.date === day.date).sort((a, b) => a.start.localeCompare(b.start)).map(slot => <button className="pp-calendar-event" key={slot.id} onClick={() => openSchedule(slot)}><time>{slot.start}–{slot.end}</time><strong>{state.tasks.find(item => item.id === slot.taskId)?.title}</strong><small>{slot.sync === 'simulated' ? '飞书同步示例' : slot.sync === 'failed' ? '同步失败示例' : '个人工作时段'}</small></button>)}</div></section>)}</div><div className="pp-mobile-calendar"><div className="pp-day-selector" aria-label="选择日历日期">{calendarDays.map(day => <button key={day.date} aria-label={day.date} aria-pressed={activeCalendarDate === day.date} className={activeCalendarDate === day.date ? 'active' : ''} onClick={() => setSelectedCalendarDate(day.date)}><span>{day.day}</span><strong>{day.number}</strong></button>)}</div><h3>{activeCalendarDate} 的安排</h3>{slotRows(state.schedules.filter(slot => slot.date === activeCalendarDate).sort((a,b) => a.start.localeCompare(b.start)))}</div><div className="pp-inline-note"><Icon name="clock" size={18} /><p>日历显示计划时间。时段结束后保留未完成内容，可以继续或改期。</p></div>{state.schedules.some(slot => slot.sync === 'failed') && <div className="pp-error" role="alert">飞书同步失败示例，本地安排仍然保留。<button onClick={retrySync}>重试同步</button></div>}</>}
        </>}

        {screen === 'work' && task && <>
          <button className="pp-back" onClick={() => go('work')}>← 所有工作</button><div className="pp-page-heading pp-task-heading"><div><span className="pp-eyebrow">{task.template} / 我的空间</span><h1 ref={heading} tabIndex={-1}>{task.title}</h1><p>{task.criterion}</p></div><button className="pp-secondary" onClick={() => updateTask(task.id, item => ({ ...item, status: item.status === 'done' ? 'doing' : 'done' }))}>{task.status === 'done' ? '重新继续' : '记录工作完成'}</button></div>
          <div className="pp-task-meta"><span className="pp-chip">{STATUS_LABELS[task.status]}</span>{task.dueDate && <span>截止 {task.dueDate.slice(5)}</span>}<button onClick={() => openSchedule() }><Icon name="calendar" size={15} /> {state.schedules.filter(slot => slot.taskId === task.id).length} 个时段</button><button onClick={() => go('growth')}>目标与计划 ↗</button><span className={storageError ? 'pp-warning' : ''}>{saveLabel}</span></div>
          <div className="pp-tabs"><button aria-pressed={taskView === 'content'} className={taskView === 'content' ? 'active' : ''} onClick={() => setTaskView('content')}>工作正文</button><button aria-pressed={taskView === 'steps'} className={taskView === 'steps' ? 'active' : ''} onClick={() => setTaskView('steps')}>步骤与分工</button><button aria-pressed={taskView === 'schedule'} className={taskView === 'schedule' ? 'active' : ''} onClick={() => setTaskView('schedule')}>时间安排</button></div>
          <div className="pp-document-layout"><section className="pp-document">
            {taskView === 'content' && <><div className="pp-document-toolbar"><span>工作正文</span><span>{task.body.trim().length} 字 · 自动保存示例</span></div><label className="pp-editor-label"><span className="pp-sr-only">任务工作正文</span><textarea className="pp-document-editor" aria-label="任务工作正文" value={task.body} onChange={event => updateTask(task.id, item => ({ ...item, body: event.target.value, status: item.status === 'todo' ? 'doing' : item.status }))} spellCheck={false} /></label><div className="pp-document-foot"><span>写下你的内容、判断和真实结果。</span><button className="pp-text-button" onClick={() => openSheet('agent')}>让 AI 帮我整理</button></div>{task.revisions.length > 0 && <details className="pp-version"><summary>保留的内容版本 · {task.revisions.length}</summary>{task.revisions.map((revision, index) => <div key={index}><span>{revision.label} · {revision.body.length} 字</span><button onClick={() => updateTask(task.id, current => ({ ...current, body: revision.body,
              revisions: [...current.revisions.filter((_, i) => i !== index), { body: current.body, label: '恢复版本前' }] }))}>恢复这个版本</button></div>)}</details>}</>}
            {taskView === 'steps' && <><div className="pp-document-toolbar"><span>明确每一步由谁完成</span><span>{task.steps.filter(step => step.done).length}/{task.steps.length}</span></div><div className="pp-step-list">{task.steps.map(step => <div key={step.id}><span className={`pp-step-dot ${step.done ? 'done' : ''}`}>{step.done ? <Icon name="check" size={14} /> : null}</span><div><strong>{step.title}</strong><small>{step.owner === 'AI' ? 'AI 整理后提供草稿，由我决定采用' : step.owner === '共同' ? 'AI 协助检查，我确认实际结果' : '需要我实际完成'}</small></div><span className="pp-chip">{step.owner}</span>{step.owner !== 'AI' && <button className="pp-text-button" onClick={() => updateTask(task.id, current => ({ ...current, steps: current.steps.map(item => item.id === step.id ? { ...item, done: !item.done } : item) }))}>{step.done ? '重开' : '确认结果'}</button>}</div>)}</div><p className="pp-inline-description">AI 的草稿与本人的学习、判断分别记录，整项工作的完成由实际结果决定。</p></>}
            {taskView === 'schedule' && <><div className="pp-document-toolbar"><span>为工作留出时间</span><button className="pp-text-button" onClick={() => openSchedule()}>＋ 添加时段</button></div>{slotRows(state.schedules.filter(slot => slot.taskId === task.id).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)))}</>}
          </section><aside className="pp-work-rail"><details className="pp-task-properties"><summary>任务信息与完成标准</summary><label className="pp-field"><span>标题</span><input aria-label="修改工作标题" maxLength={180} value={task.title} onChange={event => updateTask(task.id, current => ({ ...current, title: event.target.value }))} /></label><label className="pp-field"><span>完成标准</span><textarea aria-label="修改完成标准" value={task.criterion} onChange={event => updateTask(task.id, current => ({ ...current, criterion: event.target.value }))} /></label><label className="pp-field"><span>截止日期 · 与工作时段分开</span><input aria-label="工作截止日期" type="date" value={task.dueDate ?? ''} onInput={event => updateTask(task.id, current => ({ ...current, dueDate: event.currentTarget.value }))} /></label></details><section className="pp-ai-result"><div className="pp-section-label"><span><Icon name="spark" size={16} /> AI 协作</span><span className="pp-chip">示例</span></div><label className="pp-toggle"><span>允许整理资料并准备草稿</span><input type="checkbox" checked={task.ai.enabled} onChange={event => updateTask(task.id, current => ({ ...current, ai: { ...current.ai, enabled: event.target.checked,
            status: event.target.checked ? current.ai.draft ? 'ready' : 'waiting' : 'paused' } }))} /></label><p className="pp-run-status" role="status">{task.ai.status === 'ready' && !task.ai.draft ? '草稿已采用 · 示例' : RUN_LABELS[task.ai.status]}</p>{task.ai.draft ? <><div className="pp-draft-preview">{task.ai.draft}</div><button className="pp-secondary" onClick={() => adoptDraft(task)}>把草稿加入正文</button></> : task.ai.status === 'error' ? <div className="pp-error"><p>模拟整理失败。已有正文和资料仍然保留。</p><button onClick={() => updateTask(task.id, current => ({ ...current, ai: { ...current.ai, enabled: true, status: 'waiting' } }))}>重试整理</button></div> : <p className="pp-small">{task.ai.status === 'ready' ? '草稿已加入正文，可以继续编辑。' : task.ai.status === 'running' ? '正在准备一份可查看的内容提纲…' : '启用后自动演示准备过程，无需再点击执行步骤。'}</p>}<p className="pp-caption">预设内容演示，关闭原型时不会真正后台运行。</p></section>
            <section className="pp-related"><h3>关联学习</h3>{state.learning.filter(item => item.taskId === task.id).map(item => <button key={item.id} onClick={() => { setLearningId(item.id); go('learn'); }}><Icon name="learn" size={17} /><span>{item.title}<small>{item.status}</small></span><Icon name="arrow" size={14} /></button>)}<button className="pp-text-button" onClick={() => { setResourceTaskId(task.id); openSheet('resource'); }}>＋ 添加学习资料</button></section>
            <section className="pp-related"><h3>成果的去处</h3><p className="pp-small">正文是当前成果，后续可保存到选定的外部文档。</p><button className="pp-secondary" onClick={() => { if (state.connection.connected && state.connection.documents) { setReceiptTaskId(task.id); openSheet('document'); } else { setConnectStep(1); openSheet('connect'); } }}>{state.connection.connected && state.connection.documents ? '预览飞书成果示例' : '连接飞书流程示例'}<Icon name="link" size={15} /></button></section></aside></div>
        </>}

        {screen === 'learn' && <>
          <div className="pp-page-heading"><div><span className="pp-eyebrow">资料 → 理解 → 练习 → 应用</span><h1 ref={heading} tabIndex={-1}>让学到的知识，进入你的工作。</h1><p>手动保存链接，记录理解，再留下一个实际成果。</p></div><button className="pp-primary" onClick={() => { setResourceTaskId(focusTask?.id ?? ''); openSheet('resource'); }}><Icon name="plus" size={17} /> 添加资料链接</button></div>
          {!learning ? <div className="pp-empty"><Icon name="learn" size={26} /><h2>从一份你想学的资料开始。</h2><p>课程、文章、视频和官方文档都可以保存链接。</p><button className="pp-secondary" onClick={() => openSheet('resource')}>添加资料链接</button></div> : <div className="pp-learning-layout"><aside className="pp-learning-list"><h2>我的学习</h2>{state.learning.map(item => <button className={learning.id === item.id ? 'active' : ''} key={item.id} onClick={() => setLearningId(item.id)}><span className="pp-chip">{item.status}</span><strong>{item.title}</strong><small>{item.aim || '继续补充你希望学会的内容'}</small></button>)}<p className="pp-caption">链接由本人填写，原型不自动读取网页。</p></aside><section className="pp-study"><div className="pp-study-header"><span className="pp-eyebrow">{learning.status}</span><h2>{learning.title}</h2><p>{learning.aim || '学完之后，希望能够做到什么？'}</p><a className="pp-resource-link" href={safeResourceUrl(learning.url) ?? undefined} target="_blank" rel="noreferrer"><Icon name="link" size={17} /><span>{learning.url}</span><Icon name="arrow" size={15} /></a></div><div className="pp-learning-path"><span className={learning.status !== '待学' ? 'passed' : ''}>01 阅读资料</span><span className={['待实践', '已应用'].includes(learning.status) ? 'passed' : ''}>02 理解与练习</span><span className={learning.status === '已应用' ? 'passed' : ''}>03 用到工作</span></div><label className="pp-field"><span>我的学习笔记<small>{saveLabel}</small></span><textarea aria-label="我的学习笔记" value={learning.notes} onChange={event => updateLearning(learning.id, current => ({ ...current, notes: event.target.value, status: current.status === '待学' ? '学习中' : current.status }))} placeholder="记下一个概念、一个疑问，或自己的理解。" /></label><div className="pp-exercise"><span className="pp-eyebrow">一次小练习</span><h3>它如何帮助我完成当前工作？</h3><p>写出一个输入、一个期望输出，以及你会如何验证结果。这里保存的是你的练习，和课程内容无关。</p><textarea aria-label="我的学习练习" value={learning.practice} onChange={event => updateLearning(learning.id, current => ({ ...current, practice: event.target.value }))} placeholder="输入是什么？结果是什么？我准备怎样试一次？" /><div><label className="pp-minutes">实际学习分钟（本人填写）<input aria-label="实际学习分钟" type="number" min={0} max={1440} value={learning.minutes} onChange={event => updateLearning(learning.id, current => ({ ...current, minutes: Math.max(0, Math.min(1440, Number(event.target.value) || 0)) }))} /></label><button className="pp-secondary" disabled={!learning.practice.trim()} onClick={() => { updateLearning(learning.id, current => ({ ...current, status: '待实践' })); setNotice('练习已保存，下一步把它用到工作中。'); }}>保存练习，进入实践</button></div></div><section className="pp-application-link"><div><span className="pp-eyebrow">应用到我的工作</span><h3>{state.tasks.find(item => item.id === learning.taskId)?.title ?? '选择一个可以应用的任务'}</h3><p>作品和练习共同说明学到了什么，不以时长推断能力。</p></div>{learning.taskId ? <button className="pp-primary" onClick={() => go('work', learning.taskId)}>进入应用任务 <Icon name="arrow" size={16} /></button> : <button className="pp-primary" onClick={() => openSheet('task')}>建立应用任务</button>}</section><label className="pp-field"><span>关联工作</span><select aria-label="学习关联工作" value={learning.taskId} onChange={event => updateLearning(learning.id, current => ({ ...current, taskId: event.target.value }))}><option value="">暂不关联</option>{state.tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="pp-text-button" disabled={!learning.practice.trim() || !state.tasks.find(item => item.id === learning.taskId)?.body.trim()} onClick={() => { updateLearning(learning.id, current => ({ ...current, status: '已应用' })); setNotice('本人确认的应用结果已记录，可在成长复盘回看。'); }}>我已实践，记录应用结果 <Icon name="check" size={16} /></button></section></div>}
        </>}

        {screen === 'growth' && <>
          <div className="pp-page-heading"><div><span className="pp-eyebrow">目标、周期计划与复盘</span><h1 ref={heading} tabIndex={-1}>把每一次行动，变成下一步的依据。</h1><p>看成果与卡点，持续调整自己的学习和工作。</p></div><button className="pp-secondary" onClick={() => openSheet('agent')}><Icon name="spark" size={17} /> 一起调整计划</button></div><div className="pp-tabs"><button className={growthView === 'plan' ? 'active' : ''} aria-pressed={growthView === 'plan'} onClick={() => setGrowthView('plan')}>目标与计划</button><button className={growthView === 'review' ? 'active' : ''} aria-pressed={growthView === 'review'} onClick={() => setGrowthView('review')}>日复盘</button><button className={growthView === 'week' ? 'active' : ''} aria-pressed={growthView === 'week'} onClick={() => setGrowthView('week')}>周回顾</button></div>
          {growthView === 'plan' && <><section className="pp-goal"><span className="pp-eyebrow">本期个人目标 · 10 月 08–21 日</span><h2>{state.goal}</h2><p>完成标准：能讲清输入与输出，做出一个方案，并留下真实资料的验证结果。</p><div><span>计划版本 {state.planVersion}</span><span>{state.tasks.filter(item => item.status === 'done').length}/{state.tasks.length} 件工作已完成</span><button className="pp-text-button" onClick={() => go('work')}>查看工作成果 ↗</button></div></section><div className="pp-plan-weeks"><section><span className="pp-week-index">第一阶段</span><h3>理解概念，做出应用方案</h3><p>把资料里的知识用到自己的场景，保留一次学习笔记和可编辑方案。</p>{state.tasks.slice(0, 2).map(item => <button key={item.id} onClick={() => go('work', item.id)}><span className={`pp-step-dot ${item.status === 'done' ? 'done' : ''}`}>{item.status === 'done' && <Icon name="check" size={12} />}</span>{item.title}<Icon name="arrow" size={14} /></button>)}</section><section><span className="pp-week-index">下一阶段</span><h3>{state.adjustments.length ? '收敛到一次真实资料验证' : '完成一次实践，验证与调整'}</h3><p>用自己的资料验证流程，记录哪些知识用上了、哪些部分还需要练习。</p><button onClick={() => { setGrowthView('week'); }}><Icon name="growth" size={17} /> 从周回顾调整下一步 <Icon name="arrow" size={14} /></button></section></div><div className="pp-growth-note"><Icon name="learn" size={20} /><div><h3>学习是计划的一部分。</h3><p>{resourceCount} 份资料 · {applyCount} 次本人确认的应用。能力变化回到笔记、练习和成果，不生成虚构分数。</p><button className="pp-text-button" onClick={() => go('learn')}>查看学习与实践 ↗</button></div></div>{state.adjustments.length > 0 && <section className="pp-history"><h3>保留的计划调整</h3>{state.adjustments.map((text, index) => <p key={index}>版本 {index + 2} · {text}</p>)}<small>旧正文、已完成步骤与今天的安排保持可回看。</small></section>}</>}
          {growthView === 'review' && <div className="pp-reflection-layout"><section className="pp-evidence"><span className="pp-eyebrow">今天已有的内容 · 原型数据</span><h2>先看成果，再补充感受。</h2>{state.tasks.filter(item => item.body.trim()).map(item => <button key={item.id} onClick={() => go('work', item.id)}><Icon name="work" size={18} /><div><strong>{item.title}</strong><small>{item.body.trim().length} 字工作内容 · {STATUS_LABELS[item.status]}</small></div><Icon name="arrow" size={15} /></button>)}{state.learning.map(item => <button key={item.id} onClick={() => { setLearningId(item.id); go('learn'); }}><Icon name="learn" size={18} /><div><strong>{item.title}</strong><small>{item.status} · 本人填写 {item.minutes} 分钟{item.practice.trim() ? ' · 有练习内容' : ''}</small></div><Icon name="arrow" size={15} /></button>)}<p className="pp-caption">这是当前示例内容的汇集预览，不是对真实当天活动的分析。</p></section><form className="pp-reflection-form" onSubmit={saveReview}><span className="pp-eyebrow">10 月 08 日 · 我的日复盘</span><h2>系统不知道的，补一句就好。</h2><label className="pp-field"><span>今天的收获或卡点</span><textarea aria-label="今天的收获或卡点" value={state.reflectionNote} onChange={event => setState(previous => ({ ...previous, reflectionNote: event.target.value }))} placeholder="例如：方案写清楚了，但实际验证还没开始。" /></label><label className="pp-field"><span>明天想怎样调整</span><textarea aria-label="明天想怎样调整" value={state.reflectionNext} onChange={event => setState(previous => ({ ...previous, reflectionNext: event.target.value }))} placeholder="例如：先留 30 分钟验证一份资料，再扩展功能。" /></label><button className="pp-primary" disabled={!state.reflectionNote.trim() && !state.reflectionNext.trim()}>保存今天的复盘 <Icon name="check" size={17} /></button><p className="pp-caption">{state.reviews.some(item => item.date === TODAY) ? '今天已有一份复盘，再保存会更新同一份。' : '仅保存到独立原型，不影响真实账户。'}</p></form></div>}
          {growthView === 'week' && <><div className="pp-week-review"><div><span className="pp-eyebrow">本周期回顾 · 原型状态</span><h2>工作留下了什么，知识用上了什么？</h2><p>先依据当前内容回看，再决定下一周期的重点。</p></div><div className="pp-review-facts"><div><strong>{state.tasks.filter(item => item.status === 'done').length}</strong><span>本人记录完成的工作</span></div><div><strong>{state.learning.reduce((sum, item) => sum + item.minutes, 0)}</strong><span>本人填写学习分钟</span></div><div><strong>{applyCount}</strong><span>确认已应用的学习</span></div></div></div><div className="pp-week-findings"><section><h3>可以回看的依据</h3>{state.tasks.slice(0, 3).map(item => <button key={item.id} onClick={() => go('work', item.id)}><strong>{item.title}</strong><span>{item.body.length} 字正文 · 查看来源 ↗</span></button>)}{state.reviews.map(item => <p key={item.date}><strong>{item.date} 复盘</strong><br />{item.note}<br />{item.next}</p>)}</section><section className="pp-adjustment"><span className="pp-eyebrow">计划调整建议 · 预设示例</span><h3>下一步先验证一次，暂缓增加功能。</h3><p>建议把下阶段重点收敛到一次真实资料验证。保留学习与复盘时段，已完成内容和今天的安排不变。</p><p className="pp-caption">这条建议用于展示调整流程，尚未由真实 AI 分析产生。</p><button className="pp-primary" disabled={state.adjustments.length > 0} onClick={applyAdjustment}>{state.adjustments.length ? '已纳入下一周期计划' : '采用这次计划调整'}<Icon name="check" size={16} /></button></section></div></>}
        </>}

        {screen === 'mine' && <>
          <div className="pp-page-heading"><div><span className="pp-eyebrow">我的空间与可用能力</span><h1 ref={heading} tabIndex={-1}>按自己的节奏，连接需要的工具。</h1><p>个人目标、时间和授权范围，都由你决定。</p></div></div><section className="pp-preferences"><div><h2>我的使用节奏</h2><p>偏好保存到原型；这里不会发送实际提醒。</p></div><div className="pp-preference-fields"><label>学习时段<input aria-label="偏好学习时段" type="time" value={state.preferences.learningTime} onInput={event => setState(previous => ({ ...previous, preferences: { ...previous.preferences, learningTime: event.currentTarget.value } }))} /></label><label>晚间复盘<input aria-label="偏好晚间复盘" type="time" value={state.preferences.reviewTime} onInput={event => setState(previous => ({ ...previous, preferences: { ...previous.preferences, reviewTime: event.currentTarget.value } }))} /></label><label>每日重点<select aria-label="每日重点数量" value={state.preferences.capacity} onChange={event => setState(previous => ({ ...previous, preferences: { ...previous.preferences, capacity: Number(event.target.value) } }))}><option value={1}>1 件</option><option value={2}>2 件</option><option value={3}>3 件</option></select></label></div></section><div className="pp-section-heading"><h2>应用与能力</h2><span>按需连接，显示实际可做的事</span></div><section className="pp-connector"><span className="pp-connector-logo">飞</span><div><div className="pp-connector-title"><h3>飞书</h3><span className="pp-chip">{state.connection.connected ? '已连接 · 模拟' : '尚未连接'}</span></div><p>安排个人日程，将工作成果保存到选定的云文档。</p><div className="pp-capabilities"><span><Icon name="calendar" size={14} /> 日历读写</span><span><Icon name="work" size={14} /> 指定文档成果</span></div>{state.connection.connected && <p className="pp-caption">模拟范围：{[state.connection.calendar && '我的学习日历', state.connection.documents && 'AI 应用方案文档'].filter(Boolean).join('、')}。没有绑定真实账号。</p>}</div><button className="pp-secondary" onClick={() => { setConnectStep(1); openSheet('connect'); }}>{state.connection.connected ? '查看连接范围' : '体验连接流程'}<Icon name="arrow" size={16} /></button></section>{state.connection.connected && <div className="pp-connection-controls"><button className="pp-text-button" onClick={() => { setState(previous => ({ ...previous, connection: { connected: false, calendar: false, documents: false }, schedules: previous.schedules.map(slot => ({ ...slot, sync: 'local' })) })); setNotice('模拟连接已断开，工作内容和个人安排保留。'); }}>断开模拟连接</button>{state.schedules.some(slot => slot.sync === 'failed') && <button className="pp-text-button" onClick={retrySync}>重试失败的同步示例</button>}</div>}<section className="pp-link-explanation"><Icon name="link" size={23} /><div><h3>资料链接与应用连接，各有用途。</h3><p>文章、课程、视频链接直接保存到学习。已实现适配的应用，经过安装或配置、账号授权与资源选择后，才具备执行能力。</p><button className="pp-text-button" onClick={() => openSheet('resource')}>添加一份学习资料 ↗</button></div></section><div className="pp-data-boundary"><strong>独立的原型内容</strong><p>编辑、排期、练习和复盘仅保存在这个浏览器。没有调用真实模型、安装插件、连接外部账号或写入你的真实工作空间。</p><button className="pp-text-button" onClick={() => { setResetEmpty(false); openSheet('reset'); }}>恢复初始示例</button></div>
        </>}
      </main><div className="pp-mobile-nav">{nav}</div>
    </div>
    {notice && <div className="pp-toast" role="status"><Icon name="check" size={16} />{notice}</div>}
    {sheet && <Modal label={{ task: '创建工作页面', schedule: '安排工作时间', resource: '添加学习资料', connect: '飞书连接流程示例', agent: 'AI 助手示例', reset: '重置独立原型', document: '飞书文档成果示例' }[sheet]} className={`pp-modal ${sheet === 'agent' ? 'pp-agent-modal' : ''}`} onClose={() => setSheet(null)}><header><div><span className="pp-eyebrow">{sheet === 'connect' || sheet === 'document' ? '外部应用 · 模拟流程' : '个人工作台 · 交互原型'}</span><h2>{{ task: '开始一件可以持续推进的事', schedule: '给工作留一个时间段', resource: '保存你想学习的资料', connect: '连接飞书，用于我的工作', agent: '带着当前内容，和 AI 一起想', reset: resetEmpty ? '从空工作台开始体验' : '恢复完整场景示例', document: '工作成果的外部文档预览' }[sheet]}</h2></div><button className="pp-icon-button" aria-label="关闭面板" onClick={() => setSheet(null)}><Icon name="close" /></button></header>
      {sheet === 'task' && <form onSubmit={createTask}><label className="pp-field"><span>想完成什么</span><input autoFocus required maxLength={180} aria-label="新工作标题" value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="例如：做出一份我的 AI 应用方案" /></label><label className="pp-field"><span>内容类型</span><select aria-label="工作内容类型" value={template} onChange={event => setTemplate(event.target.value as TaskTemplate)}>{(['方案', '写作', '研究', '学习实践'] as TaskTemplate[]).map(item => <option key={item}>{item}</option>)}</select></label><label className="pp-field"><span>怎样算完成 <small>可稍后补充</small></span><textarea aria-label="工作完成标准" value={criterion} onChange={event => setCriterion(event.target.value)} placeholder="例如：明确问题、流程和首版范围，并验证一次。" /></label><p className="pp-caption">先建立正文与步骤，随后安排时间。不需要先填写项目表。</p><button className="pp-primary" disabled={!taskTitle.trim()}>创建并进入工作正文 <Icon name="arrow" size={17} /></button></form>}
      {sheet === 'schedule' && <form onSubmit={saveSchedule}><label className="pp-field"><span>安排哪件工作</span><select aria-label="安排的工作" value={slotTaskId} onChange={event => setSlotTaskId(event.target.value)}><option value="">选择工作</option>{state.tasks.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label className="pp-field"><span>日期 · Asia/Shanghai</span><input type="date" required aria-label="工作日期" value={slotDate} onInput={event => setSlotDate(event.currentTarget.value)} /></label><div className="pp-form-columns"><label className="pp-field"><span>开始时间</span><input type="time" required aria-label="工作开始时间" value={slotStart} onInput={event => setSlotStart(event.currentTarget.value)} /></label><label className="pp-field"><span>结束时间</span><input type="time" required aria-label="工作结束时间" value={slotEnd} onInput={event => setSlotEnd(event.currentTarget.value)} /></label></div><p className="pp-caption">这是计划工作时间。时间结束不会自动把任务标为完成。</p>{formError && <p className="pp-error" role="alert">{formError}</p>}<div className="pp-form-actions"><button className="pp-primary" disabled={!state.tasks.length}>保存时间安排</button>{slotId && <button type="button" className="pp-text-button" onClick={() => { setState(previous => ({ ...previous, schedules: previous.schedules.filter(slot => slot.id !== slotId) })); setSheet(null); setNotice('只移除了这个时段，工作内容仍然保留。'); }}>移除这个时段</button>}</div></form>}
      {sheet === 'resource' && <form onSubmit={addResource}><label className="pp-field"><span>资料名称</span><input required autoFocus aria-label="学习资料名称" maxLength={180} value={resourceTitle} onChange={event => setResourceTitle(event.target.value)} placeholder="课程、文章、视频或官方文档" /></label><label className="pp-field"><span>资料链接</span><input required type="url" aria-label="学习资料链接" value={resourceUrl} onChange={event => setResourceUrl(event.target.value)} placeholder="https://…" /></label><label className="pp-field"><span>希望学会什么</span><input aria-label="学习期望" value={resourceAim} onChange={event => setResourceAim(event.target.value)} placeholder="用一句话说明想掌握的内容" /></label><label className="pp-field"><span>用于哪件工作</span><select aria-label="资料关联工作" value={resourceTaskId} onChange={event => setResourceTaskId(event.target.value)}><option value="">暂不关联</option>{state.tasks.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>{formError && <p className="pp-error" role="alert">{formError}</p>}<button className="pp-primary">保存链接，进入学习 <Icon name="arrow" size={16} /></button><p className="pp-caption">这里只保存来源，不自动安装插件，也不读取网站内容。</p></form>}
      {sheet === 'connect' && <><div className="pp-connect-progress">{['安装与配置', '选择资源', '确认范围'].map((text, index) => <span className={connectStep >= index + 1 ? 'active' : ''} key={text}>{index + 1} {text}</span>)}</div>{connectStep === 1 && <div className="pp-connect-body"><h3>先确认应用可用于你的账号。</h3><p>真实接入需按飞书要求完成应用安装或配置，再授权账号。具体应用类型、发布与管理员条件在接入时验证。</p><a className="pp-resource-link" href="https://open.feishu.cn/" target="_blank" rel="noreferrer">查看飞书开放平台 <Icon name="arrow" size={16} /></a><div className="pp-inline-note"><p>此处演示连接步骤，不会打开登录授权、安装应用或读取账号。</p></div><button className="pp-primary" onClick={() => setConnectStep(2)}>继续模拟授权</button></div>}{connectStep === 2 && <div className="pp-connect-body"><h3>只选择这次工作需要的资源。</h3><label className="pp-permission"><input type="checkbox" checked={allowCalendar} onChange={event => setAllowCalendar(event.target.checked)} /><span><strong>我的学习日历 · 示例</strong><small>安排和更新本任务的工作时间</small></span></label><label className="pp-permission"><input type="checkbox" checked={allowDocuments} onChange={event => setAllowDocuments(event.target.checked)} /><span><strong>AI 应用方案文档 · 示例</strong><small>保存已采用的工作成果</small></span></label><button className="pp-primary" disabled={!allowCalendar && !allowDocuments} onClick={() => setConnectStep(3)}>查看本次连接范围</button></div>}{connectStep === 3 && <div className="pp-connect-body"><h3>范围内持续执行，随时可以断开。</h3><ul>{allowCalendar && <li>日历：安排与修改本工作台管理的时间段。</li>}{allowDocuments && <li>文档：将工作成果写到选定的文档。</li>}<li>对外发消息、公开发布和删除均不属于本次范围。</li></ul><p className="pp-caption">模拟连接不会产生真实资源。真实版本需记录资源 ID、执行回执和同步冲突。</p>{formError && <p className="pp-error" role="alert">{formError}</p>}<button className="pp-primary" onClick={connect}>确认模拟连接 <Icon name="check" size={17} /></button></div>}</>}
      {sheet === 'agent' && <><div className="pp-agent-context"><Icon name="link" size={16} /><span>当前上下文：{task?.title ?? state.goal}</span></div><p className="pp-caption">预设建议演示，不调用真实模型。问题在失败时仍然保留。</p><form onSubmit={askAgent}><label className="pp-field"><span>想一起想清楚什么</span><textarea aria-label="给 AI 助手的问题" value={agentInput} onChange={event => setAgentInput(event.target.value)} placeholder="帮我把这个目标缩小到下一步可以完成的结果。" /></label><button className="pp-primary" disabled={!agentInput.trim() || agentBusy}>{agentBusy ? '正在整理示例建议…' : agentError ? '重试这个问题' : '查看示例建议'}<Icon name="spark" size={16} /></button></form>{agentError && <p className="pp-error" role="alert">模拟 AI 暂时不可用，原问题已保留。切换为正常情境后可重试。</p>}{agentAnswer && <div className="pp-agent-answer"><span className="pp-eyebrow">基于原型内容的示例建议</span><p>{agentAnswer}</p>{(task ?? focusTask) && <button className="pp-secondary" onClick={() => go('work', (task ?? focusTask)!.id)}>回到这件工作的正文 <Icon name="arrow" size={16} /></button>}</div>}</>}
      {sheet === 'reset' && <><p className="pp-inline-description">这会替换这个浏览器中的独立原型内容，包括你在原型里的正文、链接、时间安排和复盘。真实账户与之前其他原型的数据不受影响。</p><button className="pp-primary" onClick={() => { setState(seedPersonalDemo(resetEmpty)); setScenario('normal'); setLearningId('ai-course'); setWorkView('tasks'); setWeekOffset(0); setSelectedCalendarDate(TODAY); setGrowthView('plan'); setTaskTitle(''); setCriterion(''); setResourceTitle(''); setResourceUrl(''); setResourceAim(''); setAgentInput(''); setAgentAnswer(''); if (agentTimer.current) window.clearTimeout(agentTimer.current); setAgentBusy(false); setAgentError(false); go('today'); setNotice(resetEmpty ? '空工作台已就绪，可以从一件工作开始。' : '已恢复初始场景示例。'); }}>确认{resetEmpty ? '从空工作台开始' : '恢复初始示例'}</button></>}
      {sheet === 'document' && <><span className="pp-chip">模拟文档回执 · 未创建外部文档</span><p className="pp-inline-description">文档：AI 应用方案 · 来源：{state.tasks.find(item => item.id === receiptTaskId)?.title}<br />目标资源：指定飞书文档（示例）</p><div className="pp-document-preview">{state.tasks.find(item => item.id === receiptTaskId)?.body}</div><p className="pp-caption">这里展示真实连接后成果回执的内容结构，不提供虚构的外部链接。</p><button className="pp-secondary" onClick={() => go('work', receiptTaskId)}>回到工作正文</button></>}
    </Modal>}
  </div>;
}
