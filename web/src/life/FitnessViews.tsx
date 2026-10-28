import {useEffect, useState} from 'react';
import {api} from '../api/client';
import {monthRange, shiftMonth, trendCoordinates, type FitnessReport} from './viewData';
import {localDate} from './store';

export default function FitnessViews({revision, onOpen, onReview}: {revision: string; onOpen: (id: string) => void; onReview: (range: {start: string; end: string}) => void}) {
  const [month, setMonth] = useState(() => localDate('Asia/Shanghai').slice(0, 7));
  const [mode, setMode] = useState<'calendar' | 'trend'>('calendar'), [report, setReport] = useState<FitnessReport | null>(null);
  const [selected, setSelected] = useState(''), [exercise, setExercise] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setReport(null); setError('');
    let range: ReturnType<typeof monthRange>;
    try {range = monthRange(month);} catch {setError('请选择有效月份'); return;}
    void api.get<FitnessReport>('/personal-life/views', range, {signal: controller.signal}).then(value => {
      if (!controller.signal.aborted) setReport(value);
    }).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '暂时无法读取视图');});
    return () => controller.abort();
  }, [month, revision, attempt]);
  const active = report?.days.find(d => d.date === selected) ?? report?.days.find(d => d.date === localDate('Asia/Shanghai')) ?? report?.days[0];
  const trend = report?.trends.find(t => t.exercise === exercise) ?? report?.trends[0];
  const points = trendCoordinates(trend?.points ?? []);
  const sources = (records: {id: string; title: string; version: number}[]) => records.map(r => <button key={r.id} className="hp-text" onClick={() => onOpen(r.id)}>{r.title} · 版本 {r.version} ↗</button>);
  return <section className="hp-card lf-views"><div className="hp-section-heading"><h2>回看真实记录</h2><div className="lf-actions"><button aria-pressed={mode === 'calendar'} onClick={() => setMode('calendar')}>月日历</button><button aria-pressed={mode === 'trend'} onClick={() => setMode('trend')}>动作趋势</button></div></div>
    <div className="lf-month"><button aria-label="上个月" disabled={!month} onClick={() => setMonth(shiftMonth(month, -1))}>←</button><label>月份<input type="month" min="1900-01" max="9998-12" value={month} onInput={e => {setMonth(e.currentTarget.value); setSelected('');}}/></label><button aria-label="下个月" disabled={!month} onClick={() => setMonth(shiftMonth(month, 1))}>→</button><button className="hp-text" onClick={() => setAttempt(a => a + 1)}>刷新视图</button>{report && report.start <= localDate('Asia/Shanghai') && <button className="hp-text" onClick={()=>onReview({start:report.start,end:report.end > localDate('Asia/Shanghai') ? localDate('Asia/Shanghai') : report.end})}>请专家回顾这个范围</button>}</div>
    {error && <p role="alert">{error}<button onClick={() => setAttempt(a => a + 1)}>重试</button></p>}{!report && !error && <p role="status">正在读取所选月份的全部记录…</p>}
    {report && <><div className="lf-stats"><span><strong>{report.completed_days}</strong> 个实际活动日</span><span><strong>{report.completed_records}</strong> 条已完成</span><span><strong>{report.skipped_records}</strong> 条明确未执行</span><span><strong>{report.known_minutes}</strong> 已知分钟{report.unknown_minutes_records > 0 && <small>另 {report.unknown_minutes_records} 条时长未知</small>}</span></div>
    <p className="lf-muted">范围内全部 {report.total} 条已确认记录；按原记录发生日期显示，时区可展开核对。安排不会计入实际完成，空白日表示没有记录。</p>
    {mode === 'calendar' ? <><div className="lf-calendar" aria-label={`${month} 活动日历`}>{['日','一','二','三','四','五','六'].map(d => <span className="lf-weekday" key={d}>周{d}</span>)}{Array.from({length: new Date(`${report.start}T12:00:00Z`).getUTCDay()}, (_, i) => <span key={`blank-${i}`}/>)}{report.days.map(d => <button key={d.date} aria-label={`${d.date}，${d.records.filter(r => r.outcome === 'completed').length} 条完成，${d.records.filter(r => r.outcome === 'skipped').length} 条未执行${d.planned ? '，有习惯安排' : ''}`} aria-pressed={active?.date === d.date} onClick={() => setSelected(d.date)}><strong>{d.date.slice(8)}</strong><span>{d.records.some(r => r.outcome === 'completed') && <i className="lf-dot done"/>}{d.records.some(r => r.outcome === 'skipped') && <i className="lf-dot skipped"/>}{d.planned && <i className="lf-dot planned"/>}</span></button>)}</div><div className="lf-legend"><span>● 实际完成</span><span>● 明确未执行</span><span>○ 习惯安排</span></div>
      {active && <div className="lf-day-detail"><h3>{active.date}</h3>{active.planned && <p>习惯安排 {active.time} · {active.timezone} · 规则版本 {active.habit_version}（未自动计为完成）</p>}{active.records.length ? active.records.map(r => <div key={r.id}><p>{r.outcome === 'skipped' ? '明确未执行' : r.actual_minutes === null ? '已完成 · 时长未知' : `已完成 · ${r.actual_minutes} 分钟`} · {r.timezone}</p>{sources([r])}</div>) : <p>这一天还没有实际活动记录。</p>}</div>}</> : <><label className="lf-trend-select">查看同一个动作<select aria-label="趋势动作" value={trend?.exercise ?? ''} onChange={e => setExercise(e.target.value)}>{report.trends.map(t => <option key={t.exercise}>{t.exercise}</option>)}</select></label><p className="lf-muted">每个记录日，同名动作本人填写的最大重量（kg）。不合并不同动作；重量变化不代表体能提升，次数和组数请回到原记录查看。</p>
      {points.length >= 2 ? <svg className="lf-trend" viewBox="0 0 600 215" role="img" aria-label={`${trend?.exercise} 已确认重量趋势`}><line x1="40" y1="170" x2="560" y2="170" stroke="#bfcac3"/><line x1="40" y1="30" x2="40" y2="170" stroke="#bfcac3"/><text x="5" y="175">0 kg</text><text x="5" y="23">{Math.max(...points.map(p => p.weight))} kg</text><polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#37664d" strokeWidth="3"/>{points.map(p => <g key={p.date}><circle cx={p.x} cy={p.y} r="5" fill="#37664d"/><title>{p.date} · {p.weight} kg</title><text x={p.x} y="200" textAnchor="middle">{p.date.slice(5)}</text></g>)}</svg> : <p className="hp-empty">{trend ? '只有一个记录日，暂不绘制趋势。' : '这个月还没有已确认的动作重量。'}</p>}
      {trend && <div className="lf-trend-sources">{trend.points.map(p => <div key={p.date}><strong>{p.date} · {p.weight} kg</strong>{sources(p.sources)}</div>)}</div>}</>}
    </>}
  </section>;
}
