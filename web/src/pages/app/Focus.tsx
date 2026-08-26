import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../workspace/useWorkspace';
import './Focus.css';

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function Focus() {
  const {
    state,
    activeFocus,
    activeTasks,
    activeProjects,
    activeGoals,
    activeWorkspace,
    addCapture,
    pauseFocus,
    resumeFocus,
    completeFocus,
    exitFocus,
  } = useWorkspace();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [captureText, setCaptureText] = useState('');
  const [captureSaved, setCaptureSaved] = useState(false);

  useEffect(() => {
    if (!activeFocus || activeFocus.status !== 'active') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeFocus]);

  const task = useMemo(() => activeFocus ? activeTasks.find((item) => item.id === activeFocus.taskId) : undefined, [activeFocus, activeTasks]);
  const project = task?.projectId ? activeProjects.find((item) => item.id === task.projectId) : undefined;
  const goal = task?.goalId ? activeGoals.find((item) => item.id === task.goalId) : undefined;
  const elapsedSeconds = activeFocus
    ? activeFocus.elapsedSeconds + (activeFocus.status === 'active' && activeFocus.startedAt ? Math.max(0, Math.floor((now - activeFocus.startedAt) / 1000)) : 0)
    : 0;
  const remainingSeconds = activeFocus ? Math.max(0, activeFocus.targetSeconds - elapsedSeconds) : 0;
  const progress = activeFocus ? Math.min(100, Math.round((elapsedSeconds / activeFocus.targetSeconds) * 100)) : 0;
  const progressStyle = { '--focus-progress': `${progress}%` } as CSSProperties;

  const leaveFocus = () => {
    exitFocus();
    navigate('/app/tasks');
  };

  const finishFocus = () => {
    completeFocus();
    navigate('/app/tasks');
  };

  const saveCapture = () => {
    const content = captureText.trim();
    if (!content || !task) return;
    addCapture({ content, type: 'progress', status: 'moving', taskId: task.id, projectId: task.projectId, goalId: task.goalId });
    setCaptureText('');
    setCaptureSaved(true);
    window.setTimeout(() => setCaptureSaved(false), 2600);
  };

  if (!activeFocus || !task) {
    const hasOtherWorkspaceFocus = Boolean(state.focusSession && state.focusSession.workspaceId !== activeWorkspace.id);
    return (
      <main className="focus-page focus-empty-page">
        <div className="focus-empty-mark">○</div>
        <span className="section-kicker">FOCUS</span>
        <h1>{hasOtherWorkspaceFocus ? '另一个工作空间正在专注' : '现在没有进行中的 Focus'}</h1>
        <p>{hasOtherWorkspaceFocus ? '先完成或退出另一个工作空间的专注任务，再开始新的 Focus。' : '从任务队列挑一件下一步，给它一段不被打断的时间。'}</p>
        <Link to="/app/tasks" className="primary-action">回到任务队列</Link>
      </main>
    );
  }

  return (
    <main className="focus-page">
      <header className="focus-topbar">
        <Link to="/app/tasks" className="focus-brand" aria-label="回到任务队列" title="回到任务队列">
          <span className="focus-brand-mark">GP</span>
          <span>GrowthPilot</span>
        </Link>
        <span className="focus-workspace">{activeWorkspace.name}</span>
        <button type="button" className="focus-exit-link" onClick={leaveFocus}>退出 Focus</button>
      </header>

      <section className="focus-stage" aria-label="Focus 专注执行">
        <div className="focus-stage-kicker"><span className="focus-live-dot" />FOCUS 执行态</div>
        <div className="focus-context">
          <span>{project?.name ?? '当前工作空间'}</span>
          {goal && <><i /> <span>{goal.title}</span></>}
        </div>
        <h1>{task.title}</h1>
        <p className="focus-task-description">{task.description}</p>

        <div className="focus-clock-wrap">
          <div className="focus-clock" aria-live="polite">{formatDuration(remainingSeconds)}</div>
          <span className="focus-clock-label">{remainingSeconds === 0 ? '这段时间已到，是否完成任务？' : '剩余时间'}</span>
        </div>

        <div className="focus-progress-row">
          <div className="focus-progress-track"><span style={progressStyle} /></div>
          <span>{formatDuration(elapsedSeconds)} / {formatDuration(activeFocus.targetSeconds)}</span>
        </div>

        <div className="focus-actions">
          {activeFocus.status === 'active' ? <button type="button" className="focus-secondary-action" onClick={pauseFocus}><span aria-hidden="true">Ⅱ</span>暂停</button> : <button type="button" className="focus-secondary-action" onClick={resumeFocus}><span aria-hidden="true">▶</span>继续</button>}
          <button type="button" className="focus-complete-action" onClick={finishFocus}><span aria-hidden="true">✓</span>完成任务</button>
        </div>

        <div className="focus-capture">
          <div className="focus-capture-heading"><div><span className="section-kicker">MICRO CAPTURE</span><strong>想到什么，先留一句</strong></div><span>{captureSaved ? '已记录' : '可选'}</span></div>
          <div className="focus-capture-form">
            <input value={captureText} onChange={(event) => setCaptureText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveCapture(); }} placeholder="例如：已经确认首页应该先展示下一步" maxLength={180} aria-label="记录当前进展" />
            <button type="button" className="focus-capture-submit" onClick={saveCapture} disabled={!captureText.trim()} title="保存进展" aria-label="保存进展">→</button>
          </div>
          <small>会自动关联到「{task.title}」，并进入今天的事实流。</small>
        </div>
      </section>
    </main>
  );
}
