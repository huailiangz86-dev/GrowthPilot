import { useEffect, useState } from 'react';
import PersonalAgentView from '../agent/PersonalAgentView';
import type { AgentConversation, AgentTurn } from '../agent/agentTypes';
const STORAGE = 'growthpilot.agent.prototype.v1';
const makeTurn = (question: string): AgentTurn => ({id: crypto.randomUUID(), client_request_id: crypto.randomUUID(), question, status:'completed', reply:'你最近的记录提到：任务过大时，开始会变得困难。可以先把今天的目标缩成一个 15 分钟的动作。\n\n这只是根据两条示例记录做出的建议，尚不足以判断长期趋势。', error:null, citations:[{key:'reflection:example', title:'今天的快速记录', source:'reflections', available:true}], suggestion:{title:'用 15 分钟整理原型反馈', description:'先挑最影响下一步的一条反馈，写清问题与改法。', priority:'medium', time_block:15}, confirmed_task_id:null, created_at:new Date().toISOString()});
function loadSessions(): AgentConversation[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null');
    if (Array.isArray(saved)) return saved.map((item: AgentConversation) => ({...item,turns:(item.turns ?? []).map(turn => turn.status === 'processing' ? {...turn,status:'failed' as const,error:'模拟：刷新中断了上次处理，提问已保留，可重试。'}:turn)}));
  } catch { /* Restore the independent example if its cache cannot be read. */ }
  return [{id:crypto.randomUUID(),workspace_id:'example',title:'今天的下一步',updated_at:new Date().toISOString(),turns:[makeTurn('结合最近的记录，今天我应该先做什么？')]}];
}
export default function AgentPrototype() {
  const [sessions,setSessions] = useState<AgentConversation[]>(loadSessions);
  const [selected,setSelected] = useState<string|null>(sessions[0]?.id ?? null);
  const [scenario,setScenario] = useState('success');
  const [busy,setBusy] = useState(false);
  useEffect(() => {localStorage.setItem(STORAGE,JSON.stringify(sessions));},[sessions]);
  const turns = sessions.find(item => item.id === selected)?.turns ?? [];
  const patchTurn = (id:string, patch:Partial<AgentTurn>) => setSessions(items => items.map(item => ({...item, turns:item.turns?.map(turn => turn.id === id ? {...turn,...patch}:turn)})));
  const finish = async (turn:AgentTurn) => {setBusy(true); patchTurn(turn.id,{status:'processing',error:null}); await new Promise(resolve => setTimeout(resolve,1200)); patchTurn(turn.id,scenario === 'failure' ? {status:'failed',reply:null,error:'模拟：模型暂时不可用，原文已保留。切换为成功后可重试。'} : scenario === 'processing' ? {status:'processing',reply:null,suggestion:null} : {...makeTurn(turn.question),id:turn.id,client_request_id:turn.client_request_id,...(scenario === 'source' ? {citations:[{key:'reflection:example',title:'来源不可用',source:'reflections',available:false}],suggestion:null,redacted:true,reply:'模拟：来源已移出允许范围，原回复已隐藏。可重新提问。'} : {})}); setBusy(false);};
  return <main className="agent-prototype"><div className="agent-prototype-controls"><a href="/prototype">← 返回五页原型</a><label>模拟条件 <select value={scenario} onChange={e => setScenario(e.target.value)}><option value="success">会话成功</option><option value="processing">持续处理中</option><option value="failure">模型失败</option><option value="source">来源不可用</option></select></label><span>选择条件后发送或重试。独立示例，使用预设回复。</span></div><PersonalAgentView prototype workspace="个人产品 · 示例" conversations={sessions} selected={selected} turns={turns} busy={busy} loading={false} error="" scope={['记录','任务','目标','计划','学习','知识','记忆']} onSelect={setSelected} onNew={() => setSelected(null)} onReload={() => {}} onSend={async question => {const id=selected ?? crypto.randomUUID(); const turn={...makeTurn(question),status:'processing' as const,reply:null,suggestion:null,citations:[]}; setSessions(items => selected ? items.map(item => item.id === id ? {...item,turns:[...(item.turns??[]),turn]}:item) : [{id,workspace_id:'example',title:question.slice(0,32),updated_at:new Date().toISOString(),turns:[turn]},...items]);setSelected(id);await finish(turn);return true;}} onRetry={turn => void finish(turn)} onSource={async () => scenario === 'source' ? {available:false,title:'来源不可用',content:'',reason:'模拟：记录已归档或移出数据范围。'} : {available:true,title:'今天的快速记录',content:'示例原文：任务太大时会拖延，拆成 15 分钟的小动作后比较容易开始。'}} onConfirm={async (turn,draft) => patchTurn(turn.id,{suggestion:draft,confirmed_task_id:'example-action'})}/></main>;
}
