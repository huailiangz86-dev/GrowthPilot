import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GrowthPlan as GrowthPlanModel } from '../../workspace/workspaceData';
import { localDateKey } from '../../workspace/dailyPreferences.ts';
import { useWorkspace } from '../../workspace/useWorkspace';
import './workspace.css';

type Composer = 'goal' | 'plan' | null;

export default function GrowthPlan() {
  const { activeGoals, activePlans, activeTasks, activeLearning, activeReflections, dailyPreferences, addGoal, addGrowthPlan } = useWorkspace();
  const [composer, setComposer] = useState<Composer>(null);
  const plan = activePlans[0];
  const goal = activeGoals.find((item) => item.id === plan?.goalId) ?? activeGoals[0];
  const linkedTasks = activeTasks.filter((task) => task.planId === plan?.id);
  const today = localDateKey(dailyPreferences.timezone);
  const doneTaskCount = linkedTasks.filter((task) => task.status === 'done').length;
  const completedLearningCount = activeLearning.filter((item) => item.status === 'completed').length;
  const hasEveningReflection = activeReflections.some((reflection) => reflection.type === 'evening' && reflection.reflectionDate === today);
  const recentDays = new Set(Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(dailyPreferences.timezone, date);
  }));
  const reflectionDays = new Set(activeReflections.filter((reflection) => recentDays.has(reflection.reflectionDate)).map((reflection) => reflection.reflectionDate)).size;
  const milestones = plan?.milestones.map((milestone, index) => {
    const done = milestone.includes('主线')
      ? linkedTasks.some((task) => task.status === 'done' && /主线|关系|Workspace/.test(task.title)) || activeReflections.some((reflection) => reflection.type === 'morning' && Boolean(reflection.intention?.trim()))
      : milestone.includes('Focus')
        ? doneTaskCount >= 3
        : milestone.includes('学习')
          ? completedLearningCount >= 2
          : milestone.includes('晚间')
            ? hasEveningReflection
            : false;
    return { milestone, index, done };
  }) ?? [];

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-kicker">GROWTH OS</span>
          <h2>成长计划</h2>
          <p>先确认一个方向，再把它拆成你愿意持续推进的周期。</p>
        </div>
        <div className="page-intro-actions">
          <button type="button" className="outline-action" onClick={() => setComposer(composer === 'goal' ? null : 'goal')}>新建目标</button>
          <button type="button" className="primary-action" onClick={() => setComposer(composer === 'plan' ? null : 'plan')} disabled={!activeGoals.length}>新建计划</button>
        </div>
      </header>
      {composer === 'goal' && <GoalComposer onCancel={() => setComposer(null)} onCreate={addGoal} />}
      {composer === 'plan' && <PlanComposer goals={activeGoals} onCancel={() => setComposer(null)} onCreate={addGrowthPlan} />}
      <section className="growth-hero">
        <div>
          <span className="section-kicker">ACTIVE PLAN · {plan ? `第 ${plan.currentWeek} / ${plan.totalWeeks} 周` : '还未开始'}</span>
          <h3>{plan?.title ?? '建立你的第一条成长路径'}</h3>
          <p>{plan?.description ?? '先创建一个目标，再确认一个足够轻的周期计划。'}</p>
        </div>
        <div className="growth-hero-progress">
          <strong>{plan?.progress ?? 0}%</strong>
          <span>本周期进度</span>
          <div className="progress-track"><span style={{ width: `${plan?.progress ?? 0}%` }} /></div>
        </div>
      </section>
      <div className="growth-page-grid">
        <div className="growth-main">
          <section className="workspace-panel">
            <div className="panel-header">
              <div><span className="section-kicker">GOAL</span><h3>{goal?.title ?? '还没有目标'}</h3></div>
              <span className="goal-horizon">{goal?.horizon}</span>
            </div>
            <p className="goal-description">{goal?.description ?? '用一句清楚的方向开始，截止日期和衡量方式都可以之后再补。'}</p>
            <div className="goal-progress-line">
              <span>目标推进</span>
              <strong>{goal?.progress ?? 0}%</strong>
              <div className="progress-track"><span style={{ width: `${goal?.progress ?? 0}%` }} /></div>
            </div>
          </section>
          <section className="workspace-panel">
            <div className="panel-header"><div><span className="section-kicker">MILESTONES</span><h3>阶段里程碑</h3></div><span className="muted-note">由你确认后保存</span></div>
            {milestones.length ? <div className="milestone-board">{milestones.map(({ milestone, index, done }) => <div className={done ? 'milestone-card is-done' : 'milestone-card'} key={milestone}><span>{done ? '✓' : `0${index + 1}`}</span><strong>{milestone}</strong><small>{done ? '已完成' : index === 1 ? '本周行动' : '待推进'}</small></div>)}</div> : <div className="inline-empty">先创建周期计划，再留下 1 到 3 个你想确认的里程碑。</div>}
          </section>
          <section className="workspace-panel">
            <div className="panel-header"><div><span className="section-kicker">PLAN ACTIONS</span><h3>关联任务</h3></div><Link to="/app/tasks" className="panel-link">去执行 →</Link></div>
            {linkedTasks.length ? <div className="plan-task-list">{linkedTasks.map((task) => <Link to="/app/tasks" key={task.id}><span className={`task-status status-${task.status}`}>{task.status === 'done' ? '✓' : task.status === 'doing' ? '→' : '·'}</span><strong>{task.title}</strong><small>{task.dueLabel}</small></Link>)}</div> : <div className="inline-empty">计划还没有关联任务。可以从待办页录入一个下一步。</div>}
          </section>
        </div>
        <aside className="growth-side">
          <section className="workspace-panel rhythm-panel"><span className="section-kicker">GROWTH RHYTHM</span><strong>{reflectionDays} / 7</strong><h3>最近有复盘的天数</h3><div className="week-dots">{['一', '二', '三', '四', '五', '六', '日'].map((day, index) => <span key={day} className={index < Math.min(reflectionDays, 7) ? 'is-active' : ''}><i />{day}</span>)}</div><p>稳定不是每天满格，而是知道什么时候该调整。</p></section>
          <section className="workspace-panel learning-link-panel"><div className="panel-header"><div><span className="section-kicker">LEARNING LINK</span><h3>计划里的学习</h3></div></div><p>当前计划已经连接 {activeLearning.length} 个学习入口，学习结果会回到目标和任务。</p><Link to="/app/knowledge" className="outline-action full-action">打开学习队列</Link></section>
          <section className="workspace-panel reflection-link-panel"><span className="section-kicker">REFLECTION</span><h3>让今天留下一个判断</h3><p>完成任务之外，再记录一个你今天学到的东西。</p><div className="reflection-link-actions"><Link to="/app/morning" className="text-button">{activeReflections.some((reflection) => reflection.type === 'morning' && reflection.reflectionDate === today) ? '更新晨间' : '晨间启动'} →</Link><Link to="/app/evening" className="text-button">{hasEveningReflection ? '更新晚间' : '晚间复盘'} →</Link></div></section>
        </aside>
      </div>
    </div>
  );
}

function GoalComposer({ onCancel, onCreate }: { onCancel: () => void; onCreate: ReturnType<typeof useWorkspace>['addGoal'] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, description, dueAt: dueDate ? `${dueDate}T09:00:00+08:00` : undefined });
    onCancel();
  };

  return <section className="workspace-panel growth-composer"><div className="panel-header"><div><span className="section-kicker">NEW GOAL</span><h3>确认一个要持续推进的方向</h3></div></div><form onSubmit={handleSubmit}><label><span>目标</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：建立稳定的产品交付节奏" maxLength={240} /></label><label><span>补充说明 <small>可跳过</small></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="它为什么重要？什么状态算开始有进展？" maxLength={1200} /></label><label><span>截止日期 <small>可跳过</small></span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><div className="growth-composer-footer"><button type="button" className="text-button" onClick={onCancel}>取消</button><button type="submit" className="primary-action" disabled={!title.trim()}>确认目标</button></div></form></section>;
}

function PlanComposer({ goals, onCancel, onCreate }: { goals: ReturnType<typeof useWorkspace>['activeGoals']; onCancel: () => void; onCreate: ReturnType<typeof useWorkspace>['addGrowthPlan'] }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalWeeks, setTotalWeeks] = useState(4);
  const [milestones, setMilestones] = useState('');
  const [periodType, setPeriodType] = useState<GrowthPlanModel['periodType']>('weekly');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!goalId || !title.trim()) return;
    onCreate({ goalId, title, description, totalWeeks, periodType, milestones: milestones.split('\n') });
    onCancel();
  };

  return <section className="workspace-panel growth-composer"><div className="panel-header"><div><span className="section-kicker">NEW PLAN</span><h3>把目标放进一个可执行周期</h3></div></div><form onSubmit={handleSubmit}><div className="growth-composer-grid"><label><span>关联目标</span><select value={goalId} onChange={(event) => setGoalId(event.target.value)}>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label><span>周期</span><select value={periodType} onChange={(event) => setPeriodType(event.target.value as GrowthPlanModel['periodType'])}><option value="weekly">按周</option><option value="monthly">按月</option><option value="quarterly">按季度</option></select></label><label><span>周期数</span><input type="number" min="1" max="104" value={totalWeeks} onChange={(event) => setTotalWeeks(Math.max(1, Math.min(104, Number(event.target.value) || 1)))} /></label></div><label><span>计划名称</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一个四周交付周期" maxLength={240} /></label><label><span>说明 <small>可跳过</small></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这一周期想保持怎样的节奏？" maxLength={1200} /></label><label><span>里程碑 <small>每行一个，最多 12 个</small></span><textarea value={milestones} onChange={(event) => setMilestones(event.target.value)} placeholder={'确认本周主线\n完成一次深度 Focus\n留下晚间复盘'} maxLength={1200} /></label><div className="growth-composer-footer"><button type="button" className="text-button" onClick={onCancel}>取消</button><button type="submit" className="primary-action" disabled={!goalId || !title.trim()}>确认计划</button></div></form></section>;
}
