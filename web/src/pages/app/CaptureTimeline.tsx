import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CAPTURE_SYNC_LABELS } from '../../workspace/captureSync';
import type { CaptureType } from '../../workspace/workspaceData';
import { useWorkspace } from '../../workspace/useWorkspace';
import './CaptureTimeline.css';
import FactRecorder from '../../analysis/FactRecorder';

const LABELS: Record<CaptureType, string> = {progress: '进展', decision: '决定', emotion: '状态', idea: '想法', learning: '学习'};

export default function CaptureTimeline() {
  const {activeCaptures, activeWorkspace, retryCapture} = useWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CaptureType | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const filtered = activeCaptures.filter(item => (filter === 'all' || item.type === filter) && item.content.toLowerCase().includes(query.toLowerCase().trim()));
  const pending = activeCaptures.filter(item => item.clientRequestId && item.syncState !== 'synced' && item.syncState !== 'local').length;

  async function retry(id: string) {
    try {
      const result = await retryCapture(id);
      setNotice(result.syncState === 'synced' ? '已同步同一条记录，原文和来源已保留。' : result.error ?? '原文仍保留，可以稍后重试。');
    } catch (error) {setNotice(error instanceof Error ? error.message : '暂时无法同步，原文仍保留。');}
  }

  return <div className="capture-timeline page-stack">
    <header className="page-intro"><div><span className="section-kicker">YOUR DATA · {activeWorkspace.name}</span><h2>留下的每条事实，都有来源。</h2><p>当前工作空间的快速记录。先保留原文，再确认服务端同步。</p></div><Link className="primary-action" to="/app/data?capture=1">＋ 新增记录</Link></header>
    <div className="capture-data-summary"><span>{activeCaptures.length} 条记录</span><span>{pending ? `${pending} 条待同步` : '没有待同步记录'}</span></div>
    <section className="workspace-panel capture-data-panel">
      <label className="capture-data-search"><span>搜索原文</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="寻找一条记录"/></label>
      <div className="capture-data-filters" role="group" aria-label="记录类型"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部</button>{Object.entries(LABELS).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value as CaptureType)}>{label}</button>)}</div>
      {notice && <p className="capture-data-notice" role="status">{notice}</p>}
      {!filtered.length && <div className="capture-data-empty"><h3>{activeCaptures.length ? '没有找到匹配记录' : '还没有留下记录'}</h3><p>{activeCaptures.length ? '试试其他关键词或类型。' : '一个进展、收获或感受，都可以成为起点。'}</p><Link to="/app/data?capture=1" className="outline-action">记下此刻</Link></div>}
      <div className="capture-data-list">{filtered.map(capture => {
        const key = capture.clientRequestId ?? capture.id;
        const status = capture.syncState ?? 'local';
        const open = expanded === key;
        return <article key={key} className="capture-data-item">
          <button className="capture-data-open" aria-expanded={open} onClick={() => setExpanded(open ? null : key)}><span className="capture-data-mark">{LABELS[capture.type]}</span><span><small>{capture.capturedDate || '此前记录'} · 原始用户记录</small><strong>{capture.content.split('\n')[0]}</strong></span><span className={`capture-data-status ${status}`}>{CAPTURE_SYNC_LABELS[status]}</span></button>
          {open && <div className="capture-data-detail"><p>{capture.content}</p><div className="capture-data-source"><span>来源：用户手动记录</span><span>范围：{activeWorkspace.name}</span><span>{capture.projectId ? '已关联项目' : capture.goalId ? '已关联目标' : capture.taskId ? '已关联任务' : '当前工作空间'}</span></div>{capture.syncError && <p className="capture-data-error">{capture.syncError}</p>}{capture.clientRequestId && status !== 'synced' && status !== 'local' && <button type="button" className="outline-action" disabled={status === 'syncing'} onClick={() => {void retry(capture.id);}}>{status === 'syncing' ? '正在同步…' : '重试这条记录'}</button>}{status === 'local' && <small>这条原文仅保存在当前浏览器，未自动上传。</small>}</div>}
        </article>;
      })}</div>
    </section>
    <FactRecorder/>
  </div>;
}
