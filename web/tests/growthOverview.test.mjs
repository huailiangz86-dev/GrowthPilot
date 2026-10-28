import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGrowthOverview, recentReflectionDays } from '../src/workspace/growthOverview.ts';

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

test('成长节奏对应最近七天的实际日期，排除快速记录且同日只计一次', () => {
  const days = recentReflectionDays([
    {type: 'morning', reflectionDate: '2026-10-25'},
    {type: 'evening', reflectionDate: '2026-10-25'},
    {type: 'micro', reflectionDate: '2026-10-26'},
    {type: 'evening', reflectionDate: '2026-10-19'},
  ], 'Asia/Shanghai', new Date('2026-10-26T00:30:00Z'));
  assert.equal(days[0].date, '2026-10-20');
  assert.equal(days[6].date, '2026-10-26');
  assert.deepEqual(days.filter(day => day.recorded).map(day => [day.date, day.label]), [['2026-10-25', '周日']]);
});

test('成长节奏按本人时区跨日，并在夏令时切换后保留七个连续日期', () => {
  const days = recentReflectionDays([], 'America/New_York', new Date('2026-11-02T04:30:00Z'));
  assert.deepEqual(days.map(day => day.date), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
});
