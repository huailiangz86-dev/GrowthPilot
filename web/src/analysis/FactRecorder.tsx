import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { captureOwnerId } from '../workspace/captureSync';
import { localDateKey } from '../workspace/dailyPreferences';
import type { TaskPayload } from '../workspace/dashboardData';
import { useWorkspace } from '../workspace/useWorkspace';
import { factKey, readFact, type FactEntry, type PendingFact } from './analysisTypes';
import './Analysis.css';

function WorkspaceFacts({owner,workspace,onSaved}:{owner:string;workspace:string;onSaved?:()=>void}){
  const {dailyPreferences,acceptAgentTask}=useWorkspace();const [params]=useSearchParams();
  const today=localDateKey(dailyPreferences.timezone);
  const initial=readFact(localStorage,owner,workspace);
  const [kind,setKind]=useState<'learning'|'feedback'>(initial?.request.kind??(params.get('feedback')?'feedback':'learning'));
  const [entryDate,setDate]=useState(initial?.request.entry_date??today);const [minutes,setMinutes]=useState(String(initial?.request.minutes??30));const [note,setNote]=useState(initial?.request.note??'');const [task,setTask]=useState(initial?.request.task_id??params.get('feedback')??'');
  const [pending,setPending]=useState<PendingFact|null>(initial);const [facts,setFacts]=useState<FactEntry[]>([]);const [tasks,setTasks]=useState<TaskPayload[]>([]);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [loadError,setLoadError]=useState('');const [loading,setLoading]=useState(true);
  const resultRef=useRef<HTMLParagraphElement>(null);const pendingRef=useRef<HTMLDivElement>(null);const submitted=useRef(false);
  useEffect(()=>{if(submitted.current){if(pending)pendingRef.current?.focus();else if(notice)resultRef.current?.focus();}},[pending,notice,busy]);
  const alive=useRef(true);const saving=useRef(false);const panel=useRef<HTMLElement>(null);
  const current=()=>alive.current&&captureOwnerId(localStorage.getItem('gp_token'))===owner;
  const valid=/^[\da-f-]{36}$/i.test(workspace)&&!!owner;
  const clear=(id:string)=>{if(readFact(localStorage,owner,workspace)?.request.id===id){try{localStorage.removeItem(factKey(owner,workspace));}catch{/* Reconciliation is safe even if a receipt is retained. */}}setPending(null);};
  async function load(){
    if(!valid){setLoading(false);setLoadError('请先保存当前工作台，再记录实际投入。');return;}
    setLoading(true);setLoadError('');
    const results=await Promise.allSettled([api.get<FactEntry[]>('/workspace-analysis/facts',{workspace_id:workspace}),api.get<TaskPayload[]>('/tasks',{workspace_id:workspace})]);
    if(!current())return;
    if(results[0].status==='fulfilled'){
      const rows=results[0].value;setFacts(rows);const stored=readFact(localStorage,owner,workspace);
      if(stored&&rows.some(f=>f.id===stored.request.id)){clear(stored.request.id);setNote('');if(stored.request.kind==='feedback')setTask('');setNotice('已恢复服务端保存结果，这条记录没有重复提交。');onSaved?.();}
    }else setLoadError(results[0].reason instanceof Error?results[0].reason.message:'投入与反馈暂时无法读取。');
    if(results[1].status==='fulfilled')setTasks(results[1].value);else setLoadError('任务暂时无法读取，请重试后选择行动。');
    setLoading(false);
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!loading&&params.get('feedback'))panel.current?.scrollIntoView({block:'start'});},[loading]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save(retry=false){
    if(saving.current||!valid)return;
    const stored=readFact(localStorage,owner,workspace);
    const item=retry?stored:{owner,workspace,request:{id:crypto.randomUUID(),kind,entry_date:kind==='learning'?entryDate:today,minutes:kind==='learning'?Number(minutes):null,note:note.trim(),task_id:kind==='feedback'?task:null}};
    if(!item)return;if(stored&&!retry){setPending(stored);setNotice('先重试保留的原文，或重新编辑后提交。');return;}
    try{localStorage.setItem(factKey(owner,workspace),JSON.stringify(item));}catch{setNotice('浏览器无法保留原文，请检查存储后再保存。');return;}
    submitted.current=true;setPending(item);saving.current=true;setBusy(true);setNotice('');
    try{
      const result=await api.post<{fact:FactEntry;task:TaskPayload|null}>(`/workspace-analysis/facts?workspace_id=${workspace}`,item.request);
      if(!current())return;if(result.fact.id!==item.request.id)throw new Error('保存结果没有匹配原文，请重试核对。');
      clear(item.request.id);setFacts(rows=>[result.fact,...rows.filter(row=>row.id!==result.fact.id)]);setNote('');if(item.request.kind==='feedback')setTask('');if(result.task)acceptAgentTask(result.task);setNotice(item.request.kind==='learning'?'实际分钟已保存，已加入分析。':'行动已完成，结果原文已保存到数据与分析。');onSaved?.();
    }catch(e){if(current())setNotice(`${e instanceof Error?e.message:'暂时无法保存。'} 原文已保留，可重试同一条记录。`);}
    finally{saving.current=false;if(current())setBusy(false);}
  }
  return <section className="workspace-panel" id="actual-facts" ref={panel}><div className="panel-header"><div><span className="section-kicker">ACTUAL INPUT & OUTCOME</span><h3>记录投入，带回行动结果。</h3></div><Link to="/app/insights">查看分析 ↗</Link></div>
    {loadError&&<p role="alert" className="fact-notice">{loadError} <button className="text-button" onClick={()=>void load()}>重试读取</button></p>}
    {pending?<div className="fact-notice" role="status" ref={pendingRef} tabIndex={-1}><strong>原文待核对保存结果</strong><p>{pending.request.note}</p><p>{pending.request.entry_date} · {pending.request.kind==='learning'?`${pending.request.minutes} 分钟`:'行动完成结果'}</p><button className="primary-action" disabled={busy} onClick={()=>void save(true)}>{busy?'正在核对…':'重试保存原文'}</button> <button className="outline-action" disabled={busy} onClick={()=>{clear(pending.request.id);setNotice('原文已回到输入框，可以编辑后作为一次新的提交。');}}>保留原文并重新编辑</button></div>:<form className="fact-form" onSubmit={e=>{e.preventDefault();void save();}}><label>记录内容<select value={kind} onChange={e=>setKind(e.target.value as 'learning'|'feedback')}><option value="learning">实际学习投入</option><option value="feedback">行动完成结果</option></select></label>
      {kind==='learning'?<div className="fact-panels"><label>学习日期<input type="date" required max={today} value={entryDate} onChange={e=>setDate(e.target.value)}/></label><label>实际学习分钟<input type="number" min="1" max="1440" step="1" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label></div>:<label>关联行动<select required value={task} onChange={e=>setTask(e.target.value)}><option value="">选择当前工作台的任务</option>{tasks.filter(t=>!facts.some(f=>f.task_id===t.id)).map(t=><option key={t.id} value={t.id}>{t.title}{t.status==='done'?' · 已完成':''}</option>)}</select><small>保存时会将这件行动标记为完成；已有完成结果的任务不重复录入。</small></label>}
      <label>{kind==='learning'?'学习内容原文':'完成结果原文'}<textarea required maxLength={4000} value={note} onChange={e=>setNote(e.target.value)} placeholder={kind==='learning'?'学了什么？时间以实际分钟为准。':'实际做了什么？有哪些收获或阻力？'}/></label><button className="primary-action" type="submit" disabled={busy||!valid||!note.trim()||(kind==='feedback'&&!task)}>{busy?'正在保存…':kind==='learning'?'保存实际投入':'完成行动并保存结果'}</button></form>}
    {notice&&<p className="fact-notice" role="status" ref={resultRef} tabIndex={-1}>{notice}</p>}{loading&&<p role="status">正在读取投入与结果…</p>}
    <div className="fact-entry-list">{facts.map(f=><article className="fact-entry" key={f.id}><small>{f.entry_date} · {f.kind==='learning'?`实际学习 ${f.minutes} 分钟`:'行动结果'}</small>{f.task_title&&<strong> · {f.task_title}</strong>}<p>{f.note}</p>{f.conversation_id&&<Link to={`/app/agent?conversation=${f.conversation_id}`}>回到原 Agent 对话 ↗</Link>}</article>)}</div>
  </section>;
}
export default function FactRecorder({onSaved}:{onSaved?:()=>void}){const {activeWorkspace}=useWorkspace();const owner=captureOwnerId(localStorage.getItem('gp_token'))??'';return <WorkspaceFacts key={`${owner}:${activeWorkspace.id}`} owner={owner} workspace={activeWorkspace.id} onSaved={onSaved}/>;}
