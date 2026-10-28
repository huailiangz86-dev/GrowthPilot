import {useEffect, useState} from 'react';
import {useItemHelp, type HelpResult} from '../help/useItemHelp';
import {api} from '../api/client';
import type {LearningContent} from '../personal/store';
import './learning.css';

interface Evidence {key:string; label:string; role:string; characters:number; preview:string}
interface Citation {key:string; quote:string;part?:string}
interface Diagnosis {
  schema_version?:number;
  summary:string;
  findings:{observation:string; interpretation:string; certainty:string; kind?:string;evidence:Citation[]}[];
  suggestions:{title:string; action:string; why:string; finding_indexes?:number[];success_check?:string;evidence:Citation[]}[];
  limitations:string;
}
interface Props {workspaceId:string; itemId:string; version:number; pending:boolean; day:string; entries:LearningContent['journal']; onAdopt:(data:Record<string,unknown>)=>void}
function selected(raw?:string) {
  try {const value=JSON.parse(raw??'[]'); return Array.isArray(value)&&value.every(k=>typeof k==='string')?value as string[]:[];}
  catch {return [];}
}
export default function LearningDiagnosis(props:Props) {
  const tab=sessionStorage.getItem('gp_personal_tab')||'default';
  return <Session key={`${props.workspaceId}:${props.itemId}:${tab}`} {...props}/>;
}
function Session({workspaceId,itemId,version,pending,day,entries,onAdopt}:Props) {
  const h=useItemHelp(`diagnosis:${workspaceId}:${itemId}:${sessionStorage.getItem('gp_personal_tab')||'default'}`);
  const [sources,setSources]=useState<Evidence[]>([]), [error,setError]=useState(''), [consent,setConsent]=useState(false);
  const [history,setHistory]=useState<HelpResult[]>([]), [open,setOpen]=useState(false), [freshVersion,setFreshVersion]=useState(0);
  const [reload,setReload]=useState(0), [loading,setLoading]=useState(false), [nextCursor,setNextCursor]=useState<number|null>(null);
  const [cursor,setCursor]=useState(0);
  const keys=selected(h.fields.selected), total=sources.filter(s=>keys.includes(s.key)).reduce((n,s)=>n+s.characters,0);
  useEffect(()=>{setCursor(0);},[version]);
  useEffect(()=>{
    setConsent(false);
    if(!open||pending||!h.accountCurrent)return;
    let active=true;
    setLoading(true); setFreshVersion(0);
    void api.get<{version:number;items:Evidence[];next_cursor:number|null}>(`/learning-diagnosis/${workspaceId}/${itemId}/sources`,{cursor})
      .then(data=>{if(active){setSources(previous=>cursor>0?[...new Map([...previous,...data.items].map(row=>[row.key,row])).values()]:data.items);setNextCursor(data.next_cursor);setFreshVersion(data.version);setError('');}})
      .catch(e=>{if(active)setError(e.message);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[open,pending,version,workspaceId,itemId,h.accountCurrent,reload,cursor]);
  const shown=h.accountCurrent&&!pending&&h.help?.kind==='learning_diagnose'&&!h.help.redacted&&h.help.status==='completed'&&h.help.source?.version===version?h.help:null;
  return <details className="lw-sheet" aria-label="AI 学习回顾" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary><strong>AI 学习回顾 · 识别卡点与下一步</strong></summary>
    <p>从原资料、内容、笔记、心得和实际复盘中选定这次记录。比较实际答案时，会分别引用原文和本人答案；只有笔记或自评时，先提出待检验的解释。</p>
    {loading?<p role="status">正在读取已保存来源…</p>:sources.length===0&&!error&&<p>先保存一段学习内容、笔记、心得，导入资料，或完成一次回忆。</p>}
    <div className="lw-actions"><button className="pp-text-button" onClick={()=>{setCursor(0);setReload(v=>v+1);}}>刷新已保存记录</button><span>{keys.length}/10 条 · {total} 字 / 24000 字</span></div>
    {sources.map(s=><div key={s.key} style={{margin:'12px 0'}}>
      <label><input type="checkbox" aria-label={`回顾来源 ${s.label}`} checked={keys.includes(s.key)} disabled={h.busy||loading} onChange={e=>{h.setField('selected',JSON.stringify(e.target.checked?[...keys,s.key]:keys.filter(k=>k!==s.key)));setConsent(false);}}/> {s.label} · {s.characters} 字</label>
      <details><summary>核对这条记录预览</summary><p className="lw-entry-body">{s.preview}</p></details>
    </div>)}
    {nextCursor!==null&&<button className="pp-secondary" disabled={loading||h.busy} onClick={()=>setCursor(nextCursor)}>继续读取更多来源</button>}
    <label className="pp-field"><span>这次希望识别的问题 · 选填</span><textarea aria-label="学习回顾关注点" maxLength={2000} value={h.fields.question??''} onChange={e=>{h.setField('question',e.target.value);setConsent(false);}}/></label>
    <label><input type="checkbox" aria-label="允许本次学习回顾" checked={consent} onChange={e=>setConsent(e.target.checked)}/>允许 AI 本次读取上述已保存记录，识别困难并给建议</label>
    <div className="lw-actions">
      <button className="pp-primary" disabled={!consent||pending||h.busy||loading||!keys.length||keys.length>10||keys.some(k=>!sources.some(s=>s.key===k))||total>24000||freshVersion!==version} onClick={()=>void h.start({kind:'learning_diagnose',consent:true,workspace_id:workspaceId,item_id:itemId,base_version:version,evidence_keys:keys,question:h.fields.question??''})}>识别卡点并给建议</button>
      <button className="pp-text-button" disabled={h.busy} onClick={()=>void h.refresh()}>恢复本次回顾</button>
      {h.payload&&!h.busy&&h.help?.status!=='completed'&&<button disabled={pending} onClick={()=>void h.retry()}>重试原回顾</button>}
      <button className="pp-text-button" onClick={()=>void h.saved(workspaceId,itemId).then(rows=>setHistory(rows.filter(r=>r.kind==='learning_diagnose'))).catch(e=>setError(e.message))}>查看学习回顾历史</button>
      {h.storageError&&<button onClick={h.backup}>导出回顾草稿</button>}
    </div>
    {pending&&<p>先等待学习记录保存。建议会基于确定版本。</p>}
    {h.busy&&<p role="status">正在根据选定记录回顾学习过程…</p>}
    {(h.error||h.storageError||h.help?.error||error)&&<p role="alert">{h.storageError||h.error||h.help?.error||error}</p>}
    {h.help&&(h.help.redacted||h.help.source?.version!==version)&&<p>来源或读取范围已改变，旧回顾不再展示；采用过的本人记录继续保留。</p>}
    {shown?.result&&<DiagnosisResult help={shown} entries={entries} onAdopt={index=>onAdopt({help_request_id:shown.request_id,suggestion_index:index,date:day})}/>}
    {history.map(row=><details key={row.request_id}><summary>{new Date(row.created_at).toLocaleString()} · {row.redacted?'来源已变化':row.status==='completed'?'已保存':'可重试'}</summary>
      {h.accountCurrent&&!pending&&!row.redacted&&row.source?.version===version&&row.result?<DiagnosisResult help={row}/>:<p>旧记录或范围已有变化，正文隐藏，原结果标识仍保留。</p>}
    </details>)}
  </details>;
}
export function DiagnosisResult({help,entries,onAdopt}:{help:HelpResult;entries?:LearningContent['journal'];onAdopt?:(index:number)=>void}) {
  const result=help.result as unknown as Diagnosis;
  return <div aria-label="学习回顾结果"><p>{result.summary}</p>
    {result.findings.map((f,i)=><article className="lw-library-row" key={i}>{f.kind&&<p className="pp-caption">{({self_reported:'本人报告的卡点',omission:'本次答案遗漏',contradiction:'本次答案与依据不符',no_gap_observed:'本次答案未见遗漏',source_conflict:'原资料需要澄清',insufficient_evidence:'本次证据不足'} as Record<string,string>)[f.kind]}</p>}<h3>观察 {i+1}：{f.observation}</h3><p>本次核对说明：{f.interpretation}</p><small>证据状态：{({supported:'已有记录支持',tentative:'暂时推断',insufficient:'还需补充证据'} as Record<string,string>)[f.certainty]}</small><Citations citations={f.evidence} help={help}/></article>)}
    <h3>建议一次实际尝试</h3>
    {result.suggestions.map((s,i)=>{const adopted=entries?.some(e=>e.advice_request_id===help.request_id&&e.advice_index===i);return <article className="lw-library-row" key={i}><strong>{s.title}</strong><p>{s.action}</p><p>为什么：{s.why}</p>{s.finding_indexes&&<small>对应观察：{s.finding_indexes.map(n=>n+1).join('、')}</small>}{s.success_check?<p><strong>完成后这样核对：</strong>{s.success_check}</p>:<p className="pp-caption">这份旧版回顾未保存核对条件，可重新回顾补充。</p>}<Citations citations={s.evidence} help={help}/>{onAdopt&&<button className="pp-secondary" disabled={adopted} onClick={()=>onAdopt(i)}>{adopted?'已保留到逐次记录':'采用为下一步，保存到逐次记录'}</button>}</article>;})}
    <p className="pp-caption">{result.limitations}</p>
  </div>;
}
function Citations({citations,help}:{citations:Citation[];help:HelpResult}) {
  return <details><summary>核对来源依据 · {citations.length} 条</summary>{citations.map((c,i)=><blockquote key={i}>{c.part&&<strong style={{display:'block',marginBottom:8}}>{({reference:'原文核对依据',answer:'本人实际答案',self_report:'本人自评与卡点',text:'已保存记录'} as Record<string,string>)[c.part]}</strong>}{c.quote}<small style={{display:'block',marginTop:8}}>{help.source?.evidence?.find(e=>e.key===c.key)?.label??c.key} · 冻结记录{help.source?.version?`版本 ${help.source.version}`:''}</small></blockquote>)}</details>;
}
