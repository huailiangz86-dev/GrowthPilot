import {fileKind, MAX_FILE_BYTES, type Chunk} from '../materials/materialStore.ts';

export const SOURCE_LABELS = {note:'笔记', email:'邮件', book:'书本 / 文档', link:'链接'};
export type SourceKind = keyof typeof SOURCE_LABELS;
export interface SourceFields {title:string;category:SourceKind;mode:'text'|'file'|'link'|'web';text:string;source_url:string;file:{name:string;kind:string;data_base64:string}|null;source_id:string|null;base_version:number}
export interface SourceCommand {request_id:string;source_id:string;base_version:number;title:string;category:SourceKind;kind:string;filename:string;source_url:string|null;text?:string;data_base64?:string}
export interface SourceVersion {id:string;source_id:string;version:number;title:string;category:SourceKind;kind:string;filename:string;source_url:string|null;checksum:string;bytes:number;created_at:string;status?:'ready'|'failed'|'processing';error?:string|null;attempts?:number;parser_version?:string;extraction:{text:string;chunks:Chunk[];warnings:string[];page_count:number|null;email?:Record<string,string>;web?:Record<string,string>}}
export interface SourceSummary {id:string;version:number;title:string;category:SourceKind;kind:string;source_url:string|null;preview:string;status?:string;updated_at:string}
export interface SourceJournal {fields:SourceFields;pending:SourceCommand|null}
export function emptySourceFields():SourceFields{return {title:'',category:'note',mode:'text',text:'',source_url:'',file:null,source_id:null,base_version:0};}
export function sourceFileKind(name:string){return name.toLowerCase().endsWith('.eml')?'eml':fileKind(name);}
export function freezeSource(f:SourceFields, request_id:string, source_id:string):SourceCommand {
  if(!f.title.trim())throw Error('请填写资料标题。');
  if(!Object.hasOwn(SOURCE_LABELS,f.category))throw Error('请选择资料类型。');
  const url=f.source_url.trim();
  if(url){let u:URL;try{u=new URL(url);}catch{throw Error('请填写有效的 HTTP 或 HTTPS 来源地址。');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('请填写不含账号密码的 HTTP 或 HTTPS 来源地址。');}
  const common={request_id,source_id:f.source_id??source_id,base_version:f.base_version,title:f.title.trim(),category:f.category,source_url:url||null};
  if(f.mode==='link'||f.mode==='web'){
    if(f.category!=='link'||!url)throw Error('链接资料需要填写原地址。');
    if(f.mode==='web'){const u=new URL(url);if(u.protocol!=='https:'||!['','443'].includes(u.port))throw Error('读取正文需要公开 HTTPS 地址。');}
    return {...common,kind:f.mode,filename:f.mode==='link'?'来源链接.txt':'网页快照.html'};
  }
  if(f.mode==='file'){
    if(!f.file)throw Error('请选择原文件。');
    if(f.category==='email'&&f.file.kind!=='eml')throw Error('邮件请提供 EML 原件，或选择粘贴原文。');
    if(f.file.kind==='eml'&&f.category!=='email')throw Error('EML 原件请选择邮件类型。');
    return {...common,kind:f.file.kind,filename:f.file.name,data_base64:f.file.data_base64};
  }
  if(!f.text.trim())throw Error('请填写原文。');
  if(Array.from(f.text).length>200000||new TextEncoder().encode(f.text).length>MAX_FILE_BYTES)throw Error('原文最多 20 万字、2 MB。');
  return {...common,kind:f.category==='email'?'eml':'text',filename:f.category==='email'?'邮件原文.eml':'原文.txt',text:f.text};
}
export function sourceCitation(v:SourceVersion,c:Chunk){return `“${c.text}”\n出处：${v.title} · ${SOURCE_LABELS[v.category]}\n个人资料 ${v.source_id} · 版本 ${v.version} · SHA256 ${v.checksum}\n${c.page?`第 ${c.page} 页 · `:''}字符 ${c.start+1}–${c.end}${v.source_url?`\n原地址：${v.source_url}`:''}`;}
export function readSourceJournal(raw:unknown):SourceJournal {
  if(raw===undefined)return {fields:emptySourceFields(),pending:null};
  const j=raw as SourceJournal,f=j?.fields,p=j?.pending;
  if(!f||typeof f.title!=='string'||typeof f.text!=='string'||typeof f.source_url!=='string'||!Object.hasOwn(SOURCE_LABELS,f.category)||!['text','file','link','web'].includes(f.mode)||!Number.isInteger(f.base_version)||f.base_version<0||(f.source_id!==null&&typeof f.source_id!=='string')||(f.file&&(!f.file.name||typeof f.file.data_base64!=='string'))||(p&&(!p.request_id||!p.source_id||!p.title)))throw Error('资料草稿无法读取，原数据已保留。');
  return j;
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('growthpilot-personal-sources-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('资料存储暂时被其他页面阻挡。'));r.onsuccess=()=>resolve(r.result);});}
export async function sourceStorage<T>(key:string, value?:T):Promise<T|undefined>{const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records',value===undefined?'readonly':'readwrite');const request=value===undefined?tx.objectStore('records').get(key):tx.objectStore('records').put(structuredClone(value),key);tx.oncomplete=()=>resolve(value===undefined?request.result:value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function sourceBackups(key:string){const db=await database();try{return await new Promise<{key:string;journal:SourceJournal}[]>((resolve,reject)=>{const rows:{key:string;journal:SourceJournal}[]=[],tx=db.transaction('records','readonly'),request=tx.objectStore('records').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const name=String(cursor.key);if(name.startsWith(`${key}:backup:`))rows.push({key:name,journal:cursor.value});cursor.continue();};tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export function checkpointSource(key:string, fields:SourceFields){const {file,...rest}=fields;localStorage.setItem(`${key}:fields`,JSON.stringify({...rest,file_name:file?.name??null}));}
export function restoreSource(key:string,j:SourceJournal){const raw=localStorage.getItem(`${key}:fields`);if(!raw||j.pending)return j;const fields=JSON.parse(raw),file=fields.file_name===j.fields.file?.name?j.fields.file:null;return readSourceJournal({...j,fields:{...fields,file}});}
