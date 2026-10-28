import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../workspace/useWorkspace';
import type { OnboardingDraft, OnboardingSelection } from '../../workspace/workspaceData';
import {
  createOnboardingSelection,
  inferOnboardingDraft,
  type OnboardingPreview,
} from './onboardingDraft';
import { captureOwnerId, type CaptureSaveResult } from '../../workspace/captureSync';
import { onboardingInputKey, onboardingRows, ONBOARDING_STATUS_LABELS, type OnboardingSubmission } from '../../workspace/onboardingSync';
import './Onboarding.css';

type Phase = 'write' | 'review' | 'saved';
type SavedMode = 'workspace' | 'capture';

function inputKey() {return onboardingInputKey(captureOwnerId(localStorage.getItem('gp_token')));}
function loadInputDraft() {
  try {return localStorage.getItem(inputKey()) ?? '';} catch {return '';}
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { onboardingSubmission, applyOnboarding, retryOnboarding, addCapture, retryCapture, skipOnboarding } = useWorkspace();
  const [phase, setPhase] = useState<Phase>(onboardingSubmission ? 'saved' : 'write');
  const [rawInput, setRawInput] = useState(() => onboardingSubmission?.rawInput ?? loadInputDraft());
  const [draft, setDraft] = useState<OnboardingDraft | null>(onboardingSubmission?.draft ?? null);
  const [selected, setSelected] = useState<OnboardingSelection>(() => onboardingSubmission?.selected ?? createOnboardingSelection(3));
  const [savedMode, setSavedMode] = useState<SavedMode>('workspace');
  const [aiGenerated, setAiGenerated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captureSaved, setCaptureSaved] = useState<CaptureSaveResult | null>(null);
  const savingRef = useRef(false);
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {if (phase !== 'write') stepRef.current?.focus({preventScroll:true});}, [phase]);

  useEffect(() => {
    if (!rawInput.trim()) return;
    try {localStorage.setItem(inputKey(), rawInput);} catch {setError('浏览器无法保留原话草稿，请保留当前输入后重试。');}
  }, [rawInput]);

  const handlePreview = async () => {
    const input = rawInput.trim();
    if (!input || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.post<OnboardingPreview>('/onboarding/context/preview', { raw_input: input });
      const nextDraft = inferOnboardingDraft(input, result);
      setDraft(nextDraft);
      setSelected(createOnboardingSelection(nextDraft.tasks.length));
      setAiGenerated(result?.ai_generated !== false);
      setPhase('review');
    } catch {
      const nextDraft = inferOnboardingDraft(input);
      setDraft(nextDraft);
      setSelected(createOnboardingSelection(nextDraft.tasks.length));
      setAiGenerated(false);
      setPhase('review');
      setError('AI 暂时没有响应，系统已根据你的原话准备一份最小草稿。');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!draft || !selected.workspace || savingRef.current) return;
    savingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const attempt = applyOnboarding(draft, selected, rawInput);
      setSavedMode('workspace');
      setPhase('saved');
      const result = await attempt;
      setDraft(result.draft); setSelected(result.selected); setRawInput(result.rawInput);
      if (result.saved) localStorage.removeItem(inputKey());
    } catch (cause) {setError(cause instanceof Error ? cause.message : '保存未完成，原话仍在，请重试。');}
    finally {setLoading(false); savingRef.current = false;}
  };

  const handleRetry = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setLoading(true); setError('');
    try {
      if (savedMode === 'capture' && captureSaved) {
        const result = await retryCapture(captureSaved.captureId);
        setCaptureSaved(result);
        if (result.syncState === 'synced') localStorage.removeItem(inputKey());
      } else {
        const result = await retryOnboarding();
        if (result.saved) localStorage.removeItem(inputKey());
      }
    } catch (cause) {setError(cause instanceof Error ? cause.message : '同步未完成，原话仍在。');}
    finally {setLoading(false); savingRef.current = false;}
  };

  const handleCaptureOnly = async () => {
    if (!draft || savingRef.current) return;
    savingRef.current = true; setLoading(true); setError('');
    try {
      const result = await addCapture({content: rawInput, type: 'idea', status: 'noted'});
      setCaptureSaved(result); setSavedMode('capture'); setPhase('saved');
      if (result.syncState === 'synced') localStorage.removeItem(inputKey());
    } catch (cause) {setError(cause instanceof Error ? cause.message : '原话尚未保存，请重试。');}
    finally {setLoading(false); savingRef.current = false;}
  };

  const handleReject = () => {
    setDraft(null);
    setError('');
    setPhase('write');
  };

  const handleSkip = () => {
    skipOnboarding();
    navigate('/app');
  };

  return (
    <main className="workspace-onboarding">
      <div className="onboarding-inner" ref={stepRef} tabIndex={-1} aria-label={phase === 'review' ? '审阅工作空间方案' : '工作空间保存结果'}>
        <header className="onboarding-top">
          <div className="onboarding-brand">
            <span className="brand-mark">GP</span>
            <span><strong>GrowthPilot</strong><small>AI Personal Workspace</small></span>
          </div>
          <button type="button" className="quiet-link" onClick={handleSkip}>稍后再说 →</button>
        </header>

        {phase === 'write' && (
          <WritePhase
            rawInput={rawInput}
            setRawInput={setRawInput}
            loading={loading}
            error={error}
            onPreview={handlePreview}
          />
        )}
        {phase === 'review' && draft && (
          <ReviewPhase
            draft={draft}
            rawInput={rawInput}
            aiGenerated={aiGenerated}
            selected={selected}
            setSelected={setSelected}
            loading={loading}
            error={error}
            onBack={() => { setError(''); setPhase('write'); }}
            onReject={handleReject}
            onComplete={handleComplete}
            onCapture={handleCaptureOnly}
          />
        )}
        {phase === 'saved' && draft && (
          <SavedPhase
            draft={draft}
            rawInput={rawInput}
            selected={selected}
            mode={savedMode}
            loading={loading}
            error={error}
            onEnter={() => navigate('/app')}
            submission={onboardingSubmission}
            captureSaved={captureSaved}
            onRetry={savedMode === 'workspace' && (!onboardingSubmission?.saved || error) || savedMode === 'capture' && captureSaved?.syncState !== 'synced' ? () => {void handleRetry();} : undefined}
          />
        )}
      </div>
    </main>
  );
}

function WritePhase({
  rawInput,
  setRawInput,
  loading,
  error,
  onPreview,
}: {
  rawInput: string;
  setRawInput: (value: string) => void;
  loading: boolean;
  error: string;
  onPreview: () => void;
}) {
  return (
    <section className="onboarding-content write-onboarding">
      <span className="section-kicker">FIRST WORKSPACE / 01</span>
      <h2>欢迎来到个人成长计划，<br />让我们带你进入新的里程</h2>
      <p className="onboarding-lead">先说说你现在正在做什么、想往哪里走。GrowthPilot 会把这句话变成一个可以直接开始工作的空间。</p>
      <div className="onboarding-input-box">
        <div className="onboarding-input-head"><strong>从现在开始说起</strong><span>{rawInput.length} / 2000</span></div>
        <textarea
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          maxLength={2000}
          placeholder="例如：我想把一个产品做出来，也想恢复稳定学习和运动的节奏。"
          aria-label="描述当前工作、目标、学习方向或阻塞"
          autoFocus
        />
        <div className="input-footnote"><span className="hint-dot" />你的原话会先作为草稿保留，确认后才创建工作对象。</div>
      </div>
      <div className="onboarding-what"><span>你可以提到</span><strong>正在做的事 · 想解决的问题 · 想养成的节奏 · 希望学会的东西</strong></div>
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      <button type="button" className="primary-action onboarding-primary" onClick={onPreview} disabled={!rawInput.trim() || loading}>
        {loading ? '正在理解你的方向...' : '生成我的工作空间'}<span>→</span>
      </button>
    </section>
  );
}

function ReviewPhase({
  draft,
  rawInput,
  aiGenerated,
  selected,
  setSelected,
  loading,
  error,
  onBack,
  onReject,
  onComplete,
  onCapture,
}: {
  draft: OnboardingDraft;
  rawInput: string;
  aiGenerated: boolean;
  selected: OnboardingSelection;
  setSelected: Dispatch<SetStateAction<OnboardingSelection>>;
  loading: boolean;
  error: string;
  onBack: () => void;
  onReject: () => void;
  onComplete: () => void;
  onCapture: () => void;
}) {
  const toggleWorkspace = () => setSelected((current) => current.workspace
    ? { workspace: false, project: false, goal: false, plan: false, tasks: current.tasks.map(() => false), learning: false }
    : { ...current, workspace: true });
  const toggleGoal = () => setSelected((current) => current.goal
    ? { ...current, goal: false, plan: false }
    : { ...current, goal: true });
  const toggleTask = (index: number) => setSelected((current) => ({
    ...current,
    tasks: current.tasks.map((item, itemIndex) => itemIndex === index ? !item : item),
  }));

  return (
    <section className="onboarding-content review-onboarding">
      <span className="section-kicker">AI WORKSPACE MAP / 02</span>
      <h2>我先把这句话变成<br />一张可以工作的地图</h2>
      <p className="onboarding-lead">{aiGenerated ? '这些是即将写入工作台的对象。取消选择的内容不会被创建。' : 'AI 暂时没有完成分析，下面是直接从你的原话生成的最小起点。'}</p>
      <blockquote className="onboarding-quote">“ {rawInput} ”</blockquote>

      <div className="object-map">
        <ObjectCard type="WORKSPACE" title={draft.workspace.name} detail={draft.workspace.description} selected={selected.workspace} onToggle={toggleWorkspace} />
        <div className="map-branch">
          <span className="branch-line" />
          <ObjectCard
            type="PROJECT"
            title={draft.project.name}
            detail={`${draft.project.description} · 下一步：${draft.project.nextAction}`}
            selected={selected.project}
            onToggle={() => setSelected((current) => ({ ...current, project: !current.project }))}
            disabled={!selected.workspace}
          />
          <ObjectCard
            type="GOAL"
            title={draft.goal.title}
            detail={`${draft.goal.horizon} · ${draft.goal.description}${selected.project ? ` · 项目：${draft.project.name}` : ''}`}
            selected={selected.goal}
            onToggle={toggleGoal}
            disabled={!selected.workspace}
          />
          <ObjectCard
            type="GROWTH PLAN"
            title={draft.plan.title}
            detail={`${draft.plan.totalWeeks} 周 · ${draft.plan.description} · 目标：${draft.goal.title} · 里程碑：${draft.plan.milestones.join(' → ')}`}
            selected={selected.plan}
            onToggle={() => setSelected((current) => ({ ...current, plan: !current.plan }))}
            disabled={!selected.workspace || !selected.goal}
          />
          <div className="map-children">
            <div className="map-child-group">
              <span className="object-type">TASKS / {draft.tasks.filter((_, index) => selected.tasks[index]).length}</span>
              {draft.tasks.map((task, index) => (
                <ObjectCard
                  key={index}
                  type="TASK"
                  title={task.title}
                  detail={`${task.dueLabel} · ${task.description}${selected.goal ? ` · 目标：${draft.goal.title}` : ''}${selected.plan && selected.goal ? ` · 计划：${draft.plan.title}` : ''}`}
                  selected={selected.tasks[index] ?? false}
                  onToggle={() => toggleTask(index)}
                  disabled={!selected.workspace}
                  compact
                />
              ))}
            </div>
            <div className="map-child-group">
              <span className="object-type">LEARNING</span>
              <ObjectCard
                type="LEARNING"
                title={draft.learning.title}
                detail={`预计 ${draft.learning.durationLabel} · ${draft.learning.summary}${selected.goal ? ` · 目标：${draft.goal.title}` : ''}`}
                selected={selected.learning}
                onToggle={() => setSelected((current) => ({ ...current, learning: !current.learning }))}
                disabled={!selected.workspace}
                compact
              />
            </div>
          </div>
        </div>
      </div>

      {error && <p className="onboarding-error" role="status">{error}</p>}
      {!selected.workspace && <p className="onboarding-selection-note">工作对象必须归属一个 Workspace。你可以重新保留它，或只记录原话。</p>}
      <div className="review-actions">
        <button type="button" className="danger-action" onClick={onReject} disabled={loading}>放弃方案</button>
        <button type="button" className="secondary-action" onClick={onBack}>用一句话纠正</button>
        <button type="button" className="secondary-action" onClick={onCapture} disabled={loading}>只记录原话</button>
        <button type="button" className="primary-action" onClick={onComplete} disabled={loading || !selected.workspace}>
          {loading ? '正在建立...' : '确认并进入工作台'}<span>→</span>
        </button>
      </div>
    </section>
  );
}

function ObjectCard({
  type,
  title,
  detail,
  selected,
  onToggle,
  compact = false,
  disabled = false,
}: {
  type: string;
  title: string;
  detail: string;
  selected: boolean;
  onToggle: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const classes = ['object-card', compact ? 'compact' : '', selected ? 'is-selected' : 'is-muted', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <span className="object-card-bar" />
      <div className="object-card-copy"><span className="object-type">{type}</span><strong>{title}</strong><details><summary>查看内容</summary><small>{detail}</small></details></div>
      <button
        type="button"
        className={selected ? 'object-toggle is-selected' : 'object-toggle'}
        onClick={onToggle}
        disabled={disabled}
        title={`${selected ? '忽略' : '保留'} ${title}`}
        aria-label={`${selected ? '忽略' : '保留'} ${title}`}
      >
        {selected ? '✓' : '−'}
      </button>
    </div>
  );
}

function SavedPhase({
  draft, rawInput, mode, loading, error, onEnter, onRetry, submission, captureSaved,
}: {
  draft: OnboardingDraft;
  rawInput: string;
  selected: OnboardingSelection;
  mode: SavedMode;
  loading: boolean;
  error: string;
  onEnter: () => void;
  onRetry?: () => void;
  submission: OnboardingSubmission | null;
  captureSaved: CaptureSaveResult | null;
}) {
  const synced = mode === 'capture' ? captureSaved?.syncState === 'synced' : submission?.saved === true;
  const rows = submission ? onboardingRows(submission) : [];
  const savedCount = rows.filter(row => row.status === 'synced').length;
  return <section className="onboarding-content saved-onboarding">
    <span className="saved-symbol">{synced ? '✓' : '↗'}</span>
    <span className="section-kicker">{synced ? 'YOUR WORKSPACE IS READY' : 'YOUR ORIGINAL WORDS ARE KEPT'}</span>
    <h2>{mode === 'capture' ? synced ? '原话已同步' : '原话已保留' : synced ? '第一条行动链已完整保存' : loading ? '正在逐项保存你的方案' : '方案已保留，继续完成保存'}</h2>
    <p className="onboarding-lead">{mode === 'capture' ? '这次只保存原话，没有创建方案中的工作对象。' : synced ? `「${draft.workspace.name}」的项目、计划、任务和学习入口可在工作台继续查看。` : `已保存 ${savedCount} / ${rows.length} 项。原话和确认方案保留在本机；刷新可恢复，重试只处理未完成项。`}</p>
    <blockquote className="onboarding-quote">“ {rawInput} ”</blockquote>
    {mode === 'workspace' && <div className="onboarding-save-list" aria-live="polite">{rows.map(row => <article key={row.key} className="onboarding-save-row">
      <div><span className="object-type">{row.label}</span><strong>{row.title}</strong><details><summary>查看内容与关联</summary><p>{row.detail}</p>{row.key !== 'workspace' && <p>归属：{draft.workspace.name}{row.key === 'plan' ? ` · 目标：${draft.goal.title}` : ''}</p>}</details>{row.error && <p className="onboarding-row-error">{row.error}</p>}</div>
      <span className={`onboarding-save-status ${row.status}`}>{ONBOARDING_STATUS_LABELS[row.status]}</span>
    </article>)}</div>}
    {(error || submission?.error && mode === 'workspace' || captureSaved?.error && mode === 'capture') && <p className="onboarding-error" role="alert">{error || (mode === 'workspace' ? submission?.error : captureSaved?.error)}</p>}
    <div className="review-actions">{onRetry && <button type="button" className="secondary-action" onClick={onRetry} disabled={loading}>{loading ? '正在保存…' : '重试未完成项'}</button>}<button type="button" className="primary-action" onClick={onEnter} disabled={loading}>{synced ? '进入我的成长工作台' : '先查看工作台'} <span>→</span></button></div>
  </section>;
}
