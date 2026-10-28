import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import PersonalAgentView from '../../agent/PersonalAgentView';
import { pendingKey, pendingTurn, readPending, reconcilePending, type AgentConversation, type AgentPending, type AgentSource, type AgentTurn } from '../../agent/agentTypes';
import { captureOwnerId } from '../../workspace/captureSync';
import type { TaskPayload } from '../../workspace/dashboardData';
import { useWorkspace } from '../../workspace/useWorkspace';
import {usePersonal} from '../../personal/usePersonal';

const LABELS: Record<string,string> = {tasks:'任务',goals:'目标',plans:'计划',learning:'学习',knowledge_cards:'知识卡',reflections:'记录与复盘',memories:'工作台来源记忆'};
function WorkspaceAgent({workspaceId, ownerId, requested, focusLabel, onChoose}: {workspaceId:string;ownerId:string;requested:string|null;focusLabel?:string;onChoose:(id:string|null)=>void}) {
  const {activeWorkspace, privacyScope, acceptAgentTask} = useWorkspace();
  const [conversations,setConversations] = useState<AgentConversation[]>([]);
  const [selected,setSelected] = useState<string|null>(null);
  const [turns,setTurns] = useState<AgentTurn[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [analysis,setAnalysis] = useState<AgentConversation['analysis']>();
  const alive = useRef(true);
  const selectedRef = useRef<string|null>(null);
  const sending = useRef(false);
  const sequence = useRef(0);
  const valid = /^[\da-f-]{36}$/i.test(workspaceId) && !!ownerId;
  useEffect(() => {alive.current=true;return () => {alive.current=false;};},[]);
  const current = () => alive.current && captureOwnerId(localStorage.getItem('gp_token')) === ownerId;
  const choose = (id:string|null) => {selectedRef.current=id;setSelected(id);};
  const clearPending = (requestId:string) => {
    const pending=readPending(localStorage,ownerId ?? '',workspaceId);
    if (pending?.requestId === requestId) {
      try {localStorage.removeItem(pendingKey(ownerId,workspaceId));} catch { /* Reconciliation also deduplicates a retained receipt. */ }
    }
  };
  const load = async (id:string|null, initialize=false) => {
    const version=++sequence.current; setLoading(true);setError('');
    if (!valid) {setLoading(false);setError('请先完成当前工作台的保存，再开始真实会话。');return;}
    try {
      const sessions=await api.get<AgentConversation[]>('/personal-agent/conversations',{workspace_id:workspaceId});
      const pending=readPending(localStorage,ownerId ?? '',workspaceId);
      const remembered=localStorage.getItem(`growthpilot.agent.selected.v1:${ownerId}:${workspaceId}`);
      const cid=id ?? (initialize ? pending?.conversationId ?? (requested === 'new' ? null : requested ?? sessions.find(item => item.id === remembered)?.id ?? sessions[0]?.id ?? null) : null);
      let fetched:AgentTurn[]=[];
      let scope:AgentConversation['analysis'];
      if (cid) {
        try {
          const conversation=await api.get<AgentConversation>(`/personal-agent/conversations/${cid}`);
          if (conversation.workspace_id !== workspaceId) throw new Error('这段会话属于另一个工作台，请先切换工作台。');
          fetched=conversation.turns??[];
          scope=conversation.analysis;
        }
        catch (e) {if (cid !== pending?.conversationId) throw e;}
      }
      if (!current() || version !== sequence.current) return;
      if (pending && fetched.some(turn => turn.client_request_id === pending.requestId && turn.status !== 'processing')) clearPending(pending.requestId);
      setConversations(sessions);choose(cid);setAnalysis(scope);setTurns(reconcilePending(fetched,pending?.conversationId === cid ? pending : null));
      if (cid) {try {localStorage.setItem(`growthpilot.agent.selected.v1:${ownerId}:${workspaceId}`,cid);} catch { /* The saved conversation is recoverable from the server list. */ }}
    } catch (e) {
      if (!current() || version !== sequence.current) return;
      const pending=readPending(localStorage,ownerId ?? '',workspaceId);
      if (pending && (initialize || id === pending.conversationId)) {choose(pending.conversationId);setTurns([pendingTurn(pending)]);}
      setError(e instanceof Error ? e.message : '会话暂时无法加载。');
    } finally {if (current() && version === sequence.current) setLoading(false);}
  };
  useEffect(() => {void load(null,true);},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected || busy || !turns.some(turn => turn.status === 'processing')) return;
    const timer=setTimeout(() => void load(selected),2500);
    return () => clearTimeout(timer);
  },[selected,busy,turns]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (question:string, retry?:AgentTurn):Promise<boolean> => {
    if (sending.current || !valid || !ownerId) return false;
    const cid=selectedRef.current ?? crypto.randomUUID();
    const pending:AgentPending={ownerId,workspaceId,conversationId:cid,requestId:retry?.client_request_id ?? crypto.randomUUID(),question};
    const existing=readPending(localStorage,ownerId,workspaceId);
    if (existing && existing.requestId !== pending.requestId) {void load(existing.conversationId);return false;}
    try {localStorage.setItem(pendingKey(ownerId,workspaceId),JSON.stringify(pending));} catch {setError('浏览器无法保存提问，请检查可用存储后再发送。');return false;}
    sending.current=true;setBusy(true);setError('');choose(cid);++sequence.current;
    setTurns(items => retry ? items.map(turn => turn.id === retry.id ? {...turn,status:'processing',error:null}:turn) : [...items,pendingTurn(pending,true)]);
    try {
      await api.post<AgentConversation>('/personal-agent/conversations',{id:cid,workspace_id:workspaceId});
      const result=await api.post<AgentTurn>(`/personal-agent/conversations/${cid}/turns`,{client_request_id:pending.requestId,question});
      if (!current()) return true;
      if (result.client_request_id !== pending.requestId) throw new Error('回复未匹配这次提问，原文已保留。');
      if (result.status !== 'processing') clearPending(pending.requestId);
      if (selectedRef.current === cid) setTurns(items => items.map(turn => turn.client_request_id === pending.requestId ? result:turn));
      if (selectedRef.current === cid && requested !== cid) onChoose(cid);
      const sessions=await api.get<AgentConversation[]>('/personal-agent/conversations',{workspace_id:workspaceId}).catch(() => null);
      if (current() && sessions) setConversations(sessions);
    } catch (e) {
      if (current() && selectedRef.current === cid) setTurns(items => items.map(turn => turn.client_request_id === pending.requestId ? {...turn,status:'failed',error:e instanceof Error ? e.message : '连接失败，提问已保留，可以重试。'}:turn));
    } finally {sending.current=false;if (current()) setBusy(false);}
    return true;
  };
  return <>{analysis&&<section className="workspace-panel"><strong>分析上下文：{analysis.start} — {analysis.end}</strong><p>{analysis.available?'已保留进入对话时的统计与来源，新记录会出现在下一次分析。':'来源已变更或移出允许范围，请返回分析生成新的上下文。'}{analysis.excluded_sources.length>0?' 已排除未授权来源。':''}</p><Link to={`/app/insights?period=${analysis.period}&date=${analysis.anchor}`}>回到此范围的分析 ↗</Link></section>}<PersonalAgentView workspace={activeWorkspace.name} conversations={conversations} selected={selected} turns={turns} busy={busy} loading={loading} error={error} scope={privacyScope.enabledSources.filter(key => !analysis || (['tasks','learning','reflections'].includes(key) && !analysis.excluded_sources.includes(key))).map(key => LABELS[key] ?? key)} onSelect={id => {choose(id);setTurns([]);void load(id);onChoose(id);}} onNew={() => {++sequence.current;choose(null);setTurns([]);setLoading(false);setError('');onChoose(null);}} onReload={() => void load(selectedRef.current,true)} contextLabel={focusLabel} onSend={question => submit(focusLabel ? `关于当前事项「${focusLabel}」：\n${question}` : question)} onRetry={turn => void submit(turn.question,turn)} onSource={(turn,key) => api.get<AgentSource>(`/personal-agent/conversations/${selected}/turns/${turn.id}/source`,{key})} onConfirm={async (turn,suggestion) => {
    const cid=selectedRef.current;
    const result=await api.post<{task:TaskPayload;turn:AgentTurn}>(`/personal-agent/conversations/${cid}/turns/${turn.id}/confirm`,{...suggestion,confirmed:true});
    if (!current()) return;
    acceptAgentTask(result.task);
    if (selectedRef.current === cid) setTurns(items => items.map(item => item.id === turn.id ? result.turn:item));
  }}/></>;
}
export default function PersonalAgent() {
  const {activeWorkspace,privacyScope}=useWorkspace();
  const [params,setParams]=useSearchParams();
  const requested=params.get('conversation');
  const {journal}=usePersonal();
  const focusId=params.get('context_id');
  const focusLabel=params.get('context_type')==='task' ? journal.snapshot?.tasks.find(t=>t.id===focusId)?.title : params.get('context_type')==='learning' ? journal.snapshot?.learning.find(t=>t.id===focusId)?.title : undefined;
  const ownerId=captureOwnerId(localStorage.getItem('gp_token')) ?? '';
  return <WorkspaceAgent key={`${ownerId}:${activeWorkspace.id}:${privacyScope.enabledSources.join('|')}:${requested}`} workspaceId={activeWorkspace.id} ownerId={ownerId} requested={requested} focusLabel={focusLabel} onChoose={id => setParams({conversation:id ?? 'new'})}/>;
}
