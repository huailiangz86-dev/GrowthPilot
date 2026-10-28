import {useCallback, useEffect, useRef, useState} from 'react';
import {ApiError} from '../api/client';
import {captureOwnerId} from '../workspace/captureSync';
import {restoreHelp, type HelpJournal} from './recovery';
import type {LearningResult} from './expertSkillData';

export type HelpKind = 'fitness_extract' | 'learning_explain' | 'learning_practice' | 'learning_feedback' | 'learning_diagnose';
export interface HelpPayload {request_id: string; kind: HelpKind; consent: true; text?: string; timezone?: string; workspace_id?: string; item_id?: string; base_version?: number; question?: string; answer?: string;evidence_keys?:string[]}
export interface Candidate {title: string; occurred_on: string | null; outcome: 'completed' | 'skipped' | null; actual_minutes: number | null; exercises: {name: string; weight: number | null; sets: number | null; reps: number | null; quote: string}[]; quotes: string[]; uncertainty: string}
export interface HelpResult {request_id: string; kind: HelpKind; status: 'processing' | 'completed' | 'failed'; redacted: boolean; error: string | null; input: HelpPayload | null; source: {version?: number; fields?: Record<string,string>; text?: string;evidence?:{key:string;label:string;role:string;text:string;version?:number}[]} | null; result: Candidate | LearningResult | null; created_at: string; prompt_version: string}
type Journal = HelpJournal;
export function useItemHelp(scope: string) {
  const [owner] = useState(() => captureOwnerId(localStorage.getItem('gp_token')));
  const key = `gp_item_help_v1:${owner}:${scope}`;
  const [initial] = useState(() => {
    try {
      const value = restoreHelp(localStorage,key);
      return {value, error: ''};
    } catch {return {value: {payload: null, fields: {}} as Journal, error: 'AI 草稿暂时无法读取，原存储已保留。请保留页面或导出草稿。'};}
  });
  const [journal, setJournal] = useState(initial.value), ref = useRef(initial.value);
  const [help, setHelp] = useState<HelpResult | null>(null), [error, setError] = useState(initial.error), [storageError, setStorageError] = useState(initial.error);
  const [busy, setBusy] = useState(false), inFlight = useRef(false), disposed = useRef(false);
  const authorized = useCallback(() => !disposed.current && owner && captureOwnerId(localStorage.getItem('gp_token')) === owner, [owner]);
  const persist = useCallback((next: Journal) => {
    if (!authorized()) return false;
    ref.current = next; setJournal(next);
    try {if (initial.error) throw new Error(initial.error); localStorage.setItem(key, JSON.stringify(next)); setStorageError(''); return true;}
    catch {setStorageError(initial.error || '浏览器无法保留 AI 草稿，请保留页面并导出备份。'); return false;}
  }, [authorized, initial.error, key]);
  const request = useCallback(async <T = HelpResult,>(payload?: HelpPayload, path?: string): Promise<T> => {
    if (!authorized()) throw new Error('登录账户已改变，请重新打开页面');
    const token = localStorage.getItem('gp_token'), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), payload ? 120000 : 12000);
    try {
      const response = await fetch(`/api/v1/item-help${path ?? (payload ? '' : `/${ref.current.payload!.request_id}`)}`, {
        method: payload ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: payload ? JSON.stringify(payload) : undefined, signal: controller.signal});
      const body = await response.json();
      if (!authorized()) throw new Error('登录账户已改变，旧结果已停止读取');
      if (!response.ok || !body.success) throw new ApiError(body.error || 'AI 暂时不可用', response.status);
      return body.data as T;
    } finally {clearTimeout(timer);}
  }, [authorized]);
  const refresh = useCallback(async () => {
    if (!ref.current.payload || inFlight.current || !authorized()) return;
    const id = ref.current.payload.request_id;
    try {const value = await request(); if (authorized() && ref.current.payload?.request_id === id) {setHelp(value); setError('');}}
    catch (e) {if (authorized()) {setHelp(null); setError(e instanceof ApiError && e.status === 404 ? '这次请求尚未发送完成，原输入已保留。可重试原请求。' : '暂时无法核对 AI 结果，原输入仍保留。可刷新或重试。');}}
  }, [authorized, request]);
  const send = useCallback(async (payload: HelpPayload) => {
    if (inFlight.current || !persist({...ref.current, payload})) return;
    inFlight.current = true; setBusy(true); setHelp(null); setError('');
    try {const result = await request(payload); if (authorized()) setHelp(result);}
    catch (e) {if (authorized()) setError(e instanceof ApiError ? e.message : '网络或 AI 暂时不可用，原请求仍保留。可重试原请求。');}
    finally {inFlight.current = false; if (authorized()) setBusy(false);}
  }, [authorized, persist, request]);
  useEffect(() => {
    disposed.current = false; void refresh();
    const focus = () => {if (!document.hidden) void refresh();};
    window.addEventListener('focus', focus); const timer = setInterval(focus, 15000);
    return () => {disposed.current = true; clearInterval(timer); window.removeEventListener('focus', focus);};
  }, [refresh]);
  useEffect(() => {
    if (help?.status !== 'processing') return;
    const timer = setInterval(() => void refresh(), 3000); return () => clearInterval(timer);
  }, [help?.status, refresh]);
  useEffect(() => {
    const timer = setInterval(() => {if (!authorized()) {setHelp(null);setError('登录账户已改变，请重新打开页面。');}}, 1000);
    return () => clearInterval(timer);
  }, [authorized]);
  const saved = useCallback((workspaceId: string, itemId: string) => request<HelpResult[]>(undefined, `?workspace_id=${workspaceId}&item_id=${itemId}`), [request]);
  return {help, error, storageError, accountCurrent: Boolean(authorized()), busy: busy || help?.status === 'processing', payload: journal.payload, fields: journal.fields,
    setField: (field: string, value: string) => persist({...ref.current, fields: {...ref.current.fields, [field]: value}}),
    start: (payload: Omit<HelpPayload, 'request_id'>) => send({...payload, request_id: crypto.randomUUID()}),
    retry: () => ref.current.payload && send(ref.current.payload), refresh,
    saved,
    recover: (payload: HelpPayload) => {if (persist({...ref.current, payload})) void refresh();},
    backup: () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({journal: ref.current, raw: localStorage.getItem(key)}, null, 2)], {type:'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'growthpilot-help-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }};
}
