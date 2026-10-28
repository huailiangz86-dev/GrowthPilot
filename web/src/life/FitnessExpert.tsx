import FitnessProfileFields, {FitnessProfileSummary} from './FitnessProfileFields';
import {blankProfile, type FitnessProfile} from './fitnessContext';
import {useCallback, useEffect, useRef, useState} from 'react';
import {api, ApiError} from '../api/client';
import Modal from '../components/Modal';
import {captureOwnerId} from '../workspace/captureSync';
import {localDate, type Entity} from './store';
import {dateRange, freezeExpert, restoreExpert, validateRange, type Arrangement, type ExpertCommand, type ExpertJournal, type ExpertSnapshot, type Plan, type PlanDraft, type Range, type Review, type Rule} from './expertStore';
import './expert.css';
import ExpertSkillDetails from '../help/ExpertSkillDetails';

export default function FitnessExpert({owner, tabId, revision, entryRange, onOpen, onFeedback, onAccess}: {
  owner: string; tabId: string; revision: string; entryRange: Range | null; onOpen: (id: string) => void; onFeedback: (plan: Plan) => void; onAccess: () => void;
}) {
  const key = `gp_fitness_expert:${owner}:${tabId}`, today = localDate('Asia/Shanghai');
  const [initial] = useState(() => {
    try {const restored = restoreExpert(localStorage,key,today); return {journal:entryRange ? {...restored, range: entryRange} : restored,error:''};}
    catch(e) {return {journal:{version:1 as const,range:dateRange(today),request:null,command:null,plan:null,rule:null},error:e instanceof Error ? e.message : '草稿无法读取'};}
  });
  const [storageError, setStorageError] = useState(initial.error);
  const [journal, setJournal] = useState<ExpertJournal>(initial.journal);
  const current = useRef(journal); current.current = journal;
  const [data, setData] = useState<ExpertSnapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), busyRef = useRef(false), [planOpen, setPlanOpen] = useState(Boolean(journal.plan));
  const [history, setHistory] = useState<{kind: 'plan' | 'rule' | 'profile'; rows: Entity<Arrangement | Rule | FitnessProfile>[]} | null>(null);
  const [offset, setOffset] = useState(0);
  const disposed = useRef(false), readSequence = useRef(0);
  const authorized = useCallback(() => !disposed.current && captureOwnerId(localStorage.getItem('gp_token')) === owner, [owner]);
  const ownedRequest = useCallback(async <T,>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> => {
    if (!authorized()) throw new Error('登录账户已改变，请重新打开健身档案。');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort',abort,{once:true}); if(signal?.aborted) controller.abort();
    const timeout = setTimeout(abort,12000);
    try {
      const value = payload ? await api.post<T>(path,payload,{signal:controller.signal}) : await api.get<T>(path,undefined,{signal:controller.signal});
      if (!authorized()) throw new Error('登录账户已改变，旧结果已丢弃。');
      return value;
    } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  }, [authorized]);
  const persist = useCallback((next: ExpertJournal) => {
    if (initial.error || !authorized()) return false;
    current.current = next; setJournal(next);
    try {localStorage.setItem(key,JSON.stringify(next));setStorageError('');return true;}
    catch {setStorageError('浏览器无法保存草稿，请保留页面，释放空间后再继续。'); return false;}
  }, [key, initial.error, authorized]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++readSequence.current;
    try {const value = await ownedRequest<ExpertSnapshot>(`/fitness-expert?offset=${offset}`,undefined,signal); if (!signal?.aborted && sequence === readSequence.current) {setData(value);setError('');}}
    catch(e) {if (!signal?.aborted && authorized() && sequence === readSequence.current) {setData(null); setError(e instanceof Error ? e.message : '暂时无法读取专家内容');}}
  }, [offset, ownedRequest, authorized]);
  useEffect(() => {
    disposed.current = false;
    const controller = new AbortController(); setData(null); void refresh(controller.signal);
    const check = () => {if (document.visibilityState === 'visible') void refresh(controller.signal);};
    const timer = setInterval(check,5000); window.addEventListener('focus',check); window.addEventListener('online',check);
    return () => {disposed.current = true;controller.abort();clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);};
  }, [refresh, revision]);
  async function sendPending(value = current.current) {
    if (busyRef.current || storageError || (!value.request && !value.command)) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (value.command) {
        await ownedRequest('/fitness-expert/commands',value.command);
        const profileSaved=value.command.action==='save_profile', ruleSaved=value.command.action==='save_rule';
        const next = {...current.current,command:null,profile:profileSaved ? null : current.current.profile,profileBaseVersion:profileSaved ? undefined : current.current.profileBaseVersion,
          plan:profileSaved || ruleSaved ? current.current.plan : null,rule:ruleSaved ? null : current.current.rule,ruleBaseVersion:ruleSaved ? undefined : current.current.ruleBaseVersion};
        if (persist(next)) {if(!profileSaved && !ruleSaved)setPlanOpen(false);setNotice(profileSaved ? '背景已保存；已有回顾须按当前背景重新核对。' : '安排或规则已保存，实际活动仍需本人记录。');}

      } else if (value.request) {
        await ownedRequest<Review>('/fitness-expert/reviews',value.request);
        if (persist({...current.current,request:null})) setNotice('回顾请求已保存，后台会处理，关闭页面后仍会继续。');
      }
      await refresh();
    } catch(e) {setError(e instanceof Error ? e.message : '提交尚未确认，原内容已保留'); if (e instanceof ApiError && e.status === 409) await refresh();}
    finally {busyRef.current = false;setBusy(false);}
  }
  useEffect(() => {
    // Replay a frozen submission once on remount or reconnection, without new IDs.
    void sendPending(); const retry = () => void sendPending(); window.addEventListener('online',retry);
    return () => window.removeEventListener('online',retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function review() {
    try {
      validateRange(journal.range);
      if (journal.range.end > today) throw new Error('回顾日期不能包含未来。');
      const next = {...journal, request:{...journal.range,request_id:crypto.randomUUID(),timezone:'Asia/Shanghai',consent:true as const}};
      if (persist(next)) void sendPending(next);
    } catch(e) {setError(e instanceof Error ? e.message : '请核对日期');}
  }
  function command(payload: Omit<ExpertCommand,'request_id'>) {
    const next = {...current.current,command:freezeExpert(payload,crypto.randomUUID())};
    if (persist(next)) void sendPending(next);
  }
  function openPlan(value: PlanDraft) {if (persist({...journal,plan:value})) setPlanOpen(true);}
  function adopt(review: Review) {
    const existing = data?.plans.find(p => p.review_id === review.id);
    if (existing) {if (existing.feedback) onFeedback(existing); else openPlan({entityId:existing.id,version:existing.version,action:'save_plan',data:existing.content}); return;}
    if (review.result) openPlan({entityId:review.id,version:0,action:'adopt_plan',data:{title:review.result.suggestion.title,detail:review.result.suggestion.detail,scheduled_on:today,time:'18:30',timezone:'Asia/Shanghai',planned_minutes:null,cancelled:false}});
  }
  async function showHistory(kind: 'plan' | 'rule' | 'profile', id: string) {
    try {setHistory({kind,rows:await ownedRequest<Entity<Arrangement | Rule | FitnessProfile>[]>(`/fitness-expert/history/${kind}/${id}`)});} catch(e) {if(authorized())setError(e instanceof Error ? e.message : '历史暂不可用');}
  }
  function ruleEdit(patch: Partial<Rule>) {
  const rule = journal.rule ?? data?.rule.content ?? {enabled:false,period_days:7,start_on:today,timezone:'Asia/Shanghai',consent:false};
    const next = {...rule,...patch}; delete next.access_version;
    if (next.enabled && next.start_on < today) next.start_on = today;
    persist({...journal,rule:next,ruleBaseVersion:journal.ruleBaseVersion ?? data?.rule.version ?? 0});
  }
  const rule = journal.rule ?? data?.rule.content ?? {enabled:false,period_days:7,start_on:today,timezone:'Asia/Shanghai',consent:false};
    const profile = journal.profile ?? data?.profile.content ?? blankProfile();
  function profileEdit(patch:Partial<FitnessProfile>) {persist({...journal,profile:{...profile,...patch,confirmed:patch.confirmed ?? false},profileBaseVersion:journal.profileBaseVersion ?? data?.profile.version ?? 0});}
  const frozen = Boolean(journal.command || journal.request), generating = data?.reviews.some(r => ['pending','processing'].includes(r.status) && !r.redacted);
  function citations(review: Review, ids: string[]) {
    return <div className="fe-citations">{ids.map(id => {const r = review.source?.records.find(r => r.id === id); return r ? <button key={id} type="button" className="hp-text" onClick={() => onOpen(id)}>{r.content.occurred_on} · {r.content.title} · v{r.version} ↗</button> : null;})}</div>;
  }
  return <div className="fe-workspace">
    <section className="hp-card fe-intro"><span className="hp-kicker">YOUR RECORDS, YOUR NEXT STEP</span><h2>用留下的记录，回顾下一步</h2><p>选择一段时间，专家读取已确认的记录与习惯。解读有原记录依据，采用的安排要等你填写实际结果。</p>
      <div className="hp-form-grid"><label>回顾开始日期<input type="date" aria-label="回顾开始日期" value={journal.range.start} disabled={frozen} onInput={e => persist({...journal,range:{...journal.range,start:e.currentTarget.value}})}/></label><label>回顾结束日期<input type="date" aria-label="回顾结束日期" max={today} value={journal.range.end} disabled={frozen} onInput={e => persist({...journal,range:{...journal.range,end:e.currentTarget.value}})}/></label></div>
      <div className="lf-actions"><button className="hp-primary" disabled={!data?.access.fitness_expert_enabled || busy || frozen || generating || !!storageError} onClick={review}>回顾这些真实记录</button><button className="hp-text" onClick={() => void refresh()}>刷新回顾与安排</button></div>
      {data && !data.access.fitness_expert_enabled && <p className="fe-scope">健身专家读取默认关闭。<button className="hp-text" onClick={onAccess}>选择数据范围</button></p>}
      <p className="lf-muted">回顾只使用本次日期范围，生成期间也会复查来源。不会以时长或聊天次数判断体能变化。</p>
      {(storageError || error) && <p role="alert" className="lf-alert">{storageError || error}</p>}{notice && <p role="status">{notice}</p>}
      {storageError && !initial.error && <button className="hp-outline" onClick={()=>persist(current.current)}>重试保存本页草稿</button>}
      {frozen && <div className="fe-pending"><p>这份提交的内容已固定，等待服务器确认。刷新或断线后可继续使用同一请求。</p><button disabled={busy || !!storageError} onClick={() => void sendPending()}>重试原提交</button><button disabled={busy} className="hp-text" onClick={() => {if (persist({...journal,request:null,command:null})) setNotice('已结束本页重试。服务器可能已保存；重新读取后再决定。');}}>读取当前结果，再核对草稿</button></div>}
    </section>
    <section className="hp-card fe-profile"><details><summary>我的健身背景 · {data?.profile.version ? `已保存 v${data.profile.version}` : '尚未填写'}</summary><p>背景可单独保存。允许专家使用后才随所选记录发送；修改或关闭使用后，旧回顾隐藏。</p><form onSubmit={e=>{e.preventDefault();if(data)command({action:'save_profile',entity_id:data.profile.id,base_version:journal.profileBaseVersion ?? data.profile.version,data:profile});}}><FitnessProfileFields value={profile} onChange={profileEdit} disabled={frozen || !data}/>{data && journal.profile && journal.profileBaseVersion !== data.profile.version && <div className="lf-conflict"><p>背景已由其他页面更新。你的草稿保留，请比较服务器当前版本。</p><FitnessProfileSummary value={data.profile.content ?? blankProfile()}/><button type="button" disabled={frozen} onClick={()=>persist({...journal,profileBaseVersion:data.profile.version})}>保留草稿，以当前版本重新核对</button></div>}<button className="hp-primary" disabled={!data || !journal.profile || !profile.confirmed || frozen || busy || !!storageError}>确认保存健身背景</button></form>{data && data.profile.version > 0 && <button className="hp-text" onClick={()=>void showHistory('profile',data.profile.id)}>查看背景历史</button>}</details></section>
    <div className="fe-grid"><section className="fe-reviews" aria-label="有来源的回顾">
      {!data && !error && <p role="status">正在读取已保存的回顾…</p>}
      {data && !data.reviews.length && <div className="hp-card hp-empty"><h3>第一份回顾从你的记录开始</h3><p>先选择日期。没有记录时也可以继续使用活动记录页面。</p></div>}
      {data?.reviews.map(r => <article className="hp-card fe-review" key={r.id}><div className="hp-section-heading"><h3>{r.input.start} — {r.input.end}</h3><small>{r.input.rule_version ? `周期规则 v${r.input.rule_version}` : '本人选择的范围'}</small></div>
        {r.redacted ? <p>{r.error}</p> : r.result && r.status === 'completed' ? <><span className="hp-kicker">AI 回顾 · {r.source?.records.length} 条原记录</span>{r.result.observations.map((part,i) => <div className="fe-observation" key={i}><p>{part.text}</p>{citations(r,part.record_ids)}</div>)}<p className="lf-muted">{r.result.limitation}</p><ExpertSkillDetails skill={r.result.skill}/>{r.source?.profile?.content && <details><summary>本次使用的健身背景 · v{r.source.profile.version}</summary><FitnessProfileSummary value={r.source.profile.content}/></details>}<details><summary>本次全部原记录与版本</summary>{r.source?.records.map(record => <button className="hp-text" key={record.id} onClick={() => onOpen(record.id)}>{record.content.occurred_on} · {record.content.title} · v{record.version} ↗</button>)}</details><div className="fe-suggestion">{r.result.context && <p className="fe-context-mode">{r.result.context.mode === 'repeat_logged_structure' ? '结合本人背景 · 有条件沿用原结构' : r.result.context.mode === 'review_limits' ? '限制与当时状态待核对' : '背景或反馈尚待补齐'} · 背景 v{r.result.context.profile_version}{r.result.context.record_version ? ` · 原记录 v${r.result.context.record_version}` : ''}</p>}<span className="hp-kicker">可以采用的下一步</span><h4>{r.result.suggestion.title}</h4><p>{r.result.suggestion.detail}</p>{citations(r,r.result.suggestion.record_ids)}<button className="hp-outline" disabled={frozen} onClick={() => adopt(r)}>{data.plans.some(p => p.review_id === r.id) ? '查看已采用安排' : '核对安排，再决定采用'}</button></div></> : <><p role="status">{r.status === 'processing' ? '正在生成有来源的回顾…' : r.status === 'pending' ? r.error || '已排入后台，等待处理…' : r.error || '这个范围暂时无法回顾。'}</p>{r.status === 'failed' && <button onClick={() => void ownedRequest(`/fitness-expert/reviews/${r.id}/retry`,{}).then(() => refresh()).catch(e => setError(e instanceof Error ? e.message : '重试失败'))}>重试这份回顾</button>}</>}
      </article>)}
      {data && <div className="lf-actions">{offset > 0 && <button onClick={() => setOffset(Math.max(0,offset-20))}>较新的回顾</button>}{data.reviews.length === 20 && <button onClick={() => setOffset(offset+20)}>更早的回顾</button>}</div>}
    </section><aside className="fe-sidebar"><section className="hp-card fe-plans"><h3>已采用的安排与实际反馈</h3><p className="lf-muted">安排不计为训练。未记录时，实际情况保持未知。</p>{!data?.plans.length && <p>你还没有采用安排，可以先查看记录。</p>}{data?.plans.map(p => <article key={p.id}><h4>{p.content.title}</h4><p>{p.content.scheduled_on} {p.content.time} · {p.content.timezone}{p.content.planned_minutes !== null ? ` · 预计 ${p.content.planned_minutes} 分钟` : ''}</p><p>{p.content.detail}</p><strong>{p.feedback ? p.feedback.content.outcome === 'skipped' ? '本人明确反馈未执行' : `已有实际活动反馈 · ${p.feedback.content.occurred_on}` : p.content.cancelled ? '安排已取消' : '尚无反馈 · 实际情况未知'}</strong><div className="lf-actions">{!p.content.cancelled && <button className="hp-outline" onClick={() => onFeedback(p)}>{p.feedback ? '查看或纠正实际反馈' : '记录实际情况'}</button>}{!p.feedback && <button className="hp-text" disabled={frozen} onClick={() => openPlan({entityId:p.id,version:p.version,action:'save_plan',data:{...p.content,scheduled_on:p.content.scheduled_on < today ? today : p.content.scheduled_on}})}>调整或取消安排</button>}<button className="hp-text" onClick={() => void showHistory('plan',p.id)}>安排历史 · v{p.version}</button></div></article>)}</section>
      <section className="hp-card fe-rule"><h3>每个周期，接上真实反馈</h3><p>选择后，完整周期结束时后台生成回顾；你决定是否采用下一步。服务停止时暂停，重新启动后恢复。</p><form onSubmit={e => {e.preventDefault(); if(data) {const clean = {...rule};delete clean.access_version;command({action:'save_rule',entity_id:data.rule.id,base_version:journal.ruleBaseVersion ?? data.rule.version,data:clean});}}}>
        <label className="hp-checkbox"><input type="checkbox" checked={rule.enabled} disabled={frozen} onChange={e => ruleEdit({enabled:e.target.checked,consent:e.target.checked})}/>允许按以下范围持续回顾</label><label>每个周期<select aria-label="回顾周期" value={rule.period_days} disabled={frozen} onChange={e => ruleEdit({period_days:Number(e.target.value) as Rule['period_days']})}><option value={7}>7 天</option><option value={14}>14 天</option><option value={28}>28 天</option></select></label><label>规则从哪一天开始<input type="date" aria-label="回顾规则开始日期" min={today} value={rule.start_on} disabled={frozen} onInput={e => ruleEdit({start_on:e.currentTarget.value})}/></label><label>周期时区<input value={rule.timezone} disabled={frozen} onChange={e => ruleEdit({timezone:e.target.value})}/></label><button className="hp-primary" disabled={!data || !journal.rule || busy || frozen || !!storageError}>确认保存回顾规则</button>
      </form>{data && journal.rule && journal.ruleBaseVersion !== undefined && journal.ruleBaseVersion !== data.rule.version && <div className="lf-conflict"><p>周期规则已有新版本，请比较后重新核对。</p><pre>{JSON.stringify(data.rule.content,null,2)}</pre><button disabled={frozen} onClick={()=>persist({...journal,ruleBaseVersion:data.rule.version})}>保留草稿，以当前版本重新核对</button></div>}{data && <p role="status">{data.rule_active ? `持续回顾已启用 · 下一周期从 ${data.rule.next_start} 开始` : data.rule.content?.enabled ? '持续回顾已暂停：读取范围变化后，请重新确认规则。' : '持续回顾尚未启用'} · v{data.rule.version}</p>}{data && data.rule.version > 0 && <button className="hp-text" onClick={() => void showHistory('rule',data.rule.id)}>查看周期规则历史</button>}</section>
    </aside></div>
    {planOpen && journal.plan && <Modal className="hp-dialog lf-dialog fe-dialog" label="核对健身安排" onClose={() => setPlanOpen(false)} initialFocus='[aria-label="安排名称"]'><div className="hp-dialog-header"><h2>核对健身安排</h2><button onClick={() => setPlanOpen(false)}>关闭</button></div><p>这里只保存安排。实际动作、重量、时长和结果要在活动发生后填写。</p><form onSubmit={e => {e.preventDefault();const p = current.current.plan;if(p) command({action:p.action,entity_id:p.entityId,base_version:p.version,data:p.data});}}>
      <label>安排名称<input aria-label="安排名称" value={journal.plan.data.title} disabled={frozen} maxLength={240} onChange={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,title:e.target.value}}})}/></label><label>安排说明<textarea aria-label="安排说明" rows={4} value={journal.plan.data.detail} disabled={frozen} maxLength={5000} onChange={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,detail:e.target.value}}})}/></label><div className="hp-form-grid"><label>安排日期<input type="date" aria-label="安排日期" min={today} value={journal.plan.data.scheduled_on} disabled={frozen} onInput={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,scheduled_on:e.currentTarget.value}}})}/></label><label>安排时间<input type="time" value={journal.plan.data.time} disabled={frozen} onChange={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,time:e.target.value}}})}/></label><label>预计分钟（可留空）<input type="number" min={1} max={1440} step={1} value={journal.plan.data.planned_minutes ?? ''} disabled={frozen} onChange={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,planned_minutes:e.target.value ? Number(e.target.value) : null}}})}/></label></div><label className="hp-checkbox"><input type="checkbox" checked={journal.plan.data.cancelled} disabled={frozen} onChange={e => persist({...journal,plan:{...journal.plan!,data:{...journal.plan!.data,cancelled:e.target.checked}}})}/>取消这次安排，保留历史</label>
      {error && <p role="alert">{error}</p>}{journal.plan.action === 'save_plan' && data?.plans.find(p => p.id === journal.plan!.entityId)?.version !== journal.plan.version && <div className="lf-conflict"><p>安排已有新版本。你的草稿保留，可比较服务器当前安排后重新核对。</p><pre>{JSON.stringify(data?.plans.find(p => p.id === journal.plan!.entityId)?.content,null,2)}</pre><button type="button" disabled={frozen} onClick={() => {const server=data?.plans.find(p=>p.id===journal.plan!.entityId);if(server) persist({...journal,plan:{...journal.plan!,version:server.version}});}}>保留草稿，以当前版本重新核对</button></div>}<div className="hp-dialog-actions"><span>关闭或刷新仍保留草稿</span><button className="hp-primary" disabled={frozen || busy || !!storageError}>确认保存这次安排</button></div></form></Modal>}
    {history && <Modal className="hp-dialog lf-dialog" label={history.kind === 'profile' ? '健身背景历史' : history.kind === 'plan' ? '安排历史' : '周期规则历史'} onClose={() => setHistory(null)} initialFocus="button"><div className="hp-dialog-header"><h2>{history.kind === 'profile' ? '健身背景历史' : history.kind === 'plan' ? '安排历史' : '周期规则历史'}</h2><button onClick={() => setHistory(null)}>关闭</button></div>{history.rows.map(r => <section className="lf-history" key={r.id}><h3>版本 {r.version}</h3><small>{r.created_at && new Date(r.created_at).toLocaleString()}</small>{'goal' in r.content ? <FitnessProfileSummary value={r.content}/> : 'period_days' in r.content ? <p>{r.content.enabled ? `每 ${r.content.period_days} 天回顾` : '已暂停周期回顾'} · 从 {r.content.start_on} 生效 · {r.content.timezone}</p> : <><h4>{r.content.title}</h4><p>{r.content.scheduled_on} {r.content.time} · {r.content.timezone} · {r.content.planned_minutes === null ? '未填写预计时长' : `预计 ${r.content.planned_minutes} 分钟`}</p><p>{r.content.detail}</p><p>{r.content.cancelled ? '安排已取消' : '安排已采用'}</p></>}</section>)}</Modal>}
  </div>;
}
