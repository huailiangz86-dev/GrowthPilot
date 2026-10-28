import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingKey, readPending, pendingTurn, reconcilePending} from '../src/agent/agentTypes.ts';
import {mapTaskPayload} from '../src/workspace/dashboardData.ts';
const pending={ownerId:'user-a',workspaceId:'workspace-a',conversationId:'50000000-0000-4000-8000-000000000001',requestId:'50000000-0000-4000-8000-000000000002',question:'尚未收到响应的原话'};
const store=(value)=>({getItem:()=>JSON.stringify(value)});
test('lost response restores the exact request and original question',()=>{
  assert.deepEqual(readPending(store(pending),'user-a','workspace-a'),pending);
  const turns=reconcilePending([],pending);
  assert.equal(turns[0].question,pending.question);
  assert.equal(turns[0].client_request_id,pending.requestId);
  assert.equal(turns[0].status,'failed');
});
test('pending storage isolates both account and workspace',()=>{
  assert.notEqual(pendingKey('user-a','workspace-a'),pendingKey('user-b','workspace-a'));
  assert.notEqual(pendingKey('user-a','workspace-a'),pendingKey('user-a','workspace-b'));
  assert.equal(readPending(store(pending),'user-b','workspace-a'),null);
  assert.equal(readPending(store(pending),'user-a','workspace-b'),null);
});
test('server receipt replaces rather than duplicates the local question',()=>{
  const received={...pendingTurn(pending),id:'server-id',status:'completed',reply:'已回复'};
  assert.deepEqual(reconcilePending([received],pending),[received]);
  assert.equal(reconcilePending([received],null).length,1);
});
test('invalid pending data cannot be replayed as a request',()=>{
  for(const values of [{...pending,question:''},{...pending,requestId:'broken'},{...pending,conversationId:'broken'},null]) assert.equal(readPending(store(values),'user-a','workspace-a'),null);
  assert.equal(readPending({getItem:()=>'{not-json'},'user-a','workspace-a'),null);
});
test('server task hydration preserves a link to its confirmed conversation',()=>{
  const task=mapTaskPayload({id:'task',workspace_id:'workspace',title:'确认行动',description:'用户编辑',status:'todo',priority:'medium',due_at:null,completed_at:null,energy_required:null,time_block:15,project_id:null,goal_id:null,plan_id:null,agent_source:{conversation_id:pending.conversationId,turn_id:'turn'}});
  assert.deepEqual(task.agentSource,{conversationId:pending.conversationId,turnId:'turn'});
  assert.equal(task.source,'ai');
});
