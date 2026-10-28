import {useContext, useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {api} from '../api/client';
import {WorkspaceContext} from '../workspace/context';
import {captureOwnerId} from '../workspace/captureSync';
import {mutationKey} from '../mutations/journal';
import {useMutationDraft} from '../mutations/useMutationDraft';
import type {SourceSummary, SourceVersion} from './sourceStore';
import './sources.css';
interface Space {id:string;name:string}
interface Draft {workspace_id:string;source_id:string;version:number;checksum:string;chunk_id:string;title:string;question:string;application_goal:string}
interface Result {item_id:string;unit_id:string;workspace_id:string;source_version:number}
const sample:SourceVersion={id:'sample-v1',source_id:'sample',version:1,title:'重复提交与回执',category:'note',kind:'text',filename:'示例.txt',source_url:null,checksum:'a'.repeat(64),bytes:80,created_at:'2026-10-27T00:00:00Z',status:'ready',extraction:{text:'同一提交标识与同一内容应返回已有回执，避免重复创建。',chunks:[{id:'c1',page:null,start:0,end:29,text:'同一提交标识与同一内容应返回已有回执，避免重复创建。'}],warnings:[],page_count:null}};
export default function SourceToLearning({prototype=false}:{prototype?:boolean}) {
  const [params]=useSearchParams();
  const owner=prototype?'prototype':captureOwnerId(localStorage.getItem('gp_token'));
  return owner?<Session key={`${owner}:${prototype}`} owner={owner} prototype={prototype} source={params.get('source')||''} version={Number(params.get('version'))||1}/>:<p>请先<Link to="/login">登录</Link>以读取本人资料。</p>;
}
function Session({owner,prototype,source,version}:{owner:string;prototype:boolean;source:string;version:number}) {
  const workspace = useContext(WorkspaceContext);
  const form=useMutationDraft<Draft,Draft>(mutationKey(owner,'personal','source-learning'),{workspace_id:prototype?'sample-space':'',source_id:prototype?'sample':source,version,checksum:'',chunk_id:'',title:'',question:'',application_goal:''});
  const [spaces,setSpaces]=useState<Space[]>(prototype?[{id:'sample-space',name:'示例空间'}]:[]),[sources,setSources]=useState<SourceSummary[]>([]),[selected,setSelected]=useState<SourceVersion|null>(prototype?sample:null),[versions,setVersions]=useState<number[]>([1]),[listsLoaded,setListsLoaded]=useState(prototype),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[fail,setFail]=useState(false),[reload,setReload]=useState(0);
  useEffect(()=>{if(prototype)return;let active=true;void Promise.all([api.get<Space[]>('/workspaces'),api.get<{items:SourceSummary[]}>('/personal-sources')]).then(([s,v])=>{if(active){setSpaces(s);setSources(v.items);setListsLoaded(true);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[prototype,reload]);
  useEffect(()=>{if(prototype||!form.data.source_id)return;let active=true;setSelected(null);void api.get<{current:SourceVersion;versions:number[]}>(`/personal-sources/${form.data.source_id}`,{version:form.data.version}).then(v=>{if(active){setSelected(v.current);setVersions(v.versions);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[prototype,form.data.source_id,form.data.version,reload]);
  const locked=form.busy||Boolean(form.pending),d=form.data;
  async function save() {
    const saved=await form.submit(data=>{
      if(!data.workspace_id||!selected||selected.status&&selected.status!=='ready')throw Error('请选择目标空间与已就绪原版本');
      if(!selected.extraction.chunks.some(c=>c.id===data.chunk_id))throw Error('请选择原文片段');
      return {...data,checksum:selected.checksum};
    },async pending=>{
      if(!prototype)return api.post<Result>('/source-learning',{...pending.payload,request_id:pending.request_id});
      const key=`gp_source_learning_prototype:${pending.request_id}`;
      let value=JSON.parse(localStorage.getItem(key)||'null') as Result|null;
      if(!value){value={item_id:crypto.randomUUID(),unit_id:crypto.randomUUID(),workspace_id:pending.payload.workspace_id,source_version:pending.payload.version};localStorage.setItem(key,JSON.stringify(value));}
      if(fail)throw Error('模拟：已保存但回执丢失。重试原提交只建立一份学习。');
      return value;
    });
    if(saved){setResult(saved); workspace?.setActiveWorkspace(saved.workspace_id); workspace?.retryHydration();}
  }
  const Content=prototype?'main':'section';
  return <Content className="ps-app ps-main page-stack"><header><h2>把原资料变成一次实际学习{prototype?' · 独立原型':''}</h2><p>选定原版本与片段，写下应用目标和问题。确认后直接进入作答，不需要重新复制资料。</p><Link to={prototype?'/prototype/personal-sources':'/app/knowledge/sources'}>返回个人资料库</Link></header>
    {prototype&&<label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>模拟保存成功但回执丢失（关闭后重试）</label>}
    {error&&<p role="alert">{error}<button onClick={()=>setReload(n=>n+1)}>重新读取</button></p>}
    {!prototype&&listsLoaded&&!spaces.length&&!error&&<p>还没有可用空间。<Link to="/app/onboarding">先建立工作空间</Link>，原资料与输入会保留。</p>}
    <section className="ps-card" hidden={Boolean(result)}><form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={locked}>
      <label>目标空间<select aria-label="学习目标空间" value={d.workspace_id} onChange={e=>form.change({workspace_id:e.target.value})}><option value="">请选择空间</option>{spaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {!prototype&&<label>原资料<select aria-label="学习原资料" value={d.source_id} onChange={e=>{const s=sources.find(v=>v.id===e.target.value);form.change({source_id:e.target.value,version:s?.version||1,chunk_id:''});}}><option value="">请选择资料</option>{sources.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>}
      {selected&&<><h3>{selected.title}</h3><label>原版本<select aria-label="学习资料版本" value={d.version} onChange={e=>form.change({version:Number(e.target.value),chunk_id:''})}>{versions.map(v=><option key={v} value={v}>版本 {v}</option>)}</select></label><label>原文片段<select aria-label="学习原文片段" value={d.chunk_id} onChange={e=>form.change({chunk_id:e.target.value})}><option value="">请选择片段</option>{selected.extraction.chunks.map(c=><option key={c.id} value={c.id}>{c.page?`第 ${c.page} 页 · `:''}{c.text.slice(0,80)}</option>)}</select></label>{selected.extraction.chunks.filter(c=>c.id===d.chunk_id).map(c=><blockquote key={c.id}><p>{c.text}</p><small>版本 {selected.version} · 字符 {c.start+1}–{c.end}{c.page?` · 第 ${c.page} 页`:''}</small></blockquote>)}</>}
      <label>学习标题<input aria-label="学习标题" required maxLength={240} value={d.title} onChange={e=>form.change({title:e.target.value})}/></label>
      <label>希望在哪个场景用上<textarea aria-label="学习应用目标" required maxLength={2000} value={d.application_goal} onChange={e=>form.change({application_goal:e.target.value})}/></label>
      <label>先凭记忆回答的问题<textarea aria-label="学习首个问题" required maxLength={2000} value={d.question} onChange={e=>form.change({question:e.target.value})}/></label>
    </fieldset>{form.error&&<p role="alert">{form.error}</p>}{form.protectedDraft&&<button type="button" onClick={form.recover}>保留原稿备份并恢复当前输入</button>}
    <div className="ps-actions"><button className="ps-primary" disabled={form.busy}>{form.busy?'正在保存…':form.pending?'核对并重试原提交':'确认建立学习并保留出处'}</button><button type="button" onClick={form.exportDraft}>导出学习草稿</button></div></form></section>
    {result&&<section className="ps-card" role="status"><h3>{prototype?'模拟学习已建立':'学习已保存到服务器'}</h3><p>引用原资料版本 {result.source_version}，后续修订不会改写本次依据。</p>{!prototype&&<Link className="ps-primary" to={`/app/learn/${result.item_id}?flow=1&review=${result.unit_id}`}>开始凭记忆作答 →</Link>}</section>}
  </Content>;
}
