import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';
import { useWorkspace } from '../../workspace/useWorkspace';
import MicroCapture from './MicroCapture';
import Focus from './Focus';
import './Layout.css';

const NAV_GROUPS = [
  {
    label: '开始',
    items: [
      { to: '/app', label: '首页', icon: '⌂', end: true },
      { to: '/app/workspace', label: '工作台', icon: '▦', end: false },
      { to: '/app/tasks', label: '待办', icon: '✓', end: false },
    ],
  },
  {
    label: '成长路径',
    items: [
      { to: '/app/growth', label: '成长计划', icon: '↗', end: false },
      { to: '/app/knowledge', label: '知识学习', icon: '▤', end: false },
      { to: '/app/insights', label: '洞察', icon: '◌', end: false },
    ],
  },
  {
    label: '能力',
    items: [
      { to: '/app/apps', label: '应用中心', icon: '⊞', end: false },
      { to: '/app/extensions', label: '扩展能力', icon: '✦', end: false },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/app': 'Command Center',
  '/app/workspace': '工作台',
  '/app/tasks': '待办',
  '/app/growth': '成长计划',
  '/app/knowledge': '知识学习',
  '/app/apps': '应用中心',
  '/app/extensions': '扩展能力',
  '/app/insights': '洞察',
  '/app/mine': '我的',
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
    description: '由全局 AI Command Bar 确认创建。',
    dueLabel: '待安排',
  };
}

export default function Layout() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}

function WorkspaceShell() {
  const { activeWorkspace, state, setActiveWorkspace, addTask, addCapture } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [pendingCommand, setPendingCommand] = useState<CommandPreview | null>(null);
  const [commandError, setCommandError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = useMemo(() => PAGE_TITLES[location.pathname] ?? 'GrowthPilot', [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem('gp_token');
    if (!token) navigate('/login', { replace: true });
    if (token && !state.onboardingCompleted && location.pathname !== '/app/onboarding') {
      navigate('/app/onboarding', { replace: true });
    }
  }, [navigate, location.pathname, state.onboardingCompleted]);

  useEffect(() => {
    setSidebarOpen(false);
    setActivityOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('capture') === '1') setCaptureOpen(true);
  }, [location.search]);

  const handleLogout = () => {
    localStorage.removeItem('gp_token');
    navigate('/login', { replace: true });
  };

  const submitCommand = (inputValue: string) => {
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

  const confirmCommand = () => {
    if (!pendingCommand) return;
    try {
      if (pendingCommand.action.kind === 'capture') {
        addCapture({
          content: pendingCommand.action.content,
          type: pendingCommand.action.type,
          status: pendingCommand.action.status,
        });
      } else {
        addTask(pendingCommand.action.title, {
          description: pendingCommand.action.description,
          source: 'ai',
          dueLabel: pendingCommand.action.dueLabel,
        });
      }
      setCommand('');
      setPendingCommand(null);
      setCommandError('');
      if (pendingCommand.action.kind === 'task') navigate('/app/tasks');
    } catch {
      setCommand(pendingCommand.rawInput);
      setCommandError('执行没有完成，原文已保留，请稍后重试。');
    }
  };

  const updateCommand = (value: string) => {
    setCommand(value);
    setPendingCommand(null);
    setCommandError('');
  };

  if (location.pathname === '/app/focus') return <Focus />;
  if (location.pathname === '/app/onboarding') return <Outlet />;

  return (
    <div className="workspace-shell">
      {sidebarOpen && <button type="button" className="shell-overlay" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <aside className={sidebarOpen ? 'workspace-sidebar is-open' : 'workspace-sidebar'}>
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
          <select value={activeWorkspace.id} onChange={(event) => setActiveWorkspace(event.target.value)} aria-label="切换工作空间">
            {state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
          <span className="workspace-description">{activeWorkspace.description}</span>
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
                  {item.label === '待办' && <span className="nav-count">{state.tasks.filter((task) => task.workspaceId === activeWorkspace.id && task.status !== 'done').length}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/app/mine" className={({ isActive }) => isActive ? 'workspace-nav-link is-active' : 'workspace-nav-link'}>
            <span className="nav-icon" aria-hidden="true">◎</span>
            <span>我的</span>
          </NavLink>
          <div className="sidebar-user">
            <span className="user-avatar">Z</span>
            <span className="sidebar-user-copy"><strong>成长者</strong><small>Web Workspace</small></span>
            <button type="button" className="icon-button sidebar-logout" onClick={handleLogout} title="退出登录" aria-label="退出登录">↪</button>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <button type="button" className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} title="打开导航" aria-label="打开导航">☰</button>
          <div className="topbar-heading">
            <span className="topbar-context">{activeWorkspace.name}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="command-area">
            <form className="command-bar" onSubmit={handleCommand}>
              <span className="command-icon" aria-hidden="true">⌘</span>
              <input value={command} onChange={(event) => updateCommand(event.target.value)} placeholder="告诉 AI 现在要推进什么..." aria-label="全局 AI Command Bar" aria-describedby={commandError ? 'command-error' : undefined} />
              <kbd>⌘ K</kbd>
              <button type="submit" className="command-submit" title="预览 Command" aria-label="预览 Command">→</button>
            </form>
            {commandError && <p className="command-error" id="command-error" role="alert">{commandError}</p>}
            {pendingCommand && <CommandPreviewCard preview={pendingCommand} onConfirm={confirmCommand} onReject={() => setPendingCommand(null)} onEdit={() => setPendingCommand(null)} />}
          </div>
          <div className="topbar-actions">
            <button type="button" className={activityOpen ? 'icon-button is-selected' : 'icon-button'} onClick={() => setActivityOpen((open) => !open)} title="打开活动中心" aria-label="打开活动中心">
              ◔<span className="notification-dot" />
            </button>
            <button type="button" className="topbar-user" onClick={() => navigate('/app/mine')} title="打开我的">
              <span className="user-avatar small">Z</span>
              <span>成长者</span>
            </button>
          </div>
          {activityOpen && <ActivityPopover onClose={() => setActivityOpen(false)} />}
        </header>

        <main className="workspace-content">
          <Outlet />
        </main>
        <button type="button" className="capture-fab" title="快速记录" aria-label="快速记录" onClick={() => setCaptureOpen(true)}>＋</button>
        {captureOpen && <MicroCapture onClose={() => {
          setCaptureOpen(false);
          if (location.search) navigate(location.pathname, { replace: true });
        }} />}
      </div>
    </div>
  );
}

function ActivityPopover({ onClose }: { onClose: () => void }) {
  const { activeActivities } = useWorkspace();
  return (
    <div className="activity-popover">
      <div className="popover-heading"><div><span className="sidebar-overline">ACTIVITY CENTER</span><strong>最近发生</strong></div><button type="button" className="icon-button" onClick={onClose} title="关闭活动中心" aria-label="关闭活动中心">×</button></div>
      {activeActivities.slice(0, 3).map((activity) => <div className="popover-item" key={activity.id}><span className={`activity-dot tone-${activity.tone}`} /><div><strong>{activity.title}</strong><small>{activity.timeLabel}</small></div></div>)}
      <NavLink to="/app/workspace" className="popover-link" onClick={onClose}>查看全部活动 →</NavLink>
    </div>
  );
}

function CommandPreviewCard({
  preview,
  onConfirm,
  onReject,
  onEdit,
}: {
  preview: CommandPreview;
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
              <div><dt>来源</dt><dd>AI Command Bar</dd></div>
            </>
          )}
        </dl>
      </div>
      <div className="command-preview-actions">
        <button type="button" className="preview-confirm" onClick={onConfirm}>确认执行</button>
        <button type="button" className="preview-secondary" onClick={onEdit}>修改原文</button>
        <button type="button" className="preview-dismiss" onClick={onReject} title="拒绝本次 Command" aria-label="拒绝本次 Command">×</button>
      </div>
    </section>
  );
}
