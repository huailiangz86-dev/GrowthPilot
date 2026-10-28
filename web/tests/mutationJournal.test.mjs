import assert from 'node:assert/strict';
import test from 'node:test';
import {clearDraft, emptyDraft, exportDraftContent, freezeMutation, mutationKey, readDraft, recoverDraft, writeDraft} from '../src/mutations/journal.ts';
function storage() {const data = new Map(); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}

test('refresh recovers the original creation request and exact frozen payload', () => {
  const store = storage(), key = mutationKey('owner-a','workspace-a','goal-new');
  const original = {title:'原始输入',description:'保留原文',dueDate:'2026-11-02'};
  let {draft,raw} = readDraft(store,key,original);
  const payload = {title:original.title,due_at:'2026-11-02T01:00:00.000Z'};
  draft = freezeMutation(draft,payload);raw = writeDraft(store,key,draft,raw);
  payload.title='后来改变';
  const restored = readDraft(store,key,{}).draft;
  assert.equal(restored.pending.request_id,draft.request_id);
  assert.equal(restored.pending.payload.title,'原始输入');
  assert.equal(restored.pending.payload.due_at,'2026-11-02T01:00:00.000Z');
  assert.deepEqual(restored.data,original);
  assert.deepEqual(freezeMutation(restored,{title:'不能替换原提交'}),restored);
  clearDraft(store,key,raw);assert.equal(store.getItem(key),null);
});

test('another tab cannot overwrite or delete a newer draft while retaining its own input', () => {
  const store=storage(),key='draft',a=emptyDraft({title:'甲'}),b=emptyDraft({title:'乙'});
  const raw=writeDraft(store,key,a,null);
  assert.throws(()=>writeDraft(store,key,b,null),/另一个页面/);
  assert.throws(()=>clearDraft(store,key,null));
  assert.equal(store.getItem(key),raw);
  assert.equal(b.data.title,'乙');
});

test('quota errors and corrupted journals are surfaced without overwriting saved input', () => {
  const store=storage();store.setItem('bad','{damaged');
  assert.throws(()=>readDraft(store,'bad',{title:''}),/无法读取/);
  assert.equal(store.getItem('bad'),'{damaged');
  const broken={...emptyDraft({title:''}),data:{title:12}};store.setItem('wrong',JSON.stringify(broken));
  assert.throws(()=>readDraft(store,'wrong',{title:''}),/格式异常/);
  const limited={...store,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>writeDraft(limited,'new',emptyDraft({title:'当前输入'}),null),/quota/);
  assert.equal(store.getItem('new'),null);
});

test('accounts, workspaces and forms never share request journals', () => {
  assert.equal(new Set([mutationKey('a','w','goal'),mutationKey('b','w','goal'),mutationKey('a','x','goal'),mutationKey('a','w','project')]).size,4);
  assert.notEqual(mutationKey('a:b','w','goal'),mutationKey('a','b:w','goal'));
});

test('export preserves corrupt stored bytes, frozen submission and input before reload', () => {
  const store = storage(); store.setItem('draft', '{damaged\n原始草稿');
  const current = freezeMutation(emptyDraft({title: '当前输入'}), {title: '冻结提交'});
  const backup = {title: '重新读取前的输入'};
  const exported = JSON.parse(exportDraftContent(store, 'draft', current, backup));
  assert.equal(exported.stored, '{damaged\n原始草稿');
  assert.deepEqual(exported.current, current);
  assert.deepEqual(exported.backup, backup);
  assert.equal(store.getItem('draft'), exported.stored);
  const unavailable = {...store, getItem() {throw Error('unavailable');}};
  const fallback = JSON.parse(exportDraftContent(unavailable, 'draft', current, backup));
  assert.equal(fallback.stored, null);
  assert.deepEqual(fallback.current, current);
  assert.deepEqual(fallback.backup, backup);
});

test('protected recovery archives raw bytes before replacing and refuses storage failure or changed source', () => {
  const values = new Map([['draft', '{broken']]);
  const store = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const draft = emptyDraft({title:'恢复的输入'});
  assert.throws(()=>recoverDraft(store,'draft',draft,'old'),/已变化/);
  const failing = {...store,setItem:()=>{throw Error('quota');}};
  assert.throws(()=>recoverDraft(failing,'draft',draft,'{broken'),/quota/);
  assert.equal(store.getItem('draft'),'{broken');
  recoverDraft(store,'draft',draft,'{broken');
  assert.equal(readDraft(store,'draft',{title:''}).draft.data.title,'恢复的输入');
  assert.equal([...values].find(([k])=>k.startsWith('draft:protected:'))[1],'{broken');
});
