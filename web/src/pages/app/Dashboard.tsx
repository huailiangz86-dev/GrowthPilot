import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspace/useWorkspace';
import { useExecution } from '../../execution/useExecution';
import { ExecutionSummary } from './Execution';
import './workspace.css';
import './Execution.css';

export default function Dashboard() {
  const { activeWorkspace, activeTasks, activePlans, activeLearning, dailyPreferences } = useWorkspace();
  const { data } = useExecution();
  const scheduled = new Set(data?.jobs.filter(job => job.status === 'waiting').map(job => job.result.task_id).filter(Boolean));
  const tasks = activeTasks.filter(task => task.status !== 'done').sort((a, b) =>
    (a.status === 'blocked' ? 1 : 0) - (b.status === 'blocked' ? 1 : 0) ||
    Number(scheduled.has(b.id)) - Number(scheduled.has(a.id)) ||
    (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')).slice(0, 3);
  const learning = activeLearning.find(item => item.status === 'in_progress') ?? activeLearning.find(item => item.status !== 'completed');
  const plan = activePlans.find(item => item.executionEnabled) ?? activePlans[0];
  const planJob = data?.jobs.find(job => job.resource_id === plan?.id);
  const learningAction = (taskId: string) => data?.jobs.find(job => job.kind === 'learning' && job.result.task_id === taskId);
  const date = new Intl.DateTimeFormat('zh-CN', {month:'long', day:'numeric', weekday:'long', timeZone:dailyPreferences.timezone}).format(new Date());
  return <div className="page-stack">
    <header className="page-intro"><div><span className="section-kicker">{date} · {activeWorkspace.name}</span><h2>今天，先推进一件具体的事</h2><p>先看系统的执行结果，再处理需要你完成的下一步。</p></div><Link className="outline-action" to="/app/agent">和 Agent 讨论 →</Link></header>
    <ExecutionSummary />
    <section className="workspace-panel"><div className="panel-header"><div><span className="section-kicker">需要你完成的下一步</span><h3>当前行动</h3></div><Link className="panel-link" to="/app/tasks">全部待办 →</Link></div>
      <div className="today-action-list">{tasks.map((task, index) => <article className="today-action" key={task.id}><span className="today-action-number">0{index + 1}</span><div className="today-action-copy"><strong>{task.title}</strong><p>{task.description || '完成后留下实际结果，系统会据此更新进度。'}</p><small>{task.planId ? '来自计划 · GrowthPilot 待办' : 'GrowthPilot 待办'} · {task.dueLabel} · {task.status === 'blocked' ? '需要处理阻塞' : task.status === 'doing' ? '进行中' : '待处理'}</small></div><Link to={learningAction(task.id) ? `/app/learn/${learningAction(task.id)!.resource_id}` : `/app/insights?feedback=${task.id}#actual-facts`}>{learningAction(task.id) ? '开始学习' : '记录结果'} ↗</Link></article>)}</div>
      {!tasks.length && <p className="inline-empty">当前没有待处理行动。建立包含具体步骤的计划后，后台会安排第一步。</p>}
    </section>
    <div className="today-support"><section className="workspace-panel"><div className="panel-header"><span className="section-kicker">计划正在如何推进</span><Link className="panel-link" to="/app/growth">管理计划 →</Link></div><h4>{plan?.title ?? '还没有持续执行的计划'}</h4><p>{planJob?.result.summary ?? (plan?.executionEnabled ? '计划已启用，等待后台首次排程。' : plan ? '已有计划尚未启用后台推进。' : '确认方向和具体步骤，系统会持续安排、跟踪并回写。')}</p>{plan && <div className="progress-track"><span style={{width:`${plan.progress}%`}}/></div>}</section>
      <section className="workspace-panel"><div className="panel-header"><span className="section-kicker">继续学习</span><Link className="panel-link" to="/app/knowledge">学习队列 →</Link></div><h4>{learning?.title ?? '添加一个可打开的学习资源'}</h4><p>{learning?.summary || '保存文章链接或原始内容，学习过程会留下实际时间与结果。'}</p>{learning && <Link className="outline-action" to={`/app/learn/${learning.id}`}>打开内容并继续学习 ↗</Link>}</section></div>
    <div className="today-links"><Link to="/app/data">查看真实记录</Link><Link to="/app/insights">查看数据分析</Link><Link to="/app/morning">晨间意图</Link><Link to="/app/evening">晚间复盘</Link></div>
  </div>;
}
