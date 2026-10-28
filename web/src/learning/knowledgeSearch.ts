export interface Hit {start:number;end:number;quote:string;term:string}
export interface Excerpt {start:number;end:number;text:string;hits:Hit[]}
export interface KnowledgeEntryData {
  key:string;kind:string;title:string;item_id:string|null;preview:string;characters:number;
  source:{kind:string;version?:number;date?:string;checksum?:string;title?:string};updated_at:string;
  matched_terms?:string[];title_hits?:Hit[];excerpts?:Excerpt[];
}
export const KNOWLEDGE_LABELS:Record<string,string>={all:'全部',material:'原资料',content:'学习内容',notes:'学习笔记',insights:'学习心得',questions:'疑问',exercise:'练习',outcome:'应用成果',card:'知识卡'};

export interface SearchDraft {search:string;text:string;pending:string[]}
export function submitSearch(draft:SearchDraft):SearchDraft{
  const text=draft.text.trim();return {...draft,text,pending:text===draft.search?draft.pending:[...draft.pending.slice(-3),text]};
}
export function synchronizeSearch(draft:SearchDraft,search:string):SearchDraft{
  if(draft.search===search)return draft;
  const own=draft.pending.indexOf(search);
  return {search,text:own>=0?draft.text:search,pending:own>=0?draft.pending.slice(own+1):[]};
}

/** Server positions count original Unicode characters, rather than UTF-16 units. */
export function highlightParts(text:string,hits:Hit[],offset=0):{text:string;marked:boolean}[]{
  const chars=Array.from(text),ranges=hits.map(h=>({start:Math.max(0,h.start-offset),end:Math.min(chars.length,h.end-offset)}))
    .filter(h=>h.start<h.end).sort((a,b)=>a.start-b.start);
  const merged:{start:number;end:number}[]=[];
  for(const r of ranges){const last=merged.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}
  const parts:{text:string;marked:boolean}[]=[];let at=0;
  for(const r of merged){if(r.start>at)parts.push({text:chars.slice(at,r.start).join(''),marked:false});parts.push({text:chars.slice(r.start,r.end).join(''),marked:true});at=r.end;}
  if(at<chars.length)parts.push({text:chars.slice(at).join(''),marked:false});return parts;
}

export function citationText(entry:KnowledgeEntryData,excerpt:Excerpt):string{
  const source=entry.source.version?`版本 ${entry.source.version}`:entry.source.checksum?`SHA256 ${entry.source.checksum}`:`读取版本 ${entry.updated_at}`;
  return `“${excerpt.text}”\n出处：${entry.title} · ${KNOWLEDGE_LABELS[entry.kind]} · ${source} · 原文字符 ${excerpt.start + 1}–${excerpt.end}\n记录标识：${entry.key}`;
}
