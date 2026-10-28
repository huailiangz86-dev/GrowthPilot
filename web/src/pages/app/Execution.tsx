import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useExecution } from '../../execution/useExecution';
import type { ExecutionJob } from '../../execution/ExecutionContext';
import { useWorkspace } from '../../workspace/useWorkspace';
import { calendarSubscriptionUrl } from '../../execution/calendarConnection';
import ReminderSettings from '../../execution/ReminderSettings';
import './Execution.css';

const EXECUTION_LABELS: Record<ExecutionJob['status'], string> = {
  pending: '等待处理', waiting: '等待行动结果', blocked: '需要处理', paused: '已暂停', completed: '已产出结果', failed: '自动重试中',
};
export function ExecutionSummary() {
  const { data, error, loading, refresh } = useExecution();
  const { activePlans } = useWorkspace();
  const latest = data?.jobs.find(job => job.kind === 'analysis');
  return <section className="workspace-panel execution-summary">
    <div className="panel-header"><div><span className="section-kicker">系统正在做什么</span><h3>持续执行</h3></div><span className={`execution-health ${data?.worker.online && !error ? 'online' : ''}`}>{loading && !data ? '正在连接' : data?.worker.online && !error ? '后台运行中' : '后台状态待确认'}</span></div>
    <p>{latest?.result.summary ?? '后台会持续汇总真实记录、检查到期行动，并按已启用的计划安排下一步。'}</p>
    <div className="execution-summary-meta"><span>{activePlans.filter(plan => plan.executionEnabled).length} 个计划已启用</span><span>{latest?.result.overdue?.length ?? 0} 项到期行动</span><Link to="/app/execution">查看执行过程 →</Link></div>
    {error && <p role="alert" className="execution-error">{error} <button type="button" className="text-button" onClick={refresh}>重新连接</button></p>}
    {data && !data.worker.online && !error && <p className="execution-error">执行服务没有近期心跳，当前结果可能尚未更新。</p>}
  </section>;
}

export default function Execution() {
  const { data, error, loading, refresh } = useExecution();
  const { activePlans, activeWorkspace } = useWorkspace();
  const unstarted = activePlans.filter(plan => !plan.executionEnabled);
  return <div className="page-stack execution-page">
    <header className="page-intro"><div><span className="section-kicker">执行与应用</span><h2>看到系统实际做了什么</h2><p>服务运行期间，关闭页面后排程和汇总仍会继续。需要你完成的行动会等待真实结果。</p></div><Link className="outline-action" to="/app/growth">管理计划 →</Link></header>
    <ExecutionSummary />
    {error && <div className="execution-error" role="alert">{error} <button className="text-button" onClick={refresh}>重试读取</button></div>}
    <div className="execution-columns"><section className="workspace-panel"><div className="panel-header"><h3>执行队列</h3><span className="muted-note">{loading && !data ? '读取中…' : `${data?.jobs.length ?? 0} 项`}</span></div>
      {data?.jobs.map(job => <article className="execution-job" key={job.id}><div className="execution-job-top"><strong>{job.title}</strong><span className={`execution-state ${job.status}`}>{EXECUTION_LABELS[job.status]}</span></div><p>{job.error ?? job.result.summary}</p>
        {job.result.steps && <ol className="execution-steps">{job.result.steps.map(step => <li key={step.task_id} className={step.status === 'done' ? 'done' : ''}><span>{step.title}</span><small>{step.status === 'done' ? '已完成' : step.status === 'pending' ? '上一项完成后安排' : step.status === 'blocked' ? '阻塞' : '已进入待办'}</small></li>)}</ol>}
        <div className="execution-job-footer"><small>{job.last_run_at ? `最近处理 ${new Date(job.last_run_at).toLocaleString('zh-CN')}` : '等待首次处理'}{job.status === 'failed' ? ` · 下次重试 ${new Date(job.next_run_at).toLocaleTimeString('zh-CN')}` : ''}</small><Link to={job.kind === 'analysis' ? '/app/insights' : job.kind === 'learning' ? `/app/learn/${job.resource_id}?flow=1` : '/app/tasks'}>{job.kind === 'analysis' ? '查看分析结果' : job.kind === 'learning' ? '打开学习资源' : '打开实际待办'} ↗</Link></div>
      </article>)}
      {!loading && !data?.jobs.length && <p className="inline-empty">服务连接后会建立汇总任务。创建包含具体步骤的计划，后台会自动安排第一步。</p>}
      {unstarted.length > 0 && <p className="execution-footnote">{unstarted.length} 个已有计划尚未启用。<Link to="/app/growth">查看并启用 →</Link></p>}
    </section><aside className="execution-side"><CalendarConnection key={activeWorkspace.id} /><ReminderSettings key={`push:${activeWorkspace.id}`} workspaceId={activeWorkspace.id} /><section className="workspace-panel"><h3>最近执行记录</h3><div className="execution-history">{data?.events.map(event => <article key={event.id}><strong>{event.payload.title}</strong><p>{event.payload.summary ?? '已写入实际待办。'}</p><time>{new Date(event.created_at).toLocaleString('zh-CN')}</time></article>)}{!data?.events.length && <p className="inline-empty">后台产出结果后会在这里留下记录。</p>}</div></section></aside></div>
  </div>;
}

export function CalendarConnection() {
  const { activeWorkspace } = useWorkspace();
  const [url, setUrl] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState({deadlines:true,blocks:true,reviews:true});
  useEffect(() => {
    let active=true;
    void api.get<{connected:boolean;scope:typeof scope|null}>('/execution/calendar-subscription',{workspace_id:activeWorkspace.id})
      .then(result=>{if(active&&result.connected&&result.scope){setScope(result.scope);setNotice('已有服务器订阅。可按所选范围导出；重新生成地址将更新范围并使旧地址失效。');}})
      .catch(()=>{if(active)setNotice('现有订阅状态暂时无法读取，可重新进入页面核对。');});
    return()=>{active=false;};
  },[activeWorkspace.id]);
  const pending = useRef(false);
  const connect = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice(''); setUrl('');
    try {
      const result = await api.post<{url: string}>('/execution/calendar-subscription?workspace_id=' + encodeURIComponent(activeWorkspace.id), scope);
      setUrl(calendarSubscriptionUrl(result.url));
      setNotice('订阅地址已生成，旧地址已失效。将下面地址添加到日历的订阅功能。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '生成订阅失败'); }
    finally { pending.current = false; setBusy(false); }
  };
  const revoke = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await api.delete('/execution/calendar-subscription?workspace_id=' + encodeURIComponent(activeWorkspace.id)); setUrl(''); setNotice('日历订阅已撤销。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '撤销失败'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="workspace-panel calendar-connection"><span className="section-kicker">实际应用</span><h3>订阅服务器日历</h3><p>将服务器生成的只读订阅地址添加到手机或电脑日历，已选范围的工作时段、截止标记和复习日期会由日历应用定期读取。</p><p className="execution-footnote">订阅使用部署域名，由服务器提供。日历应用决定刷新频率；关闭 GrowthPilot 页面后仍可读取。</p><fieldset disabled={busy}><legend>本次导出或生成地址的范围</legend>{([['deadlines','工作截止日期'],['blocks','实际安排的工作时段'],['reviews','已保存的复习日期']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={scope[key]} onChange={e=>setScope(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}</fieldset><button disabled={busy} onClick={()=>{void fetch(`/api/v1/execution/calendar-export?${new URLSearchParams({workspace_id:activeWorkspace.id,...Object.fromEntries(Object.entries(scope).map(([k,v])=>[k,String(v)]))})}`,{headers:{Authorization:`Bearer ${localStorage.getItem('gp_token')||''}`}}).then(async response=>{if(!response.ok)throw Error('导出失败，请重试读取');const blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download='growthpilot.ics';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}).catch(e=>setNotice(e.message));}}>导出所选范围 ICS</button><div className="calendar-actions"><button type="button" className="outline-action" disabled={busy} onClick={() => {void connect();}}>{busy ? '处理中…' : url ? '重新生成地址' : '生成日历订阅地址'}</button><button type="button" className="text-button" disabled={busy} onClick={() => {void revoke();}}>撤销订阅</button></div>
    {url && <label className="calendar-url"><span>只读订阅地址</span><input aria-label="日历订阅地址" readOnly value={url} onFocus={event => event.target.select()}/><button className="text-button" onClick={() => {void navigator.clipboard.writeText(url).then(() => setNotice('订阅地址已复制。')).catch(() => setNotice('请选中并复制上面的地址。'));}}>复制地址</button></label>}
    {notice && <p role="status" className="execution-footnote">{notice}</p>}
  </section>;
}
