import {useState} from 'react';
import ReminderSettings from '../execution/ReminderSettings';
import '../pages/app/Execution.css';
import '../sources/sources.css';
export default function CalendarRemindersPrototype() {
  const [scope,setScope]=useState({blocks:true,deadlines:true,reviews:true}),[active,setActive]=useState(false);
  return <main className="ps-app page-stack ps-main"><h1>日历与后台提醒 · 独立原型</h1><p>虚构示例，不连接日历、不申请通知权限、不发送真实推送。</p><section className="workspace-panel"><h2>确认日历范围</h2>{([['blocks','真实工作时段 · 14:00–14:45'],['deadlines','截止标记 · 18:00（不代表工时）'],['reviews','复习日期 · 全天']] as const).map(([k,label])=><label style={{display:'block'}} key={k}><input type="checkbox" checked={scope[k]} onChange={e=>setScope(s=>({...s,[k]:e.target.checked}))}/>{label}</label>)}<button onClick={()=>setActive(true)}>模拟生成所选范围订阅</button><button onClick={()=>setActive(false)}>模拟撤销订阅</button><p role="status">{active?`模拟订阅已生成，包含 ${Object.values(scope).filter(Boolean).length} 类内容。`:'当前无有效订阅。'}</p><p>修改和取消沿用稳定事件标识；订阅由日历应用自行刷新。</p></section><ReminderSettings workspaceId="prototype" prototype/></main>;
}
