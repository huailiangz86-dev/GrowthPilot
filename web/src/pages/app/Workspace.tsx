import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspace/useWorkspace';
import './workspace.css';

const RESOURCE_LINKS = [
  { icon: '▣', name: '产品目录', detail: 'PRD、方案与决策记录', tone: 'teal', to: '/app/ai-coach' },
  { icon: '◫', name: '设计资料', detail: 'UX、原型与参考素材', tone: 'orange', to: '/app/knowledge' },
  { icon: '⌁', name: '研究输入', detail: '竞品、文章与用户观察', tone: 'blue', to: '/app/knowledge' },
  { icon: '↗', name: '最近产出', detail: '这周完成的文件与结论', tone: 'green', to: '/app/tasks' },
];

export default function Workspace() {
  const { activeWorkspace, activeProjects, activeGoals, activePlans, activeActivities, activeCaptures } = useWorkspace();
  const activeProject = activeProjects[0];

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div><span className="section-kicker">WORKSPACE OVERVIEW</span><h2>{activeWorkspace.name}</h2><p>{activeWorkspace.description}。这里是工作、学习和成长事实发生的地方。</p></div>
        <Link to="/app/ai-coach" className="outline-action">让 AI 整理一下 →</Link>
      </header>

      <section className="workspace-summary-grid">
        <div className="summary-metric"><span className="metric-label">进行中项目</span><strong>{activeProjects.length}</strong><small>项目正在推进</small></div>
        <div className="summary-metric"><span className="metric-label">当前目标</span><strong>{activeGoals.length}</strong><small>目标连接到计划</small></div>
        <div className="summary-metric"><span className="metric-label">当前计划</span><strong>{activePlans.length}</strong><small>一条明确行动路径</small></div>
        <div className="summary-metric accent-metric"><span className="metric-label">空间状态</span><strong>有上下文</strong><small>活动会持续沉淀</small></div>
      </section>

      <div className="workspace-page-grid">
        <div className="workspace-page-main">
          <section className="workspace-panel">
            <div className="panel-header"><div><span className="section-kicker">PROJECTS</span><h3>项目与进行中内容</h3></div><Link to="/app/ai-coach" className="small-action">＋ 新建项目</Link></div>
            <div className="project-board">
              {activeProjects.map((project) => <Link to="/app/tasks" className="project-board-row" key={project.id}><span className="project-board-mark" style={{ color: project.accent, background: `${project.accent}16` }}>{project.name.slice(0, 1)}</span><span className="project-row-copy"><strong>{project.name}</strong><small>{project.description}</small></span><span className="project-board-status"><i className={`project-status-dot status-${project.status}`} />{project.status === 'active' ? '进行中' : project.status === 'paused' ? '已暂停' : '已完成'}</span><span className="project-board-progress">{project.progress}%<small className="mini-progress"><i style={{ width: `${project.progress}%`, background: project.accent }} /></small></span><span className="project-arrow" aria-hidden="true">↗</span></Link>)}
            </div>
          </section>

          <section className="workspace-panel">
            <div className="panel-header"><div><span className="section-kicker">RESOURCES</span><h3>目录与资源入口</h3></div><span className="muted-note">Workspace 范围</span></div>
            <div className="resource-grid">{RESOURCE_LINKS.map((resource) => <Link to={resource.to} className="resource-tile" key={resource.name}><span className={`resource-icon resource-${resource.tone}`}>{resource.icon}</span><strong>{resource.name}</strong><small>{resource.detail}</small><span className="resource-arrow">↗</span></Link>)}</div>
          </section>

          <section className="workspace-panel timeline-panel">
            <div className="panel-header"><div><span className="section-kicker">ACTIVITY TIMELINE</span><h3>工作空间活动</h3></div><span className="muted-note">事件会成为未来的上下文</span></div>
            <div className="timeline-list">{activeActivities.map((activity) => <div className="timeline-row" key={activity.id}><span className={`activity-dot tone-${activity.tone}`} /><div><strong>{activity.title}</strong><p>{activity.detail}</p></div><time>{activity.timeLabel}</time></div>)}</div>
          </section>
        </div>

        <aside className="workspace-page-side">
          <section className="workspace-panel capture-panel"><div className="panel-header"><div><span className="section-kicker">MICRO CAPTURE</span><h3>今天留下的事实</h3></div><span className="capture-mark">●</span></div><p>进展、决定、状态、想法和学习，会自动进入后续的复盘与洞察。</p><div className="capture-stream">{activeCaptures.slice(0, 3).map((capture) => <div className="capture-stream-row" key={capture.id}><span className={`capture-kind capture-${capture.type}`}>{captureTypeLabel(capture.type)}</span><div><strong>{capture.content}</strong><small>{capture.createdLabel} · {captureStatusLabel(capture.status)}</small></div></div>)}{activeCaptures.length === 0 && <div className="capture-stream-empty">还没有快速记录。用右下角的＋留下一句话即可。</div>}</div></section>
          <section className="workspace-panel context-panel"><div className="panel-header"><div><span className="section-kicker">WORKSPACE CONTEXT</span><h3>现在的主线</h3></div></div><div className="context-card"><span className="section-kicker">CURRENT PROJECT</span><strong>{activeProject?.name ?? '还没有项目'}</strong><p>{activeProject?.nextAction ?? '先创建一个进行中的项目。'}</p></div>{activeGoals[0] && <div className="context-goal"><span className="section-kicker">CONNECTED GOAL</span><strong>{activeGoals[0].title}</strong><div className="progress-track"><span style={{ width: `${activeGoals[0].progress}%` }} /></div><small>{activeGoals[0].progress}% · {activeGoals[0].horizon}</small></div>}</section>
          <section className="workspace-panel capability-mini"><div className="panel-header"><div><span className="section-kicker">CAPABILITIES</span><h3>把工具放进工作流</h3></div><Link to="/app/extensions" className="panel-link">全部 →</Link></div><p>应用、Plugin、Skill 和 Agent Expert 都有清晰入口，调用记录会归属当前 Workspace。</p><Link to="/app/apps" className="outline-action full-action">浏览能力中心</Link></section>
        </aside>
      </div>
    </div>
  );
}

function captureTypeLabel(type: 'progress' | 'decision' | 'emotion' | 'idea' | 'learning') {
  return type === 'progress' ? '进展' : type === 'decision' ? '决定' : type === 'emotion' ? '状态' : type === 'learning' ? '学习' : '想法';
}

function captureStatusLabel(status: string) {
  return status === 'done' ? '已完成' : status === 'moving' ? '正在推进' : status === 'blocked' ? '遇到阻力' : status === 'decided' ? '已经决定' : status === 'calm' ? '平静' : status === 'energized' ? '有能量' : status === 'tired' ? '需要放慢' : '已记录';
}
