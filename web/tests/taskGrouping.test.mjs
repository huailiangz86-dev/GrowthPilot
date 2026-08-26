import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTasks } from '../src/workspace/taskGrouping.ts';

const tasks = [
  { id: 'short', timeBlock: 20, energyRequired: 2 },
  { id: 'deep', timeBlock: 120, energyRequired: 5 },
  { id: 'missing', timeBlock: undefined, energyRequired: undefined },
];

test('按时间块分组时保留未安排任务', () => {
  const groups = groupTasks(tasks, 'time');
  assert.deepEqual(groups.map((group) => group.key), ['short', 'deep', 'unscheduled']);
  assert.equal(groups[2].tasks[0].id, 'missing');
});

test('按能量分组时使用任务已有能量字段', () => {
  const groups = groupTasks(tasks, 'energy');
  assert.deepEqual(groups.map((group) => group.key), ['light', 'high', 'unscheduled']);
});
