import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { buildGrowthOverview } from '../../workspace/growthOverview';
import type { PrivacySourceKey } from '../../workspace/workspaceData';
import { useWorkspace } from '../../workspace/useWorkspace';
import './workspace.css';

export default function Mine() {
  const {
    state,
    activeWorkspace,
    activeGoals,
    activePlans,
    activeTasks,
    activeLearning,
    activeActivities,
    activeCaptures,
    activeReflections,
    dailyPreferences,
    updateDailyPreferences,
    privacyScope,
    updatePrivacyScope,
  } = useWorkspace();
  const [timezone, setTimezone] = useState(dailyPreferences.timezone);
  const [morningTime, setMorningTime] = useState(dailyPreferences.morningTime);
  const [eveningTime, setEveningTime] = useState(dailyPreferences.eveningTime);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesNotice, setPreferencesNotice] = useState('');
  const [selectedPrivacySources, setSelectedPrivacySources] = useState<PrivacySourceKey[]>(privacyScope.enabledSources);
  const [savingPrivacyScope, setSavingPrivacyScope] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState('');

  useEffect(() => {
    setTimezone(dailyPreferences.timezone);
    setMorningTime(dailyPreferences.morningTime);
    setEveningTime(dailyPreferences.eveningTime);
  }, [dailyPreferences.eveningTime, dailyPreferences.morningTime, dailyPreferences.timezone]);

  useEffect(() => {
    setSelectedPrivacySources(privacyScope.enabledSources);
  }, [privacyScope.enabledSources]);

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPreferences(true);
    setPreferencesNotice('');
    const saved = await updateDailyPreferences({ timezone, morningTime, eveningTime });
    setSavingPreferences(false);
    setPreferencesNotice(saved ? '已保存提醒偏好。' : '未能保存提醒偏好，请检查时区和网络。');
  };
  const savePrivacyScope = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPrivacyScope(true);
    setPrivacyNotice('');
    const saved = await updatePrivacyScope(selectedPrivacySources);
    setSavingPrivacyScope(false);
    setPrivacyNotice(saved ? '已保存 Agent 数据范围。新的 Agent 请求会遵守这份设置。' : '未能保存数据范围，请检查网络。');
  };
  const togglePrivacySource = (source: PrivacySourceKey) => {
    setSelectedPrivacySources((current) => current.includes(source)
      ? current.filter((item) => item !== source)
      : [...current, source]);
  };
  const overview = buildGrowthOverview({
    goals: activeGoals,
    plans: activePlans,
    tasks: activeTasks,
    learningItems: activeLearning,
    reflections: activeReflections,
  });
  const metrics = [
    {
      label: '目标推进',
      value: overview.goalProgress === null ? '待记录' : `${overview.goalProgress}%`,
      detail: activeGoals.length ? `${activeGoals.length} 个目标的平均进度` : '先创建一个目标',
    },
    {
      label: '计划推进',
      value: overview.planProgress === null ? '待记录' : `${overview.planProgress}%`,
      detail: activePlans.length ? `${activePlans.length} 个计划的平均进度` : '先建立一个周期计划',
    },
    {
      label: '任务完成',
      value: overview.taskCompletionRate === null ? '待记录' : `${overview.taskCompletionRate}%`,
      detail: activeTasks.length ? `已完成 ${overview.completedTaskCount}/${activeTasks.length} 个任务` : '先添加一个下一步',
    },
    {
      label: '学习进度',
      value: overview.learningProgress === null ? '待记录' : `${overview.learningProgress}%`,
      detail: activeLearning.length ? `${activeLearning.length} 项学习的平均进度` : '先添加一个学习入口',
    },
    {
      label: '复盘天数',
      value: `${overview.reflectionDays} 天`,
      detail: overview.reflectionDays ? '按晨间或晚间的日期去重' : '晨间或晚间开始积累',
    },
    {
      label: '计划节点',
      value: `${overview.milestoneCount} 个`,
      detail: overview.milestoneCount ? '只统计已定义节点，不推断完成' : '计划中尚未定义节点',
    },
  ];

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-kicker">PERSONAL CONTROL ROOM</span>
          <h2>我的</h2>
          <p>管理你的个人上下文、数据和能力范围。</p>
        </div>
        <Link to="/app/onboarding" className="outline-action">重新建立上下文 →</Link>
      </header>

      <section className="mine-profile">
        <div className="mine-avatar">Z</div>
        <div>
          <span className="section-kicker">YOUR CONTEXT</span>
          <h3>成长者</h3>
          <p>以工作为入口，以成长为结果。你的系统会从真实行动中逐渐理解你。</p>
        </div>
        <span className="profile-ready"><i />上下文已连接</span>
      </section>

      <section className="mine-growth-overview">
        <div className="panel-header">
          <div>
            <span className="section-kicker">GROWTH OVERVIEW</span>
            <h3>{activeWorkspace.name} 的成长数据</h3>
          </div>
          <span className="muted-note">来自当前 Workspace 的领域事实</span>
        </div>
        <div className="mine-growth-metrics">
          {metrics.map((metric) => (
            <div className="mine-growth-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <small>{metric.detail}</small>
            </div>
          ))}
        </div>
        <p className="mine-growth-note">目标、计划和学习按各自进度平均计算；任务按已完成任务占比计算。尚未录入的领域会显示待记录，不代表表现为零。</p>
      </section>

      <div className="mine-grid">
        <section className="workspace-panel">
          <div className="panel-header">
            <div><span className="section-kicker">DATA OVERVIEW</span><h3>你的数据正在变得有用</h3></div>
          </div>
          <div className="mine-stat-grid">
            <div><strong>{activeTasks.length}</strong><span>任务</span></div>
            <div><strong>{activeLearning.length}</strong><span>学习输入</span></div>
            <div><strong>{activeCaptures.length}</strong><span>快速记录</span></div>
            <div><strong>{activeActivities.length}</strong><span>工作台事件</span></div>
          </div>
          <p className="mine-note">这些计数只属于当前 Workspace。日常工作仍然从首页、待办和学习入口开始。</p>
        </section>

        <section className="workspace-panel mine-links">
          <div className="panel-header">
            <div><span className="section-kicker">PERSONAL DATA</span><h3>数据与历史工具</h3></div>
          </div>
          <Link to="/app/memory"><span>◍</span><div><strong>Memory 与长期上下文</strong><small>查看系统记住了什么</small></div><b>→</b></Link>
          <Link to="/app/knowledge-base"><span>▤</span><div><strong>旧知识库入口</strong><small>已保留的历史知识功能</small></div><b>→</b></Link>
          <Link to="/app/records"><span>↳</span><div><strong>历史交易工具</strong><small>记录、复盘、持仓和行情</small></div><b>→</b></Link>
        </section>
      </div>

      <section className="workspace-panel daily-preferences-panel">
        <div className="panel-header">
          <div><span className="section-kicker">DAILY RHYTHM</span><h3>晨晚节奏</h3></div>
          <span className="muted-note">系统通知未开启</span>
        </div>
        <form onSubmit={savePreferences}>
          <label>
            <span>时区</span>
            <input value={timezone} list="daily-timezones" onChange={(event) => setTimezone(event.target.value)} aria-label="时区" />
            <datalist id="daily-timezones">
              <option value="Asia/Shanghai" />
              <option value="Asia/Tokyo" />
              <option value="Asia/Singapore" />
              <option value="America/Los_Angeles" />
              <option value="America/New_York" />
              <option value="Europe/London" />
            </datalist>
          </label>
          <label>
            <span>晨间时间</span>
            <input type="time" value={morningTime} onChange={(event) => setMorningTime(event.target.value)} aria-label="晨间提醒时间" />
          </label>
          <label>
            <span>晚间时间</span>
            <input type="time" value={eveningTime} onChange={(event) => setEveningTime(event.target.value)} aria-label="晚间提醒时间" />
          </label>
          <button type="submit" className="primary-action" disabled={savingPreferences}>{savingPreferences ? '保存中' : '保存节奏'}</button>
        </form>
        {preferencesNotice && <p className="daily-preferences-notice" role="status">{preferencesNotice}</p>}
      </section>

      <section className="workspace-panel privacy-scope-panel">
        <div className="panel-header">
          <div><span className="section-kicker">AGENT DATA SCOPE</span><h3>Agent 可以参考哪些数据</h3></div>
          <span className="muted-note">默认全部开启</span>
        </div>
        <p className="mine-note">这是新 Personal Agent 的读取范围。关闭来源只影响之后的新请求，已经生成的回复和引用不会被改写。旧交易教练仍是历史工具，不属于这份新范围。</p>
        <form onSubmit={savePrivacyScope}>
          <div className="privacy-scope-options">
            {([
              ['tasks', '任务', '当前 Workspace 的任务状态和下一步。'],
              ['goals', '目标', '当前 Workspace 的目标与进度。'],
              ['plans', '计划', '当前 Workspace 的周期计划。'],
              ['learning', '学习', '当前 Workspace 的学习入口与进度。'],
              ['knowledge_cards', '知识卡', '已保存且确认过的知识卡内容。'],
              ['reflections', '晨晚复盘与快速记录', 'Morning、Micro Capture 和 Evening。'],
              ['memories', '长期 Memory', '长期保存的个人事实和记忆。'],
            ] as const).map(([key, label, description]) => (
              <label className="privacy-scope-option" key={key}>
                <input type="checkbox" checked={selectedPrivacySources.includes(key)} onChange={() => togglePrivacySource(key)} />
                <span><strong>{label}</strong><small>{description}</small></span>
              </label>
            ))}
          </div>
          <button type="submit" className="primary-action" disabled={savingPrivacyScope}>{savingPrivacyScope ? '保存中' : '保存数据范围'}</button>
        </form>
        {privacyNotice && <p className="daily-preferences-notice" role="status">{privacyNotice}</p>}
      </section>

      <section className="privacy-band">
        <div>
          <span className="section-kicker">WEB-FIRST / MINIAPP COMPANION</span>
          <strong>完整工作台在 Web，常用动作在小程序</strong>
          <p>小程序只承载快速记录、Morning、Evening、提醒和今日任务，复杂的组织、学习和分析留在 Web。</p>
        </div>
        <Link to="/app/extensions" className="outline-action">管理连接与权限 →</Link>
      </section>

      <section className="workspace-panel active-workspace-panel">
        <div className="panel-header">
          <div><span className="section-kicker">WORKSPACES</span><h3>我的工作空间</h3></div>
          <span className="muted-note">{state.workspaces.length} 个空间</span>
        </div>
        <div className="workspace-list">
          {state.workspaces.map((workspace) => (
            <div className={workspace.id === activeWorkspace.id ? 'workspace-list-row is-active' : 'workspace-list-row'} key={workspace.id}>
              <span className="workspace-list-mark" style={{ background: workspace.color }}>{workspace.name.slice(0, 1)}</span>
              <div><strong>{workspace.name}</strong><small>{workspace.description}</small></div>
              <span>{workspace.updatedLabel}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
