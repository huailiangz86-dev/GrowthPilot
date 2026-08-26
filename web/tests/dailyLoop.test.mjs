import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDailyLoop } from '../src/workspace/dailyLoop.ts';

const TODAY = '2026-08-16';

function buildInput(overrides = {}) {
  return {
    tasks: [],
    learningItems: [],
    captures: [],
    reflections: [],
    today: TODAY,
    ...overrides,
  };
}

test('未完成晨间启动时优先引导晨间', () => {
  const loop = buildDailyLoop(buildInput({
    tasks: [{ id: 'task-1', dueLabel: '今天', priority: 'high', status: 'todo' }],
  }));

  assert.equal(loop.nextAction.label, '先完成晨间启动');
  assert.equal(loop.nextAction.to, '/app/morning');
});

test('晨间完成后优先引导当日高优任务', () => {
  const loop = buildDailyLoop(buildInput({
    reflections: [{ type: 'morning', reflectionDate: TODAY, energy: 4 }],
    tasks: [{ id: 'task-1', title: '完成首页闭环', dueLabel: '今天', priority: 'high', status: 'todo' }],
  }));

  assert.equal(loop.nextAction.label, '推进「完成首页闭环」');
  assert.match(loop.nextAction.detail, /1 个高优任务/);
});

test('聚合当日任务、快速记录与学习进度', () => {
  const loop = buildDailyLoop(buildInput({
    reflections: [{ type: 'morning', reflectionDate: TODAY, energy: 4 }],
    tasks: [
      { id: 'done', dueLabel: '今天', priority: 'high', status: 'done', completedDate: TODAY },
      { id: 'todo', dueLabel: '今天', priority: 'medium', status: 'todo' },
    ],
    learningItems: [{ id: 'learning-1', title: 'Agent 工作流', status: 'in_progress', progress: 70, progressUpdatedDate: TODAY }],
    captures: [{ id: 'capture-1', capturedDate: TODAY }],
  }));

  assert.equal(loop.completedTaskCount, 1);
  assert.equal(loop.steps.find((step) => step.id === 'tasks')?.detail, '已完成 1/2 个今日任务');
  assert.equal(loop.steps.find((step) => step.id === 'learning')?.completed, true);
  assert.equal(loop.steps.find((step) => step.id === 'capture')?.detail, '今天留下 1 条事实');
  assert.equal(loop.nextAction.label, '继续学习「Agent 工作流」');
});
