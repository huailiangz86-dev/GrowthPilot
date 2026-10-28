export interface FrozenMutation<P> { request_id: string; payload: P }
export interface MutationDraft<D, P> { version: 1; request_id: string; data: D; pending: FrozenMutation<P> | null }
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'length' | 'key'>>;
export function exportDraftContent<D, P>(storage: StorageAccess, key: string, current: MutationDraft<D, P>, backup: D | null) {
  let stored: string | null = null;
  try {stored = storage.getItem(key);} catch {/* Export current input even when storage is unavailable. */}
  const protectedDrafts: string[] = [];
  try {
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const name = storage.key?.(i);
      if (name?.startsWith(`${key}:protected:`)) {const value = storage.getItem(name); if (value !== null) protectedDrafts.push(value);}
    }
  } catch {/* Previously collected backups and current input remain exportable. */}
  return JSON.stringify({stored, current, backup, protectedDrafts}, null, 2);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function mutationKey(owner: string, workspace: string, form: string) {
  return ['gp_mutation_v1', owner, workspace, form].map(encodeURIComponent).join(':');
}
export function emptyDraft<D, P>(data: D): MutationDraft<D, P> {
  return {version: 1, request_id: crypto.randomUUID(), data, pending: null};
}
export function readDraft<D, P>(storage: StorageAccess, key: string, initial: D) {
  const raw = storage.getItem(key);
  if (raw === null) return {draft: emptyDraft<D, P>(initial), raw};
  let value: MutationDraft<D, P>;
  try {value = JSON.parse(raw);} catch {throw new Error('保存草稿无法读取，原内容仍保留。请导出后再处理。');}
  if (value?.version !== 1 || !uuid.test(value.request_id) || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)
      || Object.entries(initial as object).some(([key, item]) => !(key in (value.data as object)) || item !== null && typeof item !== typeof (value.data as Record<string, unknown>)[key])
      || value.pending !== null && (!value.pending || value.pending.request_id !== value.request_id || !value.pending.payload || typeof value.pending.payload !== 'object' || Array.isArray(value.pending.payload))) {
    throw new Error('保存草稿格式异常，原内容仍保留。请导出后再处理。');
  }
  return {draft: value, raw};
}
export function writeDraft<D, P>(storage: StorageAccess, key: string, draft: MutationDraft<D, P>, expectedRaw: string | null) {
  if (storage.getItem(key) !== expectedRaw) throw new Error('另一个页面已更新这份草稿。当前输入仍在，请导出或重新读取后继续。');
  const raw = JSON.stringify(draft);
  storage.setItem(key, raw);
  return raw;
}
export function freezeMutation<D, P>(draft: MutationDraft<D, P>, payload: P): MutationDraft<D, P> {
  if (draft.pending) return draft;
  return {...draft, pending: {request_id: draft.request_id, payload: structuredClone(payload)}};
}
export function clearDraft(storage: StorageAccess, key: string, expectedRaw: string | null) {
  if (storage.getItem(key) !== expectedRaw) throw new Error('其他页面的草稿已保留。');
  storage.removeItem(key);
}

export function recoverDraft<D, P>(storage: StorageAccess, key: string, draft: MutationDraft<D, P>, expectedRaw: string | null) {
  if (expectedRaw === null || storage.getItem(key) !== expectedRaw) throw new Error('原草稿已变化，请重新读取后再恢复。');
  const backupKey = `${key}:protected:${draft.request_id}`;
  const existing = storage.getItem(backupKey);
  if (existing !== null && existing !== expectedRaw) throw new Error('已有备份内容不同，原稿仍保留，请先导出核对。');
  storage.setItem(backupKey, expectedRaw);
  return writeDraft(storage, key, draft, expectedRaw);
}
