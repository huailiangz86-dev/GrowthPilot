export type Rating='again'|'hard'|'good'|'easy';
export const RATINGS:Record<Rating,{label:string;hint:string}>={again:{label:'没想起',hint:'需要重新理解和练习'},hard:{label:'费力想起',hint:'有遗漏，或需要提示'},good:{label:'基本想起',hint:'能回忆主要内容，作答方式另行记录'},easy:{label:'轻松想起',hint:'能解释并举例，作答方式另行记录'}};
export interface Source{kind:'document'|'material'|'personal_source';source_id?:string;title:string;quote?:string;revision_id?:string;version?:number;field?:'content'|'notes'|'insights'|'exercise';material_id?:string;checksum?:string;chunk_id?:string;start?:number;end?:number;page?:number|null;application_goal?:string}
export type ScheduleMode='suggested'|'manual'|'none';
export type QueueState='unfinished'|'new'|'due'|'upcoming'|'unscheduled';
export interface SavedSchedule{mode:ScheduleMode;rule_version:string|null;interval_days:number|null;scheduled_on:string;next_review_date:string|null;basis_attempt_id:string|null;previous_interval_days:number|null;timezone:string}
export interface SchedulePreview{today:string;token:string;rule_version:string;latest_attempt_id:string|null;previous_interval_days:number|null;early_review:boolean;choices:Record<Rating,{interval_days:number;next_review_date:string}>}
export interface Unit{id:string;item_id:string;item_title:string;question:string;kind:'concept'|'question';source:Source;created_at:string;completed_count:number;unfinished_count:number;last_rating:Rating|null;next_review_date:string|null;schedule?:SavedSchedule|null;queue_state?:QueueState|null;today?:string|null}
export type Assistance='independent'|'source'|'ai'|'unknown';
export const ASSISTANCE:Record<Assistance,string>={independent:'独立回忆',source:'看过原文或笔记',ai:'使用过 AI 提示',unknown:'未记录'};
export interface Practice{result:string;criterion:string;checked_by:'self'}
export interface Attempt{id:string;unit_id:string;snapshot:{question:string;kind:string;source:Source;item_id:string;schedule?:SavedSchedule;assistance?:Assistance;practice?:Practice};answer:string;did_not_recall:boolean;status:'answered'|'completed';rating:Rating|null;understanding:string;difficulty:string;next_action:string;next_review_date:string|null;answered_at:string;completed_at:string|null}
export interface Form{question:string;kind:'concept'|'question';mode:'content'|'notes'|'insights'|'exercise'|'material';quote:string;materialId:string;chunkId:string;application_goal?:string}
export interface Reflection{rating:Rating|'';understanding:string;difficulty:string;next_action:string;next_review_date:string;schedule_mode?:ScheduleMode}
export interface Recall{answer:string;did_not_recall:boolean;attemptId:string|null;reflection:Reflection;assistance?:Assistance;flow_step?:'check'|'practice'|'schedule';practice_result?:string;practice_criterion?:string;practice_checked?:boolean}
export interface Pending{kind:'create'|'answer'|'finish';url:string;body:Record<string,unknown>;unitId:string}
export interface Journal{form:Form;selected:string;recalls:Record<string,Recall>;pending:Pending|null;notice:string;rejected?:Pending}
export const blankReflection=():Reflection=>({rating:'',understanding:'',difficulty:'',next_action:'',next_review_date:'',schedule_mode:'suggested'});
export const blankRecall=():Recall=>({answer:'',did_not_recall:false,attemptId:null,reflection:blankReflection(),assistance:'unknown',flow_step:'check',practice_result:'',practice_criterion:'',practice_checked:false});
export const practiceReady=(r:Recall)=>Boolean(r.practice_result?.trim()&&r.practice_criterion?.trim()&&r.practice_checked);
export const emptyJournal=():Journal=>({form:{question:'',kind:'question',mode:'notes',quote:'',materialId:'',chunkId:''},selected:'',recalls:{},pending:null,notice:''});
export const journalKey=(owner:string,wid:string,iid:string,tab:string)=>`gp_learning_review_v1:${owner}:${wid}:${iid}:${tab}`;
export function readJournal(storage:Pick<Storage,'getItem'>,key:string):Journal{const raw=storage.getItem(key);if(!raw)return emptyJournal();try{const j=JSON.parse(raw) as Journal;if(!j||!j.form||typeof j.selected!=='string'||!j.recalls||!('pending'in j))throw Error();return j;}catch{throw Error('复盘草稿无法读取，原记录保留，请先导出备份。');}}
export function acknowledge(j:Journal,p:Pending,result:Unit|Attempt):Journal{
  if(j.pending?.body.request_id!==p.body.request_id)return j;
  if(p.kind==='create')return {...j,pending:null,selected:result.id,form:{...j.form,question:''},notice:'复习问题已保存。现在先凭记忆作答。'};
  const a=result as Attempt,r=j.recalls[p.unitId]??blankRecall();
  return {...j,pending:null,recalls:{...j.recalls,[p.unitId]:{...r,attemptId:a.id,reflection:p.kind==='answer'?{...blankReflection(),rating:a.did_not_recall?'again':''}:r.reflection}},notice:p.kind==='answer'?'答案已保存，请核对原文并完成复盘。':'学习复盘已保存，已进入日复盘。'};
}
export function documentSource(revisionId:string,field:'content'|'notes'|'insights'|'exercise',text:string,quote:string){const index=text.indexOf(quote),start=Array.from(text.slice(0,index)).length;if(!quote.trim()||quote.length>12000||index<0)throw Error('依据需是已保存内容中完整的一段原文，最多 12000 字。');return {kind:'document',revision_id:revisionId,field,start,end:start+Array.from(quote).length};}
export const sourceLabel=(s:Source)=>`${s.title} · ${s.kind==='document'?`笔记版本 ${s.version} · ${({content:'学习内容',notes:'笔记',insights:'心得',exercise:'练习'}[s.field??'notes'])}`:`原资料${s.version?` · 版本 ${s.version}`:''}${s.page?` · 第 ${s.page} 页`:''}`} · 位置 ${s.start}–${s.end}`;
// Old drafts keep their explicit dates; only new reflections default to suggestions.
export const scheduleMode=(r:Reflection):ScheduleMode=>r.schedule_mode??'manual';
export function finishBody(r:Reflection,preview:SchedulePreview|null){
  const mode=scheduleMode(r);
  if(mode==='suggested'&&(!r.rating||!preview))throw Error('请先读取并核对建议日期，或选择本人日期 / 暂不安排。');
  return {rating:r.rating,understanding:r.understanding,difficulty:r.difficulty,next_action:r.next_action,schedule_mode:mode,
    next_review_date:mode==='manual'?r.next_review_date||null:null,...(mode==='suggested'?{schedule_token:preview!.token}:{})};
}
export function queueState(u:Unit,today:string):QueueState{return u.queue_state??(u.unfinished_count?'unfinished':!u.completed_count?'new':!u.next_review_date?'unscheduled':u.next_review_date<=(u.today??today)?'due':'upcoming');}
export function sortQueue(units:Unit[],today:string):Unit[]{const rank:Record<QueueState,number>={unfinished:0,due:1,new:2,unscheduled:3,upcoming:4};return [...units].sort((a,b)=>rank[queueState(a,today)]-rank[queueState(b,today)]||(a.next_review_date??'').localeCompare(b.next_review_date??'')||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}
