import type {ExpertSkill, Teaching} from './expertSkillData';
const STATUS = {target: '练习检查项', supported: '本次答案有对应依据', needs_revision: '本次答案需要修正', missing: '本次答案尚未涉及', uncertain: '依据不足，待核对'};

export default function ExpertSkillDetails({skill}: {skill?: ExpertSkill}) {
  if (!skill) return <small>这份历史结果生成时尚未记录专业方法；重新请求可使用当前方法。</small>;
  return <details className="ih-methods"><summary>本次使用的方法与来源</summary><h4>{skill.name}</h4>
    {skill.tools.training_volume?.movements.map(m => <article key={m.name}><strong>{m.name}</strong><p>本范围已记录 {m.recorded_sets} 组 · {m.recorded_reps} 次 · 外部重量量 {m.external_volume_kg_reps} kg·次</p>
      {m.comparisons.length > 0 && <details><summary>组数和次数相同的记录比较 · {m.comparisons.length} 对</summary>{m.comparisons.map((c,i) => <p key={i}>{c.previous.date} 的 {c.previous.weight_kg} kg → {c.current.date} 的 {c.current.weight_kg} kg，填写重量变化 {c.weight_change_kg} kg。</p>)}</details>}</article>)}
    {skill.tools.record_comparison && <p>有实际活动记录的日期：{skill.tools.record_comparison.recorded_days.join('、') || '无'}。共 {skill.tools.record_comparison.comparison_count} 对可比较记录；仍需核对器械和动作条件。</p>}
    <ul>{skill.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
    <p>方法来源核对日期：{skill.reviewed_on}</p><ul>{skill.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><small> · {source.role}</small></li>)}</ul>
  </details>;
}
export function TeachingDetails({teaching}: {teaching?: Teaching}) {
  if (!teaching) return null;
  return <div className="ih-teaching">{teaching.criteria.map(c => <article key={c.id}><h4>{c.id} · {c.criterion}</h4><strong>{STATUS[c.status]}</strong><p>{c.feedback}</p><details><summary>核对这一项的依据</summary><blockquote>{c.source_quote}</blockquote>{c.answer_quote && <><small>本次答案中的原话</small><blockquote>{c.answer_quote}</blockquote></>}</details></article>)}
    {teaching.hints.map((hint,index) => <details key={index}><summary>提示 {index + 1} · {['思考方向','拆解步骤','核对原文'][index]}</summary><p>{hint}</p></details>)}
    <h4>尝试回答</h4><ol>{teaching.questions.map(question => <li key={question}>{question}</li>)}</ol>
  </div>;
}
