import test from 'node:test';
import assert from 'node:assert/strict';
import {factKey,readFact} from '../src/analysis/analysisTypes.ts';
const request={id:'11111111-2222-4333-a444-555555555555',kind:'learning',entry_date:'2026-10-07',minutes:30,note:'实际学习内容',task_id:null};
const storage=value=>({getItem:()=>JSON.stringify(value)});
test('actual-minute original and id survive owner/workspace-scoped recovery',()=>{
 const value={owner:'alice',workspace:'work',request};assert.deepEqual(readFact(storage(value),'alice','work'),value);
 assert.equal(readFact(storage(value),'bob','work'),null);assert.equal(readFact(storage(value),'alice','other'),null);
 assert.notEqual(factKey('alice','work'),factKey('bob','work'));
});
test('estimated or malformed data cannot restore as actual learning minutes',()=>{
 for(const minutes of [null,0,1441,1.5,'30'])assert.equal(readFact(storage({owner:'alice',workspace:'work',request:{...request,minutes}}),'alice','work'),null);
 assert.equal(readFact({getItem:()=>'{bad'},'alice','work'),null);
 for(const updates of [{id:'-'.repeat(36)},{task_id:request.id},{note:'x'.repeat(4001)}])assert.equal(readFact(storage({owner:'alice',workspace:'work',request:{...request,...updates}}),'alice','work'),null);
});
test('feedback requires a real task reference and preserves original text',()=>{
 const value={owner:'alice',workspace:'work',request:{...request,kind:'feedback',minutes:null,task_id:request.id}};
 assert.deepEqual(readFact(storage(value),'alice','work'),value);
 assert.equal(readFact(storage({...value,request:{...value.request,task_id:null}}),'alice','work'),null);
});
