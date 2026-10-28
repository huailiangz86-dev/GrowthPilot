import {EQUIPMENT, EXPERIENCE, GOALS, type FitnessProfile} from './fitnessContext';
export function FitnessProfileSummary({value:p}:{value:FitnessProfile}) {
  return <dl className="fe-profile-summary"><dt>目标与经验</dt><dd>{p.goal ? GOALS[p.goal] : '目标未填写'} · {p.experience ? EXPERIENCE[p.experience] : '经验未填写'}</dd>
    <dt>可用时间</dt><dd>每周 {p.days_per_week ?? '未知'} 天 · 每次 {p.session_minutes ?? '未知'} 分钟</dd>
    <dt>本人可用器械</dt><dd>{p.equipment.map(k=>EQUIPMENT[k]).join('、') || '未填写'}</dd>
    <dt>适用情况</dt><dd>{p.population==='healthy_adult' ? '本人确认成年，当前无需要专业指导的健康情况' : p.population==='needs_guidance' ? '未成年或需要专业指导' : '尚未确认'}</dd>
    <dt>活动限制</dt><dd>{p.limitations==='none' ? '本人确认当前没有已知限制' : p.limitations==='reported' ? '存在限制，需要先核对' : '尚未确认'}{p.limitation_notes && ` · ${p.limitation_notes}`}</dd>
    <dt>背景使用</dt><dd>{p.share_with_expert ? '本人允许专家使用' : '未允许专家使用'} · {p.confirmed ? '本人已核对' : '待本人核对'}</dd></dl>;
}
export default function FitnessProfileFields({value:p,onChange,disabled=false}:{value:FitnessProfile;onChange:(patch:Partial<FitnessProfile>)=>void;disabled?:boolean}) {
  return <fieldset className="fe-profile-fields" disabled={disabled}><legend>本人确认的健身背景</legend>
    <div className="hp-form-grid"><label>当前目标<select aria-label="当前目标" value={p.goal ?? ''} onChange={e=>onChange({goal:e.target.value as FitnessProfile['goal'] || null})}><option value="">尚未填写</option>{Object.entries(GOALS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>训练经验<select aria-label="训练经验" value={p.experience ?? ''} onChange={e=>onChange({experience:e.target.value as FitnessProfile['experience'] || null})}><option value="">尚未填写</option>{Object.entries(EXPERIENCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>每周可安排天数<input aria-label="每周可安排天数" type="number" min={1} max={7} value={p.days_per_week ?? ''} onChange={e=>onChange({days_per_week:e.target.value ? Number(e.target.value) : null})}/></label>
    <label>每次可用分钟<input aria-label="每次可用分钟" type="number" min={5} max={240} value={p.session_minutes ?? ''} onChange={e=>onChange({session_minutes:e.target.value ? Number(e.target.value) : null})}/></label></div>
    <fieldset className="lf-days"><legend>可用器械 · 由本人选择</legend>{Object.entries(EQUIPMENT).map(([k,v])=><label key={k}><input type="checkbox" checked={p.equipment.includes(k as keyof typeof EQUIPMENT)} onChange={e=>onChange({equipment:e.target.checked ? [...p.equipment,k as keyof typeof EQUIPMENT] : p.equipment.filter(x=>x!==k)})}/>{v}</label>)}</fieldset>
    <label>适用情况<select aria-label="适用情况" value={p.population} onChange={e=>onChange({population:e.target.value as FitnessProfile['population']})}><option value="unknown">尚未确认</option><option value="healthy_adult">本人确认成年，当前无需要专业指导的健康情况</option><option value="needs_guidance">未成年或需要专业指导</option></select></label>
    <label>活动限制<select aria-label="活动限制" value={p.limitations} onChange={e=>onChange({limitations:e.target.value as FitnessProfile['limitations']})}><option value="unknown">尚未确认</option><option value="none">当前没有已知活动限制</option><option value="reported">存在限制，需要先核对</option></select></label>
    <label>限制或希望避开的活动<textarea aria-label="限制说明" rows={2} maxLength={2000} value={p.limitation_notes} onChange={e=>onChange({limitation_notes:e.target.value})}/></label>
    <label className="hp-checkbox"><input type="checkbox" checked={p.share_with_expert} onChange={e=>onChange({share_with_expert:e.target.checked})}/>允许健身专家在回顾时使用这份背景</label>
    <label className="hp-checkbox"><input type="checkbox" checked={p.confirmed} onChange={e=>onChange({confirmed:e.target.checked})}/>这些背景由本人填写并核对</label>
  </fieldset>;
}
