import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { captureOwnerId, CAPTURE_SYNC_LABELS, type CaptureSaveResult } from '../../workspace/captureSync';
import type { CaptureInput, CaptureStatus, CaptureType } from '../../workspace/workspaceData';
import { useWorkspace } from '../../workspace/useWorkspace';
import './MicroCapture.css';
import Modal from '../../components/Modal';

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
  clientRequestId: string;
  content: string;
  type: CaptureType;
  status: CaptureStatus;
  relation: string;
}

function emptyDraft(): Draft { return {clientRequestId: crypto.randomUUID(), content: '', type: 'idea', status: 'noted', relation: 'none'}; }

function loadDraft(key: string): Draft {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const type = TYPE_OPTIONS.some((option) => option.value === parsed.type) ? parsed.type as CaptureType : 'idea';
    const status = STATUS_OPTIONS[type].some((option) => option.value === parsed.status) ? parsed.status as CaptureStatus : STATUS_OPTIONS[type][0].value;
    return {clientRequestId: parsed.clientRequestId ?? crypto.randomUUID(), content: parsed.content ?? '', type, status, relation: parsed.relation ?? 'none'};
  } catch {
    return emptyDraft();
  }
}

export default function MicroCapture({ onClose }: { onClose: () => void }) {
  const { activeWorkspace, activeProjects, activeGoals, activeTasks, addCapture, retryCapture } = useWorkspace();
  const navigate = useNavigate();
  const draftKey = `${DRAFT_KEY}:${captureOwnerId(localStorage.getItem('gp_token')) ?? 'local'}:${activeWorkspace.id}`;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(draftKey));
  const [saved, setSaved] = useState<CaptureSaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => {if (saved) successRef.current?.focus();}, [saved]);
  const statusOptions = STATUS_OPTIONS[draft.type];
  const relationOptions = useMemo(() => [
    ...activeProjects.map((project) => ({ value: `project:${project.id}`, label: `项目 · ${project.name}` })),
    ...activeGoals.map((goal) => ({ value: `goal:${goal.id}`, label: `目标 · ${goal.title}` })),
    ...activeTasks.filter((task) => task.status !== 'done').slice(0, 8).map((task) => ({ value: `task:${task.id}`, label: `任务 · ${task.title}` })),
  ], [activeGoals, activeProjects, activeTasks]);

  useEffect(() => {
    if (saved) return;
    try {
      if (!draft.content.trim() && draft.relation === 'none') window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch { setError('浏览器存储暂不可用，请保留输入后重试。'); }
  }, [draft, draftKey, saved]);

  const selectType = (type: CaptureType) => setDraft((current) => ({ ...current, type, status: STATUS_OPTIONS[type][0].value }));

  const handleSave = async () => {
    const content = draft.content.trim();
    if (!content || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    const [relationType, relationId] = draft.relation.split(':');
    const input: CaptureInput = {content, type: draft.type, status: draft.status, clientRequestId: draft.clientRequestId};
    if (relationType === 'project' && relationId) input.projectId = relationId;
    if (relationType === 'goal' && relationId) input.goalId = relationId;
    if (relationType === 'task' && relationId) input.taskId = relationId;
    try {
      const result = await addCapture(input);
      setSaved(result);
      // The durable queue now owns the original, including offline records.
      try {window.localStorage.removeItem(draftKey);} catch { /* Preserve the draft if removal is unavailable. */ }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '记录未保存，输入仍在，请稍后重试。');
    } finally {savingRef.current = false; setSaving(false);}
  };

  const handleRetry = async () => {
    if (!saved || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {setSaved(await retryCapture(saved.captureId));}
    catch (retryError) {setError(retryError instanceof Error ? retryError.message : '暂时无法同步，原文仍保留。');}
    finally {savingRef.current = false; setSaving(false);}
  };

  return <Modal className="micro-capture-layer" label="快速记录" onClose={onClose}>
    <button type="button" className="micro-capture-backdrop" aria-label="关闭快速记录" aria-hidden="true" tabIndex={-1} onClick={onClose} />
    <section className="micro-capture-sheet">
      {saved ? <div className="micro-capture-success" role="status" ref={successRef} tabIndex={-1}><span>✓</span><strong>{saving ? '同步中' : CAPTURE_SYNC_LABELS[saved.syncState]}</strong><p>{saved.syncState === 'synced' ? '原文与来源已保存，可以在数据页回看。' : '原文已保留在此浏览器。刷新后仍可在数据页找到同一条记录。'}</p>{saved.error && <p>{saved.error}</p>}{error && <p role="alert">{error}</p>}<div className="capture-result-actions">{saved.syncState !== 'synced' && saved.syncState !== 'local' && <button className="outline-action" type="button" disabled={saving} onClick={handleRetry}>{saving ? '正在同步…' : '重试同步'}</button>}<button type="button" className="primary-action" onClick={() => {onClose(); navigate('/app/data');}}>查看这条记录</button><button className="text-button" type="button" onClick={onClose}>继续工作</button></div></div> : <>
        <header className="micro-capture-header"><div><span className="section-kicker">MICRO CAPTURE</span><h2>留下一条正在发生的事</h2></div><button type="button" className="icon-button" aria-label="关闭快速记录" title="关闭快速记录" onClick={onClose}>×</button></header>
        <div className="capture-type-options" role="group" aria-label="选择记录类型">{TYPE_OPTIONS.map((option) => <button type="button" key={option.value} aria-pressed={draft.type === option.value} className={draft.type === option.value ? 'is-selected' : ''} onClick={() => selectType(option.value)}><i>{option.mark}</i><span>{option.label}</span></button>)}</div>
        <div className="capture-composer"><textarea aria-label="记录原文" autoFocus disabled={saving} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="刚刚发生了什么？" maxLength={360} /><span>{draft.content.length} / 360</span></div>
        <div className="capture-options-grid"><label><span>现在的状态</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as CaptureStatus }))}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>关联到 <small>可跳过</small></span><select value={draft.relation} onChange={(event) => setDraft((current) => ({ ...current, relation: event.target.value }))}><option value="none">当前工作空间</option>{relationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        {error && <p className="capture-save-error" role="alert">{error}</p>}<footer className="micro-capture-footer"><span>{saving ? '原文已保留，正在确认同步结果…' : '先保留原文，再同步到当前工作空间。'}</span><button type="button" className="primary-action" disabled={saving || !draft.content.trim()} onClick={handleSave}>{saving ? '正在保存…' : '记录下来'}</button></footer>
      </>}
    </section>
  </Modal>;
}
