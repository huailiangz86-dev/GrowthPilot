import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { localDateKey } from '../../workspace/dailyPreferences.ts';
import { useWorkspace } from '../../workspace/useWorkspace';
import './workspace.css';

type ReflectionMode = 'morning' | 'evening';

const ENERGY_LABELS = ['需要放慢一点', '先做简单的事', '可以稳步推进', '状态不错，适合 Focus', '精力充足，做重要判断'];
const MOODS = [
  { value: '平静', symbol: '○' },
  { value: '充实', symbol: '◐' },
  { value: '疲惫', symbol: '◔' },
  { value: '焦虑', symbol: '△' },
  { value: '混乱', symbol: '≈' },
];

export default function Reflection({ type }: { type: ReflectionMode }) {
  const navigate = useNavigate();
  const { activeTasks, activeProjects, activeReflections, dailyPreferences, saveMorning, saveEvening } = useWorkspace();
  const isMorning = type === 'morning';
  const date = localDateKey(dailyPreferences.timezone);
  const existing = activeReflections.find((reflection) => reflection.type === type && reflection.reflectionDate === date);
  const [energy, setEnergy] = useState(existing?.energy ?? 4);
  const [intention, setIntention] = useState(existing?.intention ?? '');
  const [completion, setCompletion] = useState(existing?.completion ?? Math.round((activeTasks.filter((task) => task.status === 'done').length / Math.max(activeTasks.length, 1)) * 100));
  const [wins, setWins] = useState(existing?.wins ?? '');
  const [friction, setFriction] = useState(existing?.friction ?? '');
  const [adjustment, setAdjustment] = useState(existing?.adjustment ?? '');
  const [mood, setMood] = useState(existing?.mood ?? '平静');
  const [saved, setSaved] = useState(false);
  const recommended = useMemo(() => activeTasks.filter((task) => task.status !== 'done').slice(0, 3), [activeTasks]);

  const handleSave = () => {
    if (isMorning) {
      saveMorning({ energy, intention });
    } else {
      saveEvening({ completion, wins, friction, adjustment, mood });
    }
    setSaved(true);
  };

  if (saved) {
    return <div className="reflection-page"><section className="reflection-result"><span className="reflection-result-mark">✓</span><span className="section-kicker">{isMorning ? 'TODAY IS READY' : 'TODAY HAS A PLACE'}</span><h2>{isMorning ? '今天先完成这几件事。' : '今天已经留下一个判断。'}</h2><p>{isMorning ? `${ENERGY_LABELS[(energy ?? 3) - 1]}。你可以先从一件和当前项目直接相关的任务开始。` : eveningSummary(completion, wins, friction, adjustment)}</p><div className="reflection-result-detail">{isMorning ? <><span>能量 {energy}/5</span>{intention && <span>今天想先：{intention}</span>}</> : <><span>完成度 {completion}%</span><span>情绪 {mood}</span>{adjustment && <span>明天调整：{adjustment}</span>}</>}</div><button type="button" className="primary-action reflection-result-action" onClick={() => navigate('/app')}>回到 Command Center →</button></section></div>;
  }

  return <div className="reflection-page"><header className="reflection-header"><Link to="/app" className="quiet-link">← 回到工作台</Link><span className="section-kicker">{isMorning ? 'MORNING STARTUP' : 'EVENING REFLECTION'} · {existing ? '已记录，可更新' : '今天'}</span></header>{isMorning ? <MorningReflection energy={energy} intention={intention} tasks={recommended} projectName={activeProjects[0]?.name} onEnergyChange={setEnergy} onIntentionChange={setIntention} onSave={handleSave} /> : <EveningReflection completion={completion} wins={wins} friction={friction} adjustment={adjustment} mood={mood} taskCount={activeTasks.length} doneCount={activeTasks.filter((task) => task.status === 'done').length} onCompletionChange={setCompletion} onWinsChange={setWins} onFrictionChange={setFriction} onAdjustmentChange={setAdjustment} onMoodChange={setMood} onSave={handleSave} />}</div>;
}

function MorningReflection({ energy, intention, tasks, projectName, onEnergyChange, onIntentionChange, onSave }: { energy: number; intention: string; tasks: ReturnType<typeof useWorkspace>['activeTasks']; projectName?: string; onEnergyChange: (value: number) => void; onIntentionChange: (value: string) => void; onSave: () => void }) {
  return <section className="reflection-sheet"><span className="section-kicker">MORNING / UNDER 2 MINUTES</span><h2>先确认今天的推进方式。</h2><p className="reflection-lead">系统会根据能量和当前项目安排建议。你不需要把整天计划得很满。</p><div className="reflection-section"><div className="reflection-section-heading"><span>今天的能量</span><strong>{energy} / 5</strong></div><div className="reflection-slider" role="group" aria-label="选择今天的能量">{[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={energy === level ? 'is-selected' : ''} onClick={() => onEnergyChange(level)}><i /><span>{level}</span></button>)}</div><p className="reflection-hint">{ENERGY_LABELS[energy - 1]}</p></div><label className="reflection-field"><span>今天最想守住的一件事 <small>可跳过</small></span><textarea value={intention} onChange={(event) => onIntentionChange(event.target.value)} placeholder="例如：先把首页的行动入口跑通，不同时分散到新的功能上。" maxLength={180} /></label><section className="reflection-recommendations"><div className="reflection-section-heading"><span>AI 建议先做</span><small>最多 3 件</small></div>{tasks.map((task, index) => <div className="reflection-task" key={task.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{task.title}</strong><small>{task.recommendedReason ?? task.description}</small></div><em>{task.dueLabel}</em></div>)}{tasks.length === 0 && <div className="reflection-empty">当前没有待办，可以用今天的意图创建一个轻量的下一步。</div>}</section><div className="reflection-footer"><span>当前项目 · {projectName ?? '个人成长计划'}</span><button type="button" className="primary-action" onClick={onSave}>开始今天</button></div></section>;
}

function EveningReflection({ completion, wins, friction, adjustment, mood, taskCount, doneCount, onCompletionChange, onWinsChange, onFrictionChange, onAdjustmentChange, onMoodChange, onSave }: { completion: number; wins: string; friction: string; adjustment: string; mood: string; taskCount: number; doneCount: number; onCompletionChange: (value: number) => void; onWinsChange: (value: string) => void; onFrictionChange: (value: string) => void; onAdjustmentChange: (value: string) => void; onMoodChange: (value: string) => void; onSave: () => void }) {
  return <section className="reflection-sheet evening-sheet"><span className="section-kicker">EVENING / UNDER 3 MINUTES</span><h2>不需要打分，只留下一点真实。</h2><p className="reflection-lead">今天发生的事会成为明天建议的依据。只填完成度和情绪也可以保存。</p><div className="completion-card"><div><span>今天的完成感</span><strong>{completion}%</strong><small>{doneCount} / {taskCount} 个任务已完成</small></div><input type="range" min="0" max="100" step="10" value={completion} onChange={(event) => onCompletionChange(Number(event.target.value))} aria-label="今天的完成感" /></div><div className="reflection-fields-grid"><label className="reflection-field"><span>做对了什么 <small>可跳过</small></span><textarea value={wins} onChange={(event) => onWinsChange(event.target.value)} placeholder="今天哪个推进值得保留？" maxLength={220} /></label><label className="reflection-field"><span>哪里不顺 <small>可跳过</small></span><textarea value={friction} onChange={(event) => onFrictionChange(event.target.value)} placeholder="哪里卡住了，或者什么让你分心？" maxLength={220} /></label></div><label className="reflection-field"><span>明天想怎样调整 <small>可跳过</small></span><textarea value={adjustment} onChange={(event) => onAdjustmentChange(event.target.value)} placeholder="例如：上午先留出一个 Focus，不开始新的支线。" maxLength={220} /></label><div className="reflection-section mood-section"><div className="reflection-section-heading"><span>今天的情绪</span><small>选择一个最接近的状态</small></div><div className="mood-options" role="group" aria-label="选择今天的情绪">{MOODS.map((item) => <button type="button" key={item.value} className={mood === item.value ? 'is-selected' : ''} onClick={() => onMoodChange(item.value)}><i>{item.symbol}</i><span>{item.value}</span></button>)}</div></div><div className="reflection-footer"><span>保存后，AI 会在后台整理一条明日建议。</span><button type="button" className="primary-action" onClick={onSave}>完成复盘</button></div></section>;
}

function eveningSummary(completion: number, wins: string, friction: string, adjustment: string) {
  if (adjustment) return `你已经为明天留下调整：「${adjustment}」。系统会把它放进下一次晨间建议里。`;
  if (wins) return `今天的完成感是 ${completion}%，并且你记下了一个值得保留的动作。明天可以从这条经验继续。`;
  if (friction) return `今天的完成感是 ${completion}%，你已经明确了一个阻力。能看见它，就是调整的开始。`;
  return `今天的完成感是 ${completion}%。不必把每一天都解释清楚，明天仍然可以从一个小的下一步开始。`;
}
