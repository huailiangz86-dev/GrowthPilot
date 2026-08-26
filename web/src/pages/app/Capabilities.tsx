import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspace/useWorkspace';
import type { Capability, Goal } from '../../workspace/workspaceData';
import type { CapabilityBriefPayload, CapabilityInvocationPayload } from '../../workspace/dashboardData';
import './workspace.css';

type CapabilityFilter = 'all' | Capability['kind'];

function invocationStatusLabel(status: CapabilityInvocationPayload['status']) {
  if (status === 'awaiting_confirmation') return '等待确认';
  if (status === 'confirmed') return '已确认授权';
  if (status === 'planned') return '已保存计划';
  if (status === 'completed') return '草稿已生成';
  return '已拒绝';
}

function executionStateLabel(state: CapabilityInvocationPayload['execution_state']) {
  if (state === 'completed') return '已完成';
  if (state === 'failed') return '失败';
  return '未开始';
}

function BriefDraft({
  brief,
  runId,
  busyFactKey,
  goals,
  onCreateTask,
  onCreateGoal,
  onCreatePlan,
  onCreateKnowledge,
  onCreateMemory,
}: {
  brief: CapabilityBriefPayload;
  runId: string;
  busyFactKey: string | null;
  goals: Goal[];
  onCreateTask?: (eventId: string, title: string) => void;
  onCreateGoal?: (eventId: string, title: string) => void;
  onCreatePlan?: (eventId: string, goalId: string, title: string, periodType: 'weekly' | 'monthly' | 'quarterly') => void;
  onCreateKnowledge?: (eventId: string, title: string, content: string, goalId?: string) => void;
  onCreateMemory?: (eventId: string, content: string, memoryType: string, importance: number, tags: string[]) => void;
}) {
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [goalTitles, setGoalTitles] = useState<Record<string, string>>({});
  const [planTitles, setPlanTitles] = useState<Record<string, string>>({});
  const [planGoalIds, setPlanGoalIds] = useState<Record<string, string>>({});
  const [planPeriods, setPlanPeriods] = useState<Record<string, '' | 'weekly' | 'monthly' | 'quarterly'>>({});
  const [knowledgeTitles, setKnowledgeTitles] = useState<Record<string, string>>({});
  const [knowledgeContents, setKnowledgeContents] = useState<Record<string, string>>({});
  const [knowledgeGoalIds, setKnowledgeGoalIds] = useState<Record<string, string>>({});
  const [memoryContents, setMemoryContents] = useState<Record<string, string>>({});
  const [memoryTypes, setMemoryTypes] = useState<Record<string, string>>({});
  const [memoryImportances, setMemoryImportances] = useState<Record<string, number>>({});
  const [memoryTags, setMemoryTags] = useState<Record<string, string>>({});
  return (
    <section className="capability-brief-result">
      <strong>{brief.title}</strong>
      <p>{brief.summary}</p>
      {brief.facts.length > 0 && (
        <ul>
          {brief.facts.map((fact) => (
            <li key={fact.event_id}>
              <time dateTime={fact.occurred_at}>{fact.occurred_at.slice(0, 16).replace('T', ' ')}</time>
              <div>
                <span>{fact.summary}</span>
                {brief.fact_actions[fact.event_id] ? (
                  <Link to="/app/tasks" className="capability-brief-task-created">已创建待办</Link>
                ) : onCreateTask && (
                  <div className="capability-brief-action">
                    <input
                      value={taskTitles[fact.event_id] ?? `跟进：${fact.summary}`}
                      maxLength={240}
                      aria-label={`为「${fact.summary}」创建待办`}
                      onChange={(event) => setTaskTitles((current) => ({
                        ...current,
                        [fact.event_id]: event.target.value,
                      }))}
                    />
                    <button
                      type="button"
                      className="outline-action"
                      disabled={busyFactKey === `${runId}:${fact.event_id}` || !(taskTitles[fact.event_id] ?? `跟进：${fact.summary}`).trim()}
                      onClick={() => onCreateTask(fact.event_id, taskTitles[fact.event_id] ?? `跟进：${fact.summary}`)}
                    >
                      {busyFactKey === `${runId}:${fact.event_id}` ? '创建中' : '创建待办'}
                    </button>
                  </div>
                )}
                {!brief.fact_goal_actions[fact.event_id] && onCreateGoal && (
                  <div className="capability-brief-action">
                    <input
                      value={goalTitles[fact.event_id] ?? `围绕：${fact.summary}`}
                      maxLength={240}
                      aria-label={`为「${fact.summary}」创建目标`}
                      onChange={(event) => setGoalTitles((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="outline-action"
                      disabled={busyFactKey === `${runId}:goal:${fact.event_id}`}
                      onClick={() => onCreateGoal(fact.event_id, goalTitles[fact.event_id] ?? `围绕：${fact.summary}`)}
                    >
                      {busyFactKey === `${runId}:goal:${fact.event_id}` ? '创建中' : '创建目标'}
                    </button>
                  </div>
                )}
                {brief.fact_goal_actions[fact.event_id] && <Link to="/app/growth" className="capability-brief-task-created">已创建目标</Link>}
                {!brief.fact_plan_actions[fact.event_id] && onCreatePlan && goals.length > 0 && (
                  <div className="capability-brief-action capability-brief-plan-action">
                    <input
                      value={planTitles[fact.event_id] ?? `围绕：${fact.summary}`}
                      maxLength={240}
                      aria-label={`为「${fact.summary}」创建成长计划`}
                      onChange={(event) => setPlanTitles((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    />
                    <select
                      value={planGoalIds[fact.event_id] ?? ''}
                      aria-label={`选择「${fact.summary}」的关联目标`}
                      onChange={(event) => setPlanGoalIds((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    >
                      <option value="" disabled>选择关联目标</option>
                      {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                    </select>
                    <select
                      value={planPeriods[fact.event_id] ?? ''}
                      aria-label={`选择「${fact.summary}」的计划周期`}
                      onChange={(event) => setPlanPeriods((current) => ({ ...current, [fact.event_id]: event.target.value as '' | 'weekly' | 'monthly' | 'quarterly' }))}
                    >
                      <option value="" disabled>选择周期</option>
                      <option value="weekly">按周</option>
                      <option value="monthly">按月</option>
                      <option value="quarterly">按季度</option>
                    </select>
                    <button
                      type="button"
                      className="outline-action"
                      disabled={
                        busyFactKey === `${runId}:plan:${fact.event_id}`
                        || !(planTitles[fact.event_id] ?? `围绕：${fact.summary}`).trim()
                        || !planGoalIds[fact.event_id]
                        || !planPeriods[fact.event_id]
                      }
                      onClick={() => onCreatePlan(
                        fact.event_id,
                        planGoalIds[fact.event_id],
                        planTitles[fact.event_id] ?? `围绕：${fact.summary}`,
                        planPeriods[fact.event_id] as 'weekly' | 'monthly' | 'quarterly',
                      )}
                    >
                      {busyFactKey === `${runId}:plan:${fact.event_id}` ? '创建中' : '创建计划'}
                    </button>
                  </div>
                )}
                {brief.fact_plan_actions[fact.event_id] && <Link to="/app/growth" className="capability-brief-task-created">已创建计划</Link>}
                {!brief.fact_knowledge_actions[fact.event_id] && onCreateKnowledge && (
                  <div className="capability-brief-knowledge-action">
                    <input
                      value={knowledgeTitles[fact.event_id] ?? `知识：${fact.summary}`}
                      maxLength={240}
                      aria-label={`为「${fact.summary}」创建知识卡标题`}
                      onChange={(event) => setKnowledgeTitles((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    />
                    <textarea
                      value={knowledgeContents[fact.event_id] ?? fact.summary}
                      maxLength={7600}
                      aria-label={`确认「${fact.summary}」的知识卡正文`}
                      onChange={(event) => setKnowledgeContents((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    />
                    <select
                      value={knowledgeGoalIds[fact.event_id] ?? ''}
                      aria-label={`选择「${fact.summary}」的知识卡目标关联`}
                      onChange={(event) => setKnowledgeGoalIds((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    >
                      <option value="">仅保存到当前 Workspace</option>
                      {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                    </select>
                    <button
                      type="button"
                      className="outline-action"
                      disabled={
                        busyFactKey === `${runId}:knowledge:${fact.event_id}`
                        || !(knowledgeTitles[fact.event_id] ?? `知识：${fact.summary}`).trim()
                        || !(knowledgeContents[fact.event_id] ?? fact.summary).trim()
                      }
                      onClick={() => onCreateKnowledge(
                        fact.event_id,
                        knowledgeTitles[fact.event_id] ?? `知识：${fact.summary}`,
                        knowledgeContents[fact.event_id] ?? fact.summary,
                        knowledgeGoalIds[fact.event_id] || undefined,
                      )}
                    >
                      {busyFactKey === `${runId}:knowledge:${fact.event_id}` ? '创建中' : '创建知识卡'}
                    </button>
                  </div>
                )}
                {brief.fact_knowledge_actions[fact.event_id] && <Link to="/app/knowledge" className="capability-brief-task-created">已创建知识卡</Link>}
                {!brief.fact_memory_actions[fact.event_id] && onCreateMemory && (
                  <div className="capability-brief-memory-action">
                    <textarea
                      value={memoryContents[fact.event_id] ?? fact.summary}
                      maxLength={4000}
                      aria-label={`确认「${fact.summary}」的 Memory 正文`}
                      onChange={(event) => setMemoryContents((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                    />
                    <div className="capability-brief-memory-fields">
                      <select
                        value={memoryTypes[fact.event_id] ?? 'semantic'}
                        aria-label={`选择「${fact.summary}」的 Memory 类型`}
                        onChange={(event) => setMemoryTypes((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                      >
                        <option value="semantic">长期事实</option>
                        <option value="episodic">经历片段</option>
                        <option value="procedural">行动方法</option>
                      </select>
                      <select
                        value={memoryImportances[fact.event_id] ?? 3}
                        aria-label={`选择「${fact.summary}」的 Memory 重要性`}
                        onChange={(event) => setMemoryImportances((current) => ({ ...current, [fact.event_id]: Number(event.target.value) }))}
                      >
                        <option value={1}>重要性 1</option>
                        <option value={2}>重要性 2</option>
                        <option value={3}>重要性 3</option>
                        <option value={4}>重要性 4</option>
                        <option value={5}>重要性 5</option>
                      </select>
                      <input
                        value={memoryTags[fact.event_id] ?? ''}
                        maxLength={240}
                        aria-label={`填写「${fact.summary}」的 Memory 标签`}
                        placeholder="标签，可用顿号分隔"
                        onChange={(event) => setMemoryTags((current) => ({ ...current, [fact.event_id]: event.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="outline-action"
                      disabled={
                        busyFactKey === `${runId}:memory:${fact.event_id}`
                        || !(memoryContents[fact.event_id] ?? fact.summary).trim()
                      }
                      onClick={() => onCreateMemory(
                        fact.event_id,
                        memoryContents[fact.event_id] ?? fact.summary,
                        memoryTypes[fact.event_id] ?? 'semantic',
                        memoryImportances[fact.event_id] ?? 3,
                        (memoryTags[fact.event_id] ?? '').split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean),
                      )}
                    >
                      {busyFactKey === `${runId}:memory:${fact.event_id}` ? '保存中' : '保存 Memory'}
                    </button>
                  </div>
                )}
                {brief.fact_memory_actions[fact.event_id] && <Link to="/app/memory" className="capability-brief-task-created">已保存 Memory</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Capabilities({ kind }: { kind?: 'app' }) {
  const { state, activeWorkspace, activeProjects, activeGoals } = useWorkspace();
  const [filter, setFilter] = useState<CapabilityFilter>(kind ?? 'all');
  const isAppCenter = kind === 'app';
  const items = useMemo(() => state.capabilities.filter((item) => {
    if (filter === 'all') return !isAppCenter || item.kind === 'app' || item.kind === 'connection';
    return item.kind === filter;
  }), [filter, isAppCenter, state.capabilities]);
  const filters: Array<[CapabilityFilter, string]> = isAppCenter
    ? [['app', '应用'], ['connection', '连接']]
    : [['all', '全部'], ['app', '应用'], ['connection', '连接'], ['plugin', 'Plugin'], ['skill', 'Skill'], ['agent', 'Agent 专家']];
  const enabledCount = state.capabilities.filter((item) => item.status === 'enabled').length;
  const setupCount = state.capabilities.filter((item) => item.status === 'needs_setup').length;

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-kicker">{isAppCenter ? 'APP CENTER' : 'CAPABILITY REGISTRY'}</span>
          <h2>{isAppCenter ? '应用与连接' : '扩展能力目录'}</h2>
          <p>每项能力都保留来源、依赖、权限、状态和当前 Workspace 范围。</p>
        </div>
      </header>
      <section className="capability-banner">
        <div><span className="section-kicker">CURRENT WORKSPACE</span><h3>{activeWorkspace?.name ?? '当前 Workspace'} 的能力</h3><p>启停与权限只保存到这里；已确认的内置简报只会读取当前事实并生成草稿。</p></div>
        <div className="capability-banner-stats"><strong>{enabledCount}</strong><span>已启用</span><strong>{setupCount}</strong><span>需要设置</span></div>
      </section>
      <section className="workspace-panel capability-library">
        <div className="panel-header">
          <div><span className="section-kicker">REGISTRY</span><h3>能力目录</h3></div>
          <div className="filter-tabs" role="tablist" aria-label="能力类型筛选">{filters.map(([value, label]) => <button type="button" className={filter === value ? 'filter-tab is-active' : 'filter-tab'} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        </div>
        <div className="capability-list">{items.map((item) => <CapabilityRow key={item.id} item={item} projects={activeProjects} goals={activeGoals} />)}</div>
      </section>
      <div className="capability-notes"><span>显示的是当前 Workspace 范围内的能力与已确认设置。</span><Link to="/app/mine">查看数据与隐私 →</Link></div>
    </div>
  );
}

function CapabilityRow({ item, projects, goals }: {
  item: Capability;
  projects: ReturnType<typeof useWorkspace>['activeProjects'];
  goals: ReturnType<typeof useWorkspace>['activeGoals'];
}) {
  const {
    updateCapabilitySettings,
    createCapabilityInvocationPreview,
    decideCapabilityInvocation,
    executeCapabilityInvocation,
    createTaskFromBriefFact,
    createGoalFromBriefFact,
    createGrowthPlanFromBriefFact,
    createKnowledgeCardFromBriefFact,
    createMemoryFromBriefFact,
    listCapabilityInvocations,
  } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [inputSummary, setInputSummary] = useState('');
  const [projectId, setProjectId] = useState('');
  const [preview, setPreview] = useState<CapabilityInvocationPayload | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [audits, setAudits] = useState<CapabilityInvocationPayload[] | null>(null);
  const [auditsLoading, setAuditsLoading] = useState(false);
  const [creatingFactKey, setCreatingFactKey] = useState<string | null>(null);
  const kindLabel = item.kind === 'app' ? '应用' : item.kind === 'connection' ? '连接' : item.kind === 'plugin' ? 'Plugin' : item.kind === 'skill' ? 'Skill' : 'Agent Expert';
  const statusLabel = item.status === 'enabled' ? '已启用' : item.status === 'needs_setup' ? '需要设置' : item.status === 'blocked' ? '受阻' : item.status === 'disabled' ? '已停用' : item.status === 'revoked' ? '已撤销' : '可发现';
  const enabled = item.settingStatus === 'enabled';
  const permissions = item.permissions;
  const save = async (nextStatus: 'enabled' | 'disabled', nextPermissions: string[]) => {
    if (nextStatus === 'enabled' && !nextPermissions.length) {
      setNotice('请先确认至少一项权限。');
      return;
    }
    setSaving(true);
    setNotice('');
    const saved = await updateCapabilitySettings(item.id, { status: nextStatus, permissions: nextPermissions });
    setSaving(false);
    if (!saved) setNotice('已保留本地选择，等待网络恢复后确认。');
  };
  const togglePermission = (permission: string) => {
    const next = permissions.includes(permission)
      ? permissions.filter((itemPermission) => itemPermission !== permission)
      : [...permissions, permission];
    void save(enabled ? 'enabled' : 'disabled', next);
  };
  const canPreview = item.kind === 'app' ? item.status === 'available' : item.status === 'enabled';
  const createPreview = async () => {
    if (!inputSummary.trim()) {
      setNotice('请先说明这次调用想完成什么。');
      return;
    }
    setSaving(true);
    setNotice('');
    const nextPreview = await createCapabilityInvocationPreview(item.id, inputSummary, projectId || undefined);
    setSaving(false);
    if (!nextPreview) {
      setNotice('未能创建调用预览。请确认当前能力已启用且网络可用。');
      return;
    }
    setPreview(nextPreview);
    setAudits((current) => current
      ? [nextPreview, ...current.filter((run) => run.id !== nextPreview.id)].slice(0, 5)
      : current);
  };
  const decidePreview = async (decision: 'confirm' | 'plan' | 'reject') => {
    if (!preview) return;
    setSaving(true);
    setNotice('');
    const updated = await decideCapabilityInvocation(preview.id, decision);
    setSaving(false);
    if (!updated) {
      setNotice('未能保存这次决定；能力状态可能已变化。');
      return;
    }
    setPreview(updated);
    setAudits((current) => current
      ? current.map((run) => run.id === updated.id ? updated : run)
      : current);
  };
  const canGenerateBrief = (run: CapabilityInvocationPayload) => (
    item.slug === 'weekly-brief-plugin'
    && run.status === 'confirmed'
    && run.execution_state === 'not_started'
  );
  const generateBrief = async (run: CapabilityInvocationPayload) => {
    setSaving(true);
    setNotice('');
    const updated = await executeCapabilityInvocation(run.id);
    setSaving(false);
    if (!updated) {
      setNotice('未能生成简报草稿；请确认能力仍已启用且网络可用。');
      return;
    }
    setPreview((current) => current?.id === updated.id ? updated : current);
    setAudits((current) => current
      ? current.map((itemRun) => itemRun.id === updated.id ? updated : itemRun)
      : current);
  };
  const createBriefTask = async (run: CapabilityInvocationPayload, eventId: string, title: string) => {
    if (!title.trim()) {
      setNotice('请先填写待办标题。');
      return;
    }
    setCreatingFactKey(`${run.id}:${eventId}`);
    setNotice('');
    const result = await createTaskFromBriefFact(run.id, eventId, title);
    setCreatingFactKey(null);
    if (!result) {
      setNotice('未能创建待办；该事实可能已被转换或当前状态已变化。');
      return;
    }
    setPreview((current) => current?.id === result.invocation.id ? result.invocation : current);
    setAudits((current) => current
      ? current.map((itemRun) => itemRun.id === result.invocation.id ? result.invocation : itemRun)
      : current);
  };
  const createBriefGoal = async (run: CapabilityInvocationPayload, eventId: string, title: string) => {
    setCreatingFactKey(`${run.id}:goal:${eventId}`);
    setNotice('');
    const result = await createGoalFromBriefFact(run.id, eventId, title);
    setCreatingFactKey(null);
    if (!result) {
      setNotice('未能创建目标；该事实可能已被转换或当前状态已变化。');
      return;
    }
    setPreview((current) => current?.id === result.invocation.id ? result.invocation : current);
    setAudits((current) => current ? current.map((itemRun) => itemRun.id === result.invocation.id ? result.invocation : itemRun) : current);
  };
  const createBriefPlan = async (
    run: CapabilityInvocationPayload,
    eventId: string,
    goalId: string,
    title: string,
    periodType: 'weekly' | 'monthly' | 'quarterly',
  ) => {
    setCreatingFactKey(`${run.id}:plan:${eventId}`);
    setNotice('');
    const result = await createGrowthPlanFromBriefFact(run.id, eventId, goalId, title, periodType);
    setCreatingFactKey(null);
    if (!result) {
      setNotice('未能创建计划；该事实、目标或当前状态可能已变化。');
      return;
    }
    setPreview((current) => current?.id === result.invocation.id ? result.invocation : current);
    setAudits((current) => current ? current.map((itemRun) => itemRun.id === result.invocation.id ? result.invocation : itemRun) : current);
  };
  const createBriefKnowledge = async (
    run: CapabilityInvocationPayload,
    eventId: string,
    title: string,
    content: string,
    goalId?: string,
  ) => {
    setCreatingFactKey(`${run.id}:knowledge:${eventId}`);
    setNotice('');
    const result = await createKnowledgeCardFromBriefFact(run.id, eventId, title, content, goalId);
    setCreatingFactKey(null);
    if (!result) {
      setNotice('未能创建知识卡；该事实、目标或当前状态可能已变化。');
      return;
    }
    setPreview((current) => current?.id === result.invocation.id ? result.invocation : current);
    setAudits((current) => current ? current.map((itemRun) => itemRun.id === result.invocation.id ? result.invocation : itemRun) : current);
  };
  const createBriefMemory = async (
    run: CapabilityInvocationPayload,
    eventId: string,
    content: string,
    memoryType: string,
    importance: number,
    tags: string[],
  ) => {
    setCreatingFactKey(`${run.id}:memory:${eventId}`);
    setNotice('');
    const result = await createMemoryFromBriefFact(run.id, eventId, content, memoryType, importance, tags);
    setCreatingFactKey(null);
    if (!result) {
      setNotice('未能保存 Memory；该事实或当前状态可能已变化。');
      return;
    }
    setPreview((current) => current?.id === result.invocation.id ? result.invocation : current);
    setAudits((current) => current ? current.map((itemRun) => itemRun.id === result.invocation.id ? result.invocation : itemRun) : current);
  };
  const toggleAudits = async () => {
    if (auditOpen) {
      setAuditOpen(false);
      return;
    }
    if (audits) {
      setAuditOpen(true);
      return;
    }
    setAuditsLoading(true);
    setNotice('');
    const history = await listCapabilityInvocations(item.id);
    setAuditsLoading(false);
    if (!history) {
      setNotice('未能读取审计记录。请确认网络可用后重试。');
      return;
    }
    setAudits(history);
    setAuditOpen(true);
  };
  return (
    <article className="capability-row">
      <span className="capability-row-icon" style={{ background: item.accent }}>{item.icon}</span>
      <div className="capability-row-copy">
        <div><strong>{item.name}</strong><span className={`capability-status status-${item.status}`}>{statusLabel}</span></div>
        <p>{item.description}</p>
        <small>{kindLabel} · {item.scope} · {item.source} v{item.version}</small>
        <div className="capability-metadata">
          <span>依赖：{item.dependencies.length ? item.dependencies.join('、') : '无'}</span>
          <span>权限：{item.permissions.length ? item.permissions.join('、') : '尚未确认'}</span>
        </div>
        {item.blockedReason && <p className="capability-blocked-reason">{item.blockedReason}</p>}
        {item.settingsSyncState === 'local' && <small className="capability-sync-pending">本地暂存，尚未完成授权确认</small>}
        {notice && <small className="capability-sync-pending">{notice}</small>}
        {canPreview && (
          <section className="capability-invocation">
            {!previewOpen ? (
              <button type="button" className="text-button capability-preview-trigger" onClick={() => setPreviewOpen(true)}>调用预览</button>
            ) : !preview ? (
              <div className="capability-invocation-form">
                <label>
                  <span>这次想完成什么</span>
                  <textarea value={inputSummary} maxLength={1200} onChange={(event) => setInputSummary(event.target.value)} placeholder="例如：根据本周已确认的工作事实，准备一份可审阅的周度简报。" />
                </label>
                {projects.length > 0 && (
                  <label>
                    <span>关联项目 <small>可跳过</small></span>
                    <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                      <option value="">仅关联当前 Workspace</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </label>
                )}
                <div className="capability-invocation-actions">
                  <button type="button" className="text-button" onClick={() => setPreviewOpen(false)}>取消</button>
                  <button type="button" className="primary-action" disabled={saving || !inputSummary.trim()} onClick={() => void createPreview()}>{saving ? '生成中' : '生成预览'}</button>
                </div>
              </div>
            ) : (
              <div className="capability-invocation-preview" aria-live="polite">
                <span className="section-kicker">INVOCATION PREVIEW</span>
                <dl>
                  <div><dt>输入摘要</dt><dd>{preview.input_summary}</dd></div>
                  <div><dt>访问范围</dt><dd>{preview.access_scope}</dd></div>
                  <div><dt>权限</dt><dd>{preview.permission_snapshot.length ? preview.permission_snapshot.join('、') : '无额外权限'}</dd></div>
                  <div><dt>预期产出</dt><dd>{preview.expected_output}</dd></div>
                </dl>
                <p>本次执行状态：{executionStateLabel(preview.execution_state)}。确认后不会自动生成或写入结果。</p>
                {preview.status === 'awaiting_confirmation' ? (
                  <div className="capability-invocation-actions">
                    <button type="button" className="text-button" disabled={saving} onClick={() => void decidePreview('reject')}>拒绝</button>
                    <button type="button" className="outline-action" disabled={saving} onClick={() => void decidePreview('plan')}>仅保存计划</button>
                    <button type="button" className="primary-action" disabled={saving} onClick={() => void decidePreview('confirm')}>确认授权</button>
                  </div>
                ) : (
                  <div className="capability-invocation-result">
                    <strong className="capability-decision-state">{preview.status === 'confirmed' ? '已确认授权，尚未生成草稿' : preview.status === 'planned' ? '已保存计划，尚未执行' : preview.status === 'completed' ? '简报草稿已生成' : '已拒绝，未执行'}</strong>
                    {canGenerateBrief(preview) && <button type="button" className="outline-action" disabled={saving} onClick={() => void generateBrief(preview)}>{saving ? '生成中' : '生成简报草稿'}</button>}
                    {preview.brief && <BriefDraft brief={preview.brief} runId={preview.id} busyFactKey={creatingFactKey} goals={goals} onCreateTask={(eventId, title) => void createBriefTask(preview, eventId, title)} onCreateGoal={(eventId, title) => void createBriefGoal(preview, eventId, title)} onCreatePlan={(eventId, goalId, title, periodType) => void createBriefPlan(preview, eventId, goalId, title, periodType)} onCreateKnowledge={(eventId, title, content, goalId) => void createBriefKnowledge(preview, eventId, title, content, goalId)} onCreateMemory={(eventId, content, memoryType, importance, tags) => void createBriefMemory(preview, eventId, content, memoryType, importance, tags)} />}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        <section className="capability-audit">
          <button type="button" className="text-button capability-audit-trigger" disabled={auditsLoading} onClick={() => void toggleAudits()}>
            {auditsLoading ? '读取审计中' : auditOpen ? '收起审计' : '查看审计'}
          </button>
          {auditOpen && (
            <div className="capability-audit-list" aria-live="polite">
              {audits?.length ? audits.map((audit) => (
                <article className="capability-audit-item" key={audit.id}>
                  <div className="capability-audit-item-header">
                    <strong>{invocationStatusLabel(audit.status)}</strong>
                    <time dateTime={audit.created_at}>{audit.created_at.slice(0, 16).replace('T', ' ')}</time>
                  </div>
                  <dl>
                    <div><dt>输入</dt><dd>{audit.input_summary}</dd></div>
                    <div><dt>范围</dt><dd>{audit.access_scope}</dd></div>
                    <div><dt>权限</dt><dd>{audit.permission_snapshot.length ? audit.permission_snapshot.join('、') : '无额外权限'}</dd></div>
                    <div><dt>产出</dt><dd>{audit.expected_output}</dd></div>
                  </dl>
                  <p>执行状态：{executionStateLabel(audit.execution_state)}</p>
                  {canGenerateBrief(audit) && <button type="button" className="outline-action capability-brief-trigger" disabled={saving} onClick={() => void generateBrief(audit)}>{saving ? '生成中' : '生成简报草稿'}</button>}
                  {audit.brief && <BriefDraft brief={audit.brief} runId={audit.id} busyFactKey={creatingFactKey} goals={goals} onCreateTask={(eventId, title) => void createBriefTask(audit, eventId, title)} onCreateGoal={(eventId, title) => void createBriefGoal(audit, eventId, title)} onCreatePlan={(eventId, goalId, title, periodType) => void createBriefPlan(audit, eventId, goalId, title, periodType)} onCreateKnowledge={(eventId, title, content, goalId) => void createBriefKnowledge(audit, eventId, title, content, goalId)} onCreateMemory={(eventId, content, memoryType, importance, tags) => void createBriefMemory(audit, eventId, content, memoryType, importance, tags)} />}
                </article>
              )) : <p className="capability-audit-empty">当前能力还没有审计记录。</p>}
            </div>
          )}
        </section>
      </div>
      {item.configurable && (
        <div className="capability-controls">
          <label className="capability-switch">
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              disabled={saving || (Boolean(item.blockedReason) && !enabled)}
              onChange={(event) => void save(event.target.checked ? 'enabled' : 'disabled', permissions)}
            />
            <span aria-hidden="true" />
            <b>{enabled ? '已启用' : '启用'}</b>
          </label>
          <div className="capability-permissions" aria-label={`${item.name} 权限`}>
            {item.availablePermissions.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={permissions.includes(permission)}
                  disabled={saving || Boolean(item.blockedReason)}
                  onChange={() => togglePermission(permission)}
                />
                <span>{permission}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
