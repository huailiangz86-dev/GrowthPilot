import {useRef,useState} from 'react';
import '../life/expert.css';
import FitnessProfileFields from '../life/FitnessProfileFields';
import {blankProfile,validProfile,type FitnessProfile} from '../life/fitnessContext';
const KEY='gp-fitness-context-prototype-v1';
export default function FitnessContextPrototype() {
  const [loaded]=useState(()=>{try {const raw=localStorage.getItem(KEY);const p=raw ? JSON.parse(raw) : blankProfile();if(!validProfile(p,true))throw new Error('原型草稿无法读取，原内容已保留');return {p,error:''};}catch(e){return {p:blankProfile(),error:e instanceof Error ? e.message : '原型存储不可用'};}});
  const [p,setP]=useState<FitnessProfile>(loaded.p), [error,setError]=useState(loaded.error), [status,setStatus]=useState(''), [fail,setFail]=useState(false), [busy,setBusy]=useState(false);
  const attempt=useRef(0);
  function update(patch:Partial<FitnessProfile>) {const next={...p,...patch};setP(next);setStatus('');attempt.current++;setBusy(false);if(loaded.error)return;try{localStorage.setItem(KEY,JSON.stringify(next));setError('');}catch{setError('原型草稿暂时无法保存，请保留页面。');}}
  async function simulate() {if(error)return;const n=++attempt.current;setBusy(true);setStatus('正在核对背景与示例反馈…');await new Promise(r=>setTimeout(r,500));if(n!==attempt.current)return;setBusy(false);
    setStatus(fail ? '模拟服务失败，背景草稿已保留，可以重试。' : !p.confirmed || !p.share_with_expert || !p.goal || !p.experience || !p.equipment.includes('dumbbell') || !p.days_per_week || !p.session_minutes || p.population==='unknown' || p.limitations==='unknown' ? '还需本人补齐背景、哑铃器械及读取范围。' : p.population!=='healthy_adult' || p.limitations!=='none' || p.limitation_notes.trim() ? '先核对适用情况与限制，示例不提供训练结构。' : '示例：沿用本人已确认的哑铃划船 5 kg · 2 × 8。训练前核对当天状态，记录实际努力程度与恢复反馈；示例不加重。');
  }
  return <section className="hp-card"><span className="hp-eyebrow">D4 · 个体背景与反馈 · 独立模拟</span><h2>让下一步结合你的情况</h2><p>先填写背景，再核对真实训练的努力程度、恢复反馈与器械。这里使用编造的记录和预设结果。</p><FitnessProfileFields value={p} onChange={update}/><p>示例实际记录：哑铃划船 5 kg · 2 × 8，努力程度 6/10，当时感觉可正常活动。正式回顾会核对原记录版本。</p><label className="hp-checkbox"><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>模拟服务失败</label><button className="hp-primary" disabled={busy || !!error} onClick={()=>void simulate()}>{busy ? '正在核对…' : '核对下一步 · 模拟 / 重试'}</button>{status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}</section>;
}
