import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {ApiError, api} from '../api/client';
import {captureOwnerId} from '../workspace/captureSync';
import {useWorkspace} from '../workspace/useWorkspace';
import {acknowledge, emptyJournal, frozenCommand, readJournal, type Action, type Draft, type Journal, type Kind, type Queued, type Result, type Review, type Snapshot} from './store';

import {PersonalContext as Context} from './context';
export function PersonalProvider({children}: {children: ReactNode}) {
  const {activeWorkspace} = useWorkspace();
  const owner = captureOwnerId(localStorage.getItem('gp_token'));
  return <TabSession key={`${owner}:${activeWorkspace.id}`} owner={owner} workspaceId={activeWorkspace.id}>{children}</TabSession>;
}
function TabSession({children, owner, workspaceId}: {children: ReactNode; owner: string | null; workspaceId: string}) {
  const [tabId,setTabId] = useState(() => {
    let id = sessionStorage.getItem('gp_personal_tab');
    if (!id) {id = crypto.randomUUID(); sessionStorage.setItem('gp_personal_tab', id);}
    return id;
  });
  const [ready,setReady] = useState(false);
  useEffect(()=>{
    const instance=crypto.randomUUID();
    let claimed=false, cancelled=false;
    if(typeof BroadcastChannel==='undefined'){setReady(true);return;}
    const channel=new BroadcastChannel(`gp_personal_tab:${owner}:${workspaceId}:${tabId}`);
    const relocate=()=>{if(cancelled)return;cancelled=true;const id=crypto.randomUUID();sessionStorage.setItem('gp_personal_tab',id);setReady(false);setTabId(id);};
    channel.onmessage=event=>{
      if(event.data?.instance===instance)return;
      if(event.data?.type==='claim' && !cancelled){
        if(claimed || instance<event.data.instance)channel.postMessage({type:'occupied',instance,target:event.data.instance});
        else relocate();
      }
      if(event.data?.type==='occupied' && event.data.target===instance)relocate();
    };
    channel.postMessage({type:'claim',instance});
    const timer=setTimeout(()=>{if(!cancelled){claimed=true;setReady(true);}},100);
    return()=>{cancelled=true;clearTimeout(timer);channel.close();};
  },[owner,workspaceId,tabId]);
  return ready ? <Provider key={tabId} tabId={tabId} owner={owner} workspaceId={workspaceId}>{children}</Provider> : <p role="status">正在恢复工作草稿…</p>;
}
function Provider({children, owner, workspaceId, tabId}: {children: ReactNode; owner: string | null; workspaceId: string; tabId: string}) {
  // Independent journals keep another tab from overwriting this tab's unsent draft.
  const key = `gp_personal_v1:${owner}:${workspaceId}:${tabId}`;
  const [initial] = useState(() => {try {return {journal: readJournal(localStorage, key), error: ''};} catch {return {journal: emptyJournal(), error: '草稿存储无法读取。请保留页面，存储恢复前不会发送新内容。'};}});
  const [journal, setJournal] = useState(initial.journal), ref = useRef(initial.journal);
  const [storageError, setStorageError] = useState(initial.error), storageBlocked = useRef(Boolean(initial.error));
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0), busy = useRef(false), disposed = useRef(false);
  const acknowledged = useRef(0);
  const authorized = useCallback(() => !disposed.current && owner !== null && captureOwnerId(localStorage.getItem('gp_token')) === owner, [owner]);
  const commit = useCallback((next: Journal) => {
    if (!authorized()) return false;
    try {
      if (initial.error) throw new Error('stored data unavailable');
      localStorage.setItem(key, JSON.stringify(next));
      storageBlocked.current = false; setStorageError(''); ref.current = next; setJournal(next); return true;
    } catch {storageBlocked.current = true; setStorageError('浏览器暂时无法保留草稿。当前输入仍在页面，重试成功后再离开。'); return false;}
  }, [authorized, key, initial.error]);
  const edit = useCallback((draft: Draft) => {
    const existing = ref.current.drafts[draft.entityId];
    const next = {...ref.current, drafts: {...ref.current.drafts, [draft.entityId]: {...(existing ?? draft), data: structuredClone(draft.data)}}};
    const saved = commit(next);
    if (!saved) {ref.current = next; setJournal(next);}
    return saved;
  }, [commit]);
  const refresh = useCallback(async () => {
    if (!authorized() || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {setLoading(false); return;}
    try {
      const generation = acknowledged.current;
      const snapshot = await api.get<Snapshot>(`/personal-work/${workspaceId}`);
      if (!authorized()) return;
      if (generation !== acknowledged.current) return;
      const current = ref.current.snapshot;
      // An older GET response cannot roll back an acknowledged local command.
      if (current) {
        snapshot.tasks = snapshot.tasks.map(t => {
          const previous = current.tasks.find(v => v.id === t.id);
          return previous && (previous.document.version > t.document.version || Date.parse(previous.updated_at ?? '') > Date.parse(t.updated_at ?? '')) ? previous : t;
        });
        snapshot.learning = snapshot.learning.map(l => {
          const previous = current.learning.find(v => v.id === l.id);
          return previous && (previous.document.version > l.document.version || Date.parse(previous.updated_at ?? '') > Date.parse(l.updated_at ?? '')) ? previous : l;
        });
        snapshot.schedules = snapshot.schedules.map(s => {const old=current.schedules.find(v=>v.id===s.id); return old && old.version>s.version ? old : s;});
        if((current.preferences?.version??0)>(snapshot.preferences?.version??0))snapshot.preferences=current.preferences;
      }
      const next = {...ref.current, snapshot};
      if (!commit(next)) {ref.current = next; setJournal(next);}
      setError('');
    } catch (err) {if (authorized()) setError(err instanceof Error ? err.message : '暂时无法读取，已保留本地草稿。');}
    finally {if (!disposed.current) setLoading(false);}
  }, [authorized, workspaceId, commit]);
  const retry = useCallback(() => {
    const j = ref.current;
    if (commit({...j, queue: j.queue.map(q => q.conflict ? q : {...q, error: undefined})})) setAttempt(value => value + 1);
    void refresh();
  }, [commit, refresh]);
  const run = useCallback((kind: Kind, action: Action, entityId: string, data: Record<string, unknown>, version: number, updatedAt: string | null) => {
    const previous = ref.current.queue.find(q => q.command.entity_id === entityId);
    if ((previous && !(kind === 'schedule' && previous.conflict)) || ref.current.drafts[entityId]) return false;
    const queued: Queued = {kind, command: {request_id: crypto.randomUUID(), entity_id: entityId, action, base_version: version, expected_updated_at: updatedAt, data}};
    return commit({...ref.current, queue: [...ref.current.queue.filter(q => q !== previous), queued]});
  }, [commit]);
  const resolve = useCallback((id: string, useLocal: boolean) => {
    const j = ref.current, draft = j.drafts[id], queued = j.queue.find(q => q.command.entity_id === id);
    const drafts = {...j.drafts};
    const item = draft?.kind === 'task' ? j.snapshot?.tasks.find(t => t.id === id) : draft?.kind === 'review' ? Object.values(j.reviews).find(r=>r.id===id) : j.snapshot?.learning.find(t => t.id === id);
    if (useLocal && queued?.command.action === 'append_material' && item && 'document' in item) {
      const rebased: Queued = {...queued, error: undefined, conflict: false, command: {...queued.command,
        request_id: crypto.randomUUID(), base_version: item.document.version, expected_updated_at: item.updated_at,
        data:{...queued.command.data,...(draft?{draft:structuredClone(draft.data)}:{})}}};
      commit({...j, queue: j.queue.map(q=>q===queued?rebased:q), backups:[...j.backups,{kind:'learning',entityId:id,
        data:queued.command.data,baseVersion:queued.command.base_version,updatedAt:queued.command.expected_updated_at,create:false}]});
      return;
    }
    if (useLocal && draft?.kind==='preferences') drafts[id]={...draft,baseVersion:j.snapshot?.preferences?.version??0,error:undefined,conflict:false};
    else if (useLocal && draft && item) drafts[id] = {...draft, baseVersion: item.document.version, updatedAt: item.updated_at, create: false, error: undefined, conflict: false};
    else if (useLocal && draft && draft.create && !item) drafts[id] = {...draft, conflict: false, error: undefined};
    else if (useLocal && queued && queued.kind === 'schedule') {
      const block = j.snapshot?.schedules.find(s => s.id === id);
      drafts[id] = {kind: 'schedule', entityId: id, data: queued.command.data, baseVersion: block?.version ?? 0, updatedAt: null, create: false};
    } else delete drafts[id];
    commit({...j, drafts, queue: j.queue.filter(q => q.command.entity_id !== id),
      backups: [...j.backups, ...(draft ? [draft] : queued ? [{kind: queued.kind, entityId: id, data: queued.command.data, baseVersion: queued.command.base_version, updatedAt: queued.command.expected_updated_at, create: false}] : [])]});
  }, [commit]);
  const cacheReview = useCallback((review: Review) => {
    const j = ref.current;
    const next = {...j, reviews: {...j.reviews, [review.date]: review}};
    if (!commit(next)) {ref.current = next; setJournal(next);}
  }, [commit]);
  useEffect(() => {
    disposed.current = false; void refresh();
    const online = () => retry();
    const visible = () => {if (!document.hidden && !busy.current) void refresh();};
    const timer = window.setInterval(visible, 15000);
    window.addEventListener('online', online);
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => {disposed.current = true; clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible);};
  }, [refresh, retry]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!authorized() || storageBlocked.current) return;
      let next = ref.current;
      const eligible = Object.values(next.drafts).filter(d => !d.conflict && !d.error && !next.queue.some(q => q.command.entity_id === d.entityId));
      if (eligible.length) {next = {...next, queue: [...next.queue, ...eligible.map(d => frozenCommand(d, crypto.randomUUID()))]}; if (!commit(next)) return;}
      if (busy.current || !navigator.onLine) return;
      const queued = next.queue.find(q => !q.conflict && !q.error);
      if (!queued) return;
      busy.current = true; setSaving(true);
      const controller=new AbortController(), timeout=window.setTimeout(()=>controller.abort(),12000);
      void api.post<Result>(`/personal-work/${workspaceId}/commands`, queued.command,{signal:controller.signal}).then(result => {
        if (authorized()) {
          acknowledged.current += 1;
          const j = ref.current;
          commit(acknowledge({...j, snapshot: j.snapshot ?? {workspace_id: workspaceId, tasks: [], learning: [], schedules: []}}, queued, result));
          setError('');
        }
      }).catch(async (err) => {
        if (!authorized()) return;
        if (err instanceof ApiError && [409, 422, 404].includes(err.status)) {
          const j = ref.current, draft = j.drafts[queued.command.entity_id];
          commit({...j, queue: j.queue.map(q => q.command.request_id === queued.command.request_id ? {...q, conflict: true, error: err.message} : q),
            drafts: draft ? {...j.drafts, [draft.entityId]: {...draft, conflict: true, error: err.message}} : j.drafts});
          await refresh();
        } else {
          const j = ref.current;
          commit({...j, queue: j.queue.map(q => q.command.request_id === queued.command.request_id ? {...q, error: '网络暂不可用，原提交等待重试。'} : q)});
          setError('内容已保留为本地草稿，恢复网络后可重试。');
        }
      }).finally(() => {
        clearTimeout(timeout);
        busy.current = false;
        if (!disposed.current) {setSaving(false); setAttempt(value => value + 1);}
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [journal, attempt, commit, authorized, workspaceId, refresh]);
  return <Context.Provider value={{journal, error, loading, saving, storageError, edit, run, refresh, retry, resolve, cacheReview}}>{children}</Context.Provider>;
}
