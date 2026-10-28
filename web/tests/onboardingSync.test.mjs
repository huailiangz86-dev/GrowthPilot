import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboardingSelection, inferOnboardingDraft } from '../src/pages/app/onboardingDraft.ts';
import { applyOnboardingResult, createOnboardingSubmission, isolateOnboardingWorkspaces, persistOnboardingSubmission, readOnboardingSubmission, restoreOnboardingState } from '../src/workspace/onboardingSync.ts';
import { cloneDefaultState } from '../src/workspace/workspaceData.ts';

const REQUEST = '11111111-1111-4111-8111-111111111111';
const draft = inferOnboardingDraft('我想完成首版产品。');
const selection = createOnboardingSelection(draft.tasks.length);
function submission(selected = selection) {return createOnboardingSubmission(draft, selected, '原话', 'owner-a', 'Asia/Shanghai', REQUEST, new Date('2026-10-07T18:00:00Z'));}
function storage() {const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};}
function result(value, failed = []) {return {client_request_id: value.requestId, saved: !failed.length, objects: value.objects.map((row, index) => ({key: row.key, id: failed.includes(row.key) ? null : `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, status: failed.includes(row.key) ? 'failed' : 'synced'}))};}

test('首次方案只提交已选对象，计划依赖目标，日期按用户时区固定', () => {
  const value = submission({...selection, project: false, goal: false, tasks: [false, true, false], learning: false});
  assert.deepEqual(value.objects.map(row => row.key), ['workspace', 'task-1']);
  assert.equal(value.payload.profile.current_project, '');
  assert.deepEqual(value.payload.profile.goals, []);
  assert.equal(value.payload.plan, undefined);
  assert.equal(value.payload.tasks[0].due_at, '2026-10-08T04:00:00.000Z');
  const unchanged = JSON.stringify(value.payload);
  draft.tasks[1].title += '被编辑';
  assert.equal(JSON.stringify(value.payload), unchanged);
  draft.tasks[1].title = draft.tasks[1].title.replace('被编辑', '');
});

test('刷新恢复固定原话、选择与请求，保存中恢复待同步，账户互不读取', () => {
  const db = storage();
  const value = submission();
  value.objects[0].status = 'syncing';
  persistOnboardingSubmission(db, value);
  const recovered = readOnboardingSubmission(db, 'owner-a');
  assert.equal(recovered.objects[0].status, 'pending');
  assert.equal(recovered.rawInput, '原话');
  assert.deepEqual(recovered.payload, value.payload);
  assert.equal(readOnboardingSubmission(db, 'owner-b'), null);
});

test('部分成功回填所有关联，刷新补回未保存对象，重放不增加副本', () => {
  const initial = submission();
  const partial = applyOnboardingResult(initial, result(initial, ['task-1']));
  const state = restoreOnboardingState(cloneDefaultState(), partial);
  const goal = state.goals.find(row => row.title === draft.goal.title);
  const plan = state.plans.find(row => row.title === draft.plan.title);
  const tasks = state.tasks.filter(row => row.workspaceId === state.activeWorkspaceId);
  assert.equal(tasks.length, 3);
  assert.equal(plan.goalId, goal.id);
  assert.equal(goal.planId, plan.id);
  assert.ok(tasks.every(row => row.planId === plan.id && row.goalId === goal.id));
  const hydrated = {...state, tasks: state.tasks.filter(row => row.id !== tasks[1].id)};
  const restored = restoreOnboardingState(hydrated, partial);
  assert.equal(restored.tasks.filter(row => row.workspaceId === restored.activeWorkspaceId).length, 3);
  const complete = applyOnboardingResult(partial, result(initial));
  const saved = restoreOnboardingState(restored, complete);
  const replayed = restoreOnboardingState(saved, complete);
  assert.equal(replayed.tasks.length, saved.tasks.length);
  assert.ok(replayed.tasks.filter(row => row.workspaceId === saved.activeWorkspaceId).every(row => !row.id.startsWith('task-')));
  assert.equal(replayed.onboardingCompleted, true);
});

test('另一账户不能看到已缓存的首次工作空间及其对象', () => {
  const state = restoreOnboardingState(cloneDefaultState(), submission());
  const isolated = isolateOnboardingWorkspaces(state, 'owner-b');
  assert.ok(isolated.workspaces.every(row => row.ownerId !== 'owner-a'));
  assert.ok(isolated.tasks.every(row => row.workspaceId !== state.activeWorkspaceId));
  assert.equal(isolated.onboardingCompleted, false);
});

test('存储失败与损坏方案都不能伪装保存成功或被覆盖', () => {
  assert.throws(() => persistOnboardingSubmission({setItem() {throw new Error('quota');}}, submission()), /浏览器无法保存/);
  assert.throws(() => readOnboardingSubmission({getItem() {return '{broken';}}, 'owner-a'), /无法读取/);
});

test('不完整的结果、异请求结果或变更已保存 ID 必须保留方案供重试', () => {
  const value = submission();
  const response = result(value);
  assert.throws(() => applyOnboardingResult(value, {...response, objects: response.objects.slice(1)}), /不完整/);
  assert.throws(() => applyOnboardingResult(value, {...response, client_request_id: 'other'}), /不完整/);
  const partial = applyOnboardingResult(value, result(value, ['task-1']));
  response.objects[0].id = '12345678-1234-4234-8234-123456789abc';
  assert.throws(() => applyOnboardingResult(partial, response), /不一致/);
});
