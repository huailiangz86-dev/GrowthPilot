import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createOnboardingSelection, inferOnboardingDraft } from '../pages/app/onboardingDraft';
import '../pages/app/Onboarding.css';
import './OnboardingPrototype.css';

const INPUT = '我想完成个人产品的第一版，建立稳定的学习与复盘节奏。';
const draft = inferOnboardingDraft(INPUT);
const SEED = [
  {key: 'workspace', label: '工作空间', title: draft.workspace.name, detail: draft.workspace.description},
  {key: 'project', label: '项目', title: draft.project.name, detail: draft.project.nextAction},
  {key: 'goal', label: '目标', title: draft.goal.title, detail: draft.goal.description},
  {key: 'plan', label: '计划', title: draft.plan.title, detail: `${draft.plan.totalWeeks} 周 · ${draft.plan.milestones.join(' → ')}`},
  ...draft.tasks.map((task, index) => ({key: `task-${index}`, label: '任务', title: task.title, detail: `${task.dueLabel} · ${task.description}`})),
  {key: 'learning', label: '学习入口', title: draft.learning.title, detail: draft.learning.summary},
];
type Status = 'pending' | 'syncing' | 'synced' | 'failed' | 'blocked';
type Row = typeof SEED[number] & {selected: boolean; status: Status; id?: string};
type Scenario = 'success' | 'offline' | 'failure' | 'partial';
const KEY = 'gp_onboarding_prototype_v1';
const LABELS: Record<Status, string> = {pending: '本地待同步', syncing: '保存中', synced: '已保存', failed: '保存失败', blocked: '等待关联对象'};

function initialState(): {confirmed: boolean; rows: Row[]} {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && Array.isArray(saved.rows) && saved.rows.length === SEED.length) return {
      confirmed: saved.confirmed === true,
      rows: saved.rows.map((row: Row) => ({...row, status: row.status === 'syncing' ? 'pending' : row.status})),
    };
  } catch { /* Start from isolated examples. */ }
  return {confirmed: false, rows: SEED.map(row => ({...row, selected: true, status: 'pending'}))};
}

export default function OnboardingPrototype() {
  const [state, setState] = useState(initialState);
  const [scenario, setScenario] = useState<Scenario>(() => {
    const value = new URLSearchParams(location.search).get('save');
    return value === 'offline' || value === 'failure' || value === 'partial' ? value : 'success';
  });
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {localStorage.setItem(KEY, JSON.stringify(state));}, [state]);
  useEffect(() => () => {if (timer.current) clearTimeout(timer.current);}, []);

  function toggle(key: string) {
    setState(current => ({...current, rows: current.rows.map(row => ({...row,
      selected: row.key === key ? !row.selected : key === 'workspace' && current.rows[0].selected
        ? false : key === 'goal' && row.key === 'plan' && current.rows.find(item => item.key === 'goal')?.selected ? false : row.selected,
    }))}));
  }
  function save() {
    if (busy) return;
    setBusy(true);
    setState(current => ({confirmed: true, rows: current.rows.map(row => row.selected && row.status !== 'synced' ? {...row, status: scenario === 'offline' ? 'pending' : 'syncing'} : row)}));
    timer.current = setTimeout(() => {
      setState(current => ({...current, rows: current.rows.map(row => {
        if (!row.selected || row.status === 'synced') return row;
        const status: Status = scenario === 'offline' ? 'pending' : scenario === 'failure' ? 'failed'
          : scenario === 'partial' && row.key === 'goal' ? 'failed'
          : scenario === 'partial' && (row.key === 'plan' || row.key.startsWith('task-') || row.key === 'learning') && current.rows.find(item => item.key === 'goal')?.selected ? 'blocked' : 'synced';
        return {...row, status, ...(status === 'synced' ? {id: row.id ?? `example-${row.key}`} : {})};
      })}));
      setBusy(false);
    }, 800);
  }
  const selected = state.rows.filter(row => row.selected);
  const saved = selected.filter(row => row.status === 'synced').length;
  const done = selected.length === saved;
  // Keep the same selectable dependency contract as the real onboarding screen.
  const allSelected = createOnboardingSelection(draft.tasks.length);

  return <main className="workspace-onboarding onboarding-prototype">
    <div className="onboarding-inner">
      <header className="onboarding-top"><div className="onboarding-brand"><span className="brand-mark">GP</span><span><strong>GrowthPilot</strong><small>A2 · 交互原型 · 独立示例数据</small></span></div><Link to="/prototype" className="quiet-link">返回今日</Link></header>
      <section className="onboarding-content">
        <span className="section-kicker">FIRST WORKSPACE / {state.confirmed ? 'SAVE' : 'REVIEW'}</span>
        <h2>{state.confirmed ? done ? '行动链已完整保存' : '每一项进展，都有记录' : '先看清，再开始'}</h2>
        <p className="onboarding-lead">{state.confirmed ? `已保存 ${saved} / ${selected.length} 项（模拟）。刷新会恢复原话、选择和保存状态；重试只处理未完成项。` : '逐项查看要建立的对象。取消选择的内容不会创建，计划需要关联一个目标。'}</p>
        <blockquote className="onboarding-quote">“ {INPUT} ”</blockquote>
        <div className="onboarding-scenario"><span>模拟保存结果</span><select aria-label="模拟保存结果" value={scenario} disabled={busy} onChange={event => setScenario(event.target.value as Scenario)}><option value="success">成功</option><option value="offline">断网</option><option value="failure">全部失败</option><option value="partial">目标失败，其余等待</option></select></div>
        <div className="onboarding-save-list">{state.rows.map(row => <article className="onboarding-save-row" key={row.key}>
          <div><span className="object-type">{row.label}</span><strong>{row.title}</strong><details><summary>查看内容与关联</summary><p>{row.detail}</p>{row.key !== 'workspace' && <p>归属：{draft.workspace.name}{row.key === 'plan' ? ` · 目标：${draft.goal.title}` : ''}</p>}</details></div>
          {state.confirmed ? <span className={`onboarding-save-status ${row.selected ? row.status : 'ignored'}`}>{row.selected ? `${LABELS[row.status]} · 模拟` : '未选择'}</span> : <input type="checkbox" aria-label={`保留${row.label}：${row.title}`} checked={row.selected} disabled={row.key !== 'workspace' && !state.rows[0].selected || row.key === 'plan' && !state.rows.find(item => item.key === 'goal')?.selected} onChange={() => toggle(row.key)}/>}
        </article>)}</div>
        <div className="review-actions"><button type="button" className="secondary-action" disabled={busy} onClick={() => setState({confirmed: false, rows: SEED.map(row => ({...row, selected: row.key.startsWith('task-') ? allSelected.tasks[Number(row.key.slice(5))] : true, status: 'pending'}))})}>重置示例</button><button type="button" className="primary-action" disabled={busy || !state.rows[0].selected || done && state.confirmed} onClick={save}>{busy ? '正在保存…' : state.confirmed ? done ? '已全部保存' : '重试未完成项' : '确认这些对象'}</button></div>
        <p className="onboarding-selection-note">这里使用预设状态，所有操作仅保存在这个原型中。真实入口：工作台 → 首次启动。</p>
      </section>
    </div>
  </main>;
}
