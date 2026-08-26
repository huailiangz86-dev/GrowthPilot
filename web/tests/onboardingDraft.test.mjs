import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOnboardingCompletionPayload,
  createOnboardingSelection,
  inferOnboardingDraft,
} from '../src/pages/app/onboardingDraft.ts';

test('AI 失败时使用原话生成最小可工作草稿', () => {
  const draft = inferOnboardingDraft('我正在准备产品发布，希望把上线任务和学习资料连起来。');

  assert.match(draft.project.name, /准备产品发布/);
  assert.match(draft.workspace.description, /准备产品发布/);
  assert.equal(draft.tasks.length, 3);
  assert.match(draft.learning.title, /准备产品发布/);
});

test('结构化预览优先于本地降级内容，并限制最多三个任务', () => {
  const draft = inferOnboardingDraft('原始输入', {
    project: { name: '发布计划', description: '完成发布', nextAction: '冻结范围', accent: '#123456' },
    tasks: Array.from({ length: 5 }, (_, index) => ({
      title: `任务 ${index + 1}`,
      description: '测试任务',
      dueLabel: '今天',
      priority: 'medium',
    })),
  });

  assert.equal(draft.project.name, '发布计划');
  assert.equal(draft.tasks.length, 3);
});

test('选择状态与实际任务数量一致', () => {
  assert.deepEqual(createOnboardingSelection(2).tasks, [true, true]);
  assert.equal(createOnboardingSelection(8).tasks.length, 3);
});

test('确认载荷只包含已确认的真实领域对象', () => {
  const draft = inferOnboardingDraft('我正在准备产品发布。');
  const selected = {
    ...createOnboardingSelection(draft.tasks.length),
    project: false,
  };
  const payload = createOnboardingCompletionPayload(draft, selected, '  我正在准备产品发布。  ');

  assert.equal(payload.raw_input, '我正在准备产品发布。');
  assert.equal(payload.workspace?.name, draft.workspace.name);
  assert.equal(payload.project, undefined);
  assert.equal(payload.profile?.current_project, draft.project.name);
});
