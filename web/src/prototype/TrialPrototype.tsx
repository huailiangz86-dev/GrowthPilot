import { useState } from 'react';
import Modal from '../components/Modal';
import useCompactLayout from '../components/useCompactLayout';
import CoreNavigation from '../components/CoreNavigation';
import WorkspaceSetup from '../components/WorkspaceSetup';
import { CORE_NAV, NAV_GROUPS } from '../workspace/navigation';
import '../pages/app/Layout.css';
import '../pages/app/MicroCapture.css';

export default function TrialPrototype() {
  const compact = useCompactLayout();
  const [page, setPage] = useState('/app');
  const [menu, setMenu] = useState(false);
  const [capture, setCapture] = useState(false);
  const [draft, setDraft] = useState(() => {try{return localStorage.getItem('growthpilot.trial.prototype.draft') ?? '';}catch{return '';}});
  const [entries, setEntries] = useState<string[]>(() => {try {const rows=JSON.parse(localStorage.getItem('growthpilot.trial.prototype.entries') ?? '[]');return Array.isArray(rows) ? rows.filter(row => typeof row === 'string') : [];} catch {return [];}});
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [emptyWorkspace, setEmptyWorkspace] = useState(() => new URLSearchParams(location.search).get('workspace') === 'empty');
  const title = NAV_GROUPS.flatMap(group => group.items).find(item => item.to === page)?.label ?? '今日';
  const sidebar = <aside className="workspace-sidebar is-open"><div className="sidebar-brand"><strong>GrowthPilot · A5 原型</strong></div><nav className="workspace-nav" aria-label="主导航">{NAV_GROUPS.map(group => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(item => <a key={item.to} className={`workspace-nav-link ${page === item.to ? 'is-active' : ''}`} href={`?page=${encodeURIComponent(item.to)}`} aria-current={page === item.to ? 'page' : undefined} onClick={event => {event.preventDefault(); setPage(item.to); setMenu(false);}}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}</div>)}</nav></aside>;
  return <div className="workspace-shell">
    {!compact && sidebar}{compact && menu && <Modal label="主导航" className="navigation-dialog" onClose={() => setMenu(false)}><button className="icon-button drawer-close" autoFocus aria-label="关闭导航" onClick={() => setMenu(false)}>×</button>{sidebar}</Modal>}
    <div className="workspace-main"><header className="workspace-topbar"><button className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={menu} onClick={() => setMenu(true)}>☰</button><div className="topbar-heading"><span className="topbar-context">独立示例 · 键盘可操作</span><h1>{title}</h1></div><a href="/prototype">返回五页原型 ↗</a></header>
      <main className="workspace-content"><label><input type="checkbox" checked={emptyWorkspace} onChange={event => setEmptyWorkspace(event.target.checked)}/> 模拟尚未建立工作空间</label>{emptyWorkspace ? <WorkspaceSetup prototype/> : <div className="page-stack"><span className="section-kicker">A5 · TRIAL READINESS</span><h2>把入口连起来，让每一步都能继续。</h2><p>手机固定显示今日、数据、Agent、分析、我的；桌面侧栏使用相同名称。更多工作页面在导航菜单里。</p><div className="workspace-panel" style={{padding:24}}><h3>{title} · 导航预览</h3>{page === '/app/data' && <div>{entries.length ? entries.map((entry,index) => <p key={index}>示例原文：{entry}</p>) : <p>尚无保存的 A5 示例记录。</p>}</div>}<p>打开菜单或记录面板后，Tab 留在面板内，Escape 关闭并返回触发按钮。关闭的手机菜单不参与键盘导航。</p><button className="primary-action" onClick={() => {setSaved(false); setCapture(true);}}>试着记录</button></div><div className="workspace-panel" style={{padding:24}}><h3>服务异常也能继续</h3><label><input type="checkbox" checked={failed} onChange={event => setFailed(event.target.checked)}/> 模拟保存失败</label><p>输入原文后尝试保存；失败时保留内容，关闭或刷新后可恢复，再重试。</p><p>真实版本使用 A1–A4 的保存、对话、分析和行动反馈合同。</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}><a href="/prototype/onboarding">首次使用原型 ↗</a><a href="/prototype/agent">Agent 原型 ↗</a><a href="/prototype/analysis">分析原型 ↗</a></div></div><p>当前五个主入口：{CORE_NAV.map(item => item.label).join(' · ')}</p></div>}</main><CoreNavigation current={page} onSelect={setPage}/>
      {capture && <Modal label="快速记录" className="micro-capture-layer" onClose={() => setCapture(false)}><section className="micro-capture-sheet"><header className="micro-capture-header"><h2>保留此刻的原文</h2><button className="icon-button" aria-label="关闭快速记录" onClick={() => setCapture(false)}>×</button></header>{saved ? <p role="status">示例已保存，可以继续。<button onClick={() => setCapture(false)}>继续工作</button></p> : <form onSubmit={event => {event.preventDefault(); if (!failed) {try {const next=[draft.trim(),...entries];localStorage.setItem('growthpilot.trial.prototype.entries',JSON.stringify(next));localStorage.removeItem('growthpilot.trial.prototype.draft');setEntries(next);setSaved(true);setDraft('');setSaveError('');}catch{setSaveError('浏览器无法保存示例，原文仍在输入框中。');}}}}><div className="capture-composer"><textarea autoFocus aria-label="记录原文" required maxLength={360} value={draft} onChange={event => {setDraft(event.target.value);try{localStorage.setItem('growthpilot.trial.prototype.draft',event.target.value);}catch{setSaveError('浏览器无法保留草稿，请保留输入后重试。');}}}/></div>{saveError && <p role="alert">{saveError}</p>}{failed && <p role="alert">模拟：暂时无法保存，原文仍保留。关闭面板取消模拟失败后可重试。</p>}<footer className="micro-capture-footer"><span>示例内容仅保留在此浏览器。</span><button className="primary-action" disabled={!draft.trim()}>保存示例记录</button></footer></form>}</section></Modal>}
    </div>
  </div>;
}
