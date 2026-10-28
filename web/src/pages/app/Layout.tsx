import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { useWorkspace } from '../../workspace/useWorkspace';
import { ExecutionProvider } from '../../execution/ExecutionContext';
import { PersonalProvider } from '../../personal/PersonalProvider';
import { usePersonal } from '../../personal/usePersonal';
import MicroCapture from './MicroCapture';
import Focus from './Focus';
import Modal from '../../components/Modal';
import CoreNavigation from '../../components/CoreNavigation';
import WorkspaceSetup from '../../components/WorkspaceSetup';
import useCompactLayout from '../../components/useCompactLayout';
import { NAV_GROUPS } from '../../workspace/navigation';
import {captureOwnerId} from '../../workspace/captureSync';
import {isPersonalKnowledgeRoute} from '../../learning/knowledgeNavigation';
import './Layout.css';

const PAGE_TITLES: Record<string, string> = {
  '/app': '今日',
  '/app/workspace': '工作台',
  '/app/data': '我的数据',
  '/app/agent': '个人 Agent',
  '/app/tasks': '工作',
  '/app/learning': '学习',
  '/app/growth': '成长计划',
  '/app/source-to-learning': '从资料建立学习',
  '/app/knowledge': '我的知识库',
  '/app/knowledge/sources': '个人资料',
  '/app/knowledge/summaries': '总结与成果',
  '/app/knowledge/cards': '知识卡与捕获',
  '/app/apps': '应用中心',
  '/app/extensions': '扩展能力',
  '/app/insights': '分析',
  '/app/mine': '我的',
  '/app/execution': '执行与应用',
  '/app/morning': '晨间启动',
  '/app/evening': '晚间复盘',
  '/app/onboarding': '建立你的工作空间',
};

type CommandAction =
  | { kind: 'task'; title: string; description: string; dueLabel: string }
  | { kind: 'capture'; content: string; type: 'progress' | 'decision' | 'emotion' | 'idea' | 'learning'; status: 'moving' | 'done' | 'blocked' | 'decided' | 'noted' | 'calm' | 'energized' | 'tired' };

type CommandPreview = {
  rawInput: string;
  action: CommandAction;
};

const CAPTURE_TYPE_LABELS: Record<Extract<CommandAction, { kind: 'capture' }>['type'], string> = {
  progress: '进展',
  decision: '决定',
  emotion: '感受',
  idea: '想法',
  learning: '学习',
};

function inferCommand(input: string): CommandAction | null {
  const value = input.trim();
  if (!value) return null;

  const captureMatch = value.match(/^(记录|记下|捕获)(?:\s*[:：]?\s*)(?:(进展|决定|情绪|感受|学习|想法)\s*[:：]?\s*)?(.+)$/);
  if (captureMatch) {
    const [, , typeLabel, content] = captureMatch;
    const type = typeLabel === '进展'
      ? 'progress'
      : typeLabel === '决定'
        ? 'decision'
        : typeLabel === '情绪' || typeLabel === '感受'
          ? 'emotion'
          : typeLabel === '学习'
            ? 'learning'
            : 'idea';
    const status = type === 'progress' ? 'moving' : type === 'decision' ? 'decided' : 'noted';
    return { kind: 'capture', content: content.trim(), type, status };
  }

  if (/^(记录|记下|捕获)\s*$/.test(value)) return null;
  return {
    kind: 'task',
    title: value,
    description: '由快捷输入 确认创建。',
    dueLabel: '待安排',
  };
}

export default function Layout() {
  const location=useLocation();
  const [owner,setOwner]=useState(()=>captureOwnerId(localStorage.getItem('gp_token')));
  useEffect(()=>{const check=()=>setOwner(captureOwnerId(localStorage.getItem('gp_token')));const timer=setInterval(check,1000);window.addEventListener('storage',check);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('storage',check);window.removeEventListener('focus',check);};},[]);
  if(!owner)return <Navigate to={`/login?next=${encodeURIComponent(location.pathname+location.search+location.hash)}`} replace />;
  return (
    <WorkspaceProvider key={owner}>
      <ExecutionProvider><PersonalProvider><WorkspaceShell /></PersonalProvider></ExecutionProvider>
    </WorkspaceProvider>
  );
}

function WorkspaceShell() {
  const { activeWorkspace, state, setActiveWorkspace, addCapture, onboardingSubmission, hydrationStatus, retryHydration } = useWorkspace();
  const personal = usePersonal();
  const location = useLocation();
  const compact = useCompactLayout();
  const mainRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const activityRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [pendingCommand, setPendingCommand] = useState<CommandPreview | null>(null);
  const [commandSaving, setCommandSaving] = useState(false);
  const commandSavingRef = useRef(false);
  const [commandError, setCommandError] = useState('');
  const navigate = useNavigate();
  const pageTitle = useMemo(() => PAGE_TITLES[location.pathname] ?? (location.pathname.startsWith('/app/learn/') ? '学习过程' : location.pathname.startsWith('/app/tasks/') ? '工作正文' : location.pathname.startsWith('/app/projects/') ? '项目详情' : 'GrowthPilot'), [location.pathname]);
  const workspaceUnavailable = hydrationStatus === 'empty' || (hydrationStatus === 'error' && !/^[\da-f-]{36}$/i.test(activeWorkspace.id));
  const checkingInitialWorkspace = hydrationStatus === 'loading' && !/^[\da-f-]{36}$/i.test(activeWorkspace.id);
  const personalKnowledge = isPersonalKnowledgeRoute(location.pathname);

  useEffect(() => {
    const token = localStorage.getItem('gp_token');
    if (!token) navigate('/login', { replace: true });
    if (token && !personalKnowledge && hydrationStatus === 'empty' && !state.onboardingCompleted && !onboardingSubmission && location.pathname !== '/app/onboarding') {
      navigate('/app/onboarding', { replace: true });
    }
  }, [navigate, location.pathname, state.onboardingCompleted, onboardingSubmission, personalKnowledge, hydrationStatus]);

  useEffect(() => {
    setSidebarOpen(false);
    setActivityOpen(false);
    setPendingCommand(null);
    if (previousPath.current !== location.pathname) {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !compact && !document.querySelector('dialog[open]')) {
        event.preventDefault(); commandRef.current?.focus();
      }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (activityOpen) activityRef.current?.focus();
        if (pendingCommand) commandRef.current?.focus();
        setActivityOpen(false); setPendingCommand(null);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [compact, activityOpen, pendingCommand]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('capture') === '1') setCaptureOpen(true);
  }, [location.search]);

  const handleLogout = () => {
    localStorage.removeItem('gp_token');
    navigate('/login', { replace: true });
  };

  const submitCommand = (inputValue: string) => {
    if (workspaceUnavailable || checkingInitialWorkspace) return;
    if (commandSavingRef.current) return;
    const value = inputValue.trim();
    if (!value) {
      setCommandError('先输入一句想推进或记录的内容。');
      return;
    }
    const action = inferCommand(value);
    if (!action) {
      setCommandError('没有识别到可执行内容，原文已保留，请补充后再试。');
      return;
    }
    setCommandError('');
    setPendingCommand({ rawInput: value, action });
  };

  const handleCommand = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitCommand(command);
  };

  const confirmCommand = async () => {
    if (!pendingCommand || commandSavingRef.current || workspaceUnavailable || checkingInitialWorkspace) return;
    commandSavingRef.current = true; setCommandSaving(true);
    try {
      if (pendingCommand.action.kind === 'capture') {
        await addCapture({
          content: pendingCommand.action.content,
          type: pendingCommand.action.type,
          status: pendingCommand.action.status,
        });
      } else {
        const id = crypto.randomUUID();
        if (!personal.edit({kind: 'task', entityId: id, baseVersion: 0, updatedAt: null, create: true,
          data: {title: pendingCommand.action.title, body: '', criterion: '', resources: [], outcome: '', status: 'todo', due_at: null}})) throw new Error('草稿暂未保存');
        navigate(`/app/tasks/${id}`);
      }
      setCommand('');
      setPendingCommand(null);
      setCommandError('');
      if (pendingCommand.action.kind === 'capture') navigate('/app/data');
    } catch {
      setCommand(pendingCommand.rawInput);
      setCommandError('执行没有完成，原文已保留，请稍后重试。');
    } finally {commandSavingRef.current = false; setCommandSaving(false);}
  };

  const updateCommand = (value: string) => {
    if (commandSavingRef.current) return;
    setCommand(value);
    setPendingCommand(null);
    setCommandError('');
  };

  if (location.pathname === '/app/focus' && !workspaceUnavailable && !checkingInitialWorkspace) return <Focus />;
  if (location.pathname === '/app/onboarding') return <Outlet />;

  const sidebar = (<aside className="workspace-sidebar is-open">
        <div className="sidebar-brand">
          <NavLink to="/app" className="brand-link">
            <span className="brand-mark">GP</span>
            <span>
              <strong>GrowthPilot</strong>
              <small>个人成长工作台</small>
            </span>
          </NavLink>
        </div>

        <div className="workspace-switcher">
          <span className="sidebar-overline">当前空间</span>
          <select value={workspaceUnavailable ? '' : activeWorkspace.id} disabled={workspaceUnavailable || checkingInitialWorkspace} onChange={(event) => setActiveWorkspace(event.target.value)} aria-label="切换工作空间">
            {workspaceUnavailable ? <option value="">尚未建立工作空间</option> : state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
          {!workspaceUnavailable && <span className="workspace-description">{activeWorkspace.description}</span>}
        </div>

        <nav className="workspace-nav" aria-label="主导航">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => isActive ? 'workspace-nav-link is-active' : 'workspace-nav-link'}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.label === '待办' && !workspaceUnavailable && !checkingInitialWorkspace && <span className="nav-count">{state.tasks.filter((task) => task.workspaceId === activeWorkspace.id && task.status !== 'done').length}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="user-avatar">Z</span>
            <span className="sidebar-user-copy"><strong>成长者</strong><small>Web Workspace</small></span>
            <button type="button" className="icon-button sidebar-logout" onClick={handleLogout} title="退出登录" aria-label="退出登录">↪</button>
          </div>
        </div>
      </aside>);

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">跳到主要内容</a>
      {!compact && sidebar}
      {compact && sidebarOpen && <Modal label="主导航" className="navigation-dialog" onClose={() => setSidebarOpen(false)}><button className="icon-button drawer-close" autoFocus aria-label="关闭导航" onClick={() => setSidebarOpen(false)}>×</button>{sidebar}</Modal>}

      <div className="workspace-main">
        <header className="workspace-topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} title="打开导航" aria-label="打开导航" aria-expanded={sidebarOpen} aria-haspopup="dialog">☰</button>
          <div className="topbar-heading">
            <span className="topbar-context">{personalKnowledge ? '我的知识库' : workspaceUnavailable ? '你的个人成长工作台' : activeWorkspace.name}</span>
            <h1>{pageTitle}</h1>
          </div>
          <NavLink className="outline-action" to="/app/agent">AI 助手</NavLink>
          <div className="command-area">
            <form className="command-bar" onSubmit={handleCommand}>
              <span className="command-icon" aria-hidden="true">⌘</span>
              <input ref={commandRef} disabled={workspaceUnavailable || checkingInitialWorkspace} value={command} onChange={(event) => updateCommand(event.target.value)} placeholder={workspaceUnavailable ? '先建立你的工作空间' : '记录此刻，或添加一个待办...'} aria-label="快捷输入" aria-describedby={commandError ? 'command-error' : undefined} />
              <kbd>⌘ K</kbd>
              <button type="submit" disabled={workspaceUnavailable || checkingInitialWorkspace} className="command-submit" title="预览快捷操作" aria-label="预览快捷操作">→</button>
            </form>
            {commandError && <p className="command-error" id="command-error" role="alert">{commandError}</p>}
            {pendingCommand && !workspaceUnavailable && !checkingInitialWorkspace && <CommandPreviewCard preview={pendingCommand} saving={commandSaving} onConfirm={confirmCommand} onReject={() => {setPendingCommand(null); commandRef.current?.focus();}} onEdit={() => {setPendingCommand(null); commandRef.current?.focus();}} />}
          </div>
          <div className="topbar-actions">
            <button type="button" ref={activityRef} disabled={workspaceUnavailable || checkingInitialWorkspace} aria-expanded={activityOpen && !workspaceUnavailable} aria-controls="activity-popover" className={activityOpen ? 'icon-button is-selected' : 'icon-button'} onClick={() => setActivityOpen((open) => !open)} title="打开活动中心" aria-label="打开活动中心">
              ◔{!workspaceUnavailable && !checkingInitialWorkspace && <span className="notification-dot" />}
            </button>
            <button type="button" className="topbar-user" onClick={() => navigate('/app/mine')} title="打开我的">
              <span className="user-avatar small">Z</span>
              <span>成长者</span>
            </button>
          </div>
          {activityOpen && !workspaceUnavailable && !checkingInitialWorkspace && <ActivityPopover onClose={() => {setActivityOpen(false); activityRef.current?.focus();}} />}
        </header>

        <main className="workspace-content" id="workspace-content" ref={mainRef} tabIndex={-1} aria-label={pageTitle}>
          {!personalKnowledge && hydrationStatus !== 'ready' && <div className={`workspace-sync-banner ${hydrationStatus === 'loading' ? 'is-loading' : ''}`} role={hydrationStatus === 'loading' ? 'status' : 'alert'}><span>{hydrationStatus === 'loading' ? '正在核对云端工作空间，当前显示浏览器保留内容。' : hydrationStatus === 'partial' ? '部分云端数据未能读取，当前内容可能不完整。原文与未同步提交仍保留。' : hydrationStatus === 'empty' ? '尚无云端工作空间，请先建立你的工作空间。' : '云端工作空间暂时无法读取，当前显示浏览器保留内容，可能包含初始示例。'}</span>{hydrationStatus === 'empty' ? <NavLink to="/app/onboarding">建立工作空间 →</NavLink> : hydrationStatus !== 'loading' && <button onClick={retryHydration}>重新读取云端</button>}</div>}
          {onboardingSubmission && !onboardingSubmission.saved && <div className="onboarding-pending-banner" role="status"><span>首次方案仍有未同步内容，原话与选择已保留。</span><NavLink to="/app/onboarding">查看并重试 →</NavLink></div>}
          {personalKnowledge ? <Outlet /> : workspaceUnavailable ? <WorkspaceSetup pending={!!onboardingSubmission && !onboardingSubmission.saved}/> : !checkingInitialWorkspace && <Outlet />}
        </main>
        <CoreNavigation/>
        <button type="button" className="capture-fab" disabled={workspaceUnavailable || checkingInitialWorkspace} title={workspaceUnavailable ? '先建立你的工作空间' : '快速记录'} aria-label="快速记录" onClick={() => setCaptureOpen(true)}>＋</button>
        {captureOpen && !workspaceUnavailable && !checkingInitialWorkspace && <MicroCapture onClose={() => {
          setCaptureOpen(false);
          const params = new URLSearchParams(location.search); params.delete('capture');
          navigate(`${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`, { replace: true });
        }} />}
      </div>
    </div>
  );
}

function ActivityPopover({ onClose }: { onClose: () => void }) {
  const { activeActivities } = useWorkspace();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {closeRef.current?.focus();}, []);
  return (
    <div className="activity-popover" id="activity-popover" role="dialog" aria-label="最近活动">
      <div className="popover-heading"><div><span className="sidebar-overline">ACTIVITY CENTER</span><strong>最近发生</strong></div><button type="button" ref={closeRef} className="icon-button" onClick={onClose} title="关闭活动中心" aria-label="关闭活动中心">×</button></div>
      {activeActivities.slice(0, 3).map((activity) => <div className="popover-item" key={activity.id}><span className={`activity-dot tone-${activity.tone}`} /><div><strong>{activity.title}</strong><small>{activity.timeLabel}</small></div></div>)}
      <NavLink to="/app/workspace" className="popover-link" onClick={onClose}>查看全部活动 →</NavLink>
    </div>
  );
}

function CommandPreviewCard({
  preview,
  saving,
  onConfirm,
  onReject,
  onEdit,
}: {
  preview: CommandPreview;
  saving: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const captureAction = preview.action.kind === 'capture' ? preview.action : null;
  const taskAction = preview.action.kind === 'task' ? preview.action : null;
  const title = captureAction ? '保存一条快速记录' : '创建一个待办';
  const detail = captureAction ? captureAction.content : taskAction?.title ?? '';

  return (
    <section className="command-preview" aria-label="Command 执行预览">
      <div className="command-preview-heading">
        <div>
          <span className="section-kicker">ACTION PREVIEW</span>
          <strong>{title}</strong>
        </div>
        <span className={captureAction ? 'command-kind is-capture' : 'command-kind'}>{captureAction ? '快速记录' : '待办'}</span>
      </div>
      <div className="command-preview-body">
        <p>{detail}</p>
        <dl>
          {captureAction ? (
            <>
              <div><dt>记录类型</dt><dd>{CAPTURE_TYPE_LABELS[captureAction.type]}</dd></div>
              <div><dt>写入位置</dt><dd>当前工作空间 · 活动记录</dd></div>
            </>
          ) : (
            <>
              <div><dt>时间</dt><dd>{taskAction?.dueLabel ?? '待安排'}</dd></div>
              <div><dt>来源</dt><dd>快捷输入</dd></div>
            </>
          )}
        </dl>
      </div>
      <div className="command-preview-actions">
        <button type="button" className="preview-confirm" disabled={saving} onClick={onConfirm}>{saving ? '正在保存…' : '确认执行'}</button>
        <button type="button" className="preview-secondary" disabled={saving} onClick={onEdit}>修改原文</button>
        <button type="button" className="preview-dismiss" disabled={saving} onClick={onReject} title="拒绝本次 Command" aria-label="拒绝本次 Command">×</button>
      </div>
    </section>
  );
}
