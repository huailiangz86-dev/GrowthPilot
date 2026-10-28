import { useEffect, useRef, useState } from 'react';
import { shouldSendOnEnter } from './input';
import { Link } from 'react-router-dom';
import type { AgentConversation, AgentSource, AgentSuggestion, AgentTurn } from './agentTypes';
import './PersonalAgent.css';

interface Props {
  workspace: string; contextLabel?:string; prototype?: boolean; conversations: AgentConversation[]; selected: string | null; turns: AgentTurn[];
  busy: boolean; loading: boolean; error: string; scope: string[];
  onSelect: (id: string) => void; onNew: () => void; onSend: (question: string) => Promise<boolean>;
  onRetry: (turn: AgentTurn) => void; onReload: () => void;
  onSource: (turn: AgentTurn, key: string) => Promise<AgentSource>;
  onConfirm: (turn: AgentTurn, suggestion: AgentSuggestion) => Promise<void>;
}
function Source({turn, citation, load}: {turn: AgentTurn; citation: AgentTurn['citations'][number]; load: Props['onSource']}) {
  const [source, setSource] = useState<AgentSource | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return <details className="agent-source" onToggle={async event => {
    if (!event.currentTarget.open || loading) return;
    setLoading(true); setError(''); setSource(null);
    try {setSource(await load(turn, citation.key));} catch {setError('来源暂时无法加载，关闭后展开可重试。');} finally {setLoading(false);}
  }}><summary>{citation.available ? '↗' : '○'} {citation.title}{citation.available && <span>查看来源</span>}</summary>
    <div>{loading ? '正在读取来源…' : error || (source?.available ? source.content : source?.reason || '来源已删除、归档或移出当前数据范围。')}</div>
  </details>;
}
function Suggestion({turn, confirm, prototype}: {turn: AgentTurn; confirm: Props['onConfirm']; prototype?: boolean}) {
  const [draft, setDraft] = useState(turn.suggestion!);
  const confirmedRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  useEffect(() => {if (turn.confirmed_task_id && submitted.current) confirmedRef.current?.focus();}, [turn.confirmed_task_id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (turn.confirmed_task_id) return <div className="agent-confirmed" role="status" ref={confirmedRef} tabIndex={-1}>✓ 已确认并保存行动{turn.confirmed_task_title && <span>「{turn.confirmed_task_title}」</span>} {prototype ? <span>（示例）</span> : <Link to="/app/tasks">查看行动 →</Link>}</div>;
  return <form className="agent-suggestion" onSubmit={async event => {
    event.preventDefault(); if (busy || !draft.title.trim()) return;
    submitted.current = true; setBusy(true); setError('');
    try {await confirm(turn, {...draft, title: draft.title.trim()});} catch (e) {setError(e instanceof Error ? e.message : '保存失败，编辑内容已保留。');} finally {setBusy(false);}
  }}><div className="agent-suggestion-head"><span>一个可以试试的下一步</span><small>待你确认</small></div>
    <label>行动名称<input maxLength={240} required value={draft.title} onChange={e => setDraft({...draft, title: e.target.value})}/></label>
    <label>行动说明<textarea maxLength={4000} rows={2} value={draft.description} onChange={e => setDraft({...draft, description: e.target.value})}/></label>
    <div className="agent-fields"><label>优先级<select value={draft.priority} onChange={e => setDraft({...draft, priority: e.target.value as AgentSuggestion['priority']})}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label>预计分钟<input type="number" min={5} max={720} value={draft.time_block ?? ''} onChange={e => setDraft({...draft, time_block: e.target.value ? Number(e.target.value) : null})}/></label></div>
    <p>先编辑，再确认。确认后会保存为当前工作台的行动，并保留这段对话作为来源。</p>
    {error && <p role="alert" className="agent-error">{error}</p>}<button className="agent-primary" disabled={busy || !draft.title.trim()}>{busy ? '正在保存…' : prototype ? '确认示例行动' : '确认并创建行动'}</button>
  </form>;
}
export default function PersonalAgentView(props: Props) {
  const [input, setInput] = useState('');
  const Heading = props.prototype ? 'h1' : 'h2';
  const processing = props.busy || props.turns.some(turn => turn.status === 'processing');
  return <section className="personal-agent">
    <header className="agent-header"><div><span className="agent-eyebrow">GROWTHPILOT · {props.prototype ? 'A3 交互原型' : '个人工作台'}</span><Heading>和个人 Agent 聊聊</Heading><p>从你留下的事实里，一起找到下一步。</p></div><span className="agent-workspace">{props.workspace}</span></header>
    {props.contextLabel && <p className="agent-scope">当前事项：{props.contextLabel} · 提问将带上此事项</p>}
    <div className="agent-scope"><span>{props.prototype ? '示例数据 · 预设回复' : '当前数据范围'}</span><p>{props.scope.length ? props.scope.join(' · ') : '尚未开启数据来源'} · <Link to={props.prototype ? '/prototype' : '/app/mine'}>管理范围</Link></p></div>
    <div className="agent-grid"><aside className="agent-sessions"><div><strong>我的会话</strong><button type="button" onClick={props.onNew} disabled={props.busy}>＋ 新对话</button></div><label className="agent-session-select">选择会话<select value={props.selected ?? ''} onChange={e => e.target.value ? props.onSelect(e.target.value) : props.onNew()}><option value="">新对话</option>{props.conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><nav aria-label="历史会话">{props.conversations.map(item => <button key={item.id} aria-current={props.selected === item.id ? 'page' : undefined} onClick={() => props.onSelect(item.id)}>{item.title}<small>{new Date(item.updated_at).toLocaleDateString('zh-CN')}</small></button>)}</nav><p>{props.prototype ? '仅在此浏览器保存示例会话。' : '会话按账号与工作台保存。跨页或刷新后，可以接着聊。'}</p></aside>
    <div className="agent-chat">{props.loading && <p role="status">正在恢复会话…</p>}{props.error && <div className="agent-error" role="alert">{props.error} <button onClick={props.onReload}>重新加载</button></div>}
      {!props.loading && !props.turns.length && <div className="agent-welcome"><span>✳</span><h2>把一个模糊的念头，<br/>聊成清楚的下一步。</h2><p>我会结合当前工作台允许的数据回答，给出可展开的来源。数据不足时，会直接说明。</p><button onClick={() => setInput('结合最近的记录，今天我应该先做什么？')}>今天应该先做什么？ ↗</button><button onClick={() => setInput('我最近遇到的阻力是什么？请给出来源。')}>回看最近的阻力 ↗</button></div>}
      <div className="agent-turns" aria-live="polite">{props.turns.map(turn => <article key={turn.id}><div className="agent-question"><span>我</span><p>{turn.question}</p></div><div className="agent-answer"><span className="agent-avatar">✳</span><div><small>个人 Agent · AI 解读</small>{turn.status === 'processing' ? <p role="status">正在结合当前数据思考… 提问已保留，刷新后可以恢复。</p> : turn.status === 'failed' ? <div className="agent-error"><p>{turn.error || '模型暂时无法回复，提问已保存。'}</p><button disabled={processing} onClick={() => props.onRetry(turn)}>重试这次提问</button></div> : <><p className="agent-reply">{turn.reply}</p>{turn.redacted && <p className="agent-muted">来源范围发生变化，可重新提问。</p>}{turn.citations.length > 0 && <div className="agent-citations"><small>依据 · {turn.citations.length} 条</small>{turn.citations.map(citation => <Source key={`${citation.key}:${citation.available}`} turn={turn} citation={citation} load={props.onSource}/>)}</div>}{(turn.suggestion || turn.confirmed_task_id) && <Suggestion turn={turn} confirm={props.onConfirm} prototype={props.prototype}/>}</>}</div></div></article>)}</div>
      <form className="agent-composer" onSubmit={async event => {event.preventDefault(); const text = input.trim(); if (text && !processing && await props.onSend(text)) setInput('');}}><label htmlFor="agent-question">你想聊些什么？</label><textarea id="agent-question" enterKeyHint="send" rows={3} maxLength={props.contextLabel ? 1970-props.contextLabel.length : 2000} value={input} onChange={e => setInput(e.target.value)} placeholder="从今天的记录、一个目标，或遇到的阻力开始…" onKeyDown={e => {if (shouldSendOnEnter(e.key, e.shiftKey, e.nativeEvent.isComposing, e.nativeEvent.keyCode)) {e.preventDefault(); e.currentTarget.form?.requestSubmit();}}}/><div><small>Enter 发送 · Shift + Enter 换行</small><button className="agent-primary" disabled={processing || props.loading || !input.trim()}>{processing ? '处理中…' : '发送 ↗'}</button></div></form>
    </div></div>
  </section>;
}
