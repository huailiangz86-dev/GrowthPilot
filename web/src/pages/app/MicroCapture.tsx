import { useEffect, useMemo, useState } from 'react';
import type { CaptureInput, CaptureStatus, CaptureType } from '../../workspace/workspaceData';
import { useWorkspace } from '../../workspace/useWorkspace';
import './MicroCapture.css';

const DRAFT_KEY = 'gp_micro_capture_draft_v1';

const TYPE_OPTIONS: Array<{ value: CaptureType; label: string; mark: string }> = [
  { value: 'progress', label: '进展', mark: '↗' },
  { value: 'decision', label: '决定', mark: '◇' },
  { value: 'emotion', label: '状态', mark: '◌' },
  { value: 'idea', label: '想法', mark: '✦' },
  { value: 'learning', label: '学习', mark: '▤' },
];

const STATUS_OPTIONS: Record<CaptureType, Array<{ value: CaptureStatus; label: string }>> = {
  progress: [{ value: 'moving', label: '正在推进' }, { value: 'done', label: '已完成' }, { value: 'blocked', label: '遇到阻力' }],
  decision: [{ value: 'decided', label: '已经决定' }, { value: 'noted', label: '待确认' }],
  emotion: [{ value: 'calm', label: '平静' }, { value: 'energized', label: '有能量' }, { value: 'tired', label: '需要放慢' }],
  idea: [{ value: 'noted', label: '先记下来' }, { value: 'moving', label: '值得继续' }],
  learning: [{ value: 'noted', label: '刚学到' }, { value: 'done', label: '已理解' }],
};

interface Draft {
  content: string;
  type: CaptureType;
  status: CaptureStatus;
  relation: string;
}

const EMPTY_DRAFT: Draft = { content: '', type: 'idea', status: 'noted', relation: 'none' };

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const type = TYPE_OPTIONS.some((option) => option.value === parsed.type) ? parsed.type as CaptureType : 'idea';
    const status = STATUS_OPTIONS[type].some((option) => option.value === parsed.status) ? parsed.status as CaptureStatus : STATUS_OPTIONS[type][0].value;
    return { content: parsed.content ?? '', type, status, relation: parsed.relation ?? 'none' };
  } catch {
    return EMPTY_DRAFT;
  }
}

export default function MicroCapture({ onClose }: { onClose: () => void }) {
  const { activeProjects, activeGoals, activeTasks, addCapture } = useWorkspace();
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [saved, setSaved] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const statusOptions = STATUS_OPTIONS[draft.type];
  const relationOptions = useMemo(() => [
    ...activeProjects.map((project) => ({ value: `project:${project.id}`, label: `项目 · ${project.name}` })),
    ...activeGoals.map((goal) => ({ value: `goal:${goal.id}`, label: `目标 · ${goal.title}` })),
    ...activeTasks.filter((task) => task.status !== 'done').slice(0, 8).map((task) => ({ value: `task:${task.id}`, label: `任务 · ${task.title}` })),
  ], [activeGoals, activeProjects, activeTasks]);

  useEffect(() => {
    if (saved) return;
    if (!draft.content.trim() && draft.relation === 'none') {
      window.localStorage.removeItem(DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, saved]);

  const selectType = (type: CaptureType) => setDraft((current) => ({ ...current, type, status: STATUS_OPTIONS[type][0].value }));

  const handleSave = async () => {
    const content = draft.content.trim();
    if (!content) return;
    const [relationType, relationId] = draft.relation.split(':');
    const input: CaptureInput = { content, type: draft.type, status: draft.status };
    if (relationType === 'project' && relationId) input.projectId = relationId;
    if (relationType === 'goal' && relationId) input.goalId = relationId;
    if (relationType === 'task' && relationId) input.taskId = relationId;
    const synced = await addCapture(input);
    if (synced) window.localStorage.removeItem(DRAFT_KEY);
    else setSyncPending(true);
    setSaved(true);
  };

  return <div className="micro-capture-layer" role="dialog" aria-modal="true" aria-label="快速记录">
    <button type="button" className="micro-capture-backdrop" aria-label="关闭快速记录" onClick={onClose} />
    <section className="micro-capture-sheet">
      {saved ? <div className="micro-capture-success"><span>✓</span><strong>{syncPending ? '已保留在本地' : '已经留下来了'}</strong><p>{syncPending ? '网络恢复后可以继续提交这条草稿；当前工作台已保留这条事实。' : '这条记录会和当前工作、复盘与后续洞察一起成为上下文。'}</p><button type="button" className="primary-action" onClick={onClose}>继续工作</button></div> : <>
        <header className="micro-capture-header"><div><span className="section-kicker">MICRO CAPTURE</span><h2>留下一条正在发生的事</h2></div><button type="button" className="icon-button" aria-label="关闭快速记录" title="关闭快速记录" onClick={onClose}>×</button></header>
        <div className="capture-type-options" role="group" aria-label="选择记录类型">{TYPE_OPTIONS.map((option) => <button type="button" key={option.value} className={draft.type === option.value ? 'is-selected' : ''} onClick={() => selectType(option.value)}><i>{option.mark}</i><span>{option.label}</span></button>)}</div>
        <div className="capture-composer"><textarea autoFocus value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="刚刚发生了什么？" maxLength={360} /><span>{draft.content.length} / 360</span></div>
        <div className="capture-options-grid"><label><span>现在的状态</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as CaptureStatus }))}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>关联到 <small>可跳过</small></span><select value={draft.relation} onChange={(event) => setDraft((current) => ({ ...current, relation: event.target.value }))}><option value="none">当前工作空间</option>{relationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <footer className="micro-capture-footer"><span>保存后会进入今天的事实与后续洞察。</span><button type="button" className="primary-action" disabled={!draft.content.trim()} onClick={handleSave}>记录下来</button></footer>
      </>}
    </section>
  </div>;
}
