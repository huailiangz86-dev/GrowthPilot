import type { Capture, Reflection } from './workspaceData.ts';

export type CaptureSyncState = 'local' | 'pending' | 'syncing' | 'failed' | 'synced';
export interface CaptureSaveResult {
  captureId: string;
  syncState: CaptureSyncState;
  error?: string;
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export function captureOwnerId(token: string | null): string | null {
  if (!token) return null;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

function queueKey(ownerId: string | null) { return `gp_capture_queue_v1:${ownerId ?? 'local'}`; }

export function readCaptureQueue(storage: StorageAccess, ownerId: string | null): Capture[] {
  const raw = storage.getItem(queueKey(ownerId));
  if (!raw) return [];
  let parsed: unknown;
  try {parsed = JSON.parse(raw);} catch (error) {throw new Error('本地记录存储无法读取，输入仍保留在草稿中。', {cause: error});}
  if (!Array.isArray(parsed) || parsed.some(item => !item?.clientRequestId || !item?.workspaceId || typeof item.content !== 'string')) {
    throw new Error('本地记录存储无法读取，输入仍保留在草稿中。');
  }
  return (parsed as Capture[]).filter(item => (item.ownerId ?? null) === ownerId).map(item => ({
    ...item, syncState: item.syncState === 'syncing' ? 'pending' : item.syncState,
  }));
}

// Persist before attempting a request. A quota error must never look like a saved record.
export function queueCapture(storage: StorageAccess, capture: Capture) {
  const queue = readCaptureQueue(storage, capture.ownerId ?? null);
  try {
    storage.setItem(queueKey(capture.ownerId ?? null), JSON.stringify([
      capture, ...queue.filter(item => item.clientRequestId !== capture.clientRequestId),
    ]));
  } catch (error) {throw new Error('浏览器无法保存这条记录，输入仍在，请稍后重试。', {cause: error});}
}

export function removeQueuedCapture(storage: StorageAccess, ownerId: string | null, clientRequestId: string) {
  const queue = readCaptureQueue(storage, ownerId);
  storage.setItem(queueKey(ownerId), JSON.stringify(queue.filter(item => item.clientRequestId !== clientRequestId)));
}

export function restoreQueuedCaptures(current: Capture[], queue: Capture[], ownerId: string | null): Capture[] {
  const visible = current.filter(item => !item.ownerId || item.ownerId === ownerId);
  const saved = new Set(visible.filter(item => item.syncState === 'synced').map(item => item.clientRequestId));
  const pending = queue.filter(item => !saved.has(item.clientRequestId));
  const pendingIds = new Set(pending.map(item => item.clientRequestId));
  return [...pending, ...visible.filter(item => !pendingIds.has(item.clientRequestId))];
}

export function captureReflection(capture: Capture): Reflection {
  return {
    id: `reflection-${capture.clientRequestId}`, workspaceId: capture.workspaceId,
    type: 'micro', reflectionDate: capture.capturedDate, captureId: capture.id,
    microType: capture.type, microStatus: capture.status, content: capture.content,
    projectId: capture.projectId, goalId: capture.goalId, taskId: capture.taskId,
    isMakeup: false, createdLabel: capture.createdLabel, clientRequestId: capture.clientRequestId,
  };
}

export function captureRequest(capture: Capture, today: string) {
  return {
    workspace_id: capture.workspaceId, client_request_id: capture.clientRequestId,
    reflection_type: 'micro', reflection_date: capture.capturedDate,
    micro_type: capture.type, micro_status: capture.status, content: capture.content,
    project_id: capture.projectId ?? null, goal_id: capture.goalId ?? null, task_id: capture.taskId ?? null,
    is_makeup: capture.capturedDate !== today,
  };
}

export const CAPTURE_SYNC_LABELS: Record<CaptureSyncState, string> = {
  local: '仅保存在此浏览器', pending: '待同步', syncing: '同步中', failed: '同步失败', synced: '已同步',
};
