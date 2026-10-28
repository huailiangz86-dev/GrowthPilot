import LearningHelp from '../help/LearningHelp';
import MaterialsPanel from '../materials/MaterialsPanel';
import LearningDiagnosis from '../learning/LearningDiagnosis';
import LearningNotebook from '../learning/LearningNotebook';
import LearningReviewPanel from '../learning-review/LearningReviewPanel';
import LearningReviewInbox from '../learning-review/LearningReviewInbox';
import {useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {api} from '../api/client';
import Modal from '../components/Modal';
import {useWorkspace} from '../workspace/useWorkspace';
import {usePersonal} from './usePersonal';
import {dateInZone, learningContent, safeResourceUrl, scheduleOnDay, scheduledMinutes, taskContent, wallTime, zonedInstant,
  type Learning, type LearningContent, type Resource, type Review, type Revision, type Schedule, type TaskContent, type WorkTask} from './store';
import '../prototype/PersonalPlatformPrototype.css';
import './personal.css';

const STATUS = {todo: '待开始', doing: '进行中', done: '已完成', blocked: '有卡点'};
const STAGES = {queued: '待学', in_progress: '学习中', practice: '待实践', applied: '已应用'};
const EMPTY_DOC = {id: null, version: 0, content: {}, updated_at: null};
function useData() {
  const {journal} = usePersonal();
  const tasks = [...(journal.snapshot?.tasks ?? [])], learning = [...(journal.snapshot?.learning ?? [])];
  for (const draft of Object.values(journal.drafts)) {
    if (draft.kind === 'task' && !tasks.some(t => t.id === draft.entityId)) tasks.unshift({id: draft.entityId, title: String(draft.data.title), description: '', status: 'todo', due_at: null, updated_at: null, document: EMPTY_DOC});
    if (draft.kind === 'learning' && !learning.some(l => l.id === draft.entityId)) learning.unshift({id: draft.entityId, title: String(draft.data.title), summary: '', status: 'queued', source_url: null, updated_at: null, document: EMPTY_DOC});
  }
  return {tasks, learning, schedules: (journal.snapshot?.schedules ?? []).filter(s => !s.cancelled_at)};
}
function Surface({children}: {children: ReactNode}) {
  const p = usePersonal();
  return <div className="pp-platform gp-personal">
    {(p.error || p.storageError) && <div className="pp-error" role="alert">{p.storageError || p.error}<button onClick={p.retry}>重试保存与读取</button></div>}
    {p.loading && !p.journal.snapshot && <p role="status">正在读取真实工作内容…</p>}
    {p.journal.queue.some(q=>q.kind==='schedule') && <p className="pp-inline-description">时间安排已保留为本地草稿，等待同步。<Link to="/app/tasks?view=calendar">查看保存状态 →</Link></p>}
    {children}
    {p.journal.backups.length > 0 && <details className="gp-draft-backups"><summary>保留的冲突草稿 · {p.journal.backups.length}</summary>{p.journal.backups.map((d, i) => <details key={i}><summary>{String(d.data.title ?? ({task:'工作',learning:'学习',review:'复盘',schedule:'时间安排',preferences:'可用时间偏好'}[d.kind]))} · 版本 {d.baseVersion}</summary><SavedContent data={d.data}/></details>)}</details>}
  </div>;
}
function SaveState({id, uncreated=false}: {id: string; uncreated?:boolean}) {
  const p = usePersonal(), draft = p.journal.drafts[id], queue = p.journal.queue.find(q => q.command.entity_id === id);
  const conflict = draft?.conflict || queue?.conflict;
  const cloudTask=p.journal.snapshot?.tasks.find(t=>t.id===id), cloudLearning=p.journal.snapshot?.learning.find(l=>l.id===id);
  const cloud=cloudTask ? taskContent(cloudTask) : cloudLearning ? learningContent(cloudLearning) : p.journal.snapshot?.schedules.find(s=>s.id===id) ?? Object.values(p.journal.reviews).find(r=>r.id===id)?.document.content ?? (p.journal.snapshot?.workspace_id===id?p.journal.snapshot.preferences:undefined);
  return <div className="gp-save-state" role="status">
    <span>{p.storageError ? '输入仍在当前页面' : conflict ? '版本冲突 · 草稿已保留' : draft || queue ? p.saving ? '保存中 · 本地草稿已保留' : '本地草稿 · 等待同步' : uncreated ? '尚未保存复盘' : '已保存到服务端'}</span>
    {(draft || queue) && <button className="pp-text-button" onClick={p.retry}>重试</button>}
    {conflict && <div className="pp-error" role="alert"><p>{draft?.error || queue?.error}</p><details><summary>比较云端与我的草稿</summary><div className="gp-content-compare"><section><h3>云端内容</h3><SavedContent data={cloud as unknown as Record<string,unknown> | undefined}/></section><section><h3>我的草稿</h3><SavedContent data={draft?.data ?? queue?.command.data}/></section></div></details>
    {queue?.command.action==='append_material'&&draft&&<SavedContent data={queue.command.data}/>}<button onClick={() => p.resolve(id, true)}>将我的草稿保存为新版本</button><button onClick={() => p.resolve(id, false)}>采用云端，保留草稿备份</button></div>}
  </div>;
}
function SavedContent({data}: {data?:Record<string,unknown>}) {
  const labels:Record<string,string>={title:'标题',body:'工作正文',criterion:'完成标准',outcome:'实际成果',aim:'想学会什么',notes:'笔记',content:'学习内容',insights:'学习心得',questions:'疑问',exercise:'练习',reason:'原因与卡点',feeling:'感受',next:'下一步',timezone:'时区',starts_at:'开始时间',ends_at:'结束时间',due_at:'截止时间',status:'状态',stage:'学习阶段',daily_minutes:'每日容量（分钟）',available_start:'可用开始时间',available_end:'可用结束时间'};
  if(!data)return <p>云端内容暂不可用，请重试读取。</p>;
  if(data.material_id)return <div><p>待确认的资料：{String(data.material_id)}</p><p>原文片段：{(data.chunk_ids as string[]).join('、')}</p><p>继续提交会把这些片段追加到最新笔记；保留另一页面的内容。</p></div>;
  return <div className="gp-saved-content">{Object.entries(labels).filter(([key])=>data[key]!=null && data[key]!=='').map(([key,label])=><div key={key}><strong>{label}</strong><p>{key==='status'?STATUS[data[key] as keyof typeof STATUS]:key==='stage'?STAGES[data[key] as keyof typeof STAGES]:['starts_at','ends_at','due_at'].includes(key)?new Date(String(data[key])).toLocaleString():String(data[key])}</p></div>)}{Array.isArray(data.resources)&&data.resources.length>0&&<div><strong>资料</strong>{(data.resources as Resource[]).map(r=><p key={r.id}>{r.title}<br/>{r.url}</p>)}</div>}{Array.isArray(data.journal)&&data.journal.length>0&&<div><strong>逐次学习记录</strong>{(data.journal as NonNullable<LearningContent['journal']>).map(e=><section key={e.id}><p>{e.date} · {e.kind==='note'?'学习笔记':'学习心得'} · {e.title}</p><p>{e.body}</p>{e.advice_request_id&&<small>AI 建议 · 本人采用 · {e.advice_request_id}</small>}</section>)}</div>}{data.minutes_by_date!=null && typeof data.minutes_by_date==='object' && <div><strong>本人自报投入</strong>{Object.entries(data.minutes_by_date).map(([day,minutes])=><p key={day}>{day} · {String(minutes)} 分钟</p>)}</div>}</div>;
}
function CalendarCapacity({day,blocks,editable=false}: {day:string;blocks:Schedule[];editable?:boolean}) {
  const p=usePersonal(),{activeWorkspace,dailyPreferences}=useWorkspace(),timezone=dailyPreferences.timezone;
  const preferences=p.journal.snapshot?.preferences;
  const cached=p.journal.drafts[activeWorkspace.id];
  const initial=cached?.kind==='preferences'?cached.data:preferences;
  const [minutes,setMinutes]=useState(String(initial?.daily_minutes??'')),[start,setStart]=useState(String(initial?.available_start??'09:00')),[end,setEnd]=useState(String(initial?.available_end??'22:00')),[error,setError]=useState('');
  let total:number|null=null;
  try{total=scheduledMinutes(blocks,day,timezone);}catch{/* A timezone without a unique midnight needs a different day. */}
  const outside=preferences?.version?blocks.filter(s=>scheduleOnDay(s,day,timezone)).filter(s=>{const a=wallTime(s.starts_at,timezone),b=wallTime(s.ends_at,timezone);return (a.slice(0,10)<day?'00:00':a.slice(11))<preferences.available_start || (b.slice(0,10)>day?'24:00':b.slice(11))>preferences.available_end;}).length:0;
  const save=(event:FormEvent)=>{event.preventDefault();const value=minutes===''?null:Number(minutes);if(start>=end || (value!=null&&(!Number.isInteger(value)||value<1||value>1440))){setError('结束需晚于开始，容量填写 1–1440 分钟或留空。');return;}setError('');p.edit({kind:'preferences',entityId:activeWorkspace.id,baseVersion:preferences?.version??0,updatedAt:null,create:false,data:{daily_minutes:value,available_start:start,available_end:end}});};
  return <section className="gp-capacity"><p className="pp-caption">{day} 已安排 {total===null?'暂无法汇总':`${Math.round(total)} 分钟`}{preferences?.daily_minutes?` · 本人容量 ${preferences.daily_minutes} 分钟`:''} · 计划时间不计入实际投入</p>{total!==null&&preferences?.daily_minutes&&total>preferences.daily_minutes&&<p className="pp-error" role="alert">已超出本人容量 {Math.round(total-preferences.daily_minutes)} 分钟，可缩短时段或改到另一日。</p>}{outside>0&&<p className="pp-error" role="alert">有 {outside} 个时段超出本人可用窗口 {preferences?.available_start}–{preferences?.available_end}，可以重新安排。</p>}{editable&&<details><summary>我的可用时间与容量 · {timezone}</summary><form className="gp-preferences-form" onSubmit={save}><label className="pp-field"><span>每天可投入分钟（留空不限）</span><input type="number" aria-label="每天可投入分钟" min={1} max={1440} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><label className="pp-field"><span>可用开始时间</span><input type="time" aria-label="可用开始时间" value={start} onInput={e=>setStart(e.currentTarget.value)}/></label><label className="pp-field"><span>可用结束时间</span><input type="time" aria-label="可用结束时间" value={end} onInput={e=>setEnd(e.currentTarget.value)}/></label><button className="pp-secondary">保存可用时间偏好</button>{error&&<p role="alert">{error}</p>}</form>{preferences?.version||cached?<SaveState id={activeWorkspace.id}/>:<p className="pp-caption">尚未保存偏好</p>}<p className="pp-caption">当前空间的个人偏好；容量超出只提示，由本人决定改期。</p></details>}</section>;
}
function WeekBudget({day,blocks}: {day:string;blocks:Schedule[]}) {
  const {dailyPreferences}=useWorkspace(),{journal}=usePersonal();
  let total=0;try{total=scheduledMinutes(blocks,day,dailyPreferences.timezone);}catch{return null;}
  const limit=journal.snapshot?.preferences?.daily_minutes;
  return total>0?<small className={limit&&total>limit?'gp-over-capacity':''}>{Math.round(total)} 分钟{limit&&total>limit?' · 超出容量':''}</small>:null;
}
function Heading({kicker, title, text, children}: {kicker: string; title: string; text?: string; children?: ReactNode}) {
  return <div className="pp-page-heading"><div><span className="pp-eyebrow">{kicker}</span><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</div>;
}
function ResourceEditor({resources, onChange}: {resources: Resource[]; onChange: (resources: Resource[]) => void}) {
  const [title, setTitle] = useState(''), [url, setUrl] = useState(''), [error, setError] = useState('');
  const add = (event: FormEvent) => {
    event.preventDefault(); const safe = safeResourceUrl(url);
    if (!safe || !title.trim()) {setError('填写资料名称和 HTTP/HTTPS 链接。'); return;}
    onChange([...resources, {id: crypto.randomUUID(), title: title.trim(), url: safe}]); setTitle(''); setUrl(''); setError('');
  };
  return <div className="gp-resources"><div className="pp-resource-list">{resources.map(r => <div key={r.id}><a className="pp-resource-link" href={safeResourceUrl(r.url) ?? undefined} target="_blank" rel="noreferrer">{r.title} ↗</a><small>{r.url}</small><button className="pp-text-button" aria-label={`移除资料 ${r.title}`} onClick={() => onChange(resources.filter(v=>v.id !== r.id))}>移除</button></div>)}</div>
    <form onSubmit={add}><label className="pp-field"><span>资料名称</span><input aria-label="资料名称" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></label><label className="pp-field"><span>资料链接</span><input aria-label="资料链接" value={url} onChange={e=>setUrl(e.target.value)} type="url" maxLength={2000} placeholder="https://…"/></label><button className="pp-secondary" disabled={resources.length >= 50}>保存资料链接</button>{error && <p role="alert" className="pp-error">{error}</p>}</form>
    <p className="pp-caption">保留手动来源；未读取外部正文，不根据地址生成摘要。</p></div>;
}
function NewTask({onClose}: {onClose: () => void}) {
  const p = usePersonal(), navigate = useNavigate();
  const [title, setTitle] = useState(''), [template, setTemplate] = useState('空白');
  const templates: Record<string, string> = {'空白': '', '写作': '# 主题\n\n## 观点与依据\n\n## 正文\n', '研究': '# 研究问题\n\n## 资料与观察\n\n## 判断与下一步\n', '学习应用': '# 想学会什么\n\n## 练习\n\n## 实际应用\n', '个人项目': '# 希望做出的结果\n\n## 工作清单\n- [ ] 完成第一步\n\n## 验证\n'};
  const submit = (e: FormEvent) => {
    e.preventDefault(); const id = crypto.randomUUID();
    if (p.edit({kind: 'task', entityId: id, baseVersion: 0, updatedAt: null, create: true,
      data: {title: title.trim(), body: templates[template], criterion: '', resources: [], outcome: '', status: 'todo', due_at: null}})) {onClose(); navigate(`/app/tasks/${id}`);}
  };
  return <Modal label="建立一件工作" className="pp-modal" onClose={onClose}><header><h2>建立一件工作</h2><button onClick={onClose} aria-label="关闭">×</button></header><form onSubmit={submit}>
    <label className="pp-field"><span>想完成什么</span><input autoFocus required aria-label="新工作标题" value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="pp-field"><span>正文起点</span><select value={template} onChange={e=>setTemplate(e.target.value)}>{Object.keys(templates).map(t=><option key={t}>{t}</option>)}</select></label>
    <p className="pp-caption">模板只是编辑结构，由你写出实际内容。</p><button className="pp-primary" disabled={!title.trim()}>创建并进入工作正文</button></form></Modal>;
}
function SlotRows({blocks, tasks, onEdit}: {blocks: Schedule[]; tasks: WorkTask[]; onEdit?: (block: Schedule) => void}) {
  const {dailyPreferences} = useWorkspace(), timezone = dailyPreferences.timezone;
  return <div className="pp-agenda-list">{blocks.length ? [...blocks].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).map(s => <div className="pp-agenda-row" key={s.id}><time>{wallTime(s.starts_at, timezone).slice(11)}–{wallTime(s.ends_at, timezone).slice(11)}<small>{dateInZone(s.starts_at, timezone)}{dateInZone(s.ends_at, timezone) !== dateInZone(s.starts_at, timezone) ? ` → ${dateInZone(s.ends_at, timezone)}` : ''}</small></time><Link to={`/app/tasks/${s.task_id}`}><strong>{tasks.find(t=>t.id === s.task_id)?.title ?? '工作'}</strong><small>{new Date(s.ends_at).getTime() < Date.now() ? '本次时段已结束 · 任务完成另行确认' : `${Math.round((Date.parse(s.ends_at)-Date.parse(s.starts_at))/60000)} 分钟 · 计划时间`}</small></Link>{onEdit && <button className="pp-text-button" onClick={()=>onEdit(s)}>改期</button>}</div>) : <p className="pp-caption">这一天还没有安排，留一个可投入的时段。</p>}</div>;
}
function ScheduleEditor({block, taskId, onClose}: {block?: Schedule; taskId?: string; onClose: () => void}) {
  const {tasks, schedules} = useData(), {dailyPreferences} = useWorkspace(), p = usePersonal();
  const [id] = useState(block?.id ?? crypto.randomUUID());
  const [selectedTask, setTask] = useState(block?.task_id ?? taskId ?? tasks[0]?.id ?? '');
  const [timezone, setZone] = useState(block?.timezone ?? dailyPreferences.timezone);
  const today = dateInZone(new Date(), timezone);
  const [start, setStart] = useState(block ? wallTime(block.starts_at, timezone) : `${today}T15:00`);
  const [end, setEnd] = useState(block ? wallTime(block.ends_at, timezone) : `${today}T15:45`);
  const [error, setError] = useState('');
  const queued = p.journal.queue.some(q=>q.command.entity_id === id && !q.conflict), draft = p.journal.drafts[id];
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      const starts_at = zonedInstant(start, timezone), ends_at = zonedInstant(end, timezone);
      if (Date.parse(ends_at) <= Date.parse(starts_at)) throw new Error('结束时间需晚于开始时间，可选择跨日结束日期。');
      const conflict = schedules.find(s => s.id !== id && Date.parse(s.starts_at) < Date.parse(ends_at) && Date.parse(s.ends_at) > Date.parse(starts_at));
      if (conflict) throw new Error(`时间冲突：与“${tasks.find(t=>t.id === conflict.task_id)?.title}”重叠，请改期。`);
      if (p.run('schedule', 'save_schedule', id, {task_id: selectedTask, starts_at, ends_at, timezone}, block?.version ?? 0, null)) onClose();
    } catch (err) {setError(err instanceof Error ? err.message : '时间暂未保存');}
  };
  return <Modal label="安排工作时间" className="pp-modal" onClose={onClose}><header><h2>安排工作时间</h2><button onClick={onClose} aria-label="关闭">×</button></header><form onSubmit={save}>
    <label className="pp-field"><span>安排哪件工作</span><select aria-label="安排的工作" value={selectedTask} onChange={e=>setTask(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    <label className="pp-field"><span>时区</span><select aria-label="工作时区" value={timezone} onChange={e=>setZone(e.target.value)}>{[...new Set([dailyPreferences.timezone, 'Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London'])].map(t=><option key={t}>{t}</option>)}</select></label>
    <label className="pp-field"><span>开始日期与时间</span><input aria-label="工作开始时间" type="datetime-local" required value={start} onInput={e=>setStart(e.currentTarget.value)}/></label>
    <label className="pp-field"><span>结束日期与时间</span><input aria-label="工作结束时间" type="datetime-local" required value={end} onInput={e=>setEnd(e.currentTarget.value)}/></label>
    <p className="pp-caption">截止日期另列。时段结束不会自动完成任务；安排分钟不算实际投入。</p>{tasks.find(t=>t.id===selectedTask)?.updated_at===null&&<p role="status">工作页尚在同步，保存成功后可以安排时间。</p>}{error && <p className="pp-error" role="alert">{error}</p>}<div className="pp-form-actions"><button className="pp-primary" disabled={!selectedTask || tasks.find(t=>t.id===selectedTask)?.updated_at===null || queued || !!draft}>保存时间安排</button>{block && <button type="button" className="pp-text-button" disabled={queued || !!draft} onClick={()=>{if (p.run('schedule', 'cancel_schedule', id, {}, block.version, null)) onClose();}}>取消这个时段</button>}</div></form></Modal>;
}
export function PersonalHome() {
  const {tasks, learning, schedules} = useData(), {dailyPreferences} = useWorkspace(), p = usePersonal();
  const [creating, setCreating] = useState(false), [slot, setSlot] = useState<Schedule | 'new' | null>(null);
  const today = dateInZone(new Date(), dailyPreferences.timezone), pending = tasks.filter(t=>t.status !== 'done'), focus = pending[0] ?? tasks[0];
  const todayBlocks = schedules.filter(s=>scheduleOnDay(s, today, dailyPreferences.timezone));
  return <Surface><Heading kicker={`${today} · 我的空间`} title="今天，继续把想法做出来。" text="留出时间，做出成果，再看见自己的进步。"><button className="pp-primary" onClick={()=>setCreating(true)}>＋ 新建工作</button></Heading>
    {!focus && !p.loading ? <div className="pp-welcome"><h2>这周，你想完成什么？</h2><p>一句话建立工作页面，再写内容、安排时间。</p><button className="pp-primary" onClick={()=>setCreating(true)}>创建第一件工作</button></div> : focus && <div className="pp-today-grid"><section className="pp-focus"><div className="pp-section-label"><span>继续上次的工作</span><span className="pp-chip">{STATUS[focus.status]}</span></div><h2>{focus.title}</h2><p>{String(p.journal.drafts[focus.id]?.data.criterion ?? taskContent(focus).criterion)}</p><div className="pp-focus-excerpt">{String(p.journal.drafts[focus.id]?.data.body ?? taskContent(focus).body).slice(0,250)}</div><Link className="pp-primary" to={`/app/tasks/${focus.id}`}>进入工作正文 →</Link></section><section className="pp-today-agenda"><div className="pp-section-label"><h2>今天的安排</h2><Link to="/app/tasks?view=calendar">日历 →</Link></div><SlotRows blocks={todayBlocks} tasks={tasks} onEdit={setSlot}/><CalendarCapacity day={today} blocks={schedules}/><button className="pp-text-button" onClick={()=>setSlot('new')}>＋ 留一个工作时段</button></section></div>}
    {!!pending.length && <><div className="pp-section-heading"><h2>今天值得推进的事</h2><span>最多三件重点</span></div><div className="pp-priority-list">{pending.slice(0,3).map((t,i)=><Link to={`/app/tasks/${t.id}`} key={t.id}><span className="pp-number">0{i+1}</span><div><strong>{t.title}</strong><small>{taskContent(t).criterion || '进入正文，继续推进'}</small></div><span>→</span></Link>)}</div></>}
    <div className="pp-bottom-grid"><section className="pp-learning-nudge"><span className="pp-eyebrow">把学习用起来</span><h3>{learning[0]?.title ?? '从一份资料开始'}</h3><p>保留笔记与练习，把知识用于当前工作。</p><Link className="pp-text-button" to="/app/learning">继续学习与实践 →</Link></section><section className="pp-review-nudge"><span className="pp-eyebrow">今晚的复盘</span><h3>成果已在这里，补一句自己的感受。</h3><p>当天工作正文、学习笔记和实际成果自动汇集。</p><Link className="pp-text-button" to="/app/evening">进入日复盘 →</Link></section></div>
    {creating && <NewTask onClose={()=>setCreating(false)}/>} {slot && <ScheduleEditor block={slot === 'new' ? undefined : slot} onClose={()=>setSlot(null)}/>}</Surface>;
}
export function PersonalWork() {
  const {tasks, schedules} = useData(), {dailyPreferences} = useWorkspace(), p = usePersonal();
  const [params, setParams] = useSearchParams(), [creating, setCreating] = useState(false), [slot, setSlot] = useState<Schedule | 'new' | null>(null), [offset, setOffset] = useState(0);
  const timezone = dailyPreferences.timezone, today = dateInZone(new Date(), timezone), [selectedDay, setDay] = useState(today);
  const anchor = new Date(`${today}T12:00:00Z`); anchor.setUTCDate(anchor.getUTCDate() - (anchor.getUTCDay()+6)%7 + offset*7);
  const days = Array.from({length:7}, (_,i)=>{const d=new Date(anchor);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0];
  const calendar = params.get('view') === 'calendar';
  return <Surface><Heading kicker="工作内容与实际成果" title="每件事，都有继续工作的地方。" text="打开正文，或为它留出时间。"><button className="pp-primary" onClick={()=>setCreating(true)}>＋ 新建工作</button></Heading><div className="pp-tabs"><button className={!calendar ? 'active' : ''} aria-pressed={!calendar} onClick={()=>setParams({})}>任务与内容</button><button className={calendar ? 'active' : ''} aria-pressed={calendar} onClick={()=>setParams({view:'calendar'})}>周日历</button></div>
    {!calendar ? <div className="pp-work-list">{tasks.map(t=><Link className="pp-work-row" key={t.id} to={`/app/tasks/${t.id}`}><span className="pp-task-mark">{t.status === 'done' ? '✓' : '▤'}</span><div><strong>{String(p.journal.drafts[t.id]?.data.title ?? t.title)}</strong><p>{taskContent(t).criterion || t.description}</p><small>{String(p.journal.drafts[t.id]?.data.body ?? taskContent(t).body).length} 字正文 · {schedules.filter(s=>s.task_id === t.id).length} 个工作时段 {p.journal.drafts[t.id] ? '· 本地草稿' : ''}</small></div><span className="pp-chip">{STATUS[t.status]}</span><span>→</span></Link>)}{!tasks.length && !p.loading && <div className="pp-empty"><h2>先建立一件工作。</h2><button className="pp-primary" onClick={()=>setCreating(true)}>新建工作</button></div>}</div> : <><div className="pp-calendar-heading"><div><h2>{days[0]} – {days[6]}</h2><p>{timezone} · 点击安排可改期，点击工作进入正文</p></div><div className="pp-calendar-actions"><button aria-label="上一周" onClick={()=>setOffset(o=>o-1)}>←</button><button onClick={()=>setOffset(0)}>本周</button><button aria-label="下一周" onClick={()=>setOffset(o=>o+1)}>→</button><button className="pp-secondary" onClick={()=>setSlot('new')} disabled={!tasks.length}>安排时间</button></div></div>
      <CalendarCapacity key={`${timezone}:${p.journal.snapshot?.preferences?.version??0}`} day={activeDay} blocks={schedules} editable/><div className="pp-week-calendar">{days.map((day,i)=><section key={day} className={day === today ? 'current' : ''}><header><span>{['周一','周二','周三','周四','周五','周六','周日'][i]}</span><strong>{day.slice(8)}</strong><WeekBudget day={day} blocks={schedules}/></header><div>{schedules.filter(s=>scheduleOnDay(s,day,timezone)).map(s=><div className="pp-calendar-event" key={s.id}><button onClick={()=>setSlot(s)}><time>{wallTime(s.starts_at,timezone).slice(11)}–{wallTime(s.ends_at,timezone).slice(11)}</time></button><Link to={`/app/tasks/${s.task_id}`}><strong>{tasks.find(t=>t.id === s.task_id)?.title}</strong></Link><small>个人工作时段</small></div>)}</div></section>)}</div>
      <div className="pp-mobile-calendar"><div className="pp-day-selector" aria-label="选择日历日期">{days.map((day,i)=><button key={day} aria-label={day} aria-pressed={activeDay === day} className={activeDay === day ? 'active' : ''} onClick={()=>setDay(day)}><span>{['一','二','三','四','五','六','日'][i]}</span><strong>{day.slice(8)}</strong></button>)}</div><h3>{activeDay} 的安排</h3><SlotRows blocks={schedules.filter(s=>scheduleOnDay(s,activeDay,timezone))} tasks={tasks} onEdit={setSlot}/></div><p className="pp-inline-description">时间结束仍保留未完成内容，可继续工作或补排。截止日期在工作属性中单独设置。</p></>}
    {p.journal.queue.filter(q=>q.kind === 'schedule').map(q=><div key={q.command.request_id}><p>时段草稿：{String(q.command.data.starts_at ?? '取消安排')}</p><SaveState id={q.command.entity_id}/>{q.conflict && q.command.action === 'save_schedule' && <button className="pp-secondary" onClick={()=>setSlot({id:q.command.entity_id,...q.command.data,version:p.journal.snapshot?.schedules.find(s=>s.id===q.command.entity_id)?.version ?? 0,cancelled_at:null} as Schedule)}>修改这份安排</button>}</div>)}
    {creating && <NewTask onClose={()=>setCreating(false)}/>} {slot && <ScheduleEditor block={slot === 'new' ? undefined : slot} onClose={()=>setSlot(null)}/>}</Surface>;
}
export function PersonalTask() {
  const {taskId = ''} = useParams(); return <TaskEditor key={taskId} id={taskId}/>;
}
function TaskEditor({id}: {id: string}) {
  const {tasks, schedules} = useData(), p = usePersonal(), {activeWorkspace, dailyPreferences} = useWorkspace();
  const task = tasks.find(t=>t.id === id), draft = p.journal.drafts[id];
  const [view, setView] = useState<'content' | 'schedule'>('content'), [slot, setSlot] = useState<Schedule | 'new' | null>(null);
  const [history, setHistory] = useState<Revision[]>([]), [historyError, setHistoryError] = useState(''), [dueError,setDueError] = useState(''), [preview, setPreview] = useState(false);
  if (!task) return <Surface><h2>{p.loading ? '正在打开工作…' : '当前空间找不到这件工作'}</h2><Link to="/app/tasks">返回所有工作</Link></Surface>;
  const content = (draft?.data ?? taskContent(task)) as unknown as TaskContent;
  const edit = (patch: Partial<TaskContent>) => p.edit({kind:'task', entityId:id, data: {...content, ...patch}, baseVersion:task.document.version, updatedAt:task.updated_at, create: task.document.version === 0 && task.updated_at === null});
  const busy = Boolean(draft || p.journal.queue.some(q=>q.command.entity_id === id));
  const readHistory = async () => {try {setHistory(await api.get<Revision[]>(`/personal-work/${activeWorkspace.id}/history/task/${id}`)); setHistoryError('');} catch {setHistoryError('暂时无法读取历史版本，当前内容仍在。');}};
  return <Surface><Link className="pp-back" to="/app/tasks">← 所有工作</Link><Heading kicker="工作页面 / 我的空间" title={content.title} text={content.criterion}><button className="pp-secondary" onClick={()=>edit({status: content.status === 'done' ? 'doing' : 'done'})}>{content.status === 'done' ? '重新继续' : '记录工作完成'}</button></Heading>
    <div className="pp-task-meta"><span className="pp-chip">{STATUS[content.status]}</span>{content.due_at && <span>截止 {wallTime(content.due_at,dailyPreferences.timezone).replace('T',' ')}</span>}<Link to="/app/growth">目标与计划 ↗</Link><Link to={`/app/agent?context_type=task&context_id=${id}`}>AI 助手 ↗</Link><SaveState id={id}/></div>
    {task.description && task.document.version === 0 && <details className="gp-legacy"><summary>已有任务说明</summary><p>{task.description}</p><p className="pp-caption">保留原任务关联；实际正文从你本次编辑开始。</p></details>}
    <div className="pp-tabs"><button className={view === 'content' ? 'active' : ''} onClick={()=>setView('content')}>工作正文</button><button className={view === 'schedule' ? 'active' : ''} onClick={()=>setView('schedule')}>时间安排</button></div><div className="pp-document-layout"><section className="pp-document">
      {view === 'content' ? <><div className="pp-document-toolbar"><span>工作正文 · {content.body.length} 字</span><button className="pp-text-button" onClick={()=>setPreview(v=>!v)}>{preview ? '继续编辑' : '查看排版'}</button></div>{preview ? <ContentPreview value={content.body}/> : <textarea className="pp-document-editor" aria-label="任务工作正文" value={content.body} maxLength={100000} onChange={e=>edit({body:e.target.value})} placeholder="写下你的实际内容、判断和结果。支持 # 标题、- 清单、> 引用和资料链接。" spellCheck={false}/>}
        <div className="pp-document-foot"><span>自动保存 · 段落、标题、清单与引用</span><button className="pp-text-button" onClick={()=>void readHistory()}>查看版本历史</button></div>{historyError && <p role="alert">{historyError}</p>}{history.length > 0 && <details className="pp-version" open><summary>内容版本 · {history.length}</summary>{history.map(r=><details key={r.id}><summary>版本 {r.version} · {new Date(r.created_at).toLocaleString()} · {r.source === 'restore' ? '恢复' : '本人'}</summary><ContentPreview value={String(r.content.body ?? '')}/><button className="pp-secondary" disabled={busy} onClick={()=>p.run('task','restore_task',id,{revision_id:r.id},task.document.version,task.updated_at)}>恢复这个版本</button></details>)}</details>}</> : <><div className="pp-document-toolbar"><span>为工作留出时间</span><button className="pp-text-button" onClick={()=>setSlot('new')}>＋ 添加时段</button></div><SlotRows blocks={schedules.filter(s=>s.task_id === id)} tasks={tasks} onEdit={setSlot}/><p className="pp-caption">一个任务可安排多次。截止与工作时段分离。</p></>}
    </section><aside className="pp-work-rail"><details className="pp-task-properties" open><summary>任务属性与完成标准</summary><label className="pp-field"><span>标题</span><input aria-label="修改工作标题" maxLength={240} value={content.title} onChange={e=>edit({title:e.target.value})}/></label><label className="pp-field"><span>状态</span><select aria-label="工作状态" value={content.status} onChange={e=>edit({status:e.target.value as TaskContent['status']})}>{Object.entries(STATUS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label className="pp-field"><span>完成标准</span><textarea aria-label="修改完成标准" maxLength={4000} value={content.criterion} onChange={e=>edit({criterion:e.target.value})}/></label><label className="pp-field"><span>截止时间 · {dailyPreferences.timezone}</span><input aria-label="工作截止时间" type="datetime-local" value={content.due_at ? wallTime(content.due_at,dailyPreferences.timezone) : ''} onInput={e=>{try{edit({due_at:e.currentTarget.value ? zonedInstant(e.currentTarget.value,dailyPreferences.timezone) : null});setDueError('');}catch(err){setDueError(err instanceof Error ? err.message : '日期未保存');}}}/></label>{dueError&&<p role="alert" className="pp-error">{dueError}</p>}<small>项目、目标、计划关联沿用原任务。</small></details><section className="gp-outcome"><h3>实际成果</h3><textarea aria-label="工作实际成果" value={content.outcome} maxLength={20000} onChange={e=>edit({outcome:e.target.value})} placeholder="保存作品结论、验证结果，或成果的资料指针。"/><p className="pp-caption">与正文一起保留版本，当天自动进入日复盘。</p></section><details className="gp-materials"><summary>资料与附件指针 · {content.resources.length}</summary><ResourceEditor resources={content.resources} onChange={resources=>edit({resources})}/></details><Link className="pp-secondary" to="/app/evening">回看今天的成果 →</Link></aside></div>
    {slot && <ScheduleEditor block={slot === 'new' ? undefined : slot} taskId={id} onClose={()=>setSlot(null)}/>}</Surface>;
}
function ContentPreview({value}: {value: string}) {
  return <div className="gp-content-preview">{value.split('\n').map((line,i)=>line.startsWith('# ') ? <h2 key={i}>{line.slice(2)}</h2> : line.startsWith('## ') ? <h3 key={i}>{line.slice(3)}</h3> : line.startsWith('> ') ? <blockquote key={i}>{line.slice(2)}</blockquote> : /^- (\[[ x]\] )?/.test(line) ? <p className="gp-list-line" key={i}>• {line.slice(2)}</p> : <p key={i}>{line || '\u00a0'}</p>)}</div>;
}
export function PersonalLearning() {
  const {itemId} = useParams(), {learning} = useData();
  const [adding, setAdding] = useState(false), [title,setTitle] = useState('');
  const p = usePersonal(), navigate = useNavigate();
  const create = (e:FormEvent) => {e.preventDefault();const id=crypto.randomUUID();if(p.edit({kind:'learning',entityId:id,baseVersion:0,updatedAt:null,create:true,data:{title:title.trim(),aim:'',resources:[],notes:'',questions:'',exercise:'',outcome:'',stage:'queued',task_id:null,minutes_by_date:{}}})){setAdding(false);navigate(`/app/learn/${id}`);}};
  if(itemId) return <LearningEditor key={itemId} id={itemId}/>;
  return <Surface><Heading kicker="资料 → 理解 → 回忆 → 复盘 → 应用" title="记录学习，留下自己的理解。" text="学习内容、笔记与心得逐次保存，再用真实记录获得建议、积累知识。"><button className="pp-primary" onClick={()=>setAdding(true)}>＋ 添加学习</button></Heading><LearningReviewInbox/><div className="pp-work-list">{learning.map(item=><Link className="pp-work-row" key={item.id} to={`/app/learn/${item.id}`}><span className="pp-task-mark">▤</span><div><strong>{String(p.journal.drafts[item.id]?.data.title ?? item.title)}</strong><p>{item.summary}</p><small>{learningContent(item).resources.length} 份资料 · {learningContent(item).content?.length??0} 字内容 · {learningContent(item).notes.length} 字笔记 · {learningContent(item).insights?.length??0} 字心得</small></div><span className="pp-chip">{STAGES[learningContent(item).stage]}</span><span>→</span></Link>)}{!learning.length && <p className="pp-empty">先添加一份想学习的资料；登录或付费内容也可以先保留链接。</p>}</div><Link className="pp-text-button" to="/app/knowledge">我的知识库 →</Link>{adding && <Modal label="添加学习" className="pp-modal" onClose={()=>setAdding(false)}><header><h2>添加学习</h2><button onClick={()=>setAdding(false)} aria-label="关闭">×</button></header><form onSubmit={create}><label className="pp-field"><span>想学会什么</span><input required aria-label="新学习标题" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240}/></label><button className="pp-primary" disabled={!title.trim()}>建立学习页，填写资料</button></form></Modal>}</Surface>;
}
function LearningEditor({id}: {id:string}) {
  const {learning, tasks} = useData(), p=usePersonal(), {dailyPreferences,activeWorkspace}=useWorkspace(), item=learning.find(l=>l.id===id), draft=p.journal.drafts[id];
  const [applicationTitle,setTitle]=useState(''), [history,setHistory]=useState<Revision[]>([]);
  const [learningParams]=useSearchParams();
  if(!item) return <Surface><h2>{p.loading ? '正在读取学习内容…' : '当前空间找不到该学习'}</h2><Link to="/app/learning">返回学习</Link></Surface>;
  const c={...learningContent(item),...draft?.data} as unknown as LearningContent, day=dateInZone(new Date(),dailyPreferences.timezone);
  const edit=(patch:Partial<LearningContent>)=>p.edit({kind:'learning',entityId:id,data:{...c,...patch},baseVersion:item.document.version,updatedAt:item.updated_at,create:item.updated_at===null});
  const pending=Boolean(draft || p.journal.queue.some(q=>q.command.entity_id===id));
  if(learningParams.get('flow')==='1')return <Surface><Link to={`/app/learn/${id}`}>← 返回学习笔记</Link><Heading kicker="学习与实践 / 完整流程" title={c.title} text="选定原文，回忆并核对，实际用一次，再安排下次回忆。"/><LearningReviewPanel workspaceId={activeWorkspace.id} item={item} notesPending={pending} guided/></Surface>;
  return <Surface><Link className="pp-back" to="/app/learning">← 所有学习</Link><Heading kicker="学习与实践 / 我的空间" title={c.title} text={c.aim}/><div className="pp-task-meta"><span className="pp-chip">{STAGES[c.stage]}</span><a href="#learning-records" className="pp-secondary">内容、笔记与心得 ↓</a><Link to={`/app/learn/${id}?flow=1`} className="pp-primary">开始完整学习流程 →</Link><a href="#learning-review" className="pp-secondary">学习复盘 ↓</a><Link to="/app/knowledge">我的知识库 →</Link><Link to={`/app/agent?context_type=learning&context_id=${id}`}>AI 助手 ↗</Link><SaveState id={id}/></div><div className="pp-learning-layout"><section className="pp-document gp-learning-main"><label className="pp-field"><span>想学会什么</span><textarea aria-label="学习期望" value={c.aim} maxLength={4000} onChange={e=>edit({aim:e.target.value})}/></label><ResourceEditor resources={c.resources} onChange={resources=>edit({resources})}/><MaterialsPanel workspaceId={activeWorkspace.id} itemId={id} persisted={item.updated_at!==null} pending={pending} onAppend={data=>p.run('learning','append_material',id,data,item.document.version,item.updated_at)}/><div id="learning-records"><LearningNotebook content={c} day={day} onChange={edit}/></div><label className="pp-field"><span>疑问</span><textarea aria-label="学习疑问" value={c.questions} maxLength={20000} onChange={e=>edit({questions:e.target.value})}/></label><label className="pp-field"><span>练习与验证</span><textarea className="gp-learning-editor" aria-label="学习练习" value={c.exercise} maxLength={50000} onChange={e=>edit({exercise:e.target.value})}/></label><LearningDiagnosis workspaceId={activeWorkspace.id} itemId={id} version={item.document.version} pending={pending} day={day} entries={c.journal} onAdopt={data=>p.run('learning','adopt_learning_advice',id,data,item.document.version,item.updated_at)}/><LearningReviewPanel workspaceId={activeWorkspace.id} item={item} notesPending={pending}/><details className="ih-optin"><summary>需要时，让 AI 帮我解释或练习</summary><LearningHelp workspaceId={activeWorkspace.id} itemId={id} version={item.document.version} pending={pending} onAdopt={exercise => edit({exercise:c.exercise ? `${c.exercise}\n\n${exercise}` : exercise})}/></details><button className="pp-text-button" onClick={()=>void api.get<Revision[]>(`/personal-work/${activeWorkspace.id}/history/learning_item/${id}`).then(setHistory).catch(()=>{})}>查看完整学习记录版本</button>{history.map(r=><details className="pp-version" key={r.id}><summary>版本 {r.version} · {new Date(r.created_at).toLocaleString()}</summary><ContentPreview value={['学习内容：'+String(r.content.content??''),'学习笔记：'+String(r.content.notes??''),'学习心得：'+String(r.content.insights??''),'逐次记录：'+((r.content.journal as {date:string;title:string;body:string}[])??[]).map(e=>`${e.date} · ${e.title}\n${e.body}`).join('\n\n'),'练习：'+String(r.content.exercise??'')].join('\n\n')}/><button disabled={pending} className="pp-secondary" onClick={()=>edit({content:String(r.content.content??''),insights:String(r.content.insights??''),journal:(r.content.journal as LearningContent['journal'])??[],notes:String(r.content.notes ?? ''),questions:String(r.content.questions ?? ''),exercise:String(r.content.exercise ?? ''),outcome:String(r.content.outcome ?? '')})}>恢复这份学习记录</button></details>)}</section><aside className="pp-work-rail"><label className="pp-field"><span>学习标题</span><input aria-label="修改学习标题" maxLength={240} value={c.title} onChange={e=>edit({title:e.target.value})}/></label><label className="pp-field"><span>本人确认的阶段</span><select aria-label="学习状态" value={c.stage} onChange={e=>edit({stage:e.target.value as LearningContent['stage']})}>{Object.entries(STAGES).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><section className="gp-outcome"><h3>把学习用起来</h3><label className="pp-field"><span>关联应用任务</span><select aria-label="关联应用任务" value={c.task_id ?? ''} onChange={e=>edit({task_id:e.target.value || null})}><option value="">暂未关联</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>{c.task_id ? <Link className="pp-secondary" to={`/app/tasks/${c.task_id}`}>进入应用工作正文 →</Link> : <><label className="pp-field"><span>创建一次应用任务</span><input aria-label="应用任务标题" value={applicationTitle} maxLength={240} placeholder={`应用：${c.title}`} onChange={e=>setTitle(e.target.value)}/></label><button className="pp-secondary" disabled={pending} onClick={()=>p.run('learning','create_application',id,{title:applicationTitle.trim() || `应用：${c.title}`},item.document.version,item.updated_at)}>创建并关联应用任务</button></>}
      <label className="pp-field"><span>实际应用成果与理解证据</span><textarea aria-label="学习应用成果" value={c.outcome} maxLength={20000} onChange={e=>edit({outcome:e.target.value})} placeholder="说明在哪里用上、观察到了什么。作品保留在关联任务中。"/></label><p className="pp-caption">“已应用”需关联工作并留下成果。应用状态不自动完成工作任务。</p></section><section><h3>投入另行记录</h3><label className="pp-field"><span>{day} 外部实际投入 · 本人自报分钟</span><input type="number" aria-label="学习实际分钟" min={0} max={1440} value={c.minutes_by_date[day] ?? 0} onChange={e=>edit({minutes_by_date:{...c.minutes_by_date,[day]:Number(e.target.value)}})}/></label><p className="pp-caption">预计时长不计入实际投入；分钟不代表掌握程度。</p>{item.updated_at && c.resources.length>0 && <ObservedTime item={item}/>}</section><Link className="pp-secondary" to="/app/evening">成果进入日复盘 →</Link></aside></div></Surface>;
}
function ObservedTime({item}: {item:Learning}) {
  const [active,setActive]=useState(false),[seconds,setSeconds]=useState(item.observed_seconds ?? 0),[error,setError]=useState('');
  const session=useRef(crypto.randomUUID()),chain=useRef(Promise.resolve());
  useEffect(()=>{
    if(!active) return;
    let disposed=false;
    const ping=(visible:boolean)=>{chain.current=chain.current.catch(()=>{}).then(async()=>{const receipt=await api.post<{active_seconds:number}>(`/learning-items/${item.id}/study`,{id:session.current,active:visible});if(!disposed){setSeconds(receipt.active_seconds);setError('');}}).catch(()=>{if(!disposed)setError('站内活动暂未同步');});};
    const visibility=()=>ping(!document.hidden && document.hasFocus()); visibility();
    const timer=setInterval(visibility,15000);document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',visibility);window.addEventListener('blur',visibility);
    return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',visibility);window.removeEventListener('blur',visibility);ping(false);};
  },[active,item.id]);
  return <div className="gp-observed"><p>站内活动：{Math.floor(seconds/60)} 分 {seconds%60} 秒 · {active?'前台活动记录中':'已暂停'}</p><button className="pp-text-button" onClick={()=>setActive(v=>!v)}>{active?'暂停活动记录':'开始站内活动记录'}</button><small>只记录当前学习页前台活动，外部阅读另行自报。</small>{error&&<p role="alert">{error}</p>}</div>;
}
export function PersonalReview() {
  const {dailyPreferences,activeWorkspace}=useWorkspace(),p=usePersonal();
  const [day,setDay]=useState(dateInZone(new Date(),dailyPreferences.timezone)),[error,setError]=useState('');
  const review=p.journal.reviews[day] ?? null;
  const queueCount=p.journal.queue.length, cacheReview=p.cacheReview;
  useEffect(()=>{let disposed=false;void api.get<Review>(`/personal-work/${activeWorkspace.id}/review/${day}`).then(r=>{if(!disposed){cacheReview(r);setError('');}}).catch(()=>{if(!disposed)setError('暂时无法汇集云端成果。草稿仍保留，恢复网络后重试。');});return()=>{disposed=true;};},[activeWorkspace.id,day,queueCount,p.journal.snapshot,cacheReview]);
  const draft=review?p.journal.drafts[review.id]:Object.values(p.journal.drafts).find(d=>d.kind==='review'&&d.data.date===day);
  const content=(draft?.data ?? review?.document.content ?? {}) as unknown as {reason?:string;feeling?:string;next?:string};
  const edit=(patch:Record<string,unknown>)=>{if(!review)return;p.edit({kind:'review',entityId:review.id,data:{date:day,reason:content.reason??review.reason??'',feeling:content.feeling??review.feeling??'',next:content.next??review.next??'',...patch},baseVersion:review.document.version,updatedAt:review.updated_at,create:review.updated_at===null});};
  return <Surface><Heading kicker="成长 / 日复盘" title="成果已在这里，补一句自己的感受。" text="系统汇集已有内容，只补充它不知道的原因与下一步。"><Link className="pp-secondary" to="/app/growth">目标与周期计划 →</Link></Heading><label className="pp-field gp-review-date"><span>回看的日期 · {dailyPreferences.timezone}</span><input aria-label="复盘日期" type="date" value={day} onInput={e=>setDay(e.currentTarget.value)}/></label>
    {error && <p role="alert" className="pp-error">{error}<button onClick={()=>void p.refresh()}>重试读取</button></p>}{queueCount>0&&<p className="pp-inline-description">还有 {queueCount} 项本地变更待保存；成功同步后自动补入成果。</p>}
    <div className="pp-reflection-layout"><section className="pp-evidence"><h2>当天已保存的工作与学习</h2><p className="pp-caption">正文引用当天最后一次保存的版本；学习复盘保留每次真实回忆、自评和下一步。</p>{review?.evidence.map(e=><div className="gp-evidence" key={e.id}><Link to={e.kind==='task'?`/app/tasks/${e.entity_id}`:`/app/learn/${e.entity_id}${e.unit_id?`?review=${e.unit_id}${e.attempt_id?`&attempt=${e.attempt_id}`:""}#learning-review`:""}`}><strong>{e.title} ↗</strong></Link><small>{e.kind==='task'?'工作':e.kind==='learning_review'?'学习复盘':'学习'} · {e.kind==='learning_review'?'逐次尝试':`版本 ${e.version}`}  · {new Date(e.saved_at).toLocaleTimeString()}</small><p>{e.excerpt}</p>{e.revision_id&&<EvidenceRevision workspaceId={activeWorkspace.id} evidence={e}/>}</div>)}{!review&&<p role="status">正在汇集当天已保存的内容…</p>}{review&&review.evidence.length===0&&<p className="pp-empty">当天还没有云端正文或成果；可以先进入工作或学习页。</p>}{review&&review.saved_evidence.length>0&&<details className="pp-version"><summary>上次复盘保留的成果引用 · {review.saved_evidence.length}</summary>{review.saved_evidence.map(e=><p key={e.id}>{e.title} · 版本 {e.version}<br/>{e.excerpt}</p>)}</details>}</section><section className="pp-reflection-form"><h2>今天的体验，由你补充。</h2>{review&&<SaveState id={review.id} uncreated={!review.updated_at}/>}<label className="pp-field"><span>发生的原因与卡点</span><textarea aria-label="复盘原因" maxLength={10000} value={content.reason??review?.reason??''} onChange={e=>edit({reason:e.target.value})} disabled={!review}/></label><label className="pp-field"><span>感受</span><textarea aria-label="复盘感受" maxLength={4000} value={content.feeling??review?.feeling??''} onChange={e=>edit({feeling:e.target.value})} disabled={!review}/></label><label className="pp-field"><span>下一步</span><textarea aria-label="复盘下一步" maxLength={10000} value={content.next??review?.next??''} onChange={e=>edit({next:e.target.value})} disabled={!review}/></label><button className="pp-primary" onClick={()=>{edit({});p.retry();}} disabled={!review}>保存复盘与成果引用</button><p className="pp-caption">自动保存为真实晚间复盘。引用保留原版本，后续编辑不会改写过去的复盘。</p></section></div></Surface>;
}
function EvidenceRevision({workspaceId,evidence}: {workspaceId:string;evidence:Review['evidence'][number]}) {
  const [revision,setRevision]=useState<Revision|null>(null),[error,setError]=useState('');
  const read=async()=>{try{const list=await api.get<Revision[]>(`/personal-work/${workspaceId}/history/${evidence.kind==='task'?'task':'learning_item'}/${evidence.entity_id}`);setRevision(list.find(r=>r.id===evidence.revision_id)??null);setError('');}catch{setError('原版本暂不可用');}};
  return <details onToggle={e=>{if(e.currentTarget.open&&!revision)void read();}}><summary>展开原版本依据</summary>{revision?<ContentPreview value={evidence.fields.map(f=>f==='journal'?((revision.content.journal as {date:string;title:string;body:string}[])??[]).map(e=>`${e.date} · ${e.title}\n${e.body}`).join('\n\n'):String(revision.content[f]??'')).join('\n\n')}/>:<p>{error||'正在读取原版本…'}</p>}</details>;
}
