import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../workspace/useWorkspace';
import { groupTasks, type TaskGroupMode } from '../../workspace/taskGrouping';
import type { Task, TaskStatus } from '../../workspace/workspaceData';
import './workspace.css';

type Filter = 'all' | 'today' | 'doing' | 'blocked' | 'done';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: 'doing', label: '进行中' },
  { key: 'blocked', label: '阻塞' },
  { key: 'done', label: '已完成' },
];

export default function Tasks() {
  const { activeTasks, activeProjects, activeFocus, addTask, updateTaskStatus, updateTaskDue, startFocus } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('all');
  const [newTask, setNewTask] = useState('');
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<TaskGroupMode>('time');
  const navigate = useNavigate();

  const visibleTasks = useMemo(() => activeTasks.filter((task) => {
    if (filter === 'today') return task.dueLabel.includes('今天');
    if (filter === 'doing') return task.status === 'doing';
    if (filter === 'blocked') return task.status === 'blocked';
    if (filter === 'done') return task.status === 'done';
    return true;
  }), [activeTasks, filter]);
  const taskGroups = useMemo(() => groupTasks(visibleTasks, groupMode), [visibleTasks, groupMode]);

  const handleAddTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addTask(newTask, { source: 'user', dueLabel: '今天' });
    setNewTask('');
  };

  const handleStartFocus = (taskId: string) => {
    if (activeFocus) {
      navigate('/app/focus');
      return;
    }
    startFocus(taskId);
    setFocusTaskId(taskId);
    navigate('/app/focus');
  };

  return (
    <div className="page-stack">
      <header className="page-intro"><div><span className="section-kicker">TASKS & FOCUS</span><h2>把注意力放回下一步</h2><p>任务从目标和计划里长出来，完成后会留下真实的进展数据。</p></div><Link to="/app/ai-coach" className="outline-action">让 AI 拆解一句话 →</Link></header>
      <section className="task-summary-grid"><div><span className="metric-label">今日待处理</span><strong>{activeTasks.filter((task) => task.dueLabel.includes('今天') && task.status !== 'done').length}</strong><small>件任务</small></div><div><span className="metric-label">进行中</span><strong>{activeTasks.filter((task) => task.status === 'doing').length}</strong><small>件任务</small></div><div><span className="metric-label">当前已完成</span><strong>{activeTasks.filter((task) => task.status === 'done').length}</strong><small>件任务</small></div><div><span className="metric-label">行动关联</span><strong>{activeTasks.filter(task => task.goalId || task.planId).length}/{activeTasks.length}</strong><small>关联目标或计划</small></div></section>
      <div className="tasks-page-grid">
        <section className="workspace-panel task-manager-panel"><div className="panel-header"><div><span className="section-kicker">YOUR QUEUE</span><h3>任务队列</h3></div><div className="filter-tabs" role="group" aria-label="任务筛选">{FILTERS.map((item) => <button type="button" key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'filter-tab is-active' : 'filter-tab'} onClick={() => setFilter(item.key)}>{item.label}<small>{item.key === 'all' ? activeTasks.length : visibleCount(activeTasks, item.key)}</small></button>)}</div></div><div className="task-group-switch" role="group" aria-label="任务分组方式"><span>组织方式</span><button type="button" aria-pressed={groupMode === 'time'} className={groupMode === 'time' ? 'is-active' : ''} onClick={() => setGroupMode('time')}>按时间块</button><button type="button" aria-pressed={groupMode === 'energy'} className={groupMode === 'energy' ? 'is-active' : ''} onClick={() => setGroupMode('energy')}>按能量</button></div><div className="task-list task-page-list">{taskGroups.map((group) => <section className="task-group" key={group.key}><div className="task-group-heading"><strong>{group.label}</strong><span>{group.tasks.length}</span></div>{group.tasks.map((task) => <TaskItem key={task.id} task={task} project={activeProjects.find((item) => item.id === task.projectId)?.name} focus={focusTaskId === task.id || activeFocus?.taskId === task.id} onFocus={() => setFocusTaskId(focusTaskId === task.id ? null : task.id)} onStartFocus={() => handleStartFocus(task.id)} onStatusChange={updateTaskStatus} onDueChange={updateTaskDue} />)}</section>)}{visibleTasks.length === 0 && <div className="empty-state"><strong>这里还没有符合条件的任务</strong><span>回到全部任务，或者从下面新增一个下一步。</span></div>}</div><form className="new-task-form" onSubmit={handleAddTask}><span>＋</span><input aria-label="新任务名称" value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="用一句话添加一个下一步..." /><button type="submit" className="primary-action" disabled={!newTask.trim()}>添加任务</button></form></section>
        <aside className="tasks-side-column"><section className="workspace-panel focus-panel"><div className="panel-header"><div><span className="section-kicker">FOCUS MODE</span><h3>专注执行</h3></div><span className="focus-number">25</span></div><p>挑一件最重要的事，给它 25 分钟不被打断的空间。</p><button type="button" className="primary-action focus-action" onClick={() => handleStartFocus(activeFocus?.taskId ?? activeTasks.find((item) => item.status !== 'done')?.id ?? '')} disabled={!activeFocus && !activeTasks.some((item) => item.status !== 'done')}>{activeFocus ? '进入当前 Focus' : '开始 25 分钟'}</button><small className="muted-note">当前重点：{activeTasks.find((item) => item.id === activeFocus?.taskId)?.title ?? activeTasks.find((item) => item.status !== 'done')?.title ?? '今天已完成'}</small></section><section className="workspace-panel recommended-panel"><div className="panel-header"><div><span className="section-kicker">实际执行与应用</span><h3>行动如何持续推进</h3></div></div><p>计划和学习资料就绪后，后台会自动安排行动；学习结果与任务完成会自动回到统计和下一步。</p><Link to="/app/execution" className="outline-action">查看过程与日历订阅 →</Link></section></aside>
      </div>
    </div>
  );
}

function visibleCount(tasks: Task[], filter: Filter) {
  return tasks.filter((task) => filter === 'today' ? task.dueLabel.includes('今天') : task.status === filter).length;
}

function TaskItem({ task, project, focus, onFocus, onStartFocus, onStatusChange, onDueChange }: { task: Task; project?: string; focus: boolean; onFocus: () => void; onStartFocus: () => void; onStatusChange: (id: string, status: TaskStatus) => void; onDueChange: (id: string, dueLabel: string) => void }) {
  return <div className={focus ? 'task-item is-focus' : 'task-item'}><button type="button" className={task.status === 'done' ? 'task-check is-done' : 'task-check'} onClick={() => onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')} aria-label={task.status === 'done' ? `恢复任务 ${task.title}` : `完成任务 ${task.title}`}>{task.status === 'done' ? '✓' : ''}</button><button type="button" className="task-item-copy" onClick={onFocus}><strong>{task.title}</strong><span>{project ?? '当前 Workspace'} · {task.description}</span>{focus && <small>{task.recommendedReason ?? '这是一个可以立即执行的下一步。'}</small>}</button><button type="button" className="task-focus-button" onClick={onStartFocus} disabled={task.status === 'done'} title={task.status === 'done' ? '已完成任务不能开始 Focus' : '开始 Focus'} aria-label={task.status === 'done' ? `已完成任务 ${task.title}` : `开始 Focus：${task.title}`}>▶</button><span className={`task-status status-${task.status}`}>{statusLabel(task.status)}</span><select className="task-status-select" value={task.status} onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)} aria-label={`更新任务 ${task.title} 状态`}><option value="todo">待处理</option><option value="doing">进行中</option><option value="blocked">阻塞</option><option value="done">已完成</option></select><button type="button" className="task-defer" onClick={() => onDueChange(task.id, task.dueLabel.includes('明天') ? '下周' : '明天')} title={task.dueLabel.includes('明天') ? '推迟到下周' : '推迟到明天'} aria-label={task.dueLabel.includes('明天') ? `推迟任务 ${task.title} 到下周` : `推迟任务 ${task.title} 到明天`}>{task.dueLabel.includes('明天') ? '下周' : '明天'}</button><span className="task-due">{task.dueLabel}</span>{task.agentSource && <Link className="task-agent-source" to={`/app/agent?conversation=${task.agentSource.conversationId}`}>来自个人 Agent · 查看对话与依据 ↗</Link>}<Link className="task-agent-source" to={`/app/insights?feedback=${task.id}#actual-facts`}>记录完成结果 ↗</Link></div>;
}

function statusLabel(status: TaskStatus) {
  return status === 'todo' ? '待处理' : status === 'doing' ? '进行中' : status === 'blocked' ? '阻塞' : '已完成';
}
