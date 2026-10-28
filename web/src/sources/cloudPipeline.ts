import type {CloudChunk} from '../learning/cloudKnowledge';

export type PipelineState = 'prepared'|'uploading'|'uploaded'|'registering'|'parsing'|'parsed'|'submitting'|'indexing'|'ready'|'uncertain'|'failed';
export interface PipelineRecord {
  id:string; source_id:string; source_version:number; title:string; mode:'original'|'extracted';
  source_checksum:string; payload_checksum:string; bytes:number; filename:string;
  index_id:string|null; category_id:string|null; workspace_id:string|null; endpoint:string|null;
  state:PipelineState; file_id:string|null; job_id:string|null; error:string|null;
  receipts:{step:string;request_id:string|null;at:string;status?:string}[]; updated_at:string;
}
export interface PipelineChunk extends CloudChunk {local_matches:{start:number;end:number;page:number|null}[]}
export interface PipelineDraft {source_id:string;version:number;mode:'original'|'extracted';index_id:string;category_id:string;query:string;request_id:string}
export const emptyPipelineDraft=():PipelineDraft=>({source_id:'',version:1,mode:'original',index_id:'',category_id:'default',query:'',request_id:''});
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function readPipelineDraft(storage:StorageLike,owner:string):PipelineDraft {
  try {const raw=JSON.parse(storage.getItem(`gp_source_pipeline:${owner}`)||'null');const base=emptyPipelineDraft();if(!raw||typeof raw!=='object')return base;
    for(const key of ['source_id','index_id','category_id','query','request_id'] as const)if(typeof raw[key]==='string')base[key]=raw[key].slice(0,key==='query'?500:160);
    if(Number.isInteger(raw.version)&&raw.version>0&&raw.version<=100)base.version=raw.version;
    if(raw.mode==='extracted')base.mode='extracted';return base;
  } catch {return emptyPipelineDraft();}
}
export function savePipelineDraft(storage:StorageLike,owner:string,draft:PipelineDraft):boolean {
  try {storage.setItem(`gp_source_pipeline:${owner}`,JSON.stringify(draft));return true;}catch{return false;}
}
export const PIPELINE_LABELS:Record<PipelineState,string>={prepared:'本地清单已准备',uploading:'正在上传',uploaded:'原件已上传，待登记',registering:'正在登记云端文件',parsing:'等待云端解析',parsed:'解析完成，待追加索引',submitting:'正在提交索引',indexing:'等待切片与索引',ready:'云端索引完成',uncertain:'回执待核对',failed:'云端处理失败'};
export function pipelineCitation(record:PipelineRecord,chunk:PipelineChunk,readAt:string):string {
  const matches=chunk.local_matches.map(m=>`${m.page?`页 ${m.page} · `:''}字符 ${m.start+1}–${m.end}`).join('；');
  return `${chunk.text}\n\n来源：${record.title} · 个人资料 ${record.source_id} · 版本 ${record.source_version}\n原件 SHA256 ${record.source_checksum}\n上传${record.mode==='original'?'原件':'提取正文'} SHA256 ${record.payload_checksum}\n百炼业务空间 ${record.workspace_id} · 知识库 ${record.index_id}\n文档 ${chunk.document_id} · 切片 ${chunk.chunk_id}\n${matches?`冻结正文精确匹配：${matches}`:'云端切片未在冻结正文中精确匹配，请打开原版本核对。'}\n读取时间 ${readAt}`;
}
