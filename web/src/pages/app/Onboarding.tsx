import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../workspace/useWorkspace';
import type { OnboardingDraft, OnboardingSelection } from '../../workspace/workspaceData';
import {
  createOnboardingCompletionPayload,
  createOnboardingSelection,
  inferOnboardingDraft,
  type OnboardingPreview,
} from './onboardingDraft';
import './Onboarding.css';

type Phase = 'write' | 'review' | 'saved';
type SavedMode = 'workspace' | 'capture';

const ONBOARDING_INPUT_DRAFT_KEY = 'gp_onboarding_input_draft';

function loadInputDraft() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ONBOARDING_INPUT_DRAFT_KEY) ?? '';
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { applyOnboarding, skipOnboarding } = useWorkspace();
  const [phase, setPhase] = useState<Phase>('write');
  const [rawInput, setRawInput] = useState(loadInputDraft);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [selected, setSelected] = useState<OnboardingSelection>(() => createOnboardingSelection(3));
  const [savedMode, setSavedMode] = useState<SavedMode>('workspace');
  const [aiGenerated, setAiGenerated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (rawInput.trim()) {
      window.localStorage.setItem(ONBOARDING_INPUT_DRAFT_KEY, rawInput);
    } else {
      window.localStorage.removeItem(ONBOARDING_INPUT_DRAFT_KEY);
    }
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

  const syncConfirmedContext = async () => {
    if (!draft || !selected.workspace || loading) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/onboarding/context/complete', {
        ...createOnboardingCompletionPayload(draft, selected, rawInput),
      });
      window.localStorage.removeItem(ONBOARDING_INPUT_DRAFT_KEY);
    } catch {
      setError('本地工作台已建立，但云端同步未完成。原话已保存在本机，可稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    if (!draft || !selected.workspace || loading) return;
    applyOnboarding(draft, selected, rawInput);
    setSavedMode('workspace');
    setPhase('saved');
    void syncConfirmedContext();
  };

  const handleCaptureOnly = () => {
    if (!draft || loading) return;
    applyOnboarding(draft, selected, rawInput, true);
    window.localStorage.removeItem(ONBOARDING_INPUT_DRAFT_KEY);
    setSavedMode('capture');
    setPhase('saved');
  };

  const handleReject = () => {
    setDraft(null);
    setError('');
    setPhase('write');
  };

  const handleSkip = () => {
    window.localStorage.removeItem(ONBOARDING_INPUT_DRAFT_KEY);
    skipOnboarding();
    navigate('/app');
  };

  return (
    <main className="workspace-onboarding">
      <div className="onboarding-inner">
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
            onRetry={savedMode === 'workspace' && error ? () => { void syncConfirmedContext(); } : undefined}
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
            detail={`下一步：${draft.project.nextAction}`}
            selected={selected.project}
            onToggle={() => setSelected((current) => ({ ...current, project: !current.project }))}
            disabled={!selected.workspace}
          />
          <ObjectCard
            type="GOAL"
            title={draft.goal.title}
            detail={draft.goal.horizon}
            selected={selected.goal}
            onToggle={toggleGoal}
            disabled={!selected.workspace}
          />
          <ObjectCard
            type="GROWTH PLAN"
            title={draft.plan.title}
            detail={`第 1 周 · ${draft.plan.totalWeeks} 周路线`}
            selected={selected.plan}
            onToggle={() => setSelected((current) => ({ ...current, plan: !current.plan }))}
            disabled={!selected.workspace || !selected.goal}
          />
          <div className="map-children">
            <div className="map-child-group">
              <span className="object-type">TASKS / {draft.tasks.filter((_, index) => selected.tasks[index]).length}</span>
              {draft.tasks.map((task, index) => (
                <ObjectCard
                  key={task.title}
                  type="TASK"
                  title={task.title}
                  detail={task.dueLabel}
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
                detail={draft.learning.durationLabel}
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
      <div className="object-card-copy"><span className="object-type">{type}</span><strong>{title}</strong><small>{detail}</small></div>
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
  draft,
  rawInput,
  selected,
  mode,
  loading,
  error,
  onEnter,
  onRetry,
}: {
  draft: OnboardingDraft;
  rawInput: string;
  selected: OnboardingSelection;
  mode: SavedMode;
  loading: boolean;
  error: string;
  onEnter: () => void;
  onRetry?: () => void;
}) {
  if (mode === 'capture') {
    return (
      <section className="onboarding-content saved-onboarding">
        <span className="saved-symbol">✓</span>
        <span className="section-kicker">ORIGINAL INPUT SAVED</span>
        <h2>原话已记录，方案没有写入</h2>
        <p className="onboarding-lead">这次只保存为一条成长记录。你可以先进入工作台，之后再让 AI 把它整理成项目和行动。</p>
        <blockquote className="onboarding-quote">“ {rawInput} ”</blockquote>
        <button type="button" className="primary-action onboarding-primary" onClick={onEnter}>进入我的成长工作台 <span>→</span></button>
      </section>
    );
  }

  const taskCount = selected.tasks.filter(Boolean).length;
  const summary = [
    { label: '工作空间', value: draft.workspace.name, show: selected.workspace },
    { label: '当前项目', value: draft.project.name, show: selected.project },
    { label: '目标', value: draft.goal.title, show: selected.goal },
    { label: '本周计划', value: draft.plan.title, show: selected.plan },
    { label: '任务', value: `${taskCount} 个已加入`, show: taskCount > 0 },
    { label: '学习入口', value: draft.learning.title, show: selected.learning },
  ].filter((item) => item.show);

  return (
    <section className="onboarding-content saved-onboarding">
      <span className="saved-symbol">✓</span>
      <span className="section-kicker">YOUR WORKSPACE IS READY</span>
      <h2>第一条行动链已经建立</h2>
      <p className="onboarding-lead">「{draft.workspace.name}」已经准备好。首页会读取刚刚确认的项目、计划、任务和学习入口。</p>
      <div className="saved-object-summary">
        {summary.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
      </div>
      {error && <p className="onboarding-error" role="status">{error}</p>}
      {onRetry && <button type="button" className="secondary-action" onClick={onRetry} disabled={loading}>{loading ? '正在重试同步...' : '重试云端同步'}</button>}
      <button type="button" className="primary-action onboarding-primary" onClick={onEnter}>进入我的成长工作台 <span>→</span></button>
    </section>
  );
}
