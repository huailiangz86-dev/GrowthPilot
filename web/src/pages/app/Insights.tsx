import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import AnalysisView from '../../analysis/AnalysisView';
import FactRecorder from '../../analysis/FactRecorder';
import type { AnalysisReport, Period } from '../../analysis/analysisTypes';
import { captureOwnerId } from '../../workspace/captureSync';
import { localDateKey } from '../../workspace/dailyPreferences';
import { useWorkspace } from '../../workspace/useWorkspace';
import './workspace.css';

function WorkspaceAnalysis({owner,workspace}:{owner:string;workspace:string}){
  const {activeWorkspace,dailyPreferences,privacyScope}=useWorkspace();const [params,setParams]=useSearchParams();const navigate=useNavigate();
  const period:Period=['day','week','month'].includes(params.get('period')??'')?params.get('period') as Period:'week';
  const anchor=/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')??'')?params.get('date')!:localDateKey(dailyPreferences.timezone);
  const [report,setReport]=useState<AnalysisReport|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [discussing,setDiscussing]=useState(false);const [revision,setRevision]=useState(0);const alive=useRef(true);const sending=useRef(false);
  const noticeRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(notice)noticeRef.current?.focus();},[notice]);
  const current=()=>alive.current&&captureOwnerId(localStorage.getItem('gp_token'))===owner;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{let active=true;setLoading(true);setReport(null);setError('');if(!/^[\da-f-]{36}$/i.test(workspace)||!owner){setLoading(false);setError('请先保存当前工作台，再查看真实统计。');return;}
    void api.get<AnalysisReport>('/workspace-analysis/report',{workspace_id:workspace,period,anchor}).then(data=>{if(active&&current())setReport(data);}).catch(e=>{if(active&&current())setError(e instanceof Error?e.message:'分析暂时无法读取。');}).finally(()=>{if(active&&current())setLoading(false);});return()=>{active=false;};
  },[workspace,owner,period,anchor,dailyPreferences.timezone,revision]); // eslint-disable-line react-hooks/exhaustive-deps
  async function discuss(){
    if(sending.current||!report)return;const key=`growthpilot.analysis.discuss.v1:${owner}:${workspace}`;let id=crypto.randomUUID();
    try{let stored;try{stored=JSON.parse(localStorage.getItem(key)??'null');}catch{stored=null;}if(stored?.period===period&&stored?.anchor===anchor&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(stored?.id??''))id=stored.id;localStorage.setItem(key,JSON.stringify({id,period,anchor}));}catch{setNotice('浏览器无法保留分析会话，请检查存储后重试。');return;}
    sending.current=true;setDiscussing(true);setNotice('');
    try{const result=await api.post<{conversation_id:string}>('/workspace-analysis/discuss',{id,workspace_id:workspace,period,anchor});if(!current())return;try{localStorage.removeItem(key);}catch{/* Existing conversation is still durable. */}navigate(`/app/agent?conversation=${result.conversation_id}`);}
    catch(e){if(current())setNotice(`${e instanceof Error?e.message:'暂时无法进入对话。'} 时间范围已保留，可以重试。`);}finally{sending.current=false;if(current())setDiscussing(false);}
  }
  return <>{notice&&<div role="alert" className="fact-notice" ref={noticeRef} tabIndex={-1}>{notice} <button className="outline-action" disabled={discussing||loading||!report} onClick={()=>void discuss()}>重试进入对话</button></div>}<AnalysisView workspace={activeWorkspace.name} period={period} anchor={anchor} onPeriod={p=>setParams({period:p,date:anchor,...(params.get('feedback')?{feedback:params.get('feedback')!}:{})})} onAnchor={a=>a&&setParams({period,date:a})} report={report} loading={loading} error={error} onRetry={()=>setRevision(r=>r+1)} onDiscuss={()=>void discuss()} discussing={discussing}/><p className="muted-note">进入 Agent 时只携带允许的数据来源：{privacyScope.enabledSources.filter(s=>['tasks','learning','reflections'].includes(s)).map(s=>s==='tasks'?'任务与行动结果':s==='learning'?'实际学习投入':'记录与复盘').join('、')||'尚未开放来源'}。</p><FactRecorder onSaved={()=>setRevision(r=>r+1)}/></>;
}
export default function Insights(){const {activeWorkspace}=useWorkspace();const owner=captureOwnerId(localStorage.getItem('gp_token'))??'';return <WorkspaceAnalysis key={`${owner}:${activeWorkspace.id}`} owner={owner} workspace={activeWorkspace.id}/>;}
