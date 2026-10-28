import {useState} from 'react';
import {useItemHelp} from '../help/useItemHelp';
import {DiagnosisResult} from '../learning/LearningDiagnosis';
import type {Attempt} from './store';

export default function AttemptCheck({workspaceId,itemId,version,attempt,pending}:{workspaceId:string;itemId:string;version:number;attempt:Attempt;pending:boolean}) {
  const h=useItemHelp(`attempt-check:${workspaceId}:${itemId}:${attempt.id}`),[consent,setConsent]=useState(false);
  const shown=h.accountCurrent&&!pending&&h.help?.status==='completed'&&!h.help.redacted&&h.help.source?.version===version&&h.help.source.evidence?.some(e=>e.key===`attempt:${attempt.id}`)?h.help:null;
  return <details className="lr-ai-check"><summary>请 AI 核对本题 · 可跳过</summary><p>本次只发送已保存的题目、原文依据和答案，核对这一次回答。你可以自行比较原文后继续。</p>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>允许 AI 本次读取上述记录</label>
    <div className="lr-actions"><button disabled={!consent||pending||h.busy||Boolean(h.payload)&&h.help?.status!=='completed'} onClick={()=>void h.start({kind:'learning_diagnose',consent:true,workspace_id:workspaceId,item_id:itemId,base_version:version,evidence_keys:[`attempt:${attempt.id}`],question:'只核对本题实际答案与给定原文。'})}>{h.help?.status==='completed'?'重新核对本题':'核对本题'}</button>
    {h.payload&&<button disabled={h.busy} onClick={()=>void h.refresh()}>读取已保存的核对</button>}{h.payload&&h.help?.status!=='completed'&&<button disabled={pending||h.busy} onClick={()=>void h.retry()}>重试原核对</button>}</div>
    {h.busy&&<p role="status">正在核对本题，其他输入仍保留…</p>}{(h.error||h.storageError||h.help?.error)&&<p role="alert">{h.storageError||h.error||h.help?.error}</p>}
    {h.storageError&&<button onClick={h.backup}>导出核对草稿</button>}
    {h.help&&!shown&&h.help.status==='completed'&&<p>来源版本或数据范围已改变，旧结果已隐藏。仍可依据本次冻结原文自行核对。</p>}
    {shown?.result&&<DiagnosisResult help={shown}/>}
  </details>;
}
