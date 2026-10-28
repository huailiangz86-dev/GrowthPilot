import {useCallback, useEffect, useRef, useState} from 'react';
import {ApiError} from '../api/client';
import {captureOwnerId} from '../workspace/captureSync';
import {acknowledgeLife, emptyJournal, freezeLifeCommand, mergeLifeSnapshot, readLifeJournal,
  type Action, type Draft, type Entity, type Journal, type Result, type Snapshot} from './store';

export function useLife(owner: string, tabId: string) {
  const key = `gp_life_v1:${owner}:${tabId}`;
  const [initial] = useState(() => {try {return {journal: readLifeJournal(localStorage, key), error: ''};} catch {return {journal: emptyJournal(), error: '原健身草稿无法读取，原存储保留；请导出备份后再处理。'};}});
  const [journal, setJournal] = useState(initial.journal), ref = useRef(initial.journal);
  const [storageError, setStorageError] = useState(initial.error), blocked = useRef(!!initial.error);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [attempt, setAttempt] = useState(0);
  const disposed = useRef(false), busy = useRef(false), generation = useRef(0);
  const authorized = useCallback(() => !disposed.current && captureOwnerId(localStorage.getItem('gp_token')) === owner, [owner]);
  const request = useCallback(async <T,>(path: string, data?: unknown, prefix = '/personal-life'): Promise<T> => {
    const token = localStorage.getItem('gp_token');
    if (!authorized()) throw new Error('登录账户已改变，请重新打开个人档案。');
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api/v1${prefix}${path}`, {method: data ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: data ? JSON.stringify(data) : undefined, signal: controller.signal});
      const body = await response.json();
      if (!authorized()) throw new Error('登录账户已改变，旧结果不会写入当前档案。');
      if (!response.ok || !body.success) throw new ApiError(body.error || '暂时无法读取个人档案。', response.status);
      return body.data as T;
    } finally {clearTimeout(timeout);}
  }, [authorized]);
  const commit = useCallback((next: Journal) => {
    if (!authorized()) return false;
    ref.current = next; setJournal(next);
    try {
      if (initial.error) throw new Error('corrupt storage retained');
      localStorage.setItem(key, JSON.stringify(next)); blocked.current = false; setStorageError(''); return true;
    } catch {blocked.current = true; setStorageError(initial.error || '浏览器无法保留健身草稿，当前输入仍在页面；重试保存成功后再离开。'); return false;}
  }, [authorized, key, initial.error]);
  const refresh = useCallback(async () => {
    if (!authorized()) return;
    const start = generation.current;
    try {
      const incoming = await request<Snapshot>(`?limit=${Math.min(100, Math.max(50, ref.current.snapshot?.records.length ?? 50))}`);
      if (!authorized() || start !== generation.current) return;
      commit({...ref.current, snapshot: mergeLifeSnapshot(ref.current.snapshot, incoming)}); setError('');
    } catch (e) {if (authorized()) setError(e instanceof Error ? e.message : '暂时无法读取，已保留原草稿。');}
    finally {if (authorized()) setLoading(false);}
  }, [authorized, commit, request]);
  const edit = useCallback((draft: Draft) => commit({...ref.current, drafts: {...ref.current.drafts, [draft.id]: {...draft, data: structuredClone(draft.data)}}}), [commit]);
  const discard = useCallback((id: string) => {
    const current = ref.current;
    if (current.queue.some(q => q.command.entity_id === id)) return false;
    const drafts = {...current.drafts}, saved = drafts[id]; delete drafts[id];
    return commit({...current, drafts, backups: [...current.backups, ...(saved ? [saved] : [])]});
  }, [commit]);
  const submit = useCallback((draft: Draft, action?: Action) => {
    const j = ref.current;
    if (j.queue.some(q => q.command.entity_id === draft.id)) return false;
    const queued = freezeLifeCommand(draft, crypto.randomUUID(), action);
    return commit({...j, drafts: {...j.drafts, [draft.id]: draft}, queue: [...j.queue, queued]});
  }, [commit]);
  const retry = useCallback(() => {
    if (commit({...ref.current, queue: ref.current.queue.map(q => q.conflict ? q : {...q, error: undefined})})) setAttempt(a => a + 1);
    void refresh();
  }, [commit, refresh]);
  const resolve = useCallback((id: string, keepLocal: boolean) => {
    const j = ref.current, draft = j.drafts[id]; if (!draft || !j.snapshot) return;
    const current = draft.kind === 'record' || draft.kind === 'reference' ? j.snapshot.records.find(r => r.id === id) : draft.kind === 'habit' ? j.snapshot.habit : j.snapshot.access;
    if (keepLocal && !current && !(draft.kind === 'record' && draft.baseVersion === 0)) return;
    const drafts = {...j.drafts};
    if (keepLocal) drafts[id] = {...draft, baseVersion: current?.version ?? 0, conflict: false, error: undefined};
    else delete drafts[id];
    commit({...j, drafts, queue: j.queue.filter(q => q.command.entity_id !== id), backups: [...j.backups, draft]});
  }, [commit]);
  useEffect(() => {
    disposed.current = false; void refresh();
    const visible = () => {if (!document.hidden && !busy.current) void refresh();};
    window.addEventListener('focus', visible); window.addEventListener('online', retry);
    const timer = window.setInterval(visible, 15000);
    return () => {disposed.current = true; clearInterval(timer); window.removeEventListener('focus', visible); window.removeEventListener('online', retry);};
  }, [refresh, retry]);
  useEffect(() => {
    if (!authorized() || busy.current || blocked.current || !navigator.onLine) return;
    const queued = ref.current.queue.find(q => !q.error && !q.conflict); if (!queued) return;
    busy.current = true; setSaving(true);
    void request<Result>('/commands', queued.command).then(result => {
      if (!authorized()) return;
      generation.current++;
      if (commit(acknowledgeLife(ref.current, queued, result))) setError('');
      void refresh();
    }).catch(async e => {
      if (!authorized()) return;
      const conflict = e instanceof ApiError && [409, 422, 404].includes(e.status);
      const message = conflict ? e.message : e instanceof ApiError && e.status === 401 ? '登录已过期，草稿仍保留；请重新登录同一账户。' : '网络或服务暂不可用，原提交等待重试。';
      const j = ref.current, draft = j.drafts[queued.draft.id];
      commit({...j, queue: j.queue.map(q => q.command.request_id === queued.command.request_id ? {...q, error: message, conflict} : q),
        drafts: conflict && draft ? {...j.drafts, [draft.id]: {...draft, conflict: true, error: message}} : j.drafts});
      setError(message); if (conflict) await refresh();
    }).finally(() => {busy.current = false; if (authorized()) {setSaving(false); setAttempt(a => a + 1);}});
  }, [journal, attempt, authorized, commit, request, refresh]);
  const history = useCallback(<T,>(kind: 'record' | 'habit', id: string) => request<Entity<T>[]>(`/history/${kind}/${id}`), [request]);
  const loadMore = useCallback(async () => {
    const j = ref.current, count = j.snapshot?.records.length ?? 0, start = generation.current;
    const incoming = await request<Snapshot>(`?offset=${count}&limit=50`);
    if (!authorized() || start !== generation.current || !ref.current.snapshot) return;
    commit({...ref.current, snapshot: {...ref.current.snapshot, total: incoming.total,
      records: [...ref.current.snapshot.records, ...incoming.records.filter(r => !ref.current.snapshot!.records.some(old => old.id === r.id))],
      references: [...ref.current.snapshot.references, ...incoming.references]}});
  }, [authorized, commit, request]);
  const workspaces = useCallback(() => request<{id: string; name: string}[]>('/workspaces', undefined, ''), [request]);
  const readRecord = useCallback((id: string) => request<Entity<import('./store').WorkoutContent>>(`/records/${id}`), [request]);
  return {journal, loading, saving, error, storageError, key, edit, discard, submit, retry, refresh, resolve, history, loadMore, workspaces, readRecord};
}
