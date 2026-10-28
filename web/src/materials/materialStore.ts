export type MaterialKind='text'|'txt'|'md'|'pdf'|'web';
export interface Upload {request_id:string;title:string;kind:MaterialKind;filename:string;source_url:string|null;text?:string;data_base64?:string}
export interface Chunk {id:string;page:number|null;start:number;end:number;text:string}
export interface Material {id:string;request_id:string;title:string;kind:MaterialKind;filename:string;source_url:string|null;checksum:string;bytes:number;status:'processing'|'ready'|'failed';error:string|null;attempts:number;characters:number|null;page_count:number|null;chunks_count:number;warnings:string[];created_at:string;web?:{requested_url:string;final_url:string;fetched_at:string;content_type:string;parser_version:string};extraction?:{text:string;chunks:Chunk[]};excerpts?:{id:string;revision_id:string;document_version:number;chunks:Chunk[]}[]}
export interface Fields {title:string;text:string;source_url:string;mode:'text'|'file'|'web';file:{id?:string;name:string;kind:MaterialKind;data_base64:string}|null}
export interface MaterialJournal {fields:Fields;pending:Upload|null;selected_material:string|null;selected:string[];last_receipt:string|null;rejected?:Upload|null}
export const MAX_FILE_BYTES=2*1024*1024;
export function emptyMaterialJournal():MaterialJournal{return {fields:{title:'',text:'',source_url:'',mode:'text',file:null},pending:null,selected_material:null,selected:[],last_receipt:null};}
export function sourceLocation(c:Chunk){return `${c.page?`第 ${c.page} 页 · `:''}片段 ${c.id} · 字符 ${c.start}–${c.end}`;}
export function materialKey(owner:string,workspace:string,item:string,tab:string){return `gp_materials_v1:${owner}:${workspace}:${item}:${tab}`;}
export function fileKind(name:string):MaterialKind{const extension=name.toLowerCase().split('.').pop();if(extension==='txt'||extension==='md'||extension==='pdf')return extension;throw Error('请选择 TXT、Markdown（.md）或 PDF 文件。');}
export function freezeUpload(fields:Fields,id:string):Upload{
  if(!fields.title.trim())throw Error('请填写资料标题。');
  const source=fields.source_url.trim();if(source){let u:URL;try{u=new URL(source);}catch{throw Error('原来源链接需为 HTTP 或 HTTPS 地址。');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('原来源链接需为 HTTP 或 HTTPS 地址。');}
  const common={request_id:id,title:fields.title.trim(),source_url:source||null};
  if(fields.mode==='web'){if(!source||new URL(source).protocol!=='https:'||!['','443'].includes(new URL(source).port))throw Error('网页导入需填写公开 HTTPS 地址；需要登录的内容请粘贴正文或上传文件。');return {...common,kind:'web',filename:'网页快照.html'};}
  if(fields.mode==='text'){if(!fields.text.trim())throw Error('请粘贴非空正文。');if(fields.text.length>200000)throw Error('正文最多 20 万字，请拆分后导入。');return {...common,kind:'text',filename:'粘贴正文.txt',text:fields.text};}
  if(!fields.file)throw Error('请选择资料文件。');
  return {...common,kind:fields.file.kind,filename:fields.file.name,data_base64:fields.file.data_base64};
}
export function readMaterialJournal(value:unknown):MaterialJournal{
  if(value===undefined)return emptyMaterialJournal();
  const j=value as MaterialJournal;
  if(!j||!j.fields||typeof j.fields.title!=='string'||typeof j.fields.text!=='string'||typeof j.fields.source_url!=='string'||!['file','text','web'].includes(j.fields.mode)||!Array.isArray(j.selected)||!j.selected.every(x=>typeof x==='string')||(j.pending&&(!j.pending.request_id||!j.pending.title)))throw Error('资料草稿无法读取，原数据已保留，请保留页面。');
  return j;
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('growthpilot-materials-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('资料草稿存储被其他页面阻挡'));r.onsuccess=()=>resolve(r.result);});}
export function saveMaterialCheckpoint(storage:Pick<Storage,'setItem'>,key:string,j:MaterialJournal){const {file,...fields}=j.fields;storage.setItem(`${key}:checkpoint`,JSON.stringify({fields,file_id:file?.id??null,selected_material:j.selected_material,selected:j.selected,last_receipt:j.last_receipt}));}
export function restoreMaterialCheckpoint(storage:Pick<Storage,'getItem'>,key:string,j:MaterialJournal){const raw=storage.getItem(`${key}:checkpoint`);if(!raw)return j;const c=JSON.parse(raw);if(!c?.fields||!Array.isArray(c.selected)||typeof c.fields.text!=='string')throw Error('资料恢复记录无法读取，原数据已保留。');return readMaterialJournal({...j,fields:{...c.fields,file:j.fields.file?.id===c.file_id?j.fields.file:null},selected_material:c.selected_material,selected:c.selected,last_receipt:c.last_receipt});}
export async function loadMaterialJournal(key:string){const db=await database();try{return await new Promise<MaterialJournal>((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').get(key);tx.oncomplete=()=>{try{resolve(restoreMaterialCheckpoint(localStorage,key,readMaterialJournal(r.result)));}catch(e){reject(e);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function saveMaterialJournal(key:string,value:MaterialJournal){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(structuredClone(value),key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
