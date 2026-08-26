import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGrowthOverview } from '../src/workspace/growthOverview.ts';

test('Mine 概览只聚合已录入领域事实，并保留指标计算语义', () => {
  const overview = buildGrowthOverview({
    goals: [{ progress: 20 }, { progress: 40 }],
    plans: [{ progress: 30, milestones: ['开始', '复盘'] }],
    tasks: [{ status: 'done' }, { status: 'todo' }, { status: 'done' }],
    learningItems: [{ progress: 50 }, { progress: 70 }],
    reflections: [
      { type: 'morning', reflectionDate: '2026-08-16' },
      { type: 'evening', reflectionDate: '2026-08-16' },
      { type: 'morning', reflectionDate: '2026-08-17' },
      { type: 'micro', reflectionDate: '2026-08-17' },
    ],
  });

  assert.equal(overview.goalProgress, 30);
  assert.equal(overview.planProgress, 30);
  assert.equal(overview.taskCompletionRate, 67);
  assert.equal(overview.completedTaskCount, 2);
  assert.equal(overview.learningProgress, 60);
  assert.equal(overview.reflectionDays, 2);
  assert.equal(overview.milestoneCount, 2);
});

test('Mine 概览在缺少对象时不把数据不足表示为零进度', () => {
  const overview = buildGrowthOverview({
    goals: [],
    plans: [],
    tasks: [],
    learningItems: [],
    reflections: [{ type: 'micro', reflectionDate: '2026-08-17' }],
  });

  assert.equal(overview.goalProgress, null);
  assert.equal(overview.planProgress, null);
  assert.equal(overview.taskCompletionRate, null);
  assert.equal(overview.learningProgress, null);
  assert.equal(overview.reflectionDays, 0);
  assert.equal(overview.milestoneCount, 0);
});
