import {useRef, useState} from 'react';
import '../personal/personal.css';
import '../learning/learning.css';

const KEY='gp-diagnosis-quality-prototype-v1';
const CASES=[
  {title:'答案与原文不符',kind:'答案不符',reference:'缓存命中时读取已有值；未命中时计算并保存新值。',answer:'每次请求都重新计算，已有值也不会读取。',observation:'答案把每次请求都描述为重新计算。',interpretation:'这次答案与“命中时读取已有值”不符。',action:'合上原文，分别写出命中与未命中时的处理步骤，再核对。',check:'答案明确区分命中时读取已有值，以及未命中时计算并保存新值。'},
  {title:'答案漏了关键步骤',kind:'答案遗漏',reference:'发送前检查收件人、主题和附件；全部核对后再发送。',answer:'检查收件人和主题，然后发送。',observation:'答案列出收件人和主题，没有列出附件。',interpretation:'这次答案漏了原文要求的附件检查。',action:'从记忆写出发送前的检查清单，并模拟检查一封邮件。',check:'清单包含收件人、主题、附件，且说明核对完成后再发送。'},
  {title:'只有学习时长',kind:'证据不足',reference:'',answer:'今天学习了 30 分钟，感觉懂了。',observation:'记录只有时长和本人感受，没有实际作答。',interpretation:'还不能识别具体知识遗漏或判断掌握情况。',action:'选择一个具体问题，先保存原文中的核对依据，再独立作答。',check:'保留同一问题的原文依据与独立答案，能逐项比较。'},
];
interface Draft {caseIndex:number;focus:string;resultIndex:number|null;notes:string;status:string}
export default function DiagnosisQualityPrototype(){
  const [initial]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return {draft:(saved??{caseIndex:0,focus:'',resultIndex:null,notes:'',status:''}) as Draft,error:''};}catch{return {draft:{caseIndex:0,focus:'',resultIndex:null,notes:'',status:''} as Draft,error:'原型草稿无法读取，请保留页面。'};}});
  const [draft,setDraft]=useState(initial.draft),[error,setError]=useState(initial.error),[busy,setBusy]=useState(false),[fail,setFail]=useState(false),[consent,setConsent]=useState(false);
  const inFlight=useRef(false), chosen=CASES[draft.caseIndex]??CASES[0],result=draft.resultIndex===null?null:CASES[draft.resultIndex];
  function save(patch:Partial<Draft>){const next={...draft,...patch};setDraft(next);try{if(initial.error)throw Error();localStorage.setItem(KEY,JSON.stringify(next));setError('');return true;}catch{setError('草稿暂时无法保留，输入留在页面。');return false;}}
  async function run(){if(inFlight.current||!save({}))return;const index=draft.caseIndex;inFlight.current=true;setBusy(true);save({resultIndex:null,status:'正在核对本次答案与原文 · 模拟'});await new Promise(r=>setTimeout(r,500));inFlight.current=false;setBusy(false);save(fail?{resultIndex:null,status:'回顾失败 · 模拟。关注点与选定来源保留，可重试。'}:{resultIndex:index,status:'回顾已保存 · 模拟'});}
  return <main className="lw-prototype"><a href="/prototype">← 原型入口</a><div className="lw-intro"><div><span>D10 · 学习诊断质量 · 独立模拟</span><h1>看清这次卡在哪里</h1><p>下面均为虚构案例与预设回复，不调用模型。</p></div></div><section className="lw-sheet">
    <div className="lw-tabs" aria-label="诊断案例">{CASES.map((c,i)=><button key={c.title} disabled={busy} aria-pressed={draft.caseIndex===i} onClick={()=>{save({caseIndex:i,resultIndex:null,status:''});setConsent(false);}}>{c.title}</button>)}</div>
    <h2>本次选定来源</h2>{chosen.reference?<><h3>原文核对依据</h3><blockquote>{chosen.reference}</blockquote><h3>本人实际答案</h3></>:<h3>本人记录</h3>}<blockquote>{chosen.answer}</blockquote>
    <label className="pp-field"><span>这次希望识别的问题 · 选填</span><textarea aria-label="回顾关注点" value={draft.focus} disabled={busy} onChange={e=>save({focus:e.target.value})}/></label>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>允许模拟回顾选定来源</label><div className="lw-actions"><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>模拟回顾失败</label><button className="pp-primary" disabled={busy||!consent||!!initial.error} onClick={()=>void run()}>{busy?'正在核对…':'回顾 / 重试 · 模拟'}</button></div>
    {draft.status&&<p role="status">{draft.status}</p>}{error&&<p role="alert">{error}</p>}{!result&&!busy&&<p>还没有回顾结果，先核对并允许读取本次来源。</p>}
    {result&&<section aria-label="诊断结果"><article className="lw-library-row"><small>{result.kind} · {draft.resultIndex===2?'还需补充证据':'本次记录支持'}</small><h3>观察：{result.observation}</h3><p>AI 解释：{result.interpretation}</p><details><summary>核对依据</summary>{result.reference&&<blockquote>原文：{result.reference}</blockquote>}<blockquote>{result.reference?'本人答案':'本人记录'}：{result.answer}</blockquote></details></article><article className="lw-library-row"><h3>建议一次实际尝试</h3><p>{result.action}</p><p><strong>完成后这样核对：</strong>{result.check}</p><button className="pp-secondary" disabled={draft.notes.includes(result.check)} onClick={()=>save({notes:[draft.notes,`本人采用 · 模拟\n${result.action}\n完成后这样核对：${result.check}\n来源原文：${result.reference||'未提供'}\n本人记录：${result.answer}`].filter(Boolean).join('\n\n'),status:'下一步与核对条件已保留 · 模拟'})}>{draft.notes.includes(result.check)?'已保留到逐次记录':'采用为下一步 · 模拟'}</button></article><p className="pp-caption">仅依据本次选定记录，不能推断长期掌握或替本人完成练习。</p></section>}
    <h2>本人逐次记录</h2><p className="lw-entry-body" aria-label="采用记录">{draft.notes||'尚未采用建议。'}</p>
  </section></main>;
}
