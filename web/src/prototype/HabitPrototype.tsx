import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import FitnessContextPrototype from './FitnessContextPrototype';
import {
  HABIT_DEMO_KEY, DEMO_TODAY, blankDraft, candidateFromText, commitWorkout, createReview, draftOf,
  feedbackFingerprint, freezeWorkout, habitDates, learningFingerprint, loadHabitDemo, monthDays,
  movementTrend, rangeSummary, recordsInRange, reuseWorkout, reviewIsCurrent, safeUrl, seedHabitDemo,
  shiftDate, validDate, type HabitDemo, type LearningDemo, type Plan, type Workout, type WorkoutDraft,
} from './habitData';
import './HabitPrototype.css';

type Screen = 'today' | 'records' | 'learn' | 'expert';
type Sheet = 'record' | 'capture' | 'plan' | 'habit' | 'reset' | null;
type Scenario = 'normal' | 'save' | 'receipt' | 'ai';
const NAV: { id: Screen; label: string; glyph: string }[] = [
  { id: 'today', label: '今日', glyph: 'sun' }, { id: 'records', label: '训练记录', glyph: 'chart' },
  { id: 'learn', label: '学习', glyph: 'book' }, { id: 'expert', label: '个人专家', glyph: 'spark' },
];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const SOURCE = { manual: '本人手动记录', assisted: '原话整理 · 本人已核对', reuse: '复用结构 · 本人已核对' };
function Glyph({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    chart: <><path d="M4 4v16h17M8 15l4-5 4 2 5-7" /></>,
    book: <><path d="M12 5C8 3 5 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-6-1-10 1v16" /></>,
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />,
    plus: <path d="M5 12h14M12 5v14" />, arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />, close: <path d="m6 6 12 12M6 18 18 6" />,
    weight: <><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.sun}</svg>;
}
function shortDate(date: string) { return `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`; }

export default function HabitPrototype() {
  const [loaded] = useState(() => loadHabitDemo(localStorage));
  const [state, setState] = useState(loaded.state);
  const stateRef = useRef(state);
  const [params, setParams] = useSearchParams();
  const screen: Screen = NAV.some(n => n.id === params.get('page')) ? params.get('page') as Screen : 'today';
  const [sheet, setSheet] = useState<Sheet>(state.draft ? 'record' : null);
  const [view, setView] = useState<'list' | 'calendar' | 'trend'>('list');
  const [period, setPeriod] = useState('28');
  const [from, setFrom] = useState(shiftDate(DEMO_TODAY, -27));
  const [to, setTo] = useState(DEMO_TODAY);
  const range = { from, to };
  const rangeValid = validDate(from) && validDate(to) && from <= to && to <= DEMO_TODAY;
  const scoped = rangeValid ? recordsInRange(state.records, range) : [];
  const summary = rangeSummary(scoped);
  const [month, setMonth] = useState('2026-10');
  const [selectedDay, setSelectedDay] = useState(DEMO_TODAY);
  const names = [...new Set(scoped.flatMap(r => r.exercises.map(e => e.name)))];
  const [movement, setMovement] = useState('深蹲');
  const activeMovement = names.includes(movement) ? movement : names[0] ?? '';
  const points = movementTrend(scoped, activeMovement);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [storageError, setStorageError] = useState(loaded.error);
  const [error, setError] = useState(state.pending ? '上次保存没有收到完整回执。草稿已保留，可以重试。' : '');
  const [notice, setNotice] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [busy, setBusy] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiAction, setAiAction] = useState<'capture' | 'expert' | 'explain' | 'feedback'>('capture');
  const [planDate, setPlanDate] = useState(DEMO_TODAY);
  const [planTitle, setPlanTitle] = useState('沿用上次结构，记录一次实际训练');
  const [planMinutes, setPlanMinutes] = useState('30');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef(screen);
  const latest = [...state.records].filter(r => r.outcome === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];
  const reviewCurrent = reviewIsCurrent(state.review, state.records);
  const habitWeek = habitDates(state.habit, { from: '2026-10-05', to: '2026-10-11' });
  const learning = state.learning;
  const explanationCurrent = learning.explainedSource === learningFingerprint(learning);
  const feedbackCurrent = learning.feedbackSource === feedbackFingerprint(learning);

  function change(update: (previous: HabitDemo) => HabitDemo) {
    const next = update(stateRef.current);
    stateRef.current = next; setState(next);
    try { localStorage.setItem(HABIT_DEMO_KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('浏览器保存失败，内容暂留在当前页面。请导出备份或重试后再离开。'); }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    if (previousScreen.current === screen) return;
    previousScreen.current = screen; heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 });
  }, [screen]);
  function go(page: Screen) { setParams({ page }); setAiError(''); }
  function open(next: Sheet) { setError(''); setAiError(''); setSheet(next); }
  function setRange(value: string) {
    setPeriod(value);
    if (value !== 'custom') { setFrom(shiftDate(DEMO_TODAY, value === 'all' ? -89 : -(Number(value) - 1))); setTo(DEMO_TODAY); }
  }
  function exportDemo() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(stateRef.current, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'growthpilot-habits-demo.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function editDraft(patch: Partial<WorkoutDraft>) { change(s => ({ ...s, draft: s.draft ? { ...s.draft, ...patch } : null })); }
  function record(date = DEMO_TODAY, plan?: Plan) {
    if (stateRef.current.draft) { setSheet('record'); setNotice('已恢复尚未保存的草稿。完成或放弃后可新建另一条。'); return; }
    const existing = plan ? state.records.find(r => r.planId === plan.id) : null;
    const draft = existing ? draftOf(existing) : plan && latest ? { ...reuseWorkout(latest, date), title: plan.title, planId: plan.id }
      : { ...blankDraft(date), title: plan?.title ?? '', planId: plan?.id };
    change(s => ({ ...s, draft })); open('record');
  }
  function edit(record: Workout) {
    if (stateRef.current.draft && stateRef.current.draft.id !== record.id) { setSheet('record'); setNotice('先完成或放弃当前草稿，再纠正另一条记录。'); return; }
    change(s => ({ ...s, draft: draftOf(record) })); open('record');
  }
  function persist(record: Workout, recover = false) {
    if (saveBusy) return;
    setSaveBusy(true); setError(''); change(s => ({ ...s, pending: record }));
    saveTimer.current = setTimeout(() => {
      setSaveBusy(false);
      if (scenario === 'save' && !recover) { setError('模拟保存失败。原输入已保存在浏览器，重试会继续保存同一条。'); return; }
      try {
        change(s => {
          const next = commitWorkout(s, record);
          return scenario === 'receipt' && !recover ? { ...next, pending: record, draft: s.draft } : next;
        });
        if (scenario === 'receipt' && !recover) { setError('模拟回执丢失：记录已经写入原型，确认结果尚未收到。重试不会增加副本。'); return; }
        if (recover) setScenario('normal'); setSheet(null); go('records'); setView('list');
        setNotice(record.version > 1 ? '纠正已保存，原始来源和旧版本仍可查看。' : '实际记录已保存到此浏览器的原型。');
      } catch (e) { setError((e as Error).message); }
    }, 750);
  }
  function submitRecord(event: FormEvent) {
    event.preventDefault();
    try { if (state.draft) persist(state.pending ?? freezeWorkout(state.draft, state.records)); }
    catch (e) { setError((e as Error).message); }
  }
  function runAI(action: typeof aiAction, retry = false) {
    if (busy) return;
    setAiAction(action);
    const snapshot = structuredClone(stateRef.current);
    const capturedRange = { from, to };
    if (action === 'capture' && !snapshot.raw.trim()) { setAiError('先写一句实际发生的事，或选择手动记录。'); return; }
    if (action === 'expert' && (!rangeValid || !rangeSummary(recordsInRange(snapshot.records, capturedRange)).count)) { setAiError('当前范围没有可回顾的已完成训练。先记录，或调整日期范围。'); return; }
    if ((action === 'explain' || action === 'feedback') && !snapshot.learning.excerpt.trim()) { setAiError('先粘贴一段材料。原型不会读取链接，也不会凭网址解释内容。'); return; }
    if (action === 'feedback' && !snapshot.learning.answer.trim()) { setAiError('先写下自己的答案，练习才有可以讨论的内容。'); return; }
    setBusy(action); setAiError('');
    timer.current = setTimeout(() => {
      setBusy('');
      if (scenario === 'ai' && !retry) { setAiError('模拟 AI 服务失败。原记录、材料与答案均已保留，可以重试或继续手动操作。'); return; }
      if (retry) setScenario('normal');
      try {
        if (action === 'capture') change(s => ({ ...s, candidate: candidateFromText(snapshot.raw) }));
        if (action === 'expert') change(s => ({ ...s, review: createReview(snapshot.records, capturedRange), reviewHistory: [...(s.reviewHistory ?? []), ...(s.review ? [s.review] : [])] }));
        if (action === 'explain') change(s => ({ ...s, learning: { ...s.learning, explainedSource: learningFingerprint(snapshot.learning),
          explanation: `预设帮助示例：先用自己的话解释你选中的材料，再找一个自己的具体例子，最后回到原文核对。\n\n本次材料摘录：\n「${snapshot.learning.excerpt.slice(0, 400)}」\n\n应用练习：用一个来自自己工作或学习的例子解释这段材料，并写出一个仍不确定的问题。这个示例只演示交互，未使用模型判断材料。` } }));
        if (action === 'feedback') change(s => ({ ...s, learning: { ...s.learning, feedbackSource: feedbackFingerprint(snapshot.learning),
          feedback: `预设反馈示例：你已提交自己的答案。请对照材料检查是否解释了关键概念、是否有一个实际例子，以及还缺什么依据。\n\n你的答案：\n「${snapshot.learning.answer.slice(0, 500)}」\n\n可以把核对后的例子写入下方应用结果。此反馈未评判答案正确与否，不代表掌握或评分。` } }));
      } catch (e) { setAiError((e as Error).message); }
    }, 1000);
  }
  function updateLearning(patch: Partial<LearningDemo>) { change(s => ({ ...s, learning: { ...s.learning, ...patch } })); }
  function adoptCandidate() {
    if (!state.candidate) return;
    if (state.draft) { setAiError('已有一份记录草稿。先完成或放弃草稿，再采用候选。'); return; }
    change(s => ({ ...s, draft: s.candidate, candidate: null })); setSheet('record'); setError('');
  }
  function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!state.review || !reviewCurrent) { setError('依据已经改变，请重新回顾后再采用安排。'); return; }
    if (!validDate(planDate) || planDate < DEMO_TODAY || !planTitle.trim() || !Number.isInteger(Number(planMinutes)) || Number(planMinutes) < 1 || Number(planMinutes) > 1440) { setError('请填写今天或之后的日期、名称和 1–1440 分钟的预计时间。'); return; }
    const id = `review-plan:${state.review.id}`;
    if (state.records.some(r => r.planId === id)) { setError('这次安排已有实际反馈，保留原安排。需要新的活动时请重新回顾。'); return; }
    change(s => ({ ...s, plans: [...s.plans.filter(p => p.id !== id), { id, date: planDate, title: planTitle.trim(), minutes: Number(planMinutes), sourceIds: state.review!.records.map(r => r.id) }] }));
    setSheet(null); go('today'); setNotice('安排已采用。实际训练还需要由你完成并记录。');
  }
  function openPlan() {
    if (!state.review) return;
    const id = `review-plan:${state.review.id}`;
    const adopted = state.plans.find(p => p.id === id);
    if (state.records.some(r => r.planId === id)) { go('today'); setNotice('已采用的安排已有实际反馈，可以在今日查看。'); return; }
    setPlanDate(adopted?.date ?? DEMO_TODAY);
    setPlanTitle(adopted?.title ?? '沿用上次结构，记录一次实际训练');
    setPlanMinutes(String(adopted?.minutes ?? 30));
    open('plan');
  }
  function renderRecord(item: Workout) {
    return <article className="hp-record" key={item.id}>
      <div className={`hp-record-mark ${item.outcome === 'skipped' ? 'is-skipped' : ''}`}><Glyph name={item.outcome === 'skipped' ? 'clock' : 'weight'} /></div>
      <div className="hp-record-body"><div className="hp-row"><h3>{item.title}</h3><span className="hp-tag">{item.outcome === 'skipped' ? '本人确认未执行' : '已记录实际训练'}</span></div>
        <p>{shortDate(item.date)} · {item.outcome === 'skipped' ? '不计入训练次数和时长' : item.minutes === null ? '实际时长未填写' : `${item.minutes} 分钟 · 本人填写`}</p>
        {!!item.exercises.length && <div className="hp-exercises">{item.exercises.map((e, i) => <span key={i}>{e.name} <b>{e.kg} kg</b> · {e.sets} × {e.reps}</span>)}</div>}
        {item.note && <p className="hp-record-note">{item.note}</p>}
        <div className="hp-row hp-record-footer"><small>{SOURCE[item.source]} · v{item.version}</small><button className="hp-text" onClick={() => edit(item)}>查看 / 纠正 <Glyph name="arrow" size={14} /></button></div>
        <details><summary>原始来源{item.revisions.length ? `与 ${item.revisions.length} 个旧版本` : ''}</summary><pre>{item.original}</pre>{item.revisions.map(v => <p key={v.version}>v{v.version} · {v.date} · {v.title} · {v.minutes ?? '未知'} 分钟<br />{v.exercises.map(e => `${e.name} ${e.kg}kg ${e.sets}×${e.reps}`).join('；')}<br />{v.note}</p>)}</details>
      </div>
    </article>;
  }
  function scopeControl() {
    return <div className="hp-range"><label>回看范围<select value={period} onChange={e => setRange(e.target.value)}><option value="7">最近 7 天</option><option value="28">最近 28 天</option><option value="all">最近 90 天</option><option value="custom">自选日期</option></select></label>
      {period === 'custom' ? <><label>起始日期<input type="date" value={from} max={DEMO_TODAY} onChange={e => setFrom(e.target.value)} /></label><label>结束日期<input type="date" value={to} max={DEMO_TODAY} onChange={e => setTo(e.target.value)} /></label></> : <span>{shortDate(from)} — {shortDate(to)}</span>}
      {!rangeValid && <p className="hp-error" role="alert">请选择有效范围，结束日期不能晚于示例今天。</p>}
    </div>;
  }
  function planCard(plan: Plan) {
    const feedback = state.records.find(r => r.planId === plan.id);
    return <article className="hp-plan" key={plan.id}><div><span className="hp-eyebrow">{shortDate(plan.date)} · 预计 {plan.minutes} 分钟</span><h3>{plan.title}</h3><p>{feedback ? feedback.outcome === 'skipped' ? '本人反馈：未执行' : '已有实际训练反馈' : plan.date < DEMO_TODAY ? '尚未记录 · 实际情况未知' : '等待本人进行 · 尚无实际结果'}</p></div>
      <button className="hp-outline" disabled={plan.date > DEMO_TODAY} onClick={() => record(plan.date, plan)}>{feedback ? '查看实际反馈' : '记录实际情况'}</button></article>;
  }
  const aiStatus = <>{busy && <p className="hp-status" role="status"><Glyph name="spark" size={16} /> 模拟处理中，原内容仍保留…</p>}{aiError && <div className="hp-error" role="alert">{aiError}<button className="hp-text" onClick={() => runAI(aiAction, true)}>重新尝试</button></div>}</>;

  return <div className="hp-app">
    <a className="hp-skip" href="#hp-content">跳到主要内容</a>
    <aside className="hp-sidebar"><a className="hp-brand" href="/prototype/habits"><span>g<span className="hp-brand-dot">.</span></span> GrowthPilot</a><p className="hp-sidebar-caption">从生活的真实记录开始</p>
      <nav aria-label="个人数据原型导航">{NAV.map(n => <button key={n.id} className={screen === n.id ? 'is-active' : ''} aria-current={screen === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Glyph name={n.glyph} />{n.label}{n.id === 'expert' && <span>可选</span>}</button>)}</nav>
      <div className="hp-sidebar-bottom"><span className="hp-eyebrow">一点一点，成为习惯</span><p>先留下发生过的事。<br />需要时，再请 AI 一起想。</p><button className="hp-text" onClick={() => open('habit')}>我的训练节奏 <Glyph name="arrow" size={14} /></button></div>
    </aside>
    <div className="hp-shell"><header className="hp-toolbar"><span className="hp-demo-badge">D0 体验原型</span><span className="hp-demo-note">独立示例 · AI 为模拟 · 仅保存到此浏览器</span><details className="hp-tools"><summary>体验设置</summary><div><label>异常体验<select value={scenario} onChange={e => setScenario(e.target.value as Scenario)}><option value="normal">正常流程</option><option value="save">保存失败</option><option value="receipt">回执丢失</option><option value="ai">AI 失败</option></select></label><button onClick={exportDemo}>导出原型内容</button><button onClick={() => open('reset')}>从空记录开始 / 恢复示例</button><a href="/prototype/personal">已有工作与学习原型 ↗</a></div></details></header>
      {storageError && <div className="hp-storage-error" role="alert">{storageError}<button onClick={() => change(s => ({ ...s }))}>重试浏览器保存</button><button onClick={exportDemo}>导出备份</button></div>}
      {notice && <div className="hp-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}><Glyph name="close" size={16} /></button></div>}
      <main id="hp-content" className="hp-main"><div className="hp-page-heading"><div><span className="hp-eyebrow">{screen === 'today' ? '2026 年 10 月 8 日 · 星期四 · 示例今天' : screen === 'records' ? '我的数据 / 健身' : screen === 'learn' ? '理解 · 练习 · 应用' : '基于我的记录 · 按需使用'}</span><h1 ref={heading} tabIndex={-1}>{screen === 'today' ? '留下今天的一点进步。' : screen === 'records' ? '每一次训练，都有迹可循。' : screen === 'learn' ? '把看懂，变成会用。' : '和自己的记录聊一聊。'}</h1><p>{screen === 'today' ? '记录实际发生的事，回看自己的节奏，需要时再获得帮助。' : screen === 'records' ? '明细、日历与趋势共用同一份记录。你可以随时核对和纠正。' : screen === 'learn' ? '带来一段材料，留下自己的理解和实际应用。' : '健身记录回顾继承所选时间范围，建议由你决定是否采用。'}</p></div>{screen !== 'learn' && <button className="hp-primary" onClick={() => record()}><Glyph name="plus" size={17} />{state.draft ? '继续记录草稿' : '记录一次训练'}</button>}</div>

        {(screen === 'expert' || screen === 'learn') && <section className="hp-card"><details><summary>这次帮助使用什么方法 · 交互示例</summary>{screen === 'expert' ? <><h3>训练量与记录比较</h3><p>按同名动作计算已记录的组数、次数和外部重量量；只比较不同日期、组次相同的记录。示例：20 kg × 3 组 × 8 次 = 480 kg·次。</p><p>动作、器械、努力程度与恢复情况不足时，保留限制，不从重量变化推断力量增长。</p><a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noreferrer">ACSM 方法来源 ↗</a></> : <><h3>先尝试，再按标准核对</h3><p>从材料中提出引导问题，准备提取练习；提示逐级展开，答案按已保存的检查项核对。</p><details><summary>提示 1 · 回忆方向</summary><p>先合上原文，回忆这段材料的关键步骤。</p></details><details><summary>提示 2 · 拆解</summary><p>分别写下先做什么、再做什么。</p></details><details><summary>提示 3 · 核对位置</summary><p>回到材料中描述步骤顺序的句子，核对自己的答案。</p></details><p>示例检查项 C1：解释步骤顺序。反馈须给出材料依据和本次答案依据。</p><a href="https://ies.ed.gov/ncee/wwc/PracticeGuide/1" target="_blank" rel="noreferrer">IES 方法来源 ↗</a></>}<p className="hp-caption">此处演示方法与来源展示；真实执行结果在登录后的健身回顾和学习页中查看。</p></details></section>}

        {screen === 'today' && <>
          <div className="hp-today-grid"><section className="hp-hero-card"><span className="hp-eyebrow">今天的小入口</span><h2>{state.records.length ? '按自己的节奏，继续。' : '第一条记录，从你开始。'}</h2><p>刚做完训练？留下一次实际记录。<br />不必先制定计划，也可以直接跳过 AI。</p><div className="hp-actions"><button className="hp-primary" onClick={() => record()}>{state.draft ? '继续未完成的记录' : '手动记录'}<Glyph name="arrow" size={16} /></button>{latest && <button className="hp-outline" onClick={() => { if (state.draft) { record(); return; } change(s => ({ ...s, draft: reuseWorkout(latest) })); open('record'); }}>复用上次结构</button>}</div><button className="hp-text hp-assist-link" onClick={() => open('capture')}><Glyph name="spark" size={15} /> 已有一句话？帮我整理 · 模拟</button><div className="hp-hero-art" aria-hidden="true"><span /><span /><span /><i /><b><Glyph name="weight" size={38} /></b></div></section>
            <section className="hp-card hp-rhythm"><div className="hp-row"><span className="hp-eyebrow">我的训练节奏</span><button className="hp-text" onClick={() => open('habit')}>调整</button></div><h2>{state.habit.enabled ? `每周 ${state.habit.days.length} 次，留给自己。` : '按需记录，也很好。'}</h2><p>{state.habit.enabled ? `周${state.habit.days.map(d => WEEKDAYS[d]).join('、周')} · ${state.habit.time} · 本人设置` : '你可以设一个适合自己的节奏，或保持随手记录。'}</p><div className="hp-week">{Array.from({ length: 7 }, (_, i) => shiftDate('2026-10-05', i)).map(date => { const r = state.records.filter(r => r.date === date), done = r.some(r => r.outcome === 'completed'), skip = r.some(r => r.outcome === 'skipped'), scheduled = habitWeek.includes(date); return <button key={date} className={`${date === DEMO_TODAY ? 'is-today' : ''} ${done ? 'is-done' : ''}`} aria-label={`${shortDate(date)}，${done ? '有训练记录' : skip ? '本人确认未执行' : scheduled ? '习惯安排，尚未记录' : '未安排，实际未知'}`} onClick={() => { go('records'); setView('calendar'); setSelectedDay(date); setMonth(date.slice(0, 7)); }}><small>{WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]}</small><span>{done ? <Glyph name="check" size={17} /> : skip ? '—' : Number(date.slice(8))}</span><i className={scheduled ? 'has-plan' : ''} /></button>; })}</div><small>实心：已记录 · 小点：习惯安排 · 空白：实际未知</small></section></div>
          <div className="hp-section-heading"><h2>继续上次，或留一个新结果</h2><button className="hp-text" onClick={() => go('records')}>查看全部记录 <Glyph name="arrow" size={15} /></button></div>
          <div className="hp-two-columns"><section className="hp-card hp-last">{latest ? <><span className="hp-eyebrow">上次实际记录 · {shortDate(latest.date)}</span><h3>{latest.title}</h3><p>{latest.exercises.map(e => `${e.name} ${e.kg} kg · ${e.sets} × ${e.reps}`).join(' / ') || '没有填写动作明细'}</p><p>{latest.note}</p><button className="hp-text" onClick={() => edit(latest)}>查看原始记录 <Glyph name="arrow" size={15} /></button></> : <><h3>还没有自己的训练记录</h3><p>可以只写活动名称和日期。未知时长留空，之后再补。</p><button className="hp-text" onClick={() => record()}>留下第一条 <Glyph name="arrow" size={15} /></button></>}</section><section className="hp-card hp-learning-teaser"><Glyph name="book" size={25} /><h3>学习也可以这样开始。</h3><p>贴一段材料，写下没看懂的地方，再用自己的例子试一次。</p><button className="hp-text" onClick={() => go('learn')}>继续学习 <Glyph name="arrow" size={15} /></button></section></div>
          {!!state.plans.length && <><div className="hp-section-heading"><h2>我采用的下一步</h2><span>预计安排与实际结果分开</span></div><section className="hp-card">{state.plans.map(planCard)}</section></>}
        </>}

        {screen === 'records' && <>{scopeControl()}<div className="hp-stat-grid"><div><strong>{summary.count}<small> 次</small></strong><span>本人记录的训练</span></div><div><strong>{summary.minutes}<small> 分钟</small></strong><span>{summary.knownMinutes} 次填写了实际时长</span></div><div><strong>{summary.skipped}<small> 次</small></strong><span>明确反馈未执行</span></div><div className="hp-stat-note">未记录 ≠ 未训练<br />不以时长判断能力提升</div></div><div className="hp-view-bar"><div className="hp-tabs" aria-label="数据查看方式">{(['list', 'calendar', 'trend'] as const).map((v, i) => <button key={v} className={view === v ? 'is-active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{['明细', '日历', '趋势'][i]}</button>)}</div><button className="hp-text" onClick={() => go('expert')}><Glyph name="spark" size={16} />请帮我回顾这个范围</button></div>
          {view === 'list' && <section className="hp-card hp-record-list">{scoped.length ? scoped.map(renderRecord) : <div className="hp-empty"><Glyph name="weight" size={34} /><h2>这段时间还没有记录</h2><p>你可以扩大范围，也可以手动留下第一条。无需先使用 AI。</p><button className="hp-primary" onClick={() => record()}>手动记录</button></div>}</section>}
          {view === 'calendar' && <div className="hp-calendar-layout"><section className="hp-card"><div className="hp-row"><h2>{month.replace('-', ' 年 ')} 月</h2><div className="hp-actions"><button className="hp-outline hp-icon-button" aria-label="上个月" onClick={() => setMonth(shiftDate(`${month}-01`, -1).slice(0, 7))}>←</button><button className="hp-outline hp-icon-button" aria-label="下个月" onClick={() => setMonth(shiftDate(`${month}-28`, 7).slice(0, 7))}>→</button></div></div><div className="hp-calendar">{['一', '二', '三', '四', '五', '六', '日'].map(d => <span key={d} className="hp-calendar-weekday">{d}</span>)}{monthDays(month).map(date => { const found = scoped.filter(r => r.date === date), done = found.some(r => r.outcome === 'completed'), skipped = found.some(r => r.outcome === 'skipped'); return <button key={date} aria-label={`${shortDate(date)}，${done ? '有训练记录' : skipped ? '确认未执行' : '此范围内没有记录'}`} className={`${date === selectedDay ? 'is-selected' : ''} ${date.slice(0, 7) !== month ? 'is-outside' : ''}`} onClick={() => setSelectedDay(date)}><span>{Number(date.slice(8))}</span><i className={done ? 'is-done' : skipped ? 'is-skipped' : ''} /></button>; })}</div><p className="hp-caption">日历仅显示所选范围的实际记录。绿色：有训练 · 短线：明确未执行。</p></section><section className="hp-card hp-day-records"><h2>{shortDate(selectedDay)}</h2>{scoped.filter(r => r.date === selectedDay).map(renderRecord)}{!scoped.some(r => r.date === selectedDay) && <div className="hp-empty"><h3>暂无范围内的实际记录</h3><p>{selectedDay < from || selectedDay > to ? '这一天不在当前回看范围内，请调整范围。' : '记录为空，实际情况未知。'}</p>{selectedDay <= DEMO_TODAY && <button className="hp-outline" onClick={() => record(selectedDay)}>补记这一天</button>}</div>}</section></div>}
          {view === 'trend' && <section className="hp-card hp-trend"><div className="hp-row"><div><span className="hp-eyebrow">同一动作 · 记录重量</span><h2>回看变化，不急着下结论。</h2></div><label>动作<select value={activeMovement} onChange={e => setMovement(e.target.value)}>{names.length ? names.map(n => <option key={n}>{n}</option>) : <option value="">暂无动作</option>}</select></label></div><p className="hp-caption">每个有记录日的最大填写重量，单位 kg。组数和次数在明细中核对；不代表力量或健康指标。</p>{points.length < 2 ? <div className="hp-empty"><h3>至少需要两个不同日期的同动作记录</h3><p>当前 {points.length} 个记录日。不会补造缺失的点或推断改善。</p></div> : <><div className="hp-plot"><svg viewBox="0 0 600 200" role="img" aria-label={`${activeMovement}按实际记录日的最大重量，${points.map(p => `${p.date} ${p.kg}kg`).join('，')}`}><path d="M30 165H570" stroke="#dde5dc" />{points.map((p, i) => { const x = 45 + i * 510 / (points.length - 1), y = 150 - p.kg / Math.max(...points.map(v => v.kg), 1) * 110; const prev = points[i - 1]; return <g key={p.date}>{prev && <line x1={45 + (i - 1) * 510 / (points.length - 1)} y1={150 - prev.kg / Math.max(...points.map(v => v.kg), 1) * 110} x2={x} y2={y} stroke="#52755d" strokeWidth="2" />}<circle cx={x} cy={y} r="5" fill="#52755d" /><text x={x} y={y - 14} textAnchor="middle">{p.kg} kg</text><text x={x} y="190" textAnchor="middle">{p.date.slice(5)}</text></g>; })}</svg></div><p className="hp-caption">横轴按有记录的日期等距排列，连线只帮助读数，不表示无记录日期的活动。</p><div className="hp-point-list">{points.map(p => <button key={p.date} onClick={() => { setView('calendar'); setMonth(p.date.slice(0, 7)); setSelectedDay(p.date); }}><span>{shortDate(p.date)}</span><b>{p.kg} kg</b><small>查看 {p.recordIds.length} 条原记录 →</small></button>)}</div></>}</section>}
        </>}

        {screen === 'expert' && <>{scopeControl()}<div className="hp-expert-layout"><section className="hp-card hp-expert-intro"><span className="hp-expert-avatar"><Glyph name="spark" size={30} /></span><span className="hp-eyebrow">健身记录回顾 · 模拟</span><h2>先看你实际留下了什么。</h2><p>当前范围有 {scoped.length} 条记录，包含 {summary.count} 次训练。回顾会引用这些记录，不要求你重新描述自己。</p><button className="hp-primary" disabled={!!busy || !rangeValid} onClick={() => runAI('expert')}>回顾这些记录<Glyph name="arrow" size={16} /></button><p className="hp-caption">此原型只演示带依据的回顾与安排，不提供个体训练处方。你也可以只使用数据页面。</p><button className="hp-text" onClick={() => go('records')}>返回数据查看</button>{aiStatus}</section><section className="hp-card hp-review">{state.review && reviewCurrent ? <><div className="hp-row"><span className="hp-eyebrow">AI 回顾 · 预设示例</span><span className="hp-tag">{state.review.records.length} 条依据</span></div><h2>从记录里看到自己的节奏。</h2><p>{state.review.summary}</p><details open><summary>本次使用的原记录 · {state.review.from} — {state.review.to}</summary><div className="hp-citations">{state.review.records.map(r => <button key={r.id} onClick={() => edit(r)}><span>{shortDate(r.date)} · {r.title}</span><small>{r.outcome === 'skipped' ? '本人确认未执行' : `${r.minutes ?? '未知'} 分钟`} · v{r.version} ↗</small></button>)}</div></details>{state.review.from !== from || state.review.to !== to ? <p className="hp-caption">查看范围已改变，这份回顾保留原范围。点击“回顾这些记录”生成新示例。</p> : null}<div className="hp-suggestion"><span className="hp-eyebrow">可以采用的下一步</span><h3>让下一次留下完整的实际反馈。</h3><p>{state.review.suggestion}</p><button className="hp-outline" onClick={openPlan}>{state.records.some(r => r.planId === `review-plan:${state.review!.id}`) ? '查看已采用安排与反馈' : state.plans.some(p => p.id === `review-plan:${state.review!.id}`) ? '调整已采用的安排' : '看看安排，再决定'}</button></div></> : <div className="hp-empty"><Glyph name="spark" size={35} /><h2>{state.review ? '原记录已纠正，请重新回顾' : '帮助在这里，随时开始。'}</h2><p>{state.review ? '旧解读和建议已隐藏，避免继续使用改变的依据。已采用的安排保留。' : '选择时间范围，回顾结果和每条依据会出现在这里。没有记录时，先从记录开始。'}</p></div>}</section></div></>}

        {screen === 'expert' && <section className="hp-card"><span className="hp-eyebrow">连续周期 · D3 交互示例</span><h2>下一轮接上实际反馈</h2><p>此处演示周期选择与历史，使用独立示例，不实际后台运行。</p><div className="hp-row">{[7,14,28].map(days => <button className="hp-outline" key={days} onClick={()=>{change(s=>({...s,reviewRules:[...(s.reviewRules ?? []),{enabled:true,days,version:(s.reviewRules?.length ?? 0)+1}]}));setNotice(`已保存每 ${days} 天回顾的模拟规则。`);}}>每 {days} 天回顾</button>)}<button className="hp-text" onClick={()=>change(s=>({...s,reviewRules:[...(s.reviewRules ?? []),{enabled:false,days:s.reviewRules?.at(-1)?.days ?? 7,version:(s.reviewRules?.length ?? 0)+1}]}))}>暂停模拟回顾</button></div><p>当前：{state.reviewRules?.at(-1)?.enabled ? `每 ${state.reviewRules.at(-1)!.days} 天回顾 · 模拟` : '周期回顾未启用'}</p><button className="hp-outline" onClick={()=>{setFrom(shiftDate(DEMO_TODAY,-13));setTo(shiftDate(DEMO_TODAY,-7));}}>查看上一周期的记录</button><button className="hp-outline" onClick={()=>{setFrom(shiftDate(DEMO_TODAY,-6));setTo(DEMO_TODAY);}}>查看本周期的实际反馈</button><p>选择范围后点击“回顾这些记录”生成预设示例；采用安排后，到今日填写实际活动。两个周期的记录不合并为一次训练。</p><details><summary>周期规则历史 · {state.reviewRules?.length ?? 0} 版</summary>{state.reviewRules?.map(rule=><p key={rule.version}>v{rule.version} · {rule.enabled ? `每 ${rule.days} 天` : '已暂停'}</p>)}</details><details><summary>已保存的上轮回顾 · {state.reviewHistory?.length ?? 0} 份</summary>{state.reviewHistory?.map(review=><article key={review.id}><h3>{review.from} — {review.to}</h3>{reviewIsCurrent(review,state.records) ? <><p>{review.summary}</p>{review.records.map(r=><button className="hp-text" key={r.id} onClick={()=>edit(r)}>{r.date} · {r.title} · v{r.version}</button>)}</> : <p>来源已纠正，旧解读已隐藏。已采用安排仍保留。</p>}</article>)}</details></section>}
        {screen === 'learn' && <div className="hp-learning-layout"><section className="hp-card hp-learning-source"><span className="hp-eyebrow">01 / 我的材料</span><label>学习事项<input value={learning.title} onChange={e => updateLearning({ title: e.target.value })} placeholder="想理解或学会什么？" /></label><label>资料链接 · 可选<input type="url" value={learning.url} onChange={e => updateLearning({ url: e.target.value })} placeholder="https://…" /></label>{learning.url && (safeUrl(learning.url) ? <a className="hp-text" href={safeUrl(learning.url)!} target="_blank" rel="noreferrer">打开原资料 ↗</a> : <p className="hp-error">请输入有效的 http 或 https 链接。</p>)}<label>粘贴一段原文<textarea aria-label="粘贴一段原文" rows={7} value={learning.excerpt} onChange={e => updateLearning({ excerpt: e.target.value })} placeholder="无法读取链接时，也可以用自己的摘录开始。" /></label><p className="hp-caption">原型仅使用你粘贴的摘录，不会抓取网址内容。摘录和自己的笔记分别保存。</p><label>我的疑问<input value={learning.question} onChange={e => updateLearning({ question: e.target.value })} /></label><button className="hp-outline" disabled={!!busy} onClick={() => runAI('explain')}><Glyph name="spark" size={16} />解释并给一个应用练习 · 模拟</button><label>我的理解与笔记<textarea aria-label="我的理解与笔记" rows={4} value={learning.notes} onChange={e => updateLearning({ notes: e.target.value })} placeholder="不需要 AI，也可以直接写自己的理解。" /></label></section><div className="hp-learning-work"><section className="hp-card"><span className="hp-eyebrow">02 / 理解与练习</span>{busy && (busy === 'explain' || busy === 'feedback') ? aiStatus : aiError ? aiStatus : null}{learning.explanation && explanationCurrent ? <div className="hp-ai-output"><pre>{learning.explanation}</pre><details><summary>查看本次材料依据</summary><pre>{learning.excerpt}</pre></details></div> : <p>{learning.explanation ? '材料或问题已改变，旧帮助已隐藏。可重新生成示例。' : '可以请 AI 演示帮助，也可以先用自己的话解释材料。'}</p>}<label>我的练习答案<textarea aria-label="我的练习答案" rows={5} value={learning.answer} onChange={e => updateLearning({ answer: e.target.value })} placeholder="用自己的例子说明：它解决什么问题，怎样应用，还有什么不确定？" /></label><button className="hp-outline" disabled={!!busy} onClick={() => runAI('feedback')}>看看我的答案 · 模拟</button>{learning.feedback && feedbackCurrent && <div className="hp-ai-output"><span className="hp-eyebrow">示例反馈 · 引用材料和我的答案</span><pre>{learning.feedback}</pre></div>}{learning.feedback && !feedbackCurrent && <p className="hp-caption">材料或答案已变化，旧反馈已隐藏。可以再次提交。</p>}</section><section className="hp-card hp-application"><span className="hp-eyebrow">03 / 带回真实应用</span><h2>我把它用在了哪里？</h2><label>实际应用结果<textarea aria-label="实际应用结果" rows={4} value={learning.application} onChange={e => updateLearning({ application: e.target.value })} placeholder="写下实际做了什么、产出在哪里，以及下一步。" /></label><p className="hp-caption">本人笔记、答案和结果即时保存到原型。生成解释、阅读或计时不会自动标记掌握。</p></section></div></div>}
        {screen === 'expert' && <FitnessContextPrototype/>}
        <footer className="hp-footer"><span>你的记录是起点，AI 帮助按需加入。</span><span>{storageError ? '当前内容仅留在页面' : '原型修改即时保存在此浏览器'}</span></footer>
      </main>
    </div>
    <nav className="hp-mobile-nav" aria-label="手机导航">{NAV.map(n => <button key={n.id} aria-current={screen === n.id ? 'page' : undefined} className={screen === n.id ? 'is-active' : ''} onClick={() => go(n.id)}><Glyph name={n.glyph} size={21} /><span>{n.label}</span></button>)}</nav>

    {sheet && <Modal label={sheet === 'record' ? '实际训练记录' : sheet === 'capture' ? '整理原话候选' : sheet === 'habit' ? '调整我的训练节奏' : sheet === 'plan' ? '采用下一步安排' : '重置独立原型'} className="hp-dialog" initialFocus={sheet === 'record' ? 'input:not(:disabled)' : undefined} onClose={() => { if (!saveBusy) setSheet(null); }}><div className="hp-dialog-header"><div><span className="hp-eyebrow">{sheet === 'record' ? '实际发生 · 本人核对' : sheet === 'capture' ? '原话保留 · 候选可纠正' : '仅作用于独立原型'}</span><h2>{sheet === 'record' ? '这一次，实际做了什么？' : sheet === 'capture' ? '说清发生的事，轻松留下记录。' : sheet === 'habit' ? '给自己一个合适的节奏。' : sheet === 'plan' ? '先看看下一次的安排。' : '选择原型起点'}</h2></div><button className="hp-icon-button" disabled={saveBusy} aria-label="暂存并关闭" onClick={() => setSheet(null)}><Glyph name="close" /></button></div>
      {sheet === 'record' && state.draft && <form onSubmit={submitRecord}><fieldset disabled={saveBusy || !!state.pending} className="hp-fieldset"><div className="hp-form-grid"><label>实际发生日期<input type="date" value={state.draft.date} max={DEMO_TODAY} onChange={e => editDraft({ date: e.target.value })} required /></label><label>这次的实际情况<select value={state.draft.outcome} onChange={e => editDraft({ outcome: e.target.value as Workout['outcome'] })}><option value="completed">实际进行了活动</option><option value="skipped">明确没有执行</option></select></label></div><label>活动名称<input value={state.draft.title} onChange={e => editDraft({ title: e.target.value })} placeholder="例如：下班后的力量训练" required /></label>{state.draft.outcome === 'completed' && <><label>实际用时 · 可留空<input type="number" min="1" max="1440" step="1" value={state.draft.minutes} onChange={e => editDraft({ minutes: e.target.value })} placeholder="分钟，未知时留空" /></label><div className="hp-row"><h3>动作明细 · 可选</h3><button type="button" className="hp-text" onClick={() => editDraft({ exercises: [...state.draft!.exercises, { name: '', kg: '', sets: '', reps: '' }] })}><Glyph name="plus" size={15} />添加动作</button></div>{state.draft.exercises.map((ex, i) => <div className="hp-exercise-input" key={i}>{(['name', 'kg', 'sets', 'reps'] as const).map((field, fi) => <label key={field}>{['动作', '重量 kg', '组数', '每组次数'][fi]}<input aria-label={`${['动作', '重量 kg', '组数', '每组次数'][fi]} ${i + 1}`} type={field === 'name' ? 'text' : 'number'} value={ex[field]} min={field === 'kg' ? 0 : 1} step={field === 'kg' ? 'any' : 1} onChange={e => editDraft({ exercises: state.draft!.exercises.map((v, index) => index === i ? { ...v, [field]: e.target.value } : v) })} /></label>)}<button type="button" className="hp-text" aria-label={`移除动作 ${i + 1}`} onClick={() => editDraft({ exercises: state.draft!.exercises.filter((_, index) => index !== i) })}><Glyph name="close" size={17} /></button></div>)}<p className="hp-caption">可只记活动。填写动作时请核对全部数值；自重可记 0 kg，未知值不补零。</p></>}<label>{state.draft.outcome === 'skipped' ? '原因或下一步 · 可选' : '实际感受或卡点 · 可选'}<textarea aria-label={state.draft.outcome === 'skipped' ? '原因或下一步 · 可选' : '实际感受或卡点 · 可选'} rows={3} value={state.draft.note} onChange={e => editDraft({ note: e.target.value })} /></label>{state.draft.source === 'reuse' && <p className="hp-caption">已复用上次的动作结构。用时和感受需要重新填写，请核对本次实际数值。</p>}{state.draft.original && <details><summary>查看保留的原话</summary><pre>{state.draft.original}</pre></details>}</fieldset>{error && <p className="hp-error" role="alert">{error}</p>}{state.pending && !saveBusy && <button type="button" className="hp-outline" onClick={() => persist(state.pending!, true)}>重试同一条记录</button>}<div className="hp-dialog-actions"><button type="button" className="hp-text" disabled={saveBusy} onClick={() => setSheet(null)}>暂存并关闭</button>{!state.pending && <button type="button" className="hp-text" onClick={() => { change(s => ({ ...s, draft: null })); setSheet(null); setNotice('记录草稿已放弃，已有记录保留。'); }}>放弃这份草稿</button>}<button className="hp-primary" disabled={saveBusy || !!state.pending}>{saveBusy ? '正在模拟保存…' : state.draft.baseVersion ? '保存纠正' : '核对并保存实际记录'}</button></div></form>}
      {sheet === 'capture' && <div><label>我的原话<textarea aria-label="我的原话" rows={4} disabled={!!busy} value={state.raw} onChange={e => change(s => ({ ...s, raw: e.target.value, candidate: null }))} placeholder="今天训练35分钟，深蹲40kg 3组8次，整体感觉顺利。" /></label><p className="hp-caption">这次用有限规则演示整理，并非模型识别。仅匹配明确的日期、分钟和“动作 重量kg 组数组 次数次”，没有写的值留空。</p><div className="hp-actions"><button className="hp-outline" disabled={!!busy} onClick={() => { change(s => ({ ...s, raw: '今天训练35分钟，深蹲40kg 3组8次，整体感觉顺利。', candidate: null })); }}>填入一句示例</button><button className="hp-primary" disabled={!!busy} onClick={() => runAI('capture')}>整理为待核对候选 · 模拟</button></div>{aiStatus}{state.candidate && <section className="hp-candidate"><span className="hp-eyebrow">尚未保存为实际记录</span><h3>先核对，可以纠正或拒绝。</h3><label>活动名称<input value={state.candidate.title} onChange={e => change(s => ({ ...s, candidate: { ...s.candidate!, title: e.target.value } }))} /></label><label>实际分钟<input type="number" value={state.candidate.minutes} onChange={e => change(s => ({ ...s, candidate: { ...s.candidate!, minutes: e.target.value } }))} /></label>{state.candidate.exercises.map((e, i) => <p key={i}>{e.name} · {e.kg} kg · {e.sets} × {e.reps}</p>)}{!state.candidate.exercises.length && <p>没有识别到完整动作，不补造数值。可以在下一步手动添加。</p>}<div className="hp-actions"><button className="hp-primary" onClick={adoptCandidate}>核对候选并继续编辑</button><button className="hp-text" onClick={() => { change(s => ({ ...s, candidate: null })); setAiError('候选已拒绝，原话仍保留。'); }}>拒绝候选</button></div></section>}<button className="hp-text hp-assist-link" onClick={() => { if (state.draft) { record(); return; } change(s => ({ ...s, draft: { ...blankDraft(), note: s.raw, original: s.raw } })); setSheet('record'); setError(''); }}>跳过 AI，用原话手动记录 <Glyph name="arrow" size={14} /></button></div>}
      {sheet === 'plan' && <form onSubmit={savePlan}><p className="hp-caption">采用只建立安排，实际完成与时长需要另行记录。</p><label>下一次日期<input type="date" min={DEMO_TODAY} value={planDate} onChange={e => setPlanDate(e.target.value)} required /></label><label>我打算做什么<input value={planTitle} onChange={e => setPlanTitle(e.target.value)} required /></label><label>预计分钟<input type="number" min="1" max="1440" value={planMinutes} onChange={e => setPlanMinutes(e.target.value)} required /></label>{error && <p className="hp-error" role="alert">{error}</p>}<div className="hp-dialog-actions"><button type="button" className="hp-text" onClick={() => setSheet(null)}>暂不采用</button><button className="hp-primary">采用这个安排</button></div></form>}
      {sheet === 'habit' && <div><label className="hp-checkbox"><input type="checkbox" checked={state.habit.enabled} onChange={e => change(s => ({ ...s, habit: { ...s.habit, enabled: e.target.checked } }))} />启用每周的记录提醒</label><p className="hp-caption">原型演示节奏安排，不发送通知。习惯只是意图，不会自动生成已完成记录。</p><fieldset className="hp-fieldset"><legend>我希望安排在哪几天</legend><div className="hp-week hp-habit-days">{[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} type="button" aria-pressed={state.habit.days.includes(d)} className={state.habit.days.includes(d) ? 'is-done' : ''} onClick={() => change(s => ({ ...s, habit: { ...s.habit, days: s.habit.days.includes(d) ? s.habit.days.filter(v => v !== d) : [...s.habit.days, d] } }))}>{WEEKDAYS[d]}</button>)}</div></fieldset><label>偏好的时间<input type="time" value={state.habit.time} onChange={e => change(s => ({ ...s, habit: { ...s.habit, time: e.target.value } }))} /></label>{state.habit.enabled && !state.habit.days.length && <p className="hp-error">选至少一天，或关闭提醒保持随手记录。</p>}<button className="hp-primary" disabled={state.habit.enabled && !state.habit.days.length} onClick={() => setSheet(null)}>保存这个节奏</button></div>}
      {sheet === 'reset' && <div><p>只重置 D0 示例、原型草稿与模拟结果。正式账户的数据保持原样。需要保留内容时，可先导出备份。</p><div className="hp-dialog-actions"><button className="hp-outline" onClick={exportDemo}>先导出</button><button className="hp-outline" onClick={() => { if (timer.current) clearTimeout(timer.current); if (saveTimer.current) clearTimeout(saveTimer.current); setBusy(''); setSaveBusy(false); change(() => seedHabitDemo()); setSheet(null); setNotice('已恢复独立示例。'); go('today'); }}>恢复示例</button><button className="hp-primary" onClick={() => { if (timer.current) clearTimeout(timer.current); if (saveTimer.current) clearTimeout(saveTimer.current); setBusy(''); setSaveBusy(false); change(() => seedHabitDemo(true)); setSheet(null); setNotice('现在可以从第一条记录开始。'); go('today'); }}>从空记录开始</button></div></div>}
    </Modal>}
  </div>;
}
