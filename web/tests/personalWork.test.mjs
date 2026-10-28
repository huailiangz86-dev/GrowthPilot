import assert from 'node:assert/strict';
import test from 'node:test';
import {acknowledge, emptyJournal, frozenCommand, readJournal, scheduleOnDay, scheduledMinutes, zonedInstant} from '../src/personal/store.ts';

const draft={kind:'task',entityId:'real-id',data:{title:'实际工作',body:'保存时的正文'},baseVersion:0,updatedAt:null,create:true};
const receipt={kind:'task',entity:{id:'real-id',title:'实际工作',description:'',status:'todo',due_at:null,updated_at:'2026-10-08T01:00:00Z',document:{id:'doc',version:1,content:draft.data,updated_at:'2026-10-08T01:00:00Z'}}};
function journal(){return {...emptyJournal(),snapshot:{workspace_id:'ws',tasks:[],learning:[],schedules:[]},drafts:{'real-id':structuredClone(draft)},queue:[frozenCommand(draft,'stable-request')]};}

test('响应在继续输入后到达，最新正文保留并以回执版本继续保存',()=>{
  const j=journal();j.drafts['real-id'].data.body='请求期间继续写下的内容';
  const next=acknowledge(j,j.queue[0],receipt);
  assert.equal(next.drafts['real-id'].data.body,'请求期间继续写下的内容');
  assert.equal(next.drafts['real-id'].baseVersion,1);assert.equal(next.drafts['real-id'].create,false);
  assert.equal(next.queue.length,0);assert.equal(next.snapshot.tasks.length,1);
});
test('响应丢失刷新恢复同一个冻结请求，不改变标识或原始内容',()=>{
  const j=journal(), serialized=JSON.stringify(j), restored=readJournal({getItem:()=>serialized},'account:ws:tab');
  assert.deepEqual(restored.queue[0].command,j.queue[0].command);
  const one=acknowledge(restored,restored.queue[0],receipt);
  assert.equal(one.snapshot.tasks[0].id,'real-id');assert.deepEqual(one.drafts,{});
});
test('重复回执不产生第二个本地任务；另一事项的草稿不受影响',()=>{
  const j=journal();j.drafts.other={...draft,entityId:'other'};
  const once=acknowledge(j,j.queue[0],receipt),twice=acknowledge(once,j.queue[0],receipt);
  assert.equal(twice.snapshot.tasks.length,1);assert.equal(twice.drafts.other.entityId,'other');
});
test('多个账号、空间和标签页使用各自存储，损坏存储不会变成空草稿',()=>{
  const values=new Map([['alice:ws:tab',JSON.stringify(journal())]]);
  const storage={getItem:k=>values.get(k)??null};
  assert.equal(readJournal(storage,'alice:ws:tab').queue.length,1);
  assert.equal(readJournal(storage,'bob:ws:tab').queue.length,0);
  assert.equal(readJournal(storage,'alice:other:tab').queue.length,0);
  values.set('broken','{');assert.throws(()=>readJournal(storage,'broken'));
});
test('跨日按用户时区出现两天，结束边界不多算下一天',()=>{
  const b={starts_at:'2026-10-08T15:30:00Z',ends_at:'2026-10-08T17:00:00Z',cancelled_at:null};
  assert.equal(scheduleOnDay(b,'2026-10-08','Asia/Shanghai'),true);assert.equal(scheduleOnDay(b,'2026-10-09','Asia/Shanghai'),true);
  assert.equal(scheduleOnDay({...b,ends_at:'2026-10-08T16:00:00Z'},'2026-10-09','Asia/Shanghai'),false);
});
test('排期转换保持实际时区，夏令时不存在或重复时间需明确改选',()=>{
  assert.equal(zonedInstant('2026-10-08T23:30','Asia/Shanghai'),'2026-10-08T15:30:00.000Z');
  assert.equal(zonedInstant('2026-10-08T15:00','America/New_York'),'2026-10-08T19:00:00.000Z');
  assert.throws(()=>zonedInstant('2026-03-08T02:30','America/New_York'));
  assert.throws(()=>zonedInstant('2026-11-01T01:30','America/New_York'));
});
test('每日容量只计当日安排部分，取消不计，夏令时保留真实时长',()=>{
  const block={starts_at:'2026-10-08T15:30:00Z',ends_at:'2026-10-08T17:00:00Z',cancelled_at:null};
  assert.equal(scheduledMinutes([block,{...block,cancelled_at:'now'}],'2026-10-08','Asia/Shanghai'),30);
  assert.equal(scheduledMinutes([block],'2026-10-09','Asia/Shanghai'),60);
  const dst={starts_at:'2026-03-08T05:00:00Z',ends_at:'2026-03-09T04:00:00Z',cancelled_at:null};
  assert.equal(scheduledMinutes([dst],'2026-03-08','America/New_York'),23*60);
});
test('D7 learning late receipt preserves continued content, insights and dated entries together',()=>{
  const d={kind:'learning',entityId:'learning',data:{title:'学习',content:'已提交内容',notes:'笔记',insights:'旧心得',journal:[{id:'entry',date:'2026-10-09',kind:'note',title:'一次记录',body:'已提交'}]},baseVersion:1,updatedAt:'old',create:false};
  const queued=frozenCommand(d,'stable-learning-request');
  const j={...emptyJournal(),snapshot:{workspace_id:'ws',tasks:[],learning:[],schedules:[]},drafts:{learning:structuredClone(d)},queue:[queued]};
  j.drafts.learning.data.content='继续写的正文';j.drafts.learning.data.insights='新的理解';j.drafts.learning.data.journal[0].body='继续写的记录';
  const r={kind:'learning',entity:{id:'learning',title:'学习',summary:'',status:'queued',updated_at:'new',document:{id:'doc',version:2,content:d.data,updated_at:'new'}}};
  const next=acknowledge(j,queued,r);
  assert.equal(next.drafts.learning.data.content,'继续写的正文');assert.equal(next.drafts.learning.data.insights,'新的理解');assert.equal(next.drafts.learning.data.journal[0].body,'继续写的记录');assert.equal(next.drafts.learning.baseVersion,2);assert.deepEqual(next.snapshot.learning[0].document.content,d.data);
});

test('D7 adoption receipt merges its cited entry with writing continued during the save',()=>{
  const entry={id:'adopted',date:'2026-10-09',kind:'insight',title:'采用建议',body:'行动及依据',advice_request_id:'help',advice_index:0};
  const queued={kind:'learning',command:{request_id:'save-advice',entity_id:'learning',action:'adopt_learning_advice',base_version:1,data:{help_request_id:'help',suggestion_index:0,date:'2026-10-09'}}};
  const d={kind:'learning',entityId:'learning',data:{title:'学习',content:'继续写正文',notes:'笔记',journal:[{id:'own',date:'2026-10-09',kind:'note',title:'本人记录',body:'继续写'}]},baseVersion:1,updatedAt:'old',create:false};
  const j={...emptyJournal(),snapshot:{workspace_id:'ws',tasks:[],learning:[],schedules:[]},drafts:{learning:d},queue:[queued]};
  const r={kind:'learning',entity:{id:'learning',title:'学习',updated_at:'new',document:{id:'doc',version:2,content:{title:'学习',content:'原正文',journal:[entry]},updated_at:'new'}}};
  const next=acknowledge(j,queued,r),twice=acknowledge(next,queued,r);
  assert.equal(next.drafts.learning.data.content,'继续写正文');assert.equal(next.drafts.learning.data.journal.length,2);assert.deepEqual(next.drafts.learning.data.journal[0],entry);assert.equal(next.drafts.learning.data.journal[1].body,'继续写');assert.equal(twice.drafts.learning.data.journal.length,2);assert.equal(next.drafts.learning.baseVersion,2);
});
