import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GrowthPlan as GrowthPlanModel } from '../../workspace/workspaceData';
import { localDateKey } from '../../workspace/dailyPreferences.ts';
import { recentReflectionDays } from '../../workspace/growthOverview';
import { zonedInstant } from '../../personal/store';
import { useWorkspace } from '../../workspace/useWorkspace';
import { api } from '../../api/client';
import { captureOwnerId } from '../../workspace/captureSync';
import { mutationKey } from '../../mutations/journal';
import { useMutationDraft } from '../../mutations/useMutationDraft';
import { useExecution } from '../../execution/useExecution';
import './workspace.css';
import './Execution.css';

type Composer = 'goal' | 'plan' | null;

export default function GrowthPlan() {
  const { activeWorkspace, activeGoals, activePlans, activeTasks, activeLearning, activeReflections, dailyPreferences, addGoal, addGrowthPlan, refreshExecutionData } = useWorkspace();
  const { data, refresh } = useExecution();
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [composer, setComposer] = useState<Composer>(null);
  const [composerSaving, setComposerSaving] = useState(false);
  const draftOwner = captureOwnerId(localStorage.getItem('gp_token')) ?? 'anonymous';
  let goalDraft = false, planDraft = false;
  try {goalDraft = !!localStorage.getItem(mutationKey(draftOwner, activeWorkspace.id, 'goal-new')); planDraft = !!localStorage.getItem(mutationKey(draftOwner, activeWorkspace.id, 'plan-new'));} catch { /* Forms retain in-memory input if storage is unavailable. */ }
  const plan = activePlans.find(item => item.id === selectedPlanId) ?? activePlans[0];
  const planJob = data?.jobs.find(job => job.kind === 'plan' && job.resource_id === plan?.id);
  const goal = plan ? activeGoals.find((item) => item.id === plan.goalId) : activeGoals[0];
  const linkedTasks = plan ? activeTasks.filter((task) => task.planId === plan.id) : [];
  const linkedLearning = activeLearning.filter(item => plan && item.relatedGoalId === plan.goalId);
  const today = localDateKey(dailyPreferences.timezone);
  const hasEveningReflection = activeReflections.some((reflection) => reflection.type === 'evening' && reflection.reflectionDate === today);
  const recentDays = recentReflectionDays(activeReflections, dailyPreferences.timezone);
  const reflectionDays = recentDays.filter(day => day.recorded).length;
  const milestones = plan?.milestones.map((milestone, index) => {
    const done = planJob?.result.steps?.[index]?.status === 'done';
    return { milestone, index, done };
  }) ?? [];
  const toggleExecution = async () => {
    if (!plan) return;
    setUpdating(true); setExecutionError('');
    try {
      await api.patch(`/growth-plans/${plan.id}`, {execution_enabled: !plan.executionEnabled});
      await refreshExecutionData(); refresh();
    } catch (error) {setExecutionError(error instanceof Error ? error.message : '后台设置尚未保存');}
    finally {setUpdating(false);}
  };

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-kicker">GROWTH OS</span>
          <h2>成长计划</h2>
          <p>先确认一个方向，再把它拆成你愿意持续推进的周期。</p>
        </div>
        <div className="page-intro-actions">
          <Link className="outline-action" to="/app/evening">日复盘与当天成果</Link>
          <button type="button" className="outline-action" disabled={composerSaving} onClick={() => setComposer(composer === 'goal' ? null : 'goal')}>{goalDraft ? '继续目标草稿' : '新建目标'}</button>
          <button type="button" className="primary-action" onClick={() => setComposer(composer === 'plan' ? null : 'plan')} disabled={composerSaving || !activeGoals.length && !planDraft}>{planDraft ? '继续计划草稿' : '新建计划'}</button>
        </div>
      </header>
      {composer === 'goal' && <GoalComposer key={activeWorkspace.id} timezone={dailyPreferences.timezone} onSaving={setComposerSaving} onCancel={() => setComposer(null)} onCreate={addGoal} />}
      {composer === 'plan' && <PlanComposer key={activeWorkspace.id} onSaving={setComposerSaving} goals={activeGoals} onCancel={() => setComposer(null)} onCreate={addGrowthPlan} />}
      {activePlans.length > 1 && <label className="plan-execution-controls">当前计划<select value={plan?.id} onChange={event => setSelectedPlanId(event.target.value)} aria-label="查看计划">{activePlans.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {plan && <section className="workspace-panel"><div className="plan-execution-controls"><strong>{plan.executionEnabled ? '后台推进已启用' : '尚未启用后台推进'}</strong><button type="button" className="outline-action" disabled={updating || plan.id.startsWith('plan-')} onClick={() => {void toggleExecution();}}>{updating ? '保存中…' : plan.executionEnabled ? '暂停后台推进' : '启用后台推进'}</button><Link to="/app/execution">查看执行记录 →</Link></div><p className="execution-footnote">{planJob?.result.summary ?? (plan.executionEnabled ? '后台将按步骤生成真实待办；每一步完成后安排下一步。' : '启用后，排程和进度回写会在后台持续运行。')}</p>{executionError && <p className="execution-error" role="alert">{executionError}</p>}</section>}
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
            {milestones.length ? <div className="milestone-board">{milestones.map(({ milestone, index, done }) => <div className={done ? 'milestone-card is-done' : 'milestone-card'} key={milestone}><span>{done ? '✓' : `0${index + 1}`}</span><strong>{milestone}</strong><small>{done ? '已完成' : '待推进'}</small></div>)}</div> : <div className="inline-empty">先创建周期计划，再留下 1 到 3 个你想确认的里程碑。</div>}
          </section>
          <section className="workspace-panel">
            <div className="panel-header"><div><span className="section-kicker">PLAN ACTIONS</span><h3>关联任务</h3></div><Link to="/app/tasks" className="panel-link">去执行 →</Link></div>
            {linkedTasks.length ? <div className="plan-task-list">{linkedTasks.map((task) => <Link to={`/app/tasks/${task.id}`} key={task.id}><span className={`task-status status-${task.status}`}>{task.status === 'done' ? '✓' : task.status === 'doing' ? '→' : '·'}</span><strong>{task.title}</strong><small>{task.dueLabel}</small></Link>)}</div> : <div className="inline-empty">{plan?.executionEnabled ? '后台正在等待排程；执行状态可在「执行与应用」查看。' : '启用后台推进后，系统会按具体步骤安排第一项待办。'}</div>}
          </section>
        </div>
        <aside className="growth-side">
          <section className="workspace-panel rhythm-panel"><span className="section-kicker">GROWTH RHYTHM</span><strong>{reflectionDays} / 7</strong><h3>最近有复盘的天数</h3><div className="week-dots">{recentDays.map(day => <span key={day.date} title={`${day.date}${day.recorded ? ' · 已复盘' : ' · 未复盘'}`} aria-label={`${day.date}${day.recorded ? ' 已复盘' : ' 未复盘'}`} className={day.recorded ? 'is-active' : ''}><i />{day.label}</span>)}</div><p>稳定不是每天满格，而是知道什么时候该调整。</p></section>
          <section className="workspace-panel learning-link-panel"><div className="panel-header"><div><span className="section-kicker">LEARNING LINK</span><h3>目标相关学习</h3></div></div><p>{plan ? `当前计划关联的目标下有 ${linkedLearning.length} 项学习。` : '创建目标并关联学习后，可在这里查看数量。'}</p><Link to="/app/learning" className="outline-action full-action">打开学习队列</Link></section>
          <section className="workspace-panel reflection-link-panel"><span className="section-kicker">REFLECTION</span><h3>让今天留下一个判断</h3><p>完成任务之外，再记录一个你今天学到的东西。</p><div className="reflection-link-actions"><Link to="/app/morning" className="text-button">{activeReflections.some((reflection) => reflection.type === 'morning' && reflection.reflectionDate === today) ? '更新晨间' : '晨间启动'} →</Link><Link to="/app/evening" className="text-button">{hasEveningReflection ? '更新晚间' : '晚间复盘'} →</Link></div></section>
        </aside>
      </div>
    </div>
  );
}

function GoalComposer({ timezone, onSaving, onCancel, onCreate }: { timezone: string; onSaving: (saving: boolean) => void; onCancel: () => void; onCreate: ReturnType<typeof useWorkspace>['addGoal'] }) {
  const {activeWorkspace} = useWorkspace();
  const owner = captureOwnerId(localStorage.getItem('gp_token')) ?? 'anonymous';
  const form = useMutationDraft<{title: string; description: string; dueDate: string}, {title: string; description: string; dueAt?: string}>(
    mutationKey(owner, activeWorkspace.id, 'goal-new'), {title: '', description: '', dueDate: ''});
  const sending = useRef(false), locked = form.busy || Boolean(form.pending);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; onSaving(true);
    try {
      const saved = await form.submit(data => ({title: data.title.trim(), description: data.description.trim(),
        dueAt: data.dueDate ? zonedInstant(`${data.dueDate}T09:00`, timezone) : undefined}),
        pending => onCreate({...pending.payload, requestId: pending.request_id}));
      if (saved) onCancel();
    } finally {sending.current = false; onSaving(false);}
  };
  return <section className="workspace-panel growth-composer"><div className="panel-header"><h3>确认一个要持续推进的方向</h3></div>
    <form onSubmit={save}><fieldset disabled={locked} style={{border: 0, padding: 0, margin: 0}}>
      <label><span>目标</span><input autoFocus aria-label="目标标题" value={form.data.title} onChange={e => form.change({title: e.target.value})} maxLength={240}/></label>
      <label><span>补充说明 <small>可跳过</small></span><textarea aria-label="目标说明" value={form.data.description} onChange={e => form.change({description: e.target.value})} maxLength={1200}/></label>
      <label><span>截止日期 <small>可跳过 · {timezone}</small></span><input aria-label="目标截止日期" type="date" value={form.data.dueDate} onInput={e => form.change({dueDate: e.currentTarget.value})}/></label>
    </fieldset>
    {form.pending && <p role="status" className="execution-footnote">正在核对同一次提交。原内容暂时锁定，重试不会新建第二个目标。</p>}
    {form.protectedDraft && <p><button type="button" disabled={form.busy} onClick={form.recover}>保留原稿备份并恢复当前输入</button><small>原始草稿会另存备份，恢复后请核对内容再保存。</small></p>}
    {form.error && <p role="alert" className="execution-error">{form.error}</p>}
    <div className="growth-composer-footer"><button type="button" className="text-button" disabled={form.busy} onClick={onCancel}>收起，保留草稿</button><button className="primary-action" disabled={form.busy || !form.data.title.trim()}>{form.busy ? '保存中…' : form.pending ? '核对并重试目标' : '确认目标'}</button></div>
    <div className="gp-project-actions"><button type="button" className="text-button" disabled={form.busy} onClick={form.exportDraft}>导出目标草稿</button><button type="button" className="text-button" disabled={form.busy} onClick={form.reload}>重新读取目标草稿</button></div>
    {form.backup && <p className="execution-footnote">重新读取前的输入仍保留，可一并导出。</p>}
    </form></section>;
}

function PlanComposer({ goals, onSaving, onCancel, onCreate }: { onSaving: (saving: boolean) => void; goals: ReturnType<typeof useWorkspace>['activeGoals']; onCancel: () => void; onCreate: ReturnType<typeof useWorkspace>['addGrowthPlan'] }) {
  const {activeWorkspace} = useWorkspace();
  const owner = captureOwnerId(localStorage.getItem('gp_token')) ?? 'anonymous';
  type PlanDraft = {goalId: string; title: string; description: string; totalWeeks: number; milestones: string; periodType: 'weekly' | 'monthly' | 'quarterly'};
  type PlanInput = {goalId: string; title: string; description: string; totalWeeks: number; milestones: string[]; periodType: GrowthPlanModel['periodType']};
  const form = useMutationDraft<PlanDraft, PlanInput>(mutationKey(owner, activeWorkspace.id, 'plan-new'),
    {goalId: goals[0]?.id ?? '', title: '', description: '', totalWeeks: 4, milestones: '', periodType: 'weekly'});
  const sending = useRef(false), locked = form.busy || Boolean(form.pending);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; onSaving(true);
    try {
      const saved = await form.submit(data => ({goalId: data.goalId, title: data.title.trim(), description: data.description.trim(), totalWeeks: data.totalWeeks,
        periodType: data.periodType, milestones: data.milestones.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 12)}),
        pending => onCreate({...pending.payload, requestId: pending.request_id}));
      if (saved) onCancel();
    } finally {sending.current = false; onSaving(false);}
  };
  return <section className="workspace-panel growth-composer"><div className="panel-header"><h3>把目标放进一个可执行周期</h3></div><form onSubmit={save}>
    <fieldset disabled={locked} style={{border: 0, padding: 0, margin: 0}}><div className="growth-composer-grid">
      <label><span>关联目标</span><select aria-label="计划关联目标" value={form.data.goalId} onChange={e => form.change({goalId: e.target.value})}>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
      <label><span>周期</span><select aria-label="计划周期" value={form.data.periodType} onChange={e => form.change({periodType: e.target.value as PlanDraft['periodType']})}><option value="weekly">按周</option><option value="monthly">按月</option><option value="quarterly">按季度</option></select></label>
      <label><span>周期数</span><input aria-label="计划周期数" type="number" min={1} max={104} value={form.data.totalWeeks} onChange={e => form.change({totalWeeks: Math.max(1, Math.min(104, Number(e.target.value) || 1))})}/></label>
    </div><label><span>计划名称</span><input autoFocus aria-label="计划名称" value={form.data.title} onChange={e => form.change({title: e.target.value})} maxLength={240}/></label>
    <label><span>说明 <small>可跳过</small></span><textarea aria-label="计划说明" value={form.data.description} onChange={e => form.change({description: e.target.value})} maxLength={1200}/></label>
    <label><span>里程碑 <small>每行一个，最多 12 个</small></span><textarea aria-label="计划里程碑" value={form.data.milestones} onChange={e => form.change({milestones: e.target.value})} maxLength={1200}/></label></fieldset>
    {form.pending && <p role="status" className="execution-footnote">正在核对同一次提交。原内容暂时锁定，重试不会新建第二个计划。</p>}
    {form.protectedDraft && <p><button type="button" disabled={form.busy} onClick={form.recover}>保留原稿备份并恢复当前输入</button></p>}
    {form.error && <p role="alert" className="execution-error">{form.error}</p>}
    <p className="execution-footnote">服务器确认保存后安排第一步，完成后继续下一步。</p>
    <div className="growth-composer-footer"><button type="button" className="text-button" disabled={form.busy} onClick={onCancel}>收起，保留草稿</button><button className="primary-action" disabled={form.busy || !form.data.goalId || !form.data.title.trim()}>{form.busy ? '保存中…' : form.pending ? '核对并重试计划' : '保存并启用计划'}</button></div>
    <div className="gp-project-actions"><button type="button" className="text-button" disabled={form.busy} onClick={form.exportDraft}>导出计划草稿</button><button type="button" className="text-button" disabled={form.busy} onClick={form.reload}>重新读取计划草稿</button></div>
    {form.backup && <p className="execution-footnote">重新读取前的输入仍保留，可一并导出。</p>}
    </form></section>;
}
