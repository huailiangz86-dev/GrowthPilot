import {useEffect, useRef, useState} from 'react';
import {ApiError} from '../api/client';
import {clearDraft, emptyDraft, exportDraftContent, freezeMutation, readDraft, recoverDraft, writeDraft, type FrozenMutation, type MutationDraft} from './journal';

export function useMutationDraft<D extends object, P extends object>(key: string, initial: D) {
  const [loaded] = useState(() => {
    try {return {...readDraft<D, P>(localStorage, key, initial), error: ''};}
    catch (error) {let raw: string | null = null; try {raw = localStorage.getItem(key);} catch {} return {draft: emptyDraft<D, P>(initial), raw, error: (error as Error).message};}
  });
  const [draft, setDraft] = useState(loaded.draft), current = useRef(draft), raw = useRef(loaded.raw);
  const [protectedDraft, setProtectedDraft] = useState(Boolean(loaded.error));
  const [error, setError] = useState(loaded.error), [busy, setBusy] = useState(false);
  const [failureCode, setFailureCode] = useState(''), [backup, setBackup] = useState<D | null>(null);
  const sending = useRef(false), active = useRef(true), blocked = useRef(Boolean(loaded.error));
  const confirmed = useRef<{request_id: string; result: unknown} | null>(null);
  useEffect(() => {
    active.current = true;
    const changed = (event: StorageEvent) => {if (event.key === key && event.newValue !== raw.current) setError('另一个页面已更新这份草稿。当前输入仍在，请导出或重新读取后继续。');};
    window.addEventListener('storage', changed);
    return () => {active.current = false; window.removeEventListener('storage', changed);};
  }, [key]);
  function persist(next: MutationDraft<D, P>) {
    if (blocked.current) throw new Error(loaded.error || '原草稿仍受保护，请先导出并核对。');
    raw.current = writeDraft(localStorage, key, next, raw.current);
  }
  function update(next: MutationDraft<D, P>) {current.current = next; setDraft(next);}
  function change(patch: Partial<D>) {
    if (sending.current || current.current.pending) return;
    const next = {...current.current, data: {...current.current.data, ...patch}};
    update(next);
    try {persist(next); setError(''); setFailureCode('');} catch (error) {setError((error as Error).message || '输入仍在当前页，草稿尚未保存。');}
  }
  async function submit<R>(build: (data: D) => P, send: (pending: FrozenMutation<P>) => Promise<R>): Promise<R | undefined> {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); setFailureCode('');
    let frozen = current.current;
    try {
      frozen = current.current.pending ? current.current : freezeMutation(current.current, build(current.current.data));
      persist(frozen); update(frozen);
      const result = confirmed.current?.request_id === frozen.request_id ? confirmed.current.result as R : await send(frozen.pending!);
      if (result === false) throw new Error('保存结果尚未确认，请按原提交重试。');
      if (!active.current) return;
      confirmed.current = {request_id: frozen.request_id, result};
      try {clearDraft(localStorage, key, raw.current); raw.current = null;} catch {/* Keep another tab's draft and the confirmed receipt. */}
      return result;
    } catch (error) {
      if (!active.current) return;
      const rejection = error instanceof ApiError && [400, 403, 404, 422].includes(error.status)
        || error instanceof ApiError && error.status === 409 && error.code === 'PROJECT_EDIT_CONFLICT';
      if (rejection) {
        const editable = {...current.current, request_id: crypto.randomUUID(), pending: null};
        update(editable);
        try {persist(editable);} catch {/* The original frozen submission remains recoverable. */}
      }
      setFailureCode(error instanceof ApiError ? error.code ?? '' : '');
      setError(error instanceof Error ? error.message : '保存结果尚未确认，原提交已保留，可重试。');
    } finally {sending.current = false; if (active.current) setBusy(false);}
  }
  function reload() {
    if (sending.current) return;
    setBackup(current.current.data);
    try {
      const value = readDraft<D, P>(localStorage, key, initial);
      raw.current = value.raw; blocked.current = false; setProtectedDraft(false); update(value.draft); setError(''); setFailureCode('');
    } catch (error) {blocked.current = true; setProtectedDraft(true); setError((error as Error).message);}
  }
  function recover() {
    if (sending.current || !blocked.current) return;
    try {
      raw.current = recoverDraft(localStorage, key, current.current, raw.current);
      blocked.current = false; setProtectedDraft(false); setError('');
    } catch (error) {setError((error as Error).message);}
  }
  function exportDraft() {
    const url = URL.createObjectURL(new Blob([exportDraftContent(localStorage, key, current.current, backup)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'growthpilot-save-draft.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {data: draft.data, pending: draft.pending, busy, error, failureCode, backup, protectedDraft, recover, change, submit, reload, exportDraft};
}
