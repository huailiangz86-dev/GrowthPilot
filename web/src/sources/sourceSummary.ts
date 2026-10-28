import type {SourceVersion} from './sourceStore.ts';

export interface SummarySelection {source_id:string;version:number;checksum:string;chunk_id:string}
export interface SummaryEvidence extends SummarySelection {key:string;title:string;category:string;source_url:string|null;text:string;start:number;end:number;page:number|null;parser_version?:string}
export interface SummaryCitation {key:string;quote:string;start:number;end:number}
export interface SummaryPoint {text:string;kind:'observation'|'inference';evidence:SummaryCitation[]}
export interface SummaryResult {title:string;points:SummaryPoint[];limitations:string}
export interface SummaryRequest {request_id:string;consent:true;question:string;selections:SummarySelection[]}
export interface SavedSummary {title:string;notes:string}
export interface SummaryRun {request_id:string;status:'processing'|'failed'|'completed';error:string|null;question:string;source:SummaryEvidence[];result:SummaryResult|null;saved:SavedSummary|null;saved_at:string|null;created_at:string;prompt_version:string}
export interface SummaryDraft {question:string;selections:SummarySelection[];pending:SummaryRequest|null;save_pending:SavedSummary|null;title:string;notes:string}
export const emptySummaryDraft=():SummaryDraft=>({question:'',selections:[],pending:null,save_pending:null,title:'',notes:''});
export function selectionKey(s:SummarySelection){return `${s.source_id}:${s.version}:${s.chunk_id}`;}
export function freezeSummary(draft:SummaryDraft,request_id:string,consent:boolean):SummaryRequest {
  if(!consent)throw Error('请明确允许 AI 处理本次选定片段与关注点。');
  if(!draft.selections.length||draft.selections.length>10)throw Error('请选择 1–10 个已保存的正文片段。');
  if(new Set(draft.selections.map(selectionKey)).size!==draft.selections.length)throw Error('同一片段只能选择一次。');
  if(Array.from(draft.question).length>2000)throw Error('关注点最多 2000 字。');
  return {request_id,consent:true,question:draft.question,selections:structuredClone(draft.selections)};
}
export function readSummaryDraft(raw:string|null):SummaryDraft {
  if(raw===null)return emptySummaryDraft();
  const d=JSON.parse(raw) as SummaryDraft;
  const selection=(s:SummarySelection)=>s&&typeof s.source_id==='string'&&Number.isInteger(s.version)&&s.version>0&&s.version<=100&&typeof s.checksum==='string'&&typeof s.chunk_id==='string';
  if(!d||typeof d.question!=='string'||Array.from(d.question).length>2000||!Array.isArray(d.selections)||d.selections.length>10||!d.selections.every(selection)||typeof d.title!=='string'||d.title.length>240||typeof d.notes!=='string'||d.notes.length>10000||
    (d.pending&&(!d.pending.request_id||d.pending.consent!==true||typeof d.pending.question!=='string'||Array.from(d.pending.question).length>2000||!Array.isArray(d.pending.selections)||d.pending.selections.length<1||d.pending.selections.length>10||!d.pending.selections.every(selection)||d.pending.question!==d.question||JSON.stringify(d.pending.selections)!==JSON.stringify(d.selections)))||
    (d.save_pending&&(typeof d.save_pending.title!=='string'||!d.save_pending.title.trim()||d.save_pending.title.length>240||typeof d.save_pending.notes!=='string'||d.save_pending.notes.length>10000)))throw Error('总结草稿无法读取，原存储已保留。');
  return {question:d.question,selections:d.selections,pending:d.pending??null,save_pending:d.save_pending??null,title:d.title,notes:d.notes};
}
export function summaryEvidence(v:SourceVersion,chunk_id:string,index:number):SummaryEvidence {
  const c=v.extraction.chunks.find(c=>c.id===chunk_id);
  if(!c||v.kind==='link'||(v.status&&v.status!=='ready')||!c.text.trim()||Array.from(v.extraction.text).slice(c.start,c.end).join('')!==c.text)throw Error('这个片段没有可核对的已保存正文。');
  return {key:`S${index+1}`,source_id:v.source_id,version:v.version,checksum:v.checksum,chunk_id:c.id,title:v.title,category:v.category,source_url:v.source_url,text:c.text,start:c.start,end:c.end,page:c.page,parser_version:v.parser_version};
}
export function summaryMarkdown(run:SummaryRun):string {
  if(!run.result||!run.saved)throw Error('请先确认保存这份总结。');
  const sources=new Map(run.source.map(s=>[s.key,s]));
  const paragraphs=run.result.points.map((p,i)=>{
    const citations=p.evidence.map(c=>{const s=sources.get(c.key);if(!s||Array.from(s.text).slice(c.start-s.start,c.end-s.start).join('')!==c.quote)throw Error('总结引用无法核对，请重新读取。');return `> ${c.quote.replace(/\n/g,'\n> ')}\n\n出处：${s.title} · 个人资料 ${s.source_id} · 版本 ${s.version} · SHA256 ${s.checksum}\n${s.page?`第 ${s.page} 页 · `:''}字符 ${c.start+1}–${c.end}${s.source_url?`\n原地址：${s.source_url}`:''}`;});
    return `${i+1}. ${p.kind==='inference'?'待验证的解释':'资料中的要点'}：${p.text}\n\n${citations.join('\n\n')}`;
  });
  return `# ${run.saved.title}\n\n${paragraphs.join('\n\n')}\n\n使用范围：仅依据这次选定的 ${run.source.length} 个冻结片段。${run.result.limitations}${run.saved.notes?`\n\n我的补充（本人填写）：\n${run.saved.notes}`:''}\n\n总结 ${run.request_id} · 提示词 ${run.prompt_version} · 保存时间 ${run.saved_at}`;
}
