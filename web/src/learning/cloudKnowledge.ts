export interface CloudChunk {document_id:string;chunk_id:string;text:string;score:number|null;title:string;hierarchy:string;document_name:string;page:number|null}
export interface CloudConnection {source:string;workspace_id:string;index_id:string;endpoint:string;mode:string;provider:string}
export interface CloudResult {items:CloudChunk[];query:string;rerank:boolean;request_id:string;retrieved_at:string;connection:CloudConnection}
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function readCloudQuery(storage:StorageLike,owner:string):string{
  try{return (storage.getItem(`gp_bailian_query:${owner}`)||'').slice(0,500);}catch{return '';}
}
export function saveCloudQuery(storage:StorageLike,owner:string,query:string):boolean{
  try{storage.setItem(`gp_bailian_query:${owner}`,query.slice(0,500));return true;}catch{return false;}
}
export function cloudCitation(chunk:CloudChunk,connection:CloudConnection,readAt:string):string{
  return `${chunk.text}\n\n来源：阿里云百炼 · ${chunk.document_name||chunk.title||'未命名资料'}\n业务空间 ${connection.workspace_id} · 知识库 ${connection.index_id}\n文档 ${chunk.document_id} · 切片 ${chunk.chunk_id}${chunk.hierarchy?`\n章节 ${chunk.hierarchy}`:''}${chunk.page?` · 页 ${chunk.page}`:''}\n读取时间 ${readAt}\n此引用为本次读取的云端切片；云端资料更新后请重新核对。`;
}
