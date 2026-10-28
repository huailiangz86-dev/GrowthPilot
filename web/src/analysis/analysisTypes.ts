export type Period = 'day' | 'week' | 'month';
export interface FactEntry { id:string; workspace_id:string; kind:'learning'|'feedback'; entry_date:string; minutes:number|null; note:string; task_id:string|null; task_title:string|null; conversation_id:string|null; created_at:string }
export interface Evidence {key:string;source:string;title:string;content:string;date:string}
export interface AnalysisReport {
  workspace_id:string; period:Period; start:string; end:string; timezone:string; generated_at:string;
  coverage:{days:number;elapsed_days:number;samples:number;state:'empty'|'sparse'|'ready'};
  metrics:{completed_tasks:number;created_tasks:number;open_tasks:number;captures:number;reflections:number;learning_minutes:number;learning_sessions:number;feedback:number;agent_completed:number};
  daily:{date:string;completed_tasks:number;records:number;learning_minutes:number;feedback:number}[];
  evidence:Evidence[]; rules:string[]; excluded_sources:string[];
}
export interface PendingFact {owner:string;workspace:string;request:{id:string;kind:'learning'|'feedback';entry_date:string;minutes:number|null;note:string;task_id:string|null}}
export const factKey=(owner:string,workspace:string)=>`growthpilot.fact.pending.v1:${owner}:${workspace}`;
const UUID=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function readFact(storage:Pick<Storage,'getItem'>,owner:string,workspace:string):PendingFact|null {
  try {const value=JSON.parse(storage.getItem(factKey(owner,workspace))??'null');const r=value?.request;
    return value?.owner===owner && value?.workspace===workspace && UUID.test(r?.id??'') && ['learning','feedback'].includes(r?.kind) && typeof r.note==='string' && r.note.trim() && r.note.length<=4000 && /^\d{4}-\d{2}-\d{2}$/.test(r.entry_date) && (r.kind==='learning' ? Number.isInteger(r.minutes)&&r.minutes>0&&r.minutes<=1440&&r.task_id===null : r.minutes===null&&UUID.test(r.task_id??'')) ? value : null;
  } catch {return null;}
}
