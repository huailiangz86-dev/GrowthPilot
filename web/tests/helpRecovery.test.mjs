import assert from 'node:assert/strict';
import test from 'node:test';
import {restoreHelp} from '../src/help/recovery.ts';
const journal = () => ({payload:{request_id:'f35b5d78-f96a-411e-810e-89386cd2dc8a',kind:'fitness_extract',consent:true,text:'本次原话'},fields:{answer:'正在修改的答案'}});
test('D2 refresh restores frozen request separately from continued answer input', () => {
  const original=journal(), restored=restoreHelp({getItem:()=>JSON.stringify(original)},'own-item-tab');
  assert.deepEqual(restored,original);assert.equal(restored.payload.text,'本次原话');assert.equal(restored.fields.answer,'正在修改的答案');
});
test('D2 malformed AI storage cannot enter UI or be replayed', () => {
  for(const value of ['{broken',JSON.stringify({...journal(),fields:{answer:42}}),JSON.stringify({...journal(),fields:[]}),
    JSON.stringify({...journal(),payload:{...journal().payload,consent:false}}),JSON.stringify({...journal(),payload:{request_id:'invalid'}})]) {
    assert.throws(()=>restoreHelp({getItem:()=>value},'own-item-tab'));
  }
});
test('D7 diagnosis retry retains chosen sources separately from a newer selection draft',()=>{
  const original={payload:{request_id:'f35b5d78-f96a-411e-810e-89386cd2dc8a',kind:'learning_diagnose',consent:true,workspace_id:'ws',item_id:'learning',base_version:4,evidence_keys:['content','notes'],question:'检查例子'},fields:{selected:'["insights"]',question:'后续问题'}};
  const restored=restoreHelp({getItem:()=>JSON.stringify(original)},'own-learning-tab');
  assert.deepEqual(restored.payload.evidence_keys,['content','notes']);assert.equal(restored.fields.selected,'["insights"]');
  for(const keys of [[],['notes','notes'],Array.from({length:11},(_,i)=>String(i))])assert.throws(()=>restoreHelp({getItem:()=>JSON.stringify({...original,payload:{...original.payload,evidence_keys:keys}})},'own-learning-tab'));
});
