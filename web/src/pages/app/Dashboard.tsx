import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildDailyLoop } from '../../workspace/dailyLoop';
import { localDateKey } from '../../workspace/dailyPreferences.ts';
import { useWorkspace } from '../../workspace/useWorkspace';
import type { Task } from '../../workspace/workspaceData';
import './workspace.css';

function formatToday(timezone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date());
}

function taskPriorityLabel(priority: Task['priority']) {
  return priority === 'high' ? '重要' : priority === 'medium' ? '常规' : '低压力';
}

export default function Dashboard() {
  const { activeWorkspace, activeProjects, activePlans, activeTasks, activeLearning, activeActivities, activeCaptures, activeInsights, activeReflections, state, dailyPreferences, updateTaskStatus, updateLearningProgress, saveMorning } = useWorkspace();
  const plan = activePlans[0];
  const today = localDateKey(dailyPreferences.timezone);
  const morning = activeReflections.find((reflection) => reflection.type === 'morning' && reflection.reflectionDate === today);
  const evening = activeReflections.find((reflection) => reflection.type === 'evening' && reflection.reflectionDate === today);
  const energy = morning?.energy ?? 4;
  const dailyLoop = useMemo(() => buildDailyLoop({
    tasks: activeTasks,
    learningItems: activeLearning,
    captures: activeCaptures,
    reflections: activeReflections,
    today,
  }), [activeCaptures, activeLearning, activeReflections, activeTasks, today]);
  const todayTasks = useMemo(() => dailyLoop.todayTasks.filter((task) => task.status !== 'done').slice(0, 3), [dailyLoop]);
  const activeProject = activeProjects.find((project) => project.status === 'active') ?? activeProjects[0];
  const inProgressLearning = activeLearning.find((item) => item.status === 'in_progress') ?? activeLearning[0];

  return (
    <div className="command-center page-stack">
      <header className="page-intro dashboard-intro">
        <div>
          <span className="section-kicker">{formatToday(dailyPreferences.timezone)} · MORNING BRIEF</span>
          <h2>早上好，成长者。</h2>
          <p>今天不用解决全部问题，先把最重要的下一步做出来。</p>
        </div>
        <div className="intro-actions">
          <span className="quiet-status"><span className="status-led" /> 工作台已准备好</span>
          <Link to="/app/morning" className="outline-action compact-action">{morning ? '更新晨间' : '晨间启动'}</Link>
          <Link to="/app/evening" className="outline-action compact-action">{evening ? '查看晚间' : '晚间复盘'}</Link>
          <Link to="/app/ai-coach" className="text-button">问 AI →</Link>
        </div>
      </header>

      <section className="brief-strip">
        <div className="brief-lead">
          <span className="section-kicker">TODAY'S BRIEF</span>
          <h3>今天先推进「{activeProject?.name ?? '当前项目'}」</h3>
          <p>{activeProject?.nextAction ?? '从一个可以完成的下一步开始。'} 这是当前工作空间里最值得先做的动作。</p>
        </div>
        <div className="brief-metrics">
          <div className="brief-metric"><strong>{dailyLoop.completedTaskCount}/{dailyLoop.todayTasks.length}</strong><span>今日任务</span></div>
          <div className="brief-metric"><strong>{plan?.progress ?? 0}%</strong><span>本周计划</span></div>
          <div className="brief-metric"><strong>{activeLearning.filter((item) => item.status !== 'completed').length}</strong><span>学习队列</span></div>
        </div>
      </section>

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <section className="workspace-panel current-work-panel">
            <div className="panel-header">
              <div><span className="section-kicker">IN PROGRESS</span><h3>进行中的工作</h3></div>
              <Link to="/app/workspace" className="panel-link">查看工作台 →</Link>
            </div>
            {activeProjects.slice(0, 2).map((project) => (
              <Link className="project-row" to="/app/workspace" key={project.id}>
                <span className="project-accent" style={{ background: project.accent }} />
                <span className="project-row-copy"><strong>{project.name}</strong><small>{project.description}</small></span>
                <span className="project-progress"><strong>{project.progress}%</strong><span className="mini-progress"><i style={{ width: `${project.progress}%`, background: project.accent }} /></span></span>
                <span className="project-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
            <div className="project-context-line"><span className="context-check">✓</span><span>当前 Workspace · {activeWorkspace.name}</span><span className="context-divider" /><span>项目和成长计划共享同一条上下文</span></div>
          </section>

          <section className="workspace-panel tasks-panel">
            <div className="panel-header">
              <div><span className="section-kicker">NEXT ACTIONS</span><h3>今天的待办</h3></div>
              <Link to="/app/tasks" className="panel-link">打开全部待办 →</Link>
            </div>
            <div className="task-list compact-task-list">
              {todayTasks.map((task) => <DashboardTask key={task.id} task={task} onStatusChange={updateTaskStatus} />)}
              {todayTasks.length === 0 && <div className="inline-empty">今天的任务已经清空，可以去做一次轻量复盘。</div>}
            </div>
            <Link to="/app/tasks" className="add-inline-action">＋ 添加一个下一步</Link>
          </section>

          <section className="workspace-panel daily-loop-panel">
            <div className="panel-header">
              <div><span className="section-kicker">TODAY'S LOOP</span><h3>今天的闭环</h3></div>
              <span className="muted-note">来自当前 Workspace 的事实</span>
            </div>
            <div className="daily-loop-steps">
              {dailyLoop.steps.map((step) => (
                <Link className={step.completed ? 'daily-loop-step is-complete' : 'daily-loop-step'} to={step.to} key={step.id}>
                  <span className="daily-loop-mark">{step.completed ? '✓' : step.id === 'morning' ? '1' : step.id === 'tasks' ? '2' : step.id === 'learning' ? '3' : step.id === 'capture' ? '4' : '5'}</span>
                  <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                </Link>
              ))}
            </div>
            <div className="daily-next-action">
              <div><span className="section-kicker">NEXT STEP</span><strong>{dailyLoop.nextAction.label}</strong><small>{dailyLoop.nextAction.detail}</small></div>
              <Link to={dailyLoop.nextAction.to} className="outline-action compact-action">去完成</Link>
            </div>
          </section>

          <section className="workspace-panel activity-panel">
            <div className="panel-header">
              <div><span className="section-kicker">WORKSPACE EVENTS</span><h3>最近活动</h3></div>
              <Link to="/app/workspace" className="panel-link">活动时间线 →</Link>
            </div>
            <div className="activity-list">
              {activeActivities.slice(0, 4).map((activity) => (
                <div className="activity-row" key={activity.id}>
                  <span className={`activity-dot tone-${activity.tone}`} />
                  <div className="activity-copy"><strong>{activity.title}</strong><small>{activity.detail}</small></div>
                  <time>{activity.timeLabel}</time>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="workspace-panel plan-panel">
            <div className="panel-header"><div><span className="section-kicker">GROWTH PLAN</span><h3>当前成长计划</h3></div><Link to="/app/growth" className="panel-link" title="打开成长计划" aria-label="打开成长计划">↗</Link></div>
            {plan ? <>
              <h4>{plan.title}</h4>
              <p className="panel-description">{plan.description}</p>
              <div className="plan-meta"><span>第 {plan.currentWeek} 周 / 共 {plan.totalWeeks} 周</span><strong>{plan.progress}%</strong></div>
              <div className="progress-track"><span style={{ width: `${plan.progress}%` }} /></div>
              <div className="milestone-list">{plan.milestones.slice(0, 3).map((milestone, index) => {
                const done = milestoneDone(milestone, { activeProjects, activeTasks, activeLearning, activeReflections, today, planId: plan.id });
                return <span key={milestone} className={done ? 'is-done' : ''}><i>{done ? '✓' : index + 1}</i>{milestone}</span>;
              })}</div>
            </> : <div className="inline-empty">还没有成长计划。</div>}
          </section>

          <section className="workspace-panel learning-panel">
            <div className="panel-header"><div><span className="section-kicker">LEARNING QUEUE</span><h3>知识学习</h3></div><Link to="/app/knowledge" className="panel-link" title="打开知识学习" aria-label="打开知识学习">↗</Link></div>
            {inProgressLearning && <div className="learning-feature">
              <Link to="/app/knowledge" className="learning-feature-link">
                <span className="learning-type">{inProgressLearning.kind === 'article' ? 'ARTICLE' : 'NOTE'}</span>
                <strong>{inProgressLearning.title}</strong>
                <p>{inProgressLearning.summary}</p>
                <div className="learning-progress-row"><span className="mini-progress"><i style={{ width: `${inProgressLearning.progress}%`, background: 'var(--blue)' }} /></span><small>{inProgressLearning.progress}% · {inProgressLearning.durationLabel}</small></div>
              </Link>
              <button type="button" className="learning-progress-action" disabled={inProgressLearning.progress >= 100} onClick={() => updateLearningProgress(inProgressLearning.id, Math.min(100, inProgressLearning.progress + 10))}>{inProgressLearning.progress >= 100 ? '已完成' : '推进 10%'}</button>
            </div>}
            <Link to="/app/knowledge" className="queue-link">查看学习队列 · {activeLearning.length} 项 →</Link>
          </section>

          <section className="workspace-panel checkin-panel">
            <div className="panel-header"><div><span className="section-kicker">QUICK CHECK-IN</span><h3>今天的能量</h3></div><strong className="energy-score">{energy}<small>/5</small></strong></div>
            <p className="panel-description">用一个数字告诉系统今天适合怎样的推进方式。</p>
            <div className="energy-scale" role="group" aria-label="选择今天的能量">
              {[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={energy === level ? 'energy-choice is-selected' : 'energy-choice'} onClick={() => saveMorning({ energy: level, intention: morning?.intention })} aria-label={`${level} 分`}>{level}</button>)}
            </div>
            <small className="checkin-note">{morning ? `已记录 · ${morning.createdLabel}` : '选择后会记录到今天的成长事实'}</small>
          </section>

          {activeInsights[0] && <section className="workspace-panel insight-panel">
            <div className="panel-header"><div><span className="section-kicker">AI INSIGHT</span><h3>{activeInsights[0].title}</h3></div><span className="insight-mark">✦</span></div>
            <p>{activeInsights[0].body}</p>
            <div className="evidence-list">{activeInsights[0].evidence.map((item) => <span key={item}>✓ {item}</span>)}</div>
            <Link to="/app/insights" className="insight-action">{activeInsights[0].actionLabel} →</Link>
          </section>}
        </aside>
      </div>

      <section className="capability-rail">
        <div className="capability-rail-intro"><span className="section-kicker">YOUR TOOLKIT</span><strong>常用能力</strong><Link to="/app/apps">管理入口 →</Link></div>
        {state.capabilities.slice(0, 4).map((capability) => <Link to={capability.kind === 'app' || capability.kind === 'connection' ? '/app/apps' : '/app/extensions'} className="capability-chip" key={capability.id}><span style={{ background: capability.accent }}>{capability.icon}</span><strong>{capability.name}</strong><small>{capability.kind === 'app' ? '应用' : capability.kind === 'connection' ? '连接' : capability.kind === 'skill' ? 'Skill' : capability.kind === 'plugin' ? 'Plugin' : 'Agent'}</small></Link>)}
      </section>
    </div>
  );
}

function milestoneDone(milestone: string, context: { activeProjects: ReturnType<typeof useWorkspace>['activeProjects']; activeTasks: ReturnType<typeof useWorkspace>['activeTasks']; activeLearning: ReturnType<typeof useWorkspace>['activeLearning']; activeReflections: ReturnType<typeof useWorkspace>['activeReflections']; today: string; planId: string }) {
  if (milestone.includes('主线')) return context.activeTasks.some((task) => task.planId === context.planId && task.status === 'done' && /主线|关系|Workspace/.test(task.title)) || context.activeReflections.some((reflection) => reflection.type === 'morning' && Boolean(reflection.intention?.trim()));
  if (milestone.includes('Focus')) return context.activeTasks.filter((task) => task.planId === context.planId && task.status === 'done').length >= 3;
  if (milestone.includes('学习')) return context.activeLearning.filter((item) => item.status === 'completed').length >= 2;
  if (milestone.includes('晚间')) return context.activeReflections.some((reflection) => reflection.type === 'evening' && reflection.reflectionDate === context.today);
  return false;
}

function DashboardTask({ task, onStatusChange }: { task: Task; onStatusChange: (id: string, status: Task['status']) => void }) {
  return (
    <div className="task-row">
      <button type="button" className={task.status === 'done' ? 'task-check is-done' : 'task-check'} onClick={() => onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')} aria-label={task.status === 'done' ? `恢复任务 ${task.title}` : `完成任务 ${task.title}`}>
        {task.status === 'done' ? '✓' : ''}
      </button>
      <div className="task-copy"><strong>{task.title}</strong><small>{task.recommendedReason ?? task.description}</small></div>
      <span className={`priority-label priority-${task.priority}`}>{taskPriorityLabel(task.priority)}</span>
      <span className="task-due">{task.dueLabel}</span>
    </div>
  );
}
