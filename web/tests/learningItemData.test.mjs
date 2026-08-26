import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLearningItemPayload } from '../src/workspace/dashboardData.ts';

test('真实 Learning Item 映射队列状态、进度和目标关联', () => {
  const item = mapLearningItemPayload({
    id: 'learning-1',
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    goal_id: 'goal-1',
    title: '理解用户研究',
    summary: '服务当前产品目标',
    kind: 'article',
    status: 'in_progress',
    progress: 40,
    duration_minutes: 30,
    progress_updated_at: '2026-08-17T01:00:00+08:00',
    created_at: '2026-08-17T01:00:00+08:00',
    updated_at: '2026-08-17T01:00:00+08:00',
  });

  assert.equal(item.workspaceId, 'workspace-1');
  assert.equal(item.relatedGoalId, 'goal-1');
  assert.equal(item.durationLabel, '30 分钟');
  assert.equal(item.progressUpdatedDate, '2026-08-17');
});
