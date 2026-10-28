import {EQUIPMENT, RECOVERY, type Equipment} from './fitnessContext';
import {useEffect, useState, type FormEvent} from 'react';
import {Link, Navigate} from 'react-router-dom';
import Modal from '../components/Modal';
import {captureOwnerId} from '../workspace/captureSync';
import {localDate, recordForm, reusedForm, type Action, type Draft, type Entity, type HabitContent, type RecordForm, type WorkoutContent} from './store';
import {useLife} from './useLife';
import FitnessViews from './FitnessViews';
import FitnessExtract from '../help/FitnessExtract';
import FitnessExpert from './FitnessExpert';
import {feedbackForm, type Plan, type Range} from './expertStore';
import '../prototype/HabitPrototype.css';
import './fitness.css';

const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function FitnessPage() {
  const [owner, setOwner] = useState(() => captureOwnerId(localStorage.getItem('gp_token')));
  useEffect(() => {
    const check = () => setOwner(captureOwnerId(localStorage.getItem('gp_token')));
    window.addEventListener('storage', check); window.addEventListener('focus', check);
    const timer = setInterval(check, 1000);
    return () => {clearInterval(timer); window.removeEventListener('storage', check); window.removeEventListener('focus', check);};
  }, []);
  return owner ? <TabSession key={owner} owner={owner} /> : <Navigate to="/login?next=fitness" replace />;
}
function TabSession({owner}: {owner: string}) {
  const [tabId, setTabId] = useState(() => {
    const id = sessionStorage.getItem('gp_life_tab') || crypto.randomUUID();
    sessionStorage.setItem('gp_life_tab', id); return id;
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const instance = crypto.randomUUID(); let claimed = false, cancelled = false;
    if (typeof BroadcastChannel === 'undefined') {setReady(true); return;}
    const channel = new BroadcastChannel(`gp_life_tab:${owner}:${tabId}`);
    const relocate = () => {if (cancelled) return; cancelled = true; const id = crypto.randomUUID(); sessionStorage.setItem('gp_life_tab', id); setReady(false); setTabId(id);};
    channel.onmessage = event => {
      if (event.data?.instance === instance) return;
      if (event.data?.type === 'claim' && !cancelled) {
        if (claimed || instance < event.data.instance) channel.postMessage({type: 'occupied', instance, target: event.data.instance});
        else relocate();
      }
      if (event.data?.type === 'occupied' && event.data.target === instance) relocate();
    };
    channel.postMessage({type: 'claim', instance});
    const timer = setTimeout(() => {if (!cancelled) {claimed = true; setReady(true);}}, 100);
    return () => {cancelled = true; clearTimeout(timer); channel.close();};
  }, [owner, tabId]);
  return ready ? <Archive key={tabId} owner={owner} tabId={tabId} /> : <p role="status">正在恢复健身草稿…</p>;
}
function Archive({owner, tabId}: {owner: string; tabId: string}) {
  const life = useLife(owner, tabId), {journal, edit, submit} = life;
  const s = journal.snapshot;
  const [section, setSection] = useState<'records' | 'habit' | 'access' | 'expert'>('records');
  const [expertRange, setExpertRange] = useState<Range | null>(null);
  const [editing, setEditing] = useState<string | null>(null), [message, setMessage] = useState('');
  const [history, setHistory] = useState<{title: string; items: Entity<WorkoutContent | HabitContent>[]} | null>(null);
  const [reference, setReference] = useState<string | null>(null), [spaces, setSpaces] = useState<{id: string; name: string}[]>([]);
  const [workspaceId, setWorkspaceId] = useState(''), [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Entity<WorkoutContent> | null>(null);
  useEffect(() => {
    if (!journal.queue.length && !life.saving && journal.snapshot) setMessage(previous =>
      ['已保留提交，等待服务器确认。', '空间引用提交等待确认。'].includes(previous) ? '' : previous);
  }, [journal.queue.length, journal.snapshot, life.saving]);
  const draft = editing ? journal.drafts[editing] : undefined;
  const pending = (id: string) => journal.queue.some(q => q.command.entity_id === id);
  function start(record?: Entity<WorkoutContent>, reuse = false) {
    const unfinished = Object.values(journal.drafts).find(d => d.kind === 'record' && (!record || d.id === record.id));
    if (unfinished && !reuse) {setEditing(unfinished.id); setMessage('已恢复本页尚未完成的草稿。'); return;}
    const id = !reuse && record ? record.id : crypto.randomUUID();
    edit({id, kind: 'record', baseVersion: !reuse && record ? record.version : 0,
      data: (reuse && record ? reusedForm(record) : recordForm(record?.content)) as unknown as Record<string, unknown>});
    setEditing(id); setMessage('');
  }
  function openRecord(id: string) {
    setBusy(true);void life.readRecord(id).then(setDetail).catch(e => setMessage(e instanceof Error ? e.message : '来源暂不可用')).finally(() => setBusy(false));
  }
  function feedback(plan: Plan) {
    if (plan.feedback) {start(plan.feedback);return;}
    const existing = Object.values(journal.drafts).find(d => d.kind === 'record' && d.data.expert_plan_id === plan.id);
    if (existing) {setEditing(existing.id);setMessage('已恢复这个安排的实际反馈草稿。');return;}
    const id = crypto.randomUUID();
    edit({id,kind:'record',baseVersion:0,data:{...recordForm(undefined,plan.content.timezone),...feedbackForm(plan,localDate(plan.content.timezone))} as unknown as Record<string,unknown>});
    setEditing(id);setMessage('请填写这次真正发生的情况，也可以明确记录未执行。');
  }
  function save(event: FormEvent, current: Draft, action?: Action) {
    event.preventDefault();
    try {
      if (submit(current, action)) {setEditing(null); setMessage('已保留提交，等待服务器确认。');}
      else setMessage('该内容已有待确认提交，或浏览器无法保存草稿。请保留页面并重试。');
    } catch (e) {setMessage(e instanceof Error ? e.message : '请核对填写内容。');}
  }
  async function showHistory(kind: 'record' | 'habit', id: string) {
    setBusy(true); setMessage('');
    try {setHistory({title: kind === 'record' ? '记录来源与纠正历史' : '习惯规则历史', items: await life.history<WorkoutContent | HabitContent>(kind, id)});}
    catch (e) {setMessage(e instanceof Error ? e.message : '暂时无法读取历史。');} finally {setBusy(false);}
  }
  async function showReferences(id: string) {
    if (journal.drafts[id]?.kind === 'record') {setEditing(id); setMessage('先完成或放弃这条记录的草稿，再管理空间引用。'); return;}
    setBusy(true); setMessage('');
    try {const list = await life.workspaces(); setSpaces(list); setWorkspaceId(list[0]?.id ?? ''); setReference(id);}
    catch (e) {setMessage(e instanceof Error ? e.message : '暂时无法读取空间。');} finally {setBusy(false);}
  }
  function setHabit(patch: Partial<HabitContent>) {
    if (!s) return;
    const old = journal.drafts[s.habit.id];
    const initial = s.habit.content ?? {enabled: false, days: [], time: '18:30', timezone: 'Asia/Shanghai', effective_from: localDate('Asia/Shanghai')};
    edit(old ? {...old, data: {...old.data, ...patch}} : {id: s.habit.id, kind: 'habit', baseVersion: s.habit.version,
      data: {...initial, effective_from: initial.effective_from < localDate(initial.timezone) ? localDate(initial.timezone) : initial.effective_from, ...patch}});
  }
  const habitDraft = s ? journal.drafts[s.habit.id] : undefined;
  const habit = (habitDraft?.data ?? s?.habit.content ?? {enabled: false, days: [], time: '18:30', timezone: 'Asia/Shanghai', effective_from: localDate('Asia/Shanghai')}) as unknown as HabitContent;
  const accessDraft = s ? journal.drafts[s.access.id] : undefined;
  const conflicts = Object.values(journal.drafts).filter(d => d.conflict);
  return <div className="hp-app lf-app">
    <a className="hp-skip" href="#fitness-main">跳到内容</a>
    <header className="lf-header"><Link to="/app" className="hp-brand"><span>g.</span>GrowthPilot</Link><span>个人健身档案</span><Link to="/login?next=fitness" onClick={() => localStorage.removeItem('gp_token')}>退出登录</Link></header>
    <main id="fitness-main" className="lf-main">
      <div className="hp-page-heading"><div><span className="hp-kicker">YOUR PERSONAL RECORDS</span><h1>从一次真实行动开始</h1><p>记录属于你。习惯帮你安排节奏，实际完成由你确认。</p></div><button className="hp-primary" onClick={() => start()}>＋ 记录一次活动</button></div>
      <div className="lf-sync" role="status">{life.saving ? '正在保存到个人档案…' : journal.queue.length ? `${journal.queue.length} 条提交等待确认，草稿已保留` : s ? `已读取个人档案 · 健身专家读取${s.access.fitness_expert_enabled ? '已允许' : '默认关闭'}` : life.loading ? '正在读取个人档案…' : '尚未读取成功'}<button className="hp-text" onClick={life.retry}>刷新与重试</button></div>
      {(message || life.error || life.storageError) && <div className="lf-alert" role="alert">{life.storageError || life.error || message}{life.error.includes('登录') && <Link to="/login?next=fitness">重新登录同一账户</Link>}</div>}
      {conflicts.map(d => {
        const current = d.kind === 'record' || d.kind === 'reference' ? s?.records.find(r => r.id === d.id)?.content : d.kind === 'habit' ? s?.habit.content : s?.access;
        return <section className="hp-card lf-conflict" key={d.id}><h2>这份草稿需要核对</h2><p>{d.error || '服务器已有更新，继续输入已保留。'}</p><div className="lf-compare"><div><h3>你的草稿</h3><pre>{JSON.stringify(d.data, null, 2)}</pre></div><div><h3>服务器当前内容</h3><pre>{JSON.stringify(current, null, 2)}</pre></div></div><div className="lf-actions"><button className="hp-primary" onClick={() => {life.resolve(d.id, true); if (d.kind === 'record') setEditing(d.id); setMessage('已保留你的草稿。核对后请再次确认保存。');}}>保留草稿并重新核对</button><button className="hp-text" onClick={() => life.resolve(d.id, false)}>采用服务器内容</button></div><small>两种选择都会保留一份本地备份，可在页面底部导出。</small></section>;
      })}
      <nav className="lf-tabs" aria-label="健身档案导航">{(['records', 'habit', 'expert', 'access'] as const).map((tab, i) => <button key={tab} aria-current={section === tab ? 'page' : undefined} className={section === tab ? 'is-active' : ''} onClick={() => {setExpertRange(null);setSection(tab);}}>{['活动记录', '习惯节奏', '个人专家', '数据范围'][i]}</button>)}</nav>
      {section === 'expert' && <FitnessExpert owner={owner} tabId={tabId} revision={`${s?.access.version}:${s?.habit.version}:${s?.records.map(r=>`${r.id}:${r.version}`).join(',')}`} entryRange={expertRange} onOpen={openRecord} onFeedback={feedback} onAccess={() => setSection('access')}/>}
      {section === 'records' && <>
        <FitnessViews revision={`${s?.total}:${s?.habit.version}:${s?.records.map(r => `${r.id}:${r.version}`).join(',')}`} onOpen={openRecord} onReview={range=>{setExpertRange(range);setSection('expert');}}/>
        {Object.values(journal.drafts).filter(d => d.kind === 'record' && !d.conflict).map(d => <div className="lf-draft" key={d.id}><span>{String(d.data.title || '未命名活动')} · {pending(d.id) ? '等待确认' : '本页草稿'}</span><button className="hp-text" onClick={() => setEditing(d.id)}>继续填写</button>{!pending(d.id) && <button className="hp-text" onClick={() => life.discard(d.id)}>放弃并保留备份</button>}</div>)}
        <section className="hp-card lf-records"><div className="hp-section-heading"><h2>你的活动记录</h2><span>{s?.total ?? '—'} 条已确认记录</span></div>
          {!s?.records.length ? <div className="hp-empty"><h2>{s ? '还没有活动记录' : '等待读取你的记录'}</h2><p>可以记录已完成的活动，也可以明确记下这次未执行。</p><button className="hp-primary" onClick={() => start()}>填写第一条</button></div> : s.records.map(r => <article className="lf-record" key={r.id} data-testid={`record-${r.id}`}><div className="lf-date">{r.content.occurred_on}<small>{r.content.timezone}</small></div><div className="lf-record-content"><h3>{r.content.title}<span>{r.content.outcome === 'skipped' ? '明确未执行' : '本人已确认'}</span></h3>{r.content.outcome === 'completed' && <small>努力程度 {r.content.effort ?? '未知'}/10 · {r.content.recovery ? RECOVERY[r.content.recovery] : '恢复感受未知'}</small>}<p>{r.content.outcome === 'skipped' ? '未产生实际训练数据' : r.content.actual_minutes === null ? '实际时长未知' : `${r.content.actual_minutes} 分钟`}{r.content.note && ` · ${r.content.note}`}</p>{r.content.exercises.length > 0 && <div className="hp-exercises">{r.content.exercises.map((e, i) => <span key={i}>{e.name} · {e.weight} kg · {e.sets} × {e.reps}</span>)}</div>}<div className="lf-record-actions"><small>{r.content.source === 'reuse' ? '复用结构 · 本人已核对' : r.content.source === 'ai' ? 'AI 整理原话 · 本人已核对' : '本人手动记录'} · 版本 {r.version}</small><button onClick={() => start(r)} disabled={pending(r.id)}>纠正记录</button><button onClick={() => start(r, true)}>复用结构</button><button disabled={busy} onClick={() => void showHistory('record', r.id)}>来源与历史</button><button disabled={busy || pending(r.id)} onClick={() => void showReferences(r.id)}>空间引用</button></div>{s.references.some(ref => ref.record_id === r.id && !ref.revoked_at) && <small>已引用到 {s.references.filter(ref => ref.record_id === r.id && !ref.revoked_at).length} 个空间 · 仍为同一条记录</small>}</div></article>)}
        </section>{s && s.records.length < s.total && <button className="hp-text" onClick={() => void life.loadMore().catch(e => setMessage(e instanceof Error ? e.message : '读取失败'))}>加载更多（已显示 {s.records.length}/{s.total}）</button>}
      </>}
      {section === 'habit' && <section className="hp-card lf-habit"><span className="hp-kicker">A RHYTHM THAT FITS YOU</span><h2>安排每周健身节奏</h2><p>安排不会生成完成记录。暂停和调整会留下规则历史。</p><form onSubmit={e => {if (habitDraft) save(e, habitDraft); else e.preventDefault();}}><label className="hp-checkbox"><input type="checkbox" checked={habit.enabled} disabled={!!s && pending(s.habit.id)} onChange={e => setHabit({enabled: e.target.checked})} />启用每周安排</label><fieldset className="lf-days"><legend>每周日期</legend>{DAYS.map((day, i) => <label key={day}><input type="checkbox" checked={habit.days.includes(i)} disabled={!!s && pending(s.habit.id)} onChange={e => setHabit({days: e.target.checked ? [...habit.days, i].sort() : habit.days.filter(d => d !== i)})} />周{day}</label>)}</fieldset><div className="hp-form-grid"><label>安排时间<input type="time" value={habit.time} onChange={e => setHabit({time: e.target.value})} /></label><label>生效日期<input type="date" value={habit.effective_from} onInput={e => setHabit({effective_from: e.currentTarget.value})} /></label><label>习惯时区<input value={habit.timezone} onChange={e => setHabit({timezone: e.target.value})} /></label></div><p className="lf-muted">当前只保存安排，不发送系统通知。新规则从今天或之后生效。</p><button className="hp-primary" disabled={!s || !habitDraft || pending(s.habit.id) || habitDraft.conflict}>确认保存习惯</button>{s && s.habit.version > 0 && <button type="button" className="hp-text" disabled={busy} onClick={() => void showHistory('habit', s.habit.id)}>查看规则历史</button>}</form></section>}
      {section === 'access' && <section className="hp-card lf-access"><span className="hp-kicker">YOU SET THE SCOPE</span><h2>健身数据的专家读取范围</h2><p>健身记录和习惯是新的个人数据范围，需要你单独选择。</p><form onSubmit={e => {if (accessDraft) save(e, accessDraft); else e.preventDefault();}}><label className="hp-checkbox"><input type="checkbox" checked={Boolean(accessDraft ? accessDraft.data.fitness_expert_enabled : s?.access.fitness_expert_enabled)} disabled={!s || pending(s.access.id)} onChange={e => {if (s) edit({id: s.access.id, kind: 'access', baseVersion: s.access.version, data: {fitness_expert_enabled: e.target.checked}});}} />允许健身专家读取我已确认的健身记录与习惯</label><p className="lf-muted">可随时关闭。关闭后旧回顾和建议隐藏、持续回顾暂停；重新允许后须再次确认周期规则。</p><button className="hp-primary" disabled={!s || !accessDraft || pending(s.access.id) || accessDraft.conflict}>确认保存范围</button><p role="status">服务器当前范围：{s?.access.fitness_expert_enabled ? '已允许' : '默认关闭'}{accessDraft ? ' · 有尚未确认的选择' : ''}</p></form></section>}
      <footer className="lf-footer"><Link to="/app">返回个人工作台</Link><button className="hp-text" onClick={() => download({journal, raw: localStorage.getItem(life.key), expert:localStorage.getItem(`gp_fitness_expert:${owner}:${tabId}`)}, 'growthpilot-fitness-backup.json')}>导出草稿与备份</button><span>可手动记录或 AI 整理原话；照片与设备同步待接入</span></footer>
    </main>
    {draft?.kind === 'record' && <RecordEditor scope={`fitness:${tabId}:${draft.id}`} draft={draft} queued={pending(draft.id)} onChange={edit} onSave={e => save(e, draft)} onClose={() => setEditing(null)} message={message} />}
    {detail && <Modal className="hp-dialog lf-dialog" label="图表引用的实际记录" onClose={() => setDetail(null)} initialFocus="button"><div className="hp-dialog-header"><h2>{detail.content.title}</h2><button onClick={() => setDetail(null)}>关闭</button></div><p>{detail.content.occurred_on} · {detail.content.timezone} · 当前版本 {detail.version}</p><p>{detail.content.outcome === 'skipped' ? '明确未执行' : detail.content.actual_minutes === null ? '已完成 · 时长未知' : `已完成 · ${detail.content.actual_minutes} 分钟`}</p>{detail.content.exercises.map((e,i) => <p key={i}>{e.name} · {e.equipment ? EQUIPMENT[e.equipment] : '器械未填写'} · {e.weight} kg · {e.sets} 组 × {e.reps} 次</p>)}<p>{detail.content.note}</p><p>努力程度 {detail.content.effort ?? '未知'}/10 · {detail.content.recovery ? RECOVERY[detail.content.recovery] : '恢复感受未知'}</p><details><summary>本人最初的原话与来源</summary><pre>{detail.content.original}</pre><p>{detail.content.source === 'ai' ? 'AI 整理后本人核对' : detail.content.source === 'reuse' ? '本人复用结构' : '本人手动记录'}</p>{detail.content.help_request_id && <p>AI 原话整理已保留来源引用</p>}</details><div className="lf-actions"><button onClick={() => {start(detail);setDetail(null);}}>纠正这条记录</button><button onClick={() => {void showHistory('record',detail.id);setDetail(null);}}>来源与历史</button></div><small>图表读取当前已确认版本，纠正后会重新计算。</small></Modal>}
    {history && <Modal className="hp-dialog lf-dialog" label={history.title} onClose={() => setHistory(null)} initialFocus="button"><div className="hp-dialog-header"><h2>{history.title}</h2><button onClick={() => setHistory(null)}>关闭</button></div>{history.items.map(item => <section className="lf-history" key={item.id}><h3>版本 {item.version}</h3><small>{item.created_at && new Date(item.created_at).toLocaleString()} · {item.change?.action === 'link_record' ? `引用到 ${item.change.workspace_name || '我的空间'}` : item.change?.action === 'unlink_record' ? `撤销 ${item.change.workspace_name || '我的空间'} 的引用` : item.change?.action === 'create_record' ? '首次本人确认' : item.change?.action === 'save_habit' ? '调整习惯规则' : '本人纠正'}</small>{'title' in item.content ? <><p>{item.content.occurred_on} · {item.content.title} · {item.content.actual_minutes === null ? '时长未知' : `${item.content.actual_minutes} 分钟`}</p><pre>{JSON.stringify(item.content.exercises, null, 2)}</pre><p>{item.content.note}</p><p>努力程度 {item.content.effort ?? '未知'}/10 · {item.content.recovery ? RECOVERY[item.content.recovery] : '恢复感受未知'}</p><details><summary>最初填写的原始记录</summary><pre>{item.content.original}</pre>{item.content.reused_from && <p>复用原记录：{item.content.reused_from}</p>}</details></> : <p>从 {item.content.effective_from} 生效 · {item.content.enabled ? `周${item.content.days.map(d => DAYS[d]).join('、')} ${item.content.time}` : '已暂停'} · {item.content.timezone}</p>}</section>)}</Modal>}
    {reference && s && <Modal className="hp-dialog lf-dialog" label="管理空间引用" onClose={() => setReference(null)} initialFocus="select"><div className="hp-dialog-header"><h2>管理空间引用</h2><button onClick={() => setReference(null)}>关闭</button></div><p>在你自己的多个空间引用同一条个人记录，计数不会重复，读取权限仍由你决定。</p>{spaces.length ? <><label>选择空间<select aria-label="选择空间" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}>{spaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><div className="lf-actions">{(['link_record', 'unlink_record'] as const).map((action, i) => <button key={action} className={i ? 'hp-text' : 'hp-primary'} disabled={pending(reference)} onClick={() => {const r = s.records.find(v => v.id === reference); if (r) {const d: Draft = {id: r.id, kind: 'reference', baseVersion: r.version, data: {workspace_id: workspaceId}}; if (submit(d, action)) {setReference(null); setMessage('空间引用提交等待确认。');}}}}>{i ? '撤销这个空间的引用' : '引用到这个空间'}</button>)}</div></> : <p>你还没有空间。可先返回个人工作台创建。</p>}<ul>{s.references.filter(r => r.record_id === reference).map(r => <li key={r.workspace_id}>{spaces.find(w => w.id === r.workspace_id)?.name || '我的空间'} · {r.revoked_at ? '引用已撤销，记录仍保留' : '正在引用'}</li>)}</ul></Modal>}
  </div>;
}
function RecordEditor({scope, draft, queued, onChange, onSave, onClose, message}: {scope: string; draft: Draft; queued: boolean; onChange: (d: Draft) => boolean; onSave: (e: FormEvent) => void; onClose: () => void; message: string}) {
  const form = draft.data as unknown as RecordForm;
  const update = (patch: Partial<RecordForm>) => onChange({...draft, data: {...form, ...patch} as unknown as Record<string, unknown>});
  return <Modal className="hp-dialog lf-dialog" label={draft.baseVersion ? '纠正活动记录' : '记录一次活动'} onClose={onClose} initialFocus='[aria-label="活动名称"]'><div className="hp-dialog-header"><h2>{draft.baseVersion ? '纠正活动记录' : '记录一次活动'}</h2><button onClick={onClose}>关闭</button></div><p>{form.source === 'reuse' ? '已带入上次的动作结构，请逐项核对这次的实际结果。' : '按你确认的实际情况填写。未知时长可以留空。'}</p>{!draft.baseVersion && !queued && <details className="ih-optin" open={Boolean(form.aiText)}><summary>用一句原话整理（可选）</summary><FitnessExtract scope={scope} form={form} onChange={update}/></details>}<form onSubmit={onSave}><label>活动名称<input aria-label="活动名称" value={form.title} maxLength={240} onChange={e => update({title: e.target.value})} /></label><div className="hp-form-grid"><label>实际发生日期<input type="date" value={form.occurred_on} onInput={e => update({occurred_on: e.currentTarget.value})} /></label><label>发生时区<input value={form.timezone} maxLength={64} onChange={e => update({timezone: e.target.value})} /></label><label>实际结果<select aria-label="实际结果" value={form.aiOutcomeUnknown ? '' : form.outcome} onChange={e => update({outcome: e.target.value as RecordForm['outcome'], aiOutcomeUnknown: false})}>{form.aiOutcomeUnknown && <option value="" disabled>请选择实际结果</option>}<option value="completed">已完成活动</option><option value="skipped">明确未执行</option></select></label>{form.outcome === 'completed' && <label>实际分钟（未知可留空）<input inputMode="numeric" value={form.minutes} onChange={e => update({minutes: e.target.value})} /></label>}</div>{form.outcome === 'completed' && <fieldset className="lf-exercises"><legend>确认的动作 · 重量单位 kg</legend>{form.exercises.map((row, i) => <div className="hp-exercise-input" key={i}>{(['name', 'weight', 'sets', 'reps'] as const).map((field, j) => <label key={field}>{['动作', '重量 kg', '组数', '每组次数'][j]}<input aria-label={`${['动作', '重量 kg', '组数', '每组次数'][j]} ${i + 1}`} value={row[field]} inputMode={field === 'name' ? 'text' : 'decimal'} onChange={e => update({exercises: form.exercises.map((old, n) => n === i ? {...old, [field]: e.target.value} : old)})} /></label>)}<label>实际器械<select aria-label={`实际器械 ${i + 1}`} value={row.equipment ?? ''} onChange={e=>update({exercises:form.exercises.map((old,n)=>n===i ? {...old,equipment:e.target.value as Equipment | ''} : old)})}><option value="">未填写</option>{Object.entries(EQUIPMENT).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button type="button" aria-label={`移除动作 ${i + 1}`} onClick={() => update({exercises: form.exercises.filter((_, n) => n !== i)})}>×</button></div>)}<button type="button" className="hp-text" onClick={() => update({exercises: [...form.exercises, {name: '', weight: '', sets: '', reps: ''}]})}>＋ 添加动作</button></fieldset>}{form.outcome === 'completed' && <div className="hp-form-grid"><label>整次活动努力程度 · 可留空<input aria-label="努力程度" type="number" min={1} max={10} value={form.effort ?? ''} onChange={e=>update({effort:e.target.value})}/><small>1 很轻松，10 接近最大努力；本人自评。</small></label><label>当时恢复感受 · 可留空<select aria-label="当时恢复感受" value={form.recovery ?? ''} onChange={e=>update({recovery:e.target.value as RecordForm['recovery']})}><option value="">未知 / 未填写</option>{Object.entries(RECOVERY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>}<label>补充说明<textarea aria-label="补充说明" rows={3} value={form.note} maxLength={10000} onChange={e => update({note: e.target.value})} /></label>{form.original && <details><summary>保留的最初原始记录</summary><pre>{form.original}</pre></details>}{message && <p role="alert">{message}</p>}<div className="hp-dialog-actions"><span>{queued ? '原提交等待回执，后续输入会继续保留' : '关闭后仍保留本页草稿'}</span><button className="hp-primary" disabled={queued || draft.conflict}>本人已核对，确认保存</button></div></form></Modal>;
}
