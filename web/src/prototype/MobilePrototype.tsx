import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DEMO_DATE, REFERENCES, SCREENS, STORAGE_KEY, loadPrototype, makeId, makeSeed, type Action, type Entry, type EntryKind, type Message, type Screen } from './prototypeData';
import './MobilePrototype.css';

type IconName = 'home' | 'journal' | 'spark' | 'chart' | 'user' | 'plus' | 'arrow' | 'send' | 'chevron' | 'close' | 'check' | 'clock' | 'link' | 'leaf' | 'shield' | 'refresh' | 'external' | 'search';
const PATHS: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>,
  journal: <><rect x="5" y="3" width="15" height="18" rx="3"/><path d="M8 3v18M11 8h5M11 12h5"/></>,
  spark: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/><path d="M20 2v4M18 4h4"/></>,
  chart: <><path d="M4 3v17h17M8 15l4-6 4 3 5-7"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  send: <path d="m5 12 7-7 7 7M12 5v15"/>, chevron: <path d="m9 5 7 7-7 7"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L19 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  link: <><path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/></>,
  leaf: <><path d="M20 3C8 1 2 7 5 15c8 5 16-1 15-12Z"/><path d="m4 21 11-11"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
  refresh: <><path d="M20 8a9 9 0 1 0 1 7M20 3v5h-5"/></>,
  external: <><path d="M14 3h7v7m0-7-11 11M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
};
function Icon({name, size = 20}: {name: IconName; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}
const NAV_ICONS: Record<Screen, IconName> = {today: 'home', data: 'journal', agent: 'spark', analysis: 'chart', mine: 'user'};
type Sheet = {kind: 'capture'} | {kind: 'entry'; id: string} | {kind: 'action'; title: string} | {kind: 'privacy'} | {kind: 'rhythm'} | {kind: 'reset'} | {kind: 'simulation'} | null;
const PROTOTYPE_DRAFT_KEY = 'gp_mobile_prototype_capture_draft';
const SYNC_LABELS = {local: '本地待同步', syncing: '同步中', failed: '同步失败', synced: '已同步'};

export default function MobilePrototype() {
  const [state, setState] = useState(loadPrototype);
  const [screen, setScreen] = useState<Screen>(() => {
    const requested = new URLSearchParams(window.location.search).get('screen');
    return SCREENS.find(item => item.id === requested)?.id ?? 'today';
  });
  const [view, setView] = useState<'prototype' | 'references'>('prototype');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [filter, setFilter] = useState<EntryKind | '全部'>('全部');
  const [period, setPeriod] = useState<'日' | '周' | '月'>('周');
  const [context, setContext] = useState('本周的工作与学习');
  const [sourceIds, setSourceIds] = useState<string[]>(['note-3', 'note-4', 'learning-7']);
  const [chatInput, setChatInput] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(() => window.localStorage.getItem(PROTOTYPE_DRAFT_KEY) ?? '');
  const [saveScenario, setSaveScenario] = useState<'success' | 'offline' | 'failure'>(() => {
    const requested = new URLSearchParams(window.location.search).get('save');
    return requested === 'offline' || requested === 'failure' ? requested : 'success';
  });
  const [draftKind, setDraftKind] = useState<EntryKind>('工作');
  const [draftMinutes, setDraftMinutes] = useState('');
  const [energy, setEnergy] = useState(3);
  const [draftGoal, setDraftGoal] = useState('产品交付');
  const [actionTitle, setActionTitle] = useState('');
  const [search, setSearch] = useState('');
  const scope: Record<EntryKind, boolean> = {工作: state.sources.includes('工作'), 学习: state.sources.includes('学习'), 状态: state.sources.includes('状态')};
  const contentRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const activeScreen = SCREENS.find(item => item.id === screen)!;
  const availableEntries = state.entries.filter(item => scope[item.kind]);
  const periodEntries = state.entries.filter(item => period !== '日' || item.date === DEMO_DATE);
  const periodActions = state.actions.filter(item => period !== '日' || item.date === DEMO_DATE);
  const learningTotal = periodEntries.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
  const completed = periodActions.filter(item => item.done).length;
  const coverage = new Set(periodEntries.map(item => item.date)).size;
  const todayActions = state.actions.filter(item => item.date === DEMO_DATE);
  const focusEntry = sheet?.kind === 'entry' ? state.entries.find(item => item.id === sheet.id) : null;
  const evidenceEntries = sourceIds.map(id => availableEntries.find(entry => entry.id === id)).filter((entry): entry is Entry => !!entry);
  const initialResponse: Message = {id: 'initial-answer', role: 'agent', content: '从你留下的记录看，值得先试着减少任务切换。\n\n10 月 3 日，你提到在三个任务之间切换，首页草图没有完成；第二天，你关掉消息后做完了记录页第一版。两条记录提供了一个可以验证的方向，但还不足以说明原因。\n\n明天先保留一个 25 分钟的完整时段，只推进一件事。结束后记下结果，我们再一起看看有没有变化。', sourceIds: ['note-3', 'note-4'], suggestion: '留出 25 分钟，只推进一个核心任务'};
  const messages = state.messages.length ? state.messages : [{id: 'initial-question', role: 'user' as const, content: '这周为什么总觉得推进不顺？'}, initialResponse];

  useEffect(() => {window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}, [state]);
  useEffect(() => {if (draft) window.localStorage.setItem(PROTOTYPE_DRAFT_KEY, draft); else window.localStorage.removeItem(PROTOTYPE_DRAFT_KEY);}, [draft]);
  useEffect(() => {contentRef.current?.scrollTo({top: 0});}, [screen]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!sheet) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('textarea, input, button')?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {setSheet(null); return;}
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    document.addEventListener('keydown', handleKeys);
    return () => {document.removeEventListener('keydown', handleKeys); previousFocus.current?.focus();};
  }, [sheet]);

  function navigate(target: Screen) {setView('prototype'); setScreen(target); setSheet(null);}
  function openCapture() {setSheet({kind: 'capture'});}
  function simulateSync(id: string) {
    const next = saveScenario === 'offline' ? 'local' : 'syncing';
    setState(current => ({...current, entries: current.entries.map(entry => entry.id === id ? {...entry, syncState: next} : entry)}));
    if (saveScenario === 'offline') {setNotice('原文已保留，可稍后重试（模拟）'); return;}
    window.setTimeout(() => {
      setState(current => ({...current, entries: current.entries.map(entry => entry.id === id ? {...entry, syncState: saveScenario === 'success' ? 'synced' : 'failed'} : entry)}));
      setNotice(saveScenario === 'success' ? '已同步（模拟）' : '同步失败，原文仍在（模拟）');
    }, 900);
  }
  function toggleAction(action: Action) {
    setState(current => ({...current, actions: current.actions.map(item => item.id === action.id ? {...item, done: !item.done} : item), entries: !action.done ? [{id: makeId(), date: DEMO_DATE, time: '16:30', kind: '工作', title: `完成：${action.title}`, content: `完成了「${action.title}」。这次行动来自${action.source}。`, goal: '产品交付'}, ...current.entries] : current.entries}));
    setNotice(action.done ? '行动已重新打开' : '已完成，结果已留在数据中');
  }
  function openAgent(label: string, ids: string[], question?: string) {
    setContext(label); setSourceIds(ids); navigate('agent');
    if (question) sendMessage(question, ids);
  }
  function sendMessage(text: string, ids = sourceIds) {
    const clean = text.trim(); if (!clean) return;
    const cited = ids.map(id => availableEntries.find(entry => entry.id === id)).filter((entry): entry is Entry => !!entry).slice(0, 3);
    const answer = cited.length
      ? `我会先从这 ${cited.length} 条记录看起。\n\n${cited.map(entry => `「${entry.title}」：${entry.content}`).join('\n\n')}\n\n这些是已经发生的事实。你现在最想调整哪一部分？可以先选择一个小行动，再用下一次记录验证。`
      : '当前选择的数据范围内还没有可引用的记录。你可以先留下一件已经发生的事，或者在数据范围设置中选择允许使用的来源。';
    const next: Message[] = [{id: makeId(), role: 'user', content: clean}, {id: makeId(), role: 'agent', content: answer, sourceIds: cited.map(entry => entry.id), ...(cited.length ? {suggestion: '留出 25 分钟，只推进一个核心任务'} : {})}];
    setState(current => ({...current, messages: [...(current.messages.length ? current.messages : messages), ...next]}));
    setChatInput('');
    window.setTimeout(() => contentRef.current?.scrollTo({top: contentRef.current.scrollHeight, behavior: 'smooth'}), 50);
  }
  function saveEntry(event: FormEvent) {
    event.preventDefault(); if (!draft.trim()) return;
    const entry: Entry = {id: makeId(), date: DEMO_DATE, time: '16:30', kind: draftKind, title: draft.trim().split(/[。\n]/)[0].slice(0, 32), content: draft.trim(), energy, goal: draftGoal, syncState: 'local', ...(draftKind === '学习' && draftMinutes ? {minutes: Number(draftMinutes)} : {})};
    setState(current => ({...current, entries: [entry, ...current.entries]}));
    setDraft(''); setDraftMinutes('');
    navigate('data'); setFilter('全部'); setSearch(''); setNotice('记录已保存');
    simulateSync(entry.id);
  }
  function confirmAction(event: FormEvent) {
    event.preventDefault(); if (!actionTitle.trim()) return;
    const title = actionTitle.trim();
    if (state.actions.some(action => action.title === title && action.source === 'Agent 建议' && !action.done)) {setNotice('这条建议已经在今日行动中'); navigate('today'); return;}
    setState(current => ({...current, actions: [...current.actions, {id: makeId(), title, date: DEMO_DATE, done: false, minutes: 25, source: 'Agent 建议'}]}));
    navigate('today'); setNotice('已加入今日行动');
  }
  function showAction(title: string) {setActionTitle(title); setSheet({kind: 'action', title});}
  function EntryRow({entry}: {entry: Entry}) {
    return <button className="gp-entry-row" onClick={() => setSheet({kind: 'entry', id: entry.id})}><span className={`gp-entry-mark kind-${entry.kind}`}><Icon name={entry.kind === '学习' ? 'journal' : entry.kind === '状态' ? 'leaf' : 'check'} size={17}/></span><span className="gp-entry-copy"><span className="gp-entry-meta">{entry.kind} · {entry.time}{entry.minutes ? ` · ${entry.minutes} 分钟` : ''}</span><strong>{entry.title}</strong><span className="gp-entry-excerpt">{entry.content}</span>{entry.syncState && <span className={`gp-sync-state ${entry.syncState}`}>{SYNC_LABELS[entry.syncState]} · 示例</span>}</span><Icon name="chevron" size={15}/></button>;
  }
  function SectionTitle({children, action, onAction}: {children: ReactNode; action?: string; onAction?: () => void}) {
    return <div className="gp-section-title"><h3>{children}</h3>{action && <button onClick={onAction}>{action}<Icon name="arrow" size={14}/></button>}</div>;
  }

  const today = <>
    <div className="gp-home-top"><span>10 月 7 日 · 星期三</span><button className="gp-avatar" onClick={() => navigate('mine')} aria-label="打开我的">林</button></div>
    <div className="gp-greeting"><span>下午好，林。</span><h1>每一点进展，<br/>都值得被看见<span>。</span></h1><p>留下一点真实，让下一步更清楚。</p></div>
    <button className="gp-capture-hero" onClick={openCapture}><span className="gp-capture-icon"><Icon name="plus" size={24}/></span><span><strong>记下此刻</strong><small>一个进展、一点收获，或今天的感受</small></span><Icon name="arrow"/></button>
    <div className="gp-quiet-stats"><div><strong>{state.entries.length}</strong><span>条本周记录</span></div><div><strong>{state.actions.filter(action => action.done).length}<small>/{state.actions.length}</small></strong><span>项行动完成</span></div><div><strong>{state.entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)}<small>min</small></strong><span>学习投入</span></div></div>
    <button className="gp-agent-invitation" onClick={() => openAgent('本周的工作与学习', ['note-3', 'note-4', 'learning-7'])}><span className="gp-eyebrow"><Icon name="spark" size={15}/> AGENT 为你留意到</span><strong>专注一点，可能比多安排一点更有用。</strong><span>从这周的记录里，一起看看你的推进节奏。</span><span className="gp-invitation-link">聊聊这件事 <Icon name="arrow" size={16}/></span></button>
    <SectionTitle action="查看分析" onAction={() => navigate('analysis')}>今天，先推进一小步</SectionTitle>
    <div className="gp-action-list">{todayActions.map(action => <button key={action.id} className={`gp-action-row ${action.done ? 'is-done' : ''}`} onClick={() => toggleAction(action)} aria-label={`${action.done ? '重新打开' : '完成'}${action.title}`}><span className="gp-checkbox">{action.done && <Icon name="check" size={14}/>}</span><span><strong>{action.title}</strong><small>{action.minutes} 分钟 · {action.source}</small></span></button>)}</div>
    <SectionTitle action="全部记录" onAction={() => navigate('data')}>刚刚留下的</SectionTitle><EntryRow entry={state.entries[0]}/>
  </>;

  const data = <>
    <div className="gp-page-heading"><span className="gp-eyebrow">YOUR STORY</span><div><h1>我的数据</h1><button className="gp-round-button" onClick={openCapture} aria-label="新增记录"><Icon name="plus"/></button></div><p>生活里的小事，慢慢连成自己的故事。</p></div>
    <label className="gp-search"><Icon name="search" size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="寻找一条记录" aria-label="搜索记录"/></label>
    <div className="gp-filter-tabs" aria-label="记录类型">{(['全部', '工作', '学习', '状态'] as const).map(item => <button key={item} aria-pressed={filter === item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className="gp-timeline">{[...new Set(state.entries.map(entry => entry.date))].map(date => {
      const entries = state.entries.filter(entry => entry.date === date && (filter === '全部' || entry.kind === filter) && `${entry.title}${entry.content}`.includes(search));
      if (!entries.length) return null;
      return <section key={date}><div className="gp-date-heading"><strong>{date === DEMO_DATE ? '今天' : `10 月 ${Number(date.slice(-2))} 日`}</strong><span>{entries.length} 条记录</span></div>{entries.map(entry => <EntryRow key={entry.id} entry={entry}/>)}</section>;
    })}{!state.entries.some(entry => (filter === '全部' || entry.kind === filter) && `${entry.title}${entry.content}`.includes(search)) && <div className="gp-empty"><Icon name="journal" size={32}/><h3>还没有找到这条记录</h3><p>试试其他关键词，或留下第一条记录。</p><button className="gp-primary" onClick={openCapture}>记下此刻</button></div>}</div>
  </>;

  const agent = <>
    <div className="gp-agent-heading"><span className="gp-agent-symbol"><Icon name="spark" size={23}/></span><div><h1>Growth Agent</h1><span>带着你的经历，一起想清楚</span></div></div>
    <div className="gp-context-bar"><Icon name="link" size={14}/><span>{context}</span><button onClick={() => setSheet({kind: 'privacy'})}>数据范围</button></div>
    <div className="gp-conversation"><div className="gp-conversation-date">今天 · 16:20</div>{messages.map(message => <div key={message.id} className={`gp-message gp-message-${message.role}`}>{message.role === 'agent' && <span className="gp-answer-label"><Icon name="spark" size={13}/> Growth Agent</span>}<div className="gp-message-content">{message.content.split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div>{message.sourceIds && message.sourceIds.filter(id => availableEntries.some(entry => entry.id === id)).length > 0 && <div className="gp-citations"><span>依据这些记录</span>{message.sourceIds.map(id => availableEntries.find(entry => entry.id === id)).filter((entry): entry is Entry => !!entry).map(entry => <button key={entry.id} onClick={() => setSheet({kind: 'entry', id: entry.id})}><Icon name="journal" size={13}/><span>10.{Number(entry.date.slice(-2))} · {entry.title}</span><Icon name="chevron" size={13}/></button>)}</div>}{message.suggestion && <div className="gp-suggestion"><span>可以试试的下一步</span><strong>{message.suggestion}</strong><small><Icon name="clock" size={13}/> 25 分钟 · 由你决定是否开始</small><button onClick={() => showAction(message.suggestion!)}>审阅这条建议 <Icon name="arrow" size={15}/></button></div>}</div>)}</div>
  </>;

  const chartDates = period === '日' ? [DEMO_DATE] : [...new Set(periodEntries.map(entry => entry.date))].sort();
  const chartValues = chartDates.map(date => periodEntries.filter(entry => entry.date === date).reduce((sum, entry) => sum + (entry.minutes ?? 0), 0));
  const maxValue = Math.max(50, ...chartValues);
  const points = chartValues.map((value, index) => `${40 + index * (258 / Math.max(chartDates.length - 1, 1))},${135 - value / maxValue * 100}`);
  const analysis = <>
    <div className="gp-page-heading"><span className="gp-eyebrow">SEE THE PATTERN</span><div><h1>看见变化</h1><span className="gp-small-label">{coverage} 天数据</span></div><p>先看事实，再找到适合自己的节奏。</p></div>
    <div className="gp-period-control">{(['日', '周', '月'] as const).map(item => <button key={item} className={period === item ? 'selected' : ''} aria-pressed={period === item} onClick={() => setPeriod(item)}>{item === '日' ? '今天' : item === '周' ? '近 7 天' : '本月'}</button>)}</div><div className="gp-period-caption">{period === '日' ? '2026 年 10 月 7 日' : '2026 年 10 月 1 日 — 7 日'}<span>已记录事实</span></div>
    <div className="gp-analysis-metrics"><div><span>行动完成</span><strong>{periodActions.length ? Math.round(completed / periodActions.length * 100) : 0}<small>%</small></strong><p>{completed} / {periodActions.length} 项行动</p></div><div><span>学习投入</span><strong>{learningTotal}<small>min</small></strong><p>{periodEntries.filter(entry => entry.kind === '学习').length} 次学习记录</p></div></div>
    <section className="gp-chart-panel"><SectionTitle>学习投入的节奏</SectionTitle><span className="gp-chart-unit">每日学习时长 · 分钟</span><svg className="gp-learning-chart" viewBox="0 0 330 171" role="img" aria-label={`学习时长，${chartDates.map((date, index) => `10月${Number(date.slice(-2))}日${chartValues[index]}分钟`).join('，')}`}><title>每日学习投入，单位：分钟</title>{[0, maxValue / 2, maxValue].map(value => <g key={value}><line x1="40" x2="304" y1={135 - value / maxValue * 100} y2={135 - value / maxValue * 100}/><text x="23" y={139 - value / maxValue * 100} textAnchor="end">{Math.round(value)}</text></g>)}<polyline className="gp-chart-line" points={points.join(' ')}/>{chartDates.map((date, index) => <g key={date}><circle cx={40 + index * (258 / Math.max(chartDates.length - 1, 1))} cy={135 - chartValues[index] / maxValue * 100} r="4"><title>{date}：{chartValues[index]} 分钟</title></circle><text x={40 + index * (258 / Math.max(chartDates.length - 1, 1))} y="161" textAnchor="middle">{Number(date.slice(-2))}日</text></g>)}</svg><span className="gp-chart-source">来源：{periodEntries.filter(entry => entry.minutes).length} 条学习记录 · 日期（10 月）</span></section>
    <section className="gp-pattern-note"><span className="gp-eyebrow"><Icon name="spark" size={14}/> AGENT 解读 · 示例</span><h3>{period === '日' ? '今天已经留下一点进展。' : '学习在继续，行动可以更集中。'}</h3><p>{period === '日' ? '回看今天的记录，选择一个最值得继续的动作。样本还不足以判断长期变化。' : '你在 7 天里持续留下学习记录。两条工作记录提到任务切换和关闭消息，可以尝试安排一个完整时段，再记录实际结果。'}</p><button onClick={() => setSheet({kind: 'entry', id: 'note-3'})}>查看原始依据 <Icon name="chevron" size={14}/></button></section>
    <button className="gp-primary gp-analysis-chat" onClick={() => openAgent(`${period === '日' ? '今天' : period === '周' ? '近 7 天' : '本月'}分析 · ${periodEntries.length} 条记录`, periodEntries.filter(entry => scope[entry.kind]).slice(0, 3).map(entry => entry.id), '结合这份分析，我下一步可以怎样调整？')}><Icon name="spark" size={18}/> 带着这份分析聊一聊 <Icon name="arrow" size={17}/></button><p className="gp-sample-coverage">本期覆盖 {coverage} 天 · {periodEntries.length} 条记录<br/>完成率 = 已完成行动 / 本期全部行动</p>
  </>;

  const mine = <>
    <div className="gp-page-heading"><span className="gp-eyebrow">YOUR SPACE</span><h1>我的</h1></div><div className="gp-profile"><span className="gp-profile-avatar">林</span><h2>林的成长空间</h2><p>每一天，都有一点自己的方向。</p></div>
    <div className="gp-profile-stats"><div><strong>{state.entries.length}</strong><span>条记录</span></div><div><strong>{new Set(state.entries.map(entry => entry.date)).size}</strong><span>天留下足迹</span></div></div>
    <SectionTitle>按自己的节奏</SectionTitle><div className="gp-setting-list"><button onClick={() => setSheet({kind: 'privacy'})}><Icon name="shield"/><span>Agent 可使用的数据</span><small>{Object.values(scope).filter(Boolean).length} 类来源</small><Icon name="chevron" size={16}/></button><button onClick={() => setSheet({kind: 'rhythm'})}><Icon name="clock"/><span>晨晚记录时间</span><small>08:30 / 21:30</small><Icon name="chevron" size={16}/></button><button onClick={() => {setView('references'); setSheet(null);}}><Icon name="leaf"/><span>这版设计的灵感</span><Icon name="chevron" size={16}/></button></div>
    <div className="gp-mine-note"><Icon name="journal" size={21}/><p>你的记录属于你。<br/>每一条建议，都可以回到它的来源。</p></div><button className="gp-reset" onClick={() => setSheet({kind: 'reset'})}><Icon name="refresh" size={14}/> 重新体验原型</button>
  </>;

  const sheetTitle = sheet?.kind === 'capture' ? '记下此刻' : sheet?.kind === 'entry' ? '记录详情' : sheet?.kind === 'action' ? '把建议变成行动' : sheet?.kind === 'privacy' ? 'Agent 的数据范围' : sheet?.kind === 'rhythm' ? '晨晚记录时间' : sheet?.kind === 'simulation' ? '可靠记录 · 模拟条件' : '重新体验原型';
  return <div className="gp-prototype">
    <header className="gp-studio-header"><a href="/prototype" className="gp-studio-brand"><span className="gp-logo"><Icon name="leaf" size={19}/></span><strong>GrowthPilot</strong><span className="gp-header-divider"/><span>手机端产品原型</span></a><div><span className="gp-version">CONCEPT 01 · OCT 2026</span><button className={view === 'references' ? 'active' : ''} onClick={() => setView(view === 'references' ? 'prototype' : 'references')}>{view === 'references' ? '返回交互原型' : '竞品与设计参考'}<Icon name="external" size={14}/></button></div></header>
    {view === 'references' ? <main className="gp-reference-page"><span className="gp-studio-kicker">RESEARCH → DESIGN</span><h1>从好的体验里，找到我们的方向。</h1><p className="gp-reference-intro">2026 年 10 月 7 日查阅官方产品页面与公开界面。功能为来源事实；“借鉴点”为本项目的设计判断。</p><div className="gp-reference-grid">{REFERENCES.map((reference, index) => <article key={reference.name}><div className="gp-reference-number">0{index + 1}<span>{reference.type}</span></div><a href={reference.url} target="_blank" rel="noreferrer"><h2>{reference.name}</h2><Icon name="external" size={18}/></a><span className="gp-reference-focus">{reference.focus}</span><p>{reference.fact}</p><div><span>借鉴到 GrowthPilot</span><strong>{reference.take}</strong><p>{reference.visual}</p></div><a className="gp-reference-source" href={reference.evidence} target="_blank" rel="noreferrer">查看官方依据 <Icon name="arrow" size={14}/></a></article>)}</div><div className="gp-reference-conclusion"><span>这版设计的取舍</span><h2>用记录建立上下文，用对话理解，用分析调整。</h2><p>采用时间线、来源引用、轻量行动卡和可解释趋势。暖白与深绿是 GrowthPilot 的视觉选择；不沿用竞品的品牌、插画或完整页面。</p><button onClick={() => setView('prototype')}>体验原型 <Icon name="arrow" size={16}/></button></div></main> : <main className="gp-studio-body"><aside className="gp-design-rail"><span className="gp-studio-kicker">MOBILE EXPERIENCE</span><h2>从留下数据，<br/>到找到下一步。</h2><p>一个围绕你自己的<br/>记录、对话与分析闭环。</p><nav aria-label="原型页面选择">{SCREENS.map((item, index) => <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>0{index + 1}</span><div><strong>{item.name}</strong><small>{item.english}</small></div><Icon name="arrow" size={15}/></button>)}</nav><div className="gp-rail-footer"><a href="/prototype/learning-loop">完整学习流程原型 →</a><br/><a href="/prototype/learning-workspace">学习记录与知识库原型 →</a><br/><a href="/prototype/learning-review">学习复盘原型 →</a><br/><a href="/prototype/materials">学习资料摄入原型 →</a><br/><a href="/prototype/web-material">公开网页资料原型 →</a><br/><a href="/prototype/diagnosis-quality">学习诊断质量原型 →</a><br/><a href="/prototype/source-pipeline">个人资料导入流程原型 →</a><br/><a href="/prototype/personal-sources">独立个人资料库原型 →</a><br/><a href="/prototype/bailian-knowledge">百炼知识库测试原型 →</a><br/><a href="/prototype/knowledge-search">知识检索与引用原型 →</a><br/><span className="gp-demo-dot"/>可点击原型 · 示例数据<p>所有操作仅保存在此浏览器。<br/>Agent 回复为预设示例。</p></div></aside>
      <section className="gp-device-stage" aria-label="手机端交互原型"><div className="gp-device-caption"><span>{activeScreen.english} · 交互原型</span><button onClick={() => setSheet({kind: 'simulation'})}>保存：{saveScenario === 'success' ? '成功' : saveScenario === 'offline' ? '断网' : '失败'} · 模拟条件</button></div><div className="gp-phone"><div className="gp-phone-status"><strong>9:41</strong><div className="gp-dynamic-island"/><span className="gp-status-symbols">▮▮▮ <span>◔</span><span className="gp-battery"/></span></div><div className="gp-phone-content" ref={contentRef} inert={!!sheet}>{screen === 'today' ? today : screen === 'data' ? data : screen === 'agent' ? agent : screen === 'analysis' ? analysis : mine}</div>
        {screen === 'agent' && <form className="gp-chat-compose" inert={!!sheet} onSubmit={event => {event.preventDefault(); sendMessage(chatInput);}}><span className="gp-compose-context">{evidenceEntries.length} 条上下文记录 · 按已选范围使用</span><div><input value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="继续聊聊你的想法…" aria-label="给 Agent 的消息"/><button type="submit" disabled={!chatInput.trim()} aria-label="发送消息"><Icon name="send" size={19}/></button></div></form>}
        <nav className="gp-bottom-nav" aria-label="手机主导航" inert={!!sheet}>{SCREENS.map(item => <button key={item.id} className={screen === item.id ? 'active' : ''} aria-current={screen === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><span><Icon name={NAV_ICONS[item.id]} size={22}/></span><small>{item.name}</small></button>)}</nav><div className="gp-home-indicator"/>
        {notice && <div className="gp-toast" role="status"><Icon name="check" size={15}/>{notice}</div>}
        {sheet && <div className="gp-sheet-backdrop" onClick={() => setSheet(null)}><section ref={dialogRef} className="gp-sheet" role="dialog" aria-modal="true" aria-labelledby="gp-sheet-title" onClick={event => event.stopPropagation()}><div className="gp-sheet-handle"/><header><div><span className="gp-eyebrow">GROWTHPILOT</span><h2 id="gp-sheet-title">{sheetTitle}</h2></div><button onClick={() => setSheet(null)} aria-label="关闭面板"><Icon name="close"/></button></header>
          {sheet.kind === 'capture' && <form onSubmit={saveEntry}><div className="gp-filter-tabs">{(['工作', '学习', '状态'] as const).map(kind => <button type="button" key={kind} className={draftKind === kind ? 'selected' : ''} aria-pressed={draftKind === kind} onClick={() => setDraftKind(kind)}>{kind}</button>)}</div><label className="gp-field"><span>刚刚发生了什么？</span><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="今天做完了一个小步骤，或者发现了一个新的想法…" maxLength={1000} rows={5}/><small>{draft.length} / 1000</small></label>{draftKind === '学习' && <label className="gp-field"><span>学习时长（分钟，可跳过）</span><input type="number" min="1" max="600" step="1" value={draftMinutes} onChange={event => setDraftMinutes(event.target.value)} placeholder="例如 30"/></label>}<label className="gp-field"><span>关联方向</span><select value={draftGoal} onChange={event => setDraftGoal(event.target.value)}><option>产品交付</option><option>稳定学习</option><option>日常生活</option></select></label><div className="gp-energy"><span>现在的能量 <small>可保留默认</small></span><div>{[1, 2, 3, 4, 5].map(value => <button type="button" aria-label={`能量 ${value}`} aria-pressed={energy === value} className={energy === value ? 'selected' : ''} key={value} onClick={() => setEnergy(value)}>{value}</button>)}</div><small>低一点也没关系，只留下此刻的真实。</small></div><button className="gp-primary" type="submit" disabled={!draft.trim()}>保存这条记录 <Icon name="check" size={16}/></button></form>}
          {sheet.kind === 'entry' && focusEntry && <div className="gp-entry-detail"><span className="gp-detail-meta">{focusEntry.date} · {focusEntry.time} · {focusEntry.kind}</span><h3>{focusEntry.title}</h3><p>{focusEntry.content}</p><div className="gp-detail-tags"><span><Icon name="link" size={13}/>{focusEntry.goal}</span>{focusEntry.minutes && <span>{focusEntry.minutes} 分钟</span>}{focusEntry.energy && <span>能量 {focusEntry.energy} / 5</span>}</div>{focusEntry.syncState && <div className="gp-sync-notice" role="status"><strong>{SYNC_LABELS[focusEntry.syncState]} · 模拟</strong><p>原文已保留在此浏览器，重试会更新同一条记录。</p>{focusEntry.syncState !== 'synced' && <button className="gp-primary" disabled={focusEntry.syncState === 'syncing'} onClick={() => simulateSync(focusEntry.id)}>{focusEntry.syncState === 'syncing' ? '正在同步…' : '重试这条记录'}</button>}</div>}<div className="gp-original-source"><Icon name="journal" size={15}/><span>原始来源：用户记录<br/><small>保留原文，供后续引用</small></span></div><button className="gp-primary" onClick={() => openAgent(`记录 · ${focusEntry.title}`, [focusEntry.id], '我想和你聊聊这条记录。')}><Icon name="spark" size={17}/> 和 Agent 讨论这条记录</button></div>}
          {sheet.kind === 'simulation' && <div><p className="gp-sheet-lead">用同一条记录体验保存中、断网保留和失败重试。这里只切换原型模拟条件，未请求真实服务。</p><div className="gp-filter-tabs">{([{id: 'success', label: '成功'}, {id: 'offline', label: '断网'}, {id: 'failure', label: '失败'}] as const).map(item => <button key={item.id} className={saveScenario === item.id ? 'selected' : ''} aria-pressed={saveScenario === item.id} onClick={() => setSaveScenario(item.id)}>{item.label}</button>)}</div><button className="gp-primary" onClick={() => setSheet(null)}>使用这个模拟条件</button><p className="gp-sheet-footnote">先新增记录，刷新后打开同一条详情；切换为成功再重试，记录总数不会增加。未提交的正文也会在此浏览器恢复。</p></div>}
          {sheet.kind === 'action' && <form onSubmit={confirmAction}><p className="gp-sheet-lead">先确认一个足够小的下一步。你可以修改，再决定是否开始。</p><label className="gp-field"><span>行动标题</span><input value={actionTitle} onChange={event => setActionTitle(event.target.value)} maxLength={120}/></label><div className="gp-action-preview"><div><span>安排到</span><strong>今日行动</strong></div><div><span>预计投入</span><strong>25 分钟</strong></div><div><span>来源</span><strong>Agent 建议 · 你确认后创建</strong></div></div><button className="gp-primary" disabled={!actionTitle.trim()} type="submit">确认加入今日行动 <Icon name="arrow" size={16}/></button><button className="gp-sheet-secondary" type="button" onClick={() => setSheet(null)}>暂时不添加</button></form>}
          {sheet.kind === 'privacy' && <div><p className="gp-sheet-lead">选择 Agent 在这版原型中可以引用的记录类型。</p>{(['工作', '学习', '状态'] as const).map(kind => <label className="gp-scope-toggle" key={kind}><span>{kind}记录</span><input type="checkbox" checked={scope[kind]} onChange={event => {const checked = event.target.checked; setState(current => ({...current, sources: checked ? [...new Set([...current.sources, kind])] : current.sources.filter(source => source !== kind)}));}}/></label>)}<p className="gp-sheet-footnote">切换影响新的回复和上下文引用；历史示例回答不会被重新生成。</p><button className="gp-primary" onClick={() => {setSheet(null); setNotice('数据范围已更新');}}>确认范围</button></div>}
          {sheet.kind === 'rhythm' && <div><p className="gp-sheet-lead">给每天留两个轻量的回看时刻。</p><div className="gp-action-preview"><div><span>晨间启动</span><strong>08:30 · 不超过 2 分钟</strong></div><div><span>晚间复盘</span><strong>21:30 · 不超过 3 分钟</strong></div></div><p className="gp-sheet-footnote">原型展示提醒的界面位置，尚未开启通知。</p><button className="gp-primary" onClick={() => setSheet(null)}>知道了</button></div>}
          {sheet.kind === 'reset' && <div><p className="gp-sheet-lead">重新载入示例记录、会话与行动，清除在这版原型里的操作。</p><button className="gp-primary" onClick={() => {setState(makeSeed()); navigate('today'); setContext('本周的工作与学习'); setSourceIds(['note-3', 'note-4', 'learning-7']); setNotice('示例已重置');}}>确认重置示例</button><button className="gp-sheet-secondary" onClick={() => setSheet(null)}>保留当前体验</button></div>}
        </section></div>}
      </div><p className="gp-device-footnote">记录 → 对话 → 分析 → 行动反馈</p></section>
      <aside className="gp-design-notes"><span className="gp-studio-kicker">DESIGN INTENT / 0{SCREENS.findIndex(item => item.id === screen) + 1}</span><h2>{activeScreen.purpose}</h2><div className="gp-design-detail">{activeScreen.details.map((detail, index) => <div key={detail}><span>0{index + 1}</span><p>{detail}</p></div>)}</div><div className="gp-try-flow"><a href="/prototype/onboarding?save=partial" style={{display: 'block', marginBottom: 18, color: 'inherit'}}>A2 · 体验首次方案保存与重试 →</a><a href="/prototype/agent" style={{display: 'block', marginBottom: 18, color: 'inherit'}}>A3 · 体验会话、引用与行动确认 →</a><a href="/prototype/analysis" style={{display: 'block', marginBottom: 18, color: 'inherit'}}>A4 · 体验日周月事实分析与异常状态 →</a><a href="/prototype/trial" style={{display: 'block', marginBottom: 18, color: 'inherit'}}>A5 · 体验统一导航、键盘与错误恢复 →</a><span>试一遍完整闭环</span><ol><li>在今日页新增一条记录</li><li>打开详情，和 Agent 讨论</li><li>查看分析，再聊聊调整</li><li>确认建议，完成今日行动</li></ol></div><div className="gp-palette-note"><span>视觉方向</span><div><i/><i/><i/><i/></div><p>暖白 / 深绿 / 松弛留白<br/>中文优先，事实与解读分层。</p><button onClick={() => setView('references')}>查看 6 个产品参考 <Icon name="arrow" size={14}/></button></div></aside>
    </main>}
  </div>;
}
