import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCapabilityPayload, mapKnowledgeCardPayload, mergeDashboardState } from '../src/workspace/dashboardData.ts';

test('真实 Knowledge Card 映射保留来源与待处理状态', () => {
  const card = mapKnowledgeCardPayload({
    id: 'card-1',
    workspace_id: 'workspace-1',
    project_id: null,
    goal_id: 'goal-1',
    task_id: 'task-1',
    learning_item_id: null,
    title: '用户访谈原文',
    source_type: 'text',
    source_url: null,
    content: '先问发生了什么，再问为什么。',
    status: 'captured',
    ai_status: 'not_requested',
    ai_summary: null,
    ai_concepts: [],
    ai_tags: [],
    ai_processed_at: null,
    created_at: '2026-08-17T08:00:00+08:00',
    updated_at: '2026-08-17T08:00:00+08:00',
  });

  assert.equal(card.workspaceId, 'workspace-1');
  assert.equal(card.sourceType, 'text');
  assert.equal(card.status, 'captured');
  assert.equal(card.goalId, 'goal-1');
  assert.equal(card.taskId, 'task-1');
  assert.equal(card.content, '先问发生了什么，再问为什么。');
  assert.equal(card.aiStatus, 'not_requested');
  assert.deepEqual(card.aiConcepts, []);
});

test('真实能力目录映射保留来源、权限与 Workspace 范围', () => {
  const capability = mapCapabilityPayload({
    id: 'capability-1',
    capability_type: 'connection',
    name: '日历连接',
    slug: 'calendar-connection',
    description: '等待用户授权。',
    source: 'builtin',
    version: '1.0',
    status: 'needs_setup',
    dependencies: ['日历授权'],
    permissions: ['读取日历（待授权）'],
    available_permissions: ['读取日历（待授权）'],
    workspace_scope: 'current',
    workspace_ids: ['workspace-1'],
    entrypoint: null,
    configurable: true,
    setting_status: null,
    blocked_reason: '此连接仍需完成授权或设置，当前不能启用。',
  });

  assert.equal(capability.kind, 'connection');
  assert.equal(capability.status, 'needs_setup');
  assert.equal(capability.scope, '当前 Workspace');
  assert.deepEqual(capability.permissions, ['读取日历（待授权）']);
  assert.deepEqual(capability.availablePermissions, ['读取日历（待授权）']);
  assert.equal(capability.configurable, true);
  assert.match(capability.blockedReason, /不能启用/);
});

test('云端 Command Center 水合真实工作对象，并用每日事实降级首页闭环', () => {
  const state = {
    activeWorkspaceId: 'local',
    workspaces: [{ id: 'local', name: '本地', description: '', color: '#000', updatedLabel: '' }],
    projects: [], goals: [], plans: [], tasks: [],
    learningItems: [
      { id: 'learning', workspaceId: 'local', title: '学习', status: 'queued', progress: 0, durationLabel: '10 分钟', summary: '' },
      { id: 'learning-draft', workspaceId: 'remote', title: '离线学习', status: 'queued', progress: 0, durationLabel: '10 分钟', summary: '' },
    ],
    activities: [], insights: [], capabilities: [],
    captures: [{ id: 'capture-draft', workspaceId: 'remote', capturedDate: '2026-08-17', content: '离线事实', type: 'idea', status: 'noted', createdLabel: '刚刚' }],
    reflections: [{ id: 'reflection-draft', workspaceId: 'remote', type: 'micro', reflectionDate: '2026-08-17', content: '离线复盘', microType: 'idea', microStatus: 'noted', createdLabel: '刚刚' }],
    focusSession: null, onboardingCompleted: true,
  };
  const result = mergeDashboardState(state, {
    workspace: { id: 'remote', name: '真实工作台', description: '云端', status: 'active' },
    projects: [{ id: 'project', name: '项目', description: '', status: 'active', progress: 20, next_action: '下一步' }],
    goals: [{ id: 'goal', title: '目标', description: '', progress: 10, status: 'active', due_at: null }],
    plans: [{ id: 'plan', goal_id: 'goal', title: '计划', description: '', progress: 5, milestones: [] }],
    tasks: [{ id: 'task', workspace_id: 'remote', project_id: 'project', goal_id: null, plan_id: null, title: '任务', description: '', status: 'todo', priority: 'high', energy_required: null, time_block: null, due_at: null, completed_at: null }],
    today_completed_tasks: [{ id: 'task-done', workspace_id: 'remote', project_id: 'project', goal_id: null, plan_id: null, title: '已完成任务', description: '', status: 'done', priority: 'medium', energy_required: null, time_block: null, due_at: null, completed_at: '2026-08-17T08:00:00+08:00' }],
    learning_items: [{
      id: 'learning-remote', workspace_id: 'remote', project_id: null, goal_id: null, title: '真实学习', summary: '来自云端',
      kind: 'course', status: 'in_progress', progress: 40, duration_minutes: 30,
      progress_updated_at: '2026-08-17T08:00:00+08:00', created_at: '2026-08-16T08:00:00+08:00', updated_at: '2026-08-17T08:00:00+08:00',
    }],
    daily_reflections: [{
      id: 'reflection-remote', workspace_id: 'remote', project_id: null, goal_id: null, task_id: null,
      reflection_type: 'micro', reflection_date: '2026-08-17', energy: null, intention: null, completion: null,
      wins: null, friction: null, adjustment: null, mood: null, micro_type: 'learning', micro_status: 'noted',
      content: '完成一段学习', is_makeup: false, created_at: '2026-08-17T08:00:00+08:00', updated_at: '2026-08-17T08:00:00+08:00',
    }],
    recent_events: [],
  });
  assert.equal(result.activeWorkspaceId, 'remote');
  assert.equal(result.tasks[0].id, 'task');
  assert.equal(result.tasks[1].completedDate, '2026-08-17');
  assert.deepEqual(result.learningItems.map((item) => item.id), ['learning-remote', 'learning-draft']);
  assert.deepEqual(result.reflections.map((item) => item.id), ['reflection-remote', 'reflection-draft']);
  assert.deepEqual(result.captures.map((item) => item.id), ['reflection-remote', 'capture-draft']);
});
