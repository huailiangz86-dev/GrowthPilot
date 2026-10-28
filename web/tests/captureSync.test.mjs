import assert from 'node:assert/strict';
import test from 'node:test';
import {captureOwnerId, captureRequest, queueCapture, readCaptureQueue, restoreQueuedCaptures} from '../src/workspace/captureSync.ts';
import {mergeHydratedItems} from '../src/workspace/dashboardData.ts';

function storage() {
  const items = new Map();
  return {getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value)};
}
const capture = {id: 'capture-request-1', clientRequestId: 'request-1', ownerId: 'user-1', workspaceId: 'workspace-1', content: '原文不能丢失', type: 'idea', status: 'noted', capturedDate: '2026-10-07', createdLabel: '刚刚', syncState: 'syncing'};

test('中断的快速记录请求刷新后恢复待同步，账户队列相互隔离', () => {
  const saved = storage();
  queueCapture(saved, capture);
  assert.equal(readCaptureQueue(saved, 'user-1')[0].syncState, 'pending');
  assert.equal(readCaptureQueue(saved, 'user-1')[0].content, capture.content);
  assert.deepEqual(readCaptureQueue(saved, 'user-2'), []);
  assert.deepEqual(restoreQueuedCaptures([capture], [], 'user-2'), []);
});

test('响应丢失后的云端水合按提交标识替换本地记录，不重复原文或覆盖其他空间', () => {
  const remote = {...capture, id: 'server-id', syncState: 'synced'};
  const other = {...capture, id: 'other', workspaceId: 'workspace-2', clientRequestId: 'request-2'};
  const merged = mergeHydratedItems([remote], [capture, other], 'workspace-1', 'capture-');
  assert.deepEqual(merged.map(item => item.id), ['server-id', 'other']);
  assert.deepEqual(restoreQueuedCaptures([remote], [capture], 'user-1'), [remote]);
});

test('浏览器存储失败不得继续提交，原有持久队列不能被损坏的数据覆盖', () => {
  const saved = storage();
  saved.setItem('gp_capture_queue_v1:user-1', '{invalid');
  assert.throws(() => queueCapture(saved, capture));
  assert.equal(saved.getItem('gp_capture_queue_v1:user-1'), '{invalid');
  assert.throws(() => queueCapture({getItem: () => null, setItem: () => {throw new Error('quota');}}, capture), error => error.cause?.message === 'quota');
});

test('跨日重试保留原记录日期、关联和同一提交标识', () => {
  const payload = captureRequest({...capture, taskId: 'task-1'}, '2026-10-08');
  assert.equal(payload.client_request_id, 'request-1');
  assert.equal(payload.reflection_date, '2026-10-07');
  assert.equal(payload.is_makeup, true);
  assert.equal(payload.task_id, 'task-1');
});

test('快速记录只以当前登录主体选择队列，无效令牌不触发账户同步', () => {
  const token = `header.${btoa(JSON.stringify({sub: 'user-1'}))}.signature`;
  assert.equal(captureOwnerId(token), 'user-1');
  assert.equal(captureOwnerId('invalid-token'), null);
});
