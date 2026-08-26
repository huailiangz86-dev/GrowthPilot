import assert from 'node:assert/strict';
import test from 'node:test';
import { mapGoalPayload, mapGrowthPlanPayload } from '../src/workspace/dashboardData.ts';

test('完整 Goal 响应保留截止时间、重要性与项目关联', () => {
  const goal = mapGoalPayload({
    id: 'goal-1',
    workspace_id: 'workspace-1',
    project_id: 'project-1',
    title: '建立交付节奏',
    description: '每周完成一个明确闭环',
    dimension: null,
    goal_type: null,
    due_at: '2026-09-30T01:00:00+08:00',
    importance: 4,
    target_metric: null,
    progress: 20,
    status: 'active',
  });

  assert.equal(goal.workspaceId, 'workspace-1');
  assert.equal(goal.horizon, '截止 2026-09-30');
  assert.equal(goal.importance, 4);
  assert.equal(goal.projectId, 'project-1');
});

test('完整 Growth Plan 响应保留周期与里程碑', () => {
  const plan = mapGrowthPlanPayload({
    id: 'plan-1',
    workspace_id: 'workspace-1',
    goal_id: 'goal-1',
    project_id: null,
    title: '四周交付周期',
    description: '',
    period_type: 'weekly',
    total_weeks: 4,
    current_week: 2,
    milestones: ['确认主线', '完成复盘'],
    progress: 25,
    status: 'active',
  });

  assert.equal(plan.goalId, 'goal-1');
  assert.equal(plan.currentWeek, 2);
  assert.equal(plan.totalWeeks, 4);
  assert.deepEqual(plan.milestones, ['确认主线', '完成复盘']);
});
