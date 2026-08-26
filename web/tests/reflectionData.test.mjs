import assert from 'node:assert/strict';
import test from 'node:test';
import { captureFromReflectionPayload, mapReflectionPayload } from '../src/workspace/dashboardData.ts';

test('真实晨间 Reflection 映射为当天反思事实', () => {
  const reflection = mapReflectionPayload({
    id: 'morning-1',
    workspace_id: 'workspace-1',
    project_id: null,
    goal_id: null,
    task_id: null,
    reflection_type: 'morning',
    reflection_date: '2026-08-17',
    energy: 4,
    intention: '完成真实写入',
    completion: null,
    wins: null,
    friction: null,
    adjustment: null,
    mood: null,
    micro_type: null,
    micro_status: null,
    content: null,
    is_makeup: false,
    created_at: '2026-08-17T01:00:00+08:00',
    updated_at: '2026-08-17T01:00:00+08:00',
  });

  assert.equal(reflection.type, 'morning');
  assert.equal(reflection.energy, 4);
  assert.equal(reflection.intention, '完成真实写入');
});

test('真实 Micro Reflection 同时生成快速记录', () => {
  const payload = {
    id: 'micro-1',
    workspace_id: 'workspace-1',
    project_id: null,
    goal_id: 'goal-1',
    task_id: null,
    reflection_type: 'micro',
    reflection_date: '2026-08-17',
    energy: null,
    intention: null,
    completion: null,
    wins: null,
    friction: null,
    adjustment: null,
    mood: null,
    micro_type: 'learning',
    micro_status: 'done',
    content: '完成 Reflection API 的最小测试。',
    is_makeup: false,
    created_at: '2026-08-17T01:00:00+08:00',
    updated_at: '2026-08-17T01:00:00+08:00',
  };
  const capture = captureFromReflectionPayload(payload);

  assert.ok(capture);
  assert.equal(capture.id, 'micro-1');
  assert.equal(capture.goalId, 'goal-1');
  assert.equal(capture.type, 'learning');
});
