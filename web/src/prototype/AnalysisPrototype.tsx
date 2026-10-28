import { useState } from 'react';
import AnalysisView from '../analysis/AnalysisView';
import type { AnalysisReport, Evidence, Period } from '../analysis/analysisTypes';

const STORAGE='growthpilot.analysis.prototype.v1';
interface ExampleFact {id:string;kind:'learning'|'feedback';minutes:number;note:string;date:string}
const BASE:Evidence[]=[
  {key:'tasks:example-one',source:'tasks',title:'整理一份问题清单',content:'已完成 · 最近完成日期：2026-10-05',date:'2026-10-05'},
  {key:'tasks:example-two',source:'tasks',title:'整理访谈问题',content:'待处理 · 创建日期：2026-10-07',date:'2026-10-07'},
  ...['2026-10-05','2026-10-06','2026-10-07'].map((date,i)=>({key:`reflections:example-${i}`,source:'reflections',title:`${date} · 快速记录`,content:['拆成15分钟容易开始。','整理了问题，准备继续讨论。','今天学习了30分钟，但计划中的任务没有完成。'][i],date})),
  {key:'facts:example-15',source:'learning',title:'实际学习投入',content:'显式记录：15 分钟；学习了一份案例。',date:'2026-10-05'},
  {key:'facts:example-30',source:'learning',title:'实际学习投入',content:'显式记录：30 分钟；整理了访谈问题。',date:'2026-10-07'},
  {key:'facts:example-feedback',source:'tasks',title:'行动反馈',content:'完成了问题清单，下一步安排一次访谈。',date:'2026-10-07'},
];
export default function AnalysisPrototype(){
  const [period,setPeriod]=useState<Period>('week');const [anchor,setAnchor]=useState('2026-10-07');const [scenario,setScenario]=useState('ready');const [notice,setNotice]=useState('');
  const [facts,setFacts]=useState<ExampleFact[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE)??'[]');return Array.isArray(saved)?saved.filter(f=>typeof f.id==='string'&&['learning','feedback'].includes(f.kind)&&typeof f.note==='string'&&Number.isInteger(f.minutes)&&f.minutes>=0):[];}catch{return [];}});
  const [kind,setKind]=useState<'learning'|'feedback'>('learning');const [minutes,setMinutes]=useState('30');const [note,setNote]=useState('');
  const day=new Date(`${anchor}T00:00:00Z`);if(period==='week')day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));if(period==='month')day.setUTCDate(1);
  const start=day.toISOString().slice(0,10);const stop=new Date(day);if(period==='month')stop.setUTCMonth(stop.getUTCMonth()+1);else stop.setUTCDate(stop.getUTCDate()+(period==='day'?1:7));
  const end=new Date(stop);end.setUTCDate(end.getUTCDate()-1);const endDate=end.toISOString().slice(0,10);const elapsed=Math.max(0,Math.min((stop.getTime()-day.getTime())/86400000,Math.floor((Date.parse('2026-10-07T00:00:00Z')-day.getTime())/86400000)+1));
  const savedFeedback=facts.some(f=>f.kind==='feedback');
  const all=[...BASE.map(e=>e.key==='tasks:example-two'&&savedFeedback?{...e,content:'已完成 · 最近完成日期：2026-10-07'}:e),...facts.map(f=>({key:`facts:${f.id}`,source:f.kind==='learning'?'learning':'tasks',title:f.kind==='learning'?'实际学习投入':'行动反馈',content:f.kind==='learning'?`显式记录：${f.minutes} 分钟；${f.note}`:f.note,date:f.date}))];
  let evidence=all.filter(e=>e.date>=start&&e.date<=endDate&&e.date<='2026-10-07');if(scenario==='empty')evidence=[];if(scenario==='sparse')evidence=evidence.filter(e=>e.source==='reflections').slice(0,1);
  const completed=evidence.filter(e=>e.key.startsWith('tasks:')&&e.content.startsWith('已完成'));
  const learning=evidence.filter(e=>e.source==='learning');const feedback=evidence.filter(e=>e.title==='行动反馈');
  const learningMinutes=(e:Evidence)=>Number(e.content.match(/记录：(\d+) 分钟/)?.[1]??0);
  const days=new Set(evidence.map(e=>e.date)).size;
  const daily=Array.from({length:elapsed},(_,i)=>{const d=new Date(day);d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);return {date,completed_tasks:completed.filter(e=>e.date===date).length,records:evidence.filter(e=>e.source==='reflections'&&e.date===date).length,learning_minutes:learning.filter(e=>e.date===date).reduce((sum,e)=>sum+learningMinutes(e),0),feedback:feedback.filter(e=>e.date===date).length};});
  const report:AnalysisReport={workspace_id:'example',period,start,end:endDate,timezone:'Asia/Shanghai',generated_at:new Date().toISOString(),coverage:{days,elapsed_days:elapsed,samples:evidence.length,state:!evidence.length?'empty':evidence.length<3||days<Math.min(3,elapsed)?'sparse':'ready'},metrics:{completed_tasks:completed.length,created_tasks:evidence.filter(e=>e.key.startsWith('tasks:')).length,open_tasks:1-Number(savedFeedback),captures:evidence.filter(e=>e.source==='reflections').length,reflections:0,learning_minutes:learning.reduce((sum,e)=>sum+learningMinutes(e),0),learning_sessions:learning.length,feedback:feedback.length,agent_completed:Number(completed.some(e=>e.key==='tasks:example-two'))},daily,evidence,rules:['自然周从周一开始，月份按用户时区的自然月。','完成任务按最近完成时间统计，当前未完成数是当前状态快照。','仅统计显式填写的实际学习分钟；预计时长、进度和原文中的数字不参与。','覆盖天数按范围内去重日期统计，样本不足不推断趋势。'],excluded_sources:[]};
  return <main className="analysis-prototype"><div className="analysis-prototype-controls"><a href="/prototype">← 返回五页原型</a><label>模拟条件 <select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="ready">完整事实</option><option value="empty">无数据</option><option value="sparse">样本不足</option><option value="loading">加载中</option><option value="error">加载失败</option></select></label><span>独立示例，今日固定为 2026-10-07。</span></div>{notice&&<p role="status">{notice}</p>}<AnalysisView prototype workspace="个人产品 · 示例" period={period} anchor={anchor} onPeriod={setPeriod} onAnchor={value=>value&&setAnchor(value)} report={report} loading={scenario==='loading'} error={scenario==='error'?'模拟：服务暂时不可用，原始记录仍保留。':''} onRetry={()=>setScenario('ready')} onDiscuss={()=>setNotice('示例：将此时间范围、计算口径和事实来源带入 Agent 对话。真实版本会保存分析上下文。')} discussing={false}/>
    <section className="workspace-panel" style={{marginTop:24}}><h3>试着记录实际投入与行动结果</h3><form className="fact-form" onSubmit={e=>{e.preventDefault();const item:ExampleFact={id:crypto.randomUUID(),kind,minutes:kind==='learning'?Number(minutes):0,note:note.trim(),date:'2026-10-07'};const next=[...facts,item];try{localStorage.setItem(STORAGE,JSON.stringify(next));setFacts(next);setNote('');setScenario('ready');setNotice('示例原文已保留，统计已更新；刷新可恢复。');}catch{setNotice('示例暂时无法保留，请检查浏览器存储。');}}}><label>记录内容<select value={kind} onChange={e=>setKind(e.target.value as 'learning'|'feedback')}><option value="learning">实际学习投入</option><option value="feedback">行动完成结果</option></select></label>{kind==='learning'?<label>实际学习分钟<input type="number" min="1" max="1440" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>:<p>示例行动：整理访谈问题。{savedFeedback?'已记录完成结果。':'保存时将完成这件示例行动。'}</p>}<label>结果原文<textarea value={note} onChange={e=>setNote(e.target.value)} required maxLength={4000}/></label><button className="primary-action" disabled={!note.trim()||(kind==='feedback'&&savedFeedback)}>{kind==='learning'?'保存示例实际投入':'完成示例行动并保存结果'}</button></form></section>
  </main>;
}
