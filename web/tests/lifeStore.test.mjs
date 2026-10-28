import assert from 'node:assert/strict';
import test from 'node:test';
import {recordForm, recordContent, reusedForm, emptyJournal, freezeLifeCommand, acknowledgeLife, mergeLifeSnapshot, readLifeJournal, habitRuleForDay, localDate} from '../src/life/store.ts';
const form = () => ({...recordForm(), title: '实际活动'});
const entity = (id = 'record', version = 1) => ({id, version, content: recordContent(form())});
const snapshot = (records = []) => ({records, total: records.length, habit: {id: 'habit', version: 0, content: null}, access: {id: 'user', version: 0, fitness_expert_enabled: false}, references: []});
const draft = () => ({id: 'record', kind: 'record', baseVersion: 0, data: form()});
test('D1 unknown duration, explicit zero weight and skipped activity remain distinct', () => {
  assert.equal(recordContent(form()).actual_minutes, null);
  const rows = [{name: '自重', weight: '0', sets: '3', reps: '8'}];
  assert.equal(recordContent({...form(), exercises: rows}).exercises[0].weight, 0);
  const skipped = recordContent({...form(), outcome: 'skipped', minutes: '20', exercises: rows});
  assert.equal(skipped.actual_minutes, null); assert.deepEqual(skipped.exercises, []);
});
test('D1 future dates and partial numeric facts require correction', () => {
  for (const patch of [{occurred_on: '2099-01-01'}, {occurred_on: '2026-02-30'}, {timezone: 'invalid'}, {minutes: '0'}, {minutes: '1.5'},
    {exercises: [{name: '深蹲', weight: '', sets: '3', reps: '8'}]}, {exercises: [{name: '深蹲', weight: '20', sets: '3.5', reps: '8'}]}]) assert.throws(() => recordContent({...form(), ...patch}));
});
test('D1 reuse copies structure while clearing occurrence facts and preserving source pointer', () => {
  const r = entity(); r.content.actual_minutes = 35; r.content.note = '旧说明';
  const reused = reusedForm(r); assert.equal(reused.minutes, ''); assert.equal(reused.note, ''); assert.equal(reused.original, '');
  assert.equal(reused.reused_from, r.id); assert.equal(reused.source, 'reuse');
});
test('D1 a frozen pending command cannot be changed by further typing', () => {
  const d = draft(), q = freezeLifeCommand(d, 'request'); d.data.title = '后续输入';
  assert.equal(q.command.data.title, '实际活动'); assert.equal(q.draft.data.title, '实际活动');
  assert.equal(q.command.request_id, 'request'); assert.equal(q.command.action, 'create_record');
});
test('D1 acknowledgement keeps later input and advances only its submitted base', () => {
  const d = draft(), q = freezeLifeCommand(d, 'request');
  const j = {...emptyJournal(), snapshot: snapshot(), drafts: {[d.id]: {...d, data: {...d.data, note: '确认过程中继续输入'}}}, queue: [q]};
  const next = acknowledgeLife(j, q, {kind: 'record', entity: entity()});
  assert.equal(next.drafts.record.data.note, '确认过程中继续输入'); assert.equal(next.drafts.record.baseVersion, 1);
  assert.equal(next.drafts.record.data.original, entity().content.original); assert.equal(next.queue.length, 0);
});
test('D1 replayed acknowledgement never duplicates a known record', () => {
  const d = draft(), q = freezeLifeCommand(d, 'request');
  const j = {...emptyJournal(), snapshot: snapshot(), drafts: {[d.id]: d}, queue: [q]};
  const once = acknowledgeLife(j, q, {kind: 'record', entity: entity()});
  const twice = acknowledgeLife(once, q, {kind: 'record', entity: entity()});
  assert.equal(twice.snapshot.total, 1); assert.equal(twice.snapshot.records.length, 1); assert.deepEqual(twice.drafts, {});
});
test('D1 older refresh/receipt cannot restore revoked permissions or references', () => {
  const newer = {...snapshot([entity('record', 3)]), access: {id: 'user', version: 2, fitness_expert_enabled: false}, references: [{record_id: 'record', workspace_id: 'space', revoked_at: 'now'}]};
  const older = {...snapshot([entity()]), access: {id: 'user', version: 1, fitness_expert_enabled: true}, references: [{record_id: 'record', workspace_id: 'space', revoked_at: null}]};
  const merged = mergeLifeSnapshot(newer, older); assert.equal(merged.access.fitness_expert_enabled, false); assert.equal(merged.records[0].version, 3); assert.equal(merged.references[0].revoked_at, 'now');
  const q = freezeLifeCommand({...draft(), kind: 'access', id: 'user', data: {fitness_expert_enabled: true}}, 'permission');
  const next = acknowledgeLife({...emptyJournal(), snapshot: newer}, q, {kind: 'access', entity: older.access});
  assert.equal(next.snapshot.access.fitness_expert_enabled, false);
});
test('D1 later remote version requires comparing continued local edits', () => {
  const d = draft(), q = freezeLifeCommand(d, 'request');
  const j = {...emptyJournal(), snapshot: snapshot([entity('record', 3)]), drafts: {[d.id]: {...d, data: {...d.data, note: '继续输入'}}}, queue: [q]};
  const next = acknowledgeLife(j, q, {kind: 'record', entity: entity()});
  assert.equal(next.drafts.record.baseVersion, 1); assert.equal(next.drafts.record.conflict, true); assert.equal(next.snapshot.records[0].version, 3);
});
test('D1 reload retains frozen request identity and corruption is never silently replaced', () => {
  const q = {...freezeLifeCommand(draft(), 'request'), error: 'network'};
  const journal = {...emptyJournal(), queue: [q]};
  const restored = readLifeJournal({getItem: () => JSON.stringify(journal)}, 'own-tab');
  assert.equal(restored.queue[0].command.request_id, 'request'); assert.equal(restored.queue[0].error, undefined);
  assert.throws(() => readLifeJournal({getItem: () => '{broken'}, 'own-tab'));
  assert.throws(() => readLifeJournal({getItem: () => '{"version":1,"drafts":{},"queue":[{}],"backups":[]}'}, 'own-tab'));
});
test('D1 first-page refresh keeps older loaded pages and historical habit rules', () => {
  assert.equal(mergeLifeSnapshot(snapshot([entity('older'), entity('newer')]), snapshot([entity('newer')])).records.length, 2);
  const rules = [{id: 'h1', version: 1, content: {effective_from: '2026-10-01', enabled: true}}, {id: 'h2', version: 2, content: {effective_from: '2026-10-08', enabled: false}}];
  assert.equal(habitRuleForDay(rules, '2026-10-02').enabled, true); assert.equal(habitRuleForDay(rules, '2026-10-09').enabled, false);
  assert.equal(habitRuleForDay(rules, '2026-09-30'), null);
  assert.equal(localDate('Asia/Shanghai', new Date('2026-10-07T17:00:00Z')), '2026-10-08');
});
