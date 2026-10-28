import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useWorkspace } from '../workspace/useWorkspace';
import { ExecutionContext as Context } from './context';

export interface ExecutionJob {
  id: string; kind: 'plan' | 'analysis' | 'learning'; resource_id: string; title: string;
  status: 'pending' | 'waiting' | 'blocked' | 'paused' | 'completed' | 'failed';
  result: { summary?: string; progress?: number; application?: string; task_id?: string;
    steps?: { title: string; task_id: string; status: string }[];
    overdue?: { id: string; title: string }[] };
  error: string | null; attempts: number; last_run_at: string | null; next_run_at: string;
}
export interface ExecutionState {
  worker: { online: boolean; last_seen_at: string | null; poll_seconds: number };
  jobs: ExecutionJob[];
  events: { id: string; created_at: string; payload: { title?: string; summary?: string; status?: string } }[];
}


export function ExecutionProvider({ children }: { children: ReactNode }) {
  const { activeWorkspace, refreshExecutionData } = useWorkspace();
  const [snapshot, setSnapshot] = useState<{ workspaceId: string; data: ExecutionState } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let disposed = false, busy = false;
    const workspaceId = activeWorkspace.id;
    setLoading(true); setError('');
    const read = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const results = await Promise.allSettled([
          api.get<ExecutionState>('/execution', { workspace_id: workspaceId }), refreshExecutionData(),
        ]);
        if (!disposed) {
          if (results[0].status === 'fulfilled') setSnapshot({ workspaceId, data: results[0].value });
          setError(results[0].status === 'rejected' ? '暂时无法读取后台执行状态。' : results[1].status === 'rejected' ? '执行状态已读取，行动数据暂未同步。' : '');
        }
      } finally { busy = false; if (!disposed) setLoading(false); }
    };
    if (localStorage.getItem('gp_token') && /^[0-9a-f-]{36}$/i.test(workspaceId)) {
      void read();
      const timer = window.setInterval(() => { if (!document.hidden) void read(); }, 15000);
      const onVisible = () => { if (!document.hidden) void read(); };
      document.addEventListener('visibilitychange', onVisible);
      return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }
    setLoading(false);
    return () => { disposed = true; };
  }, [activeWorkspace.id, refreshExecutionData, revision]);
  return <Context.Provider value={{ data: snapshot?.workspaceId === activeWorkspace.id ? snapshot.data : null, error, loading, refresh }}>{children}</Context.Provider>;
}

