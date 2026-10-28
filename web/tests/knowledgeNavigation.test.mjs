import test from 'node:test';
import assert from 'node:assert/strict';
import {isPersonalKnowledgeRoute,loginDestination} from '../src/learning/knowledgeNavigation.ts';

test('person-owned knowledge pages can open before workspace setup, without exempting workspace-only tools',()=>{
  for(const path of ['/app/knowledge','/app/knowledge/sources','/app/knowledge/summaries'])assert.equal(isPersonalKnowledgeRoute(path),true);
  for(const path of ['/app/knowledge/cards','/app/knowledge/bailian','/app/tasks','/app/knowledge-other'])assert.equal(isPersonalKnowledgeRoute(path),false);
});
test('login returns to the selected original version and preserves existing entry names',()=>{
  assert.equal(loginDestination('/app/knowledge/summaries?source=original&version=2#result'),'/app/knowledge/summaries?source=original&version=2#result');
  assert.equal(loginDestination('sources'),'/app/knowledge/sources');assert.equal(loginDestination('fitness'),'/app/fitness');
});
test('login return values cannot redirect to external pages or broaden the allowed route',()=>{
  for(const next of ['https://evil.example','//evil.example','/app/knowledge/../../outside','/app/knowledge-other','/app/knowledge/cards',null])assert.equal(loginDestination(next),'/app');
});
