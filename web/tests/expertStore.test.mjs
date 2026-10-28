import assert from 'node:assert/strict';
import test from 'node:test';
import {dateRange,feedbackForm,freezeExpert,restoreExpert,validateRange} from '../src/life/expertStore.ts';
import {recordContent,recordForm,reusedForm} from '../src/life/store.ts';
const storage=value=>({getItem:()=>value === null ? null : JSON.stringify(value)});
test('D3 selected ranges preserve leap days and reject reversed or excessive periods',()=>{
  assert.deepEqual(dateRange('2024-03-01'),{start:'2024-02-24',end:'2024-03-01'});
  for(const range of [{start:'2026-02-30',end:'2026-03-01'},{start:'2026-13-40',end:'2026-13-41'},{start:'2026-10-09',end:'2026-10-08'},{start:'2024-01-01',end:'2026-10-09'}])assert.throws(()=>validateRange(range));
});
test('D3 pending commands stay frozen while a draft changes and recover with the same identity',()=>{
  const draft={action:'adopt_plan',entity_id:crypto.randomUUID(),base_version:0,data:{title:'原安排',detail:'实际记录另填',scheduled_on:'2026-10-09',time:'18:30',timezone:'UTC',planned_minutes:null,cancelled:false}};
  const command=freezeExpert(draft,crypto.randomUUID());draft.data.title='继续编辑';
  const journal={...restoreExpert(storage(null),'key','2026-10-09'),command,plan:{entityId:draft.entity_id,action:draft.action,version:0,data:draft.data}};
  assert.equal(restoreExpert(storage(journal),'key','2026-10-10').command.data.title,'原安排');
  assert.equal(restoreExpert(storage(journal),'key','2026-10-10').command.request_id,command.request_id);
});
test('D3 corrupted pending identity cannot be replayed and incomplete range draft survives reload',()=>{
  const journal=restoreExpert(storage(null),'key','2026-10-09');journal.range.start='';
  assert.equal(restoreExpert(storage(journal),'key','2026-10-09').range.start,'');
  assert.throws(()=>restoreExpert(storage({...journal,request:{request_id:'bad',consent:true,start:'2026-10-01',end:'2026-10-09'}}),'key','2026-10-09'));
});
test('D3 adopting a plan never supplies estimated minutes or planned work as actual feedback',()=>{
  const plan={id:'plan',content:{title:'安排',detail:'AI 建议',planned_minutes:30}};
  const fields=feedbackForm(plan,'2026-10-08');const form={...recordForm(undefined,'UTC'),...fields};
  assert.equal(form.minutes,'');assert.equal(form.note,'');assert.deepEqual(form.exercises,[]);
  const fact=recordContent(form);assert.equal(fact.actual_minutes,null);assert.equal(fact.expert_plan_id,'plan');
  const corrected=recordForm(fact);assert.equal(recordContent(corrected).expert_plan_id,'plan');
  const reused=reusedForm({id:'fact',version:1,content:fact});assert.equal(recordContent(reused).expert_plan_id,null);
});
test('D3 account and tab keys isolate frozen requests while preserving original range',()=>{
  const id=crypto.randomUUID(),values=new Map();
  const a={...restoreExpert(storage(null),'a','2026-10-09'),request:{...dateRange('2026-10-09'),request_id:id,timezone:'Asia/Shanghai',consent:true}};
  values.set('gp_fitness_expert:a:tab1',JSON.stringify(a));const stores={getItem:key=>values.get(key)??null};
  assert.equal(restoreExpert(stores,'gp_fitness_expert:a:tab1','2026-10-10').request.request_id,id);
  assert.equal(restoreExpert(stores,'gp_fitness_expert:b:tab1','2026-10-10').request,null);
  assert.equal(restoreExpert(stores,'gp_fitness_expert:a:tab2','2026-10-10').request,null);
});
