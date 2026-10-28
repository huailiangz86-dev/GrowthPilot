import assert from 'node:assert/strict';
import test from 'node:test';
import {blankProfile,validProfile} from '../src/life/fitnessContext.ts';
import {freezeExpert,restoreExpert} from '../src/life/expertStore.ts';
import {recordContent,recordForm,reusedForm} from '../src/life/store.ts';
const storage=v=>({getItem:()=>v ? JSON.stringify(v) : null});
test('D4 background draft and frozen original request survive reload independently',()=>{
  const profile={...blankProfile(),goal:'general',confirmed:true}, journal=restoreExpert(storage(null),'a','2026-10-09');
  const command=freezeExpert({action:'save_profile',entity_id:crypto.randomUUID(),base_version:2,data:profile},crypto.randomUUID());
  profile.goal='strength';const restored=restoreExpert(storage({...journal,profile,profileBaseVersion:2,command}),'a','2026-10-10');
  assert.equal(restored.profile.goal,'strength');assert.equal(restored.command.data.goal,'general');assert.equal(restored.command.request_id,command.request_id);
});
test('D4 partial numeric input stays editable but malformed frozen commands cannot replay',()=>{
  const journal=restoreExpert(storage(null),'a','2026-10-09'),profile={...blankProfile(),days_per_week:0.5};
  assert.equal(restoreExpert(storage({...journal,profile}),'a','2026-10-09').profile.days_per_week,0.5);
  assert.equal(validProfile(profile),false);assert.equal(validProfile({...blankProfile(),equipment:['guessed']}),false);
  assert.throws(()=>restoreExpert(storage({...journal,command:{action:'save_profile',request_id:crypto.randomUUID(),entity_id:crypto.randomUUID(),base_version:0,data:profile}}),'a','2026-10-09'));
});
test('D4 actual subjective feedback is optional, bounded and cleared by reuse or skipped outcome',()=>{
  const form={...recordForm(),title:'实际训练',effort:'6',recovery:'ready',exercises:[{name:'划船',weight:'5',sets:'2',reps:'8',equipment:'dumbbell'}]};
  const fact=recordContent(form);assert.equal(fact.effort,6);assert.equal(fact.exercises[0].equipment,'dumbbell');
  const reused=reusedForm({id:crypto.randomUUID(),content:fact});assert.equal(reused.effort,'');assert.equal(reused.recovery,'');assert.equal(reused.exercises[0].equipment,'dumbbell');
  const skipped=recordContent({...form,outcome:'skipped'});assert.equal(skipped.effort,null);assert.equal(skipped.recovery,null);
  for(const effort of ['0','11','2.5'])assert.throws(()=>recordContent({...form,effort}));
});
test('D4 legacy records do not receive invented background or recovery feedback',()=>{
  const fact=recordContent({...recordForm(),title:'旧记录'});delete fact.effort;delete fact.recovery;
  const restored=recordForm(fact);assert.equal(restored.effort,'');assert.equal(restored.recovery,'');
  assert.equal(blankProfile().share_with_expert,false);
});
