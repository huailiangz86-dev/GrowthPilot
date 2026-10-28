import {useEffect,useState} from 'react';
import {api} from '../api/client';
interface Device {id:string;enabled:boolean;timezone:string;send_time:string;last_delivery:{status:string;attempts:number;error:string|null;sent_at:string|null}|null}
function pushKey(value:string) {const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
const labels:Record<string,string>={sent:'推送通道已接收',pending:'等待到点',failed:'发送失败，等待重试',expired:'已失效或超过重试范围',cancelled:'已取消',quiet:'本次无到期内容，保持安静'};
export default function ReminderSettings({workspaceId,prototype=false}:{workspaceId:string;prototype?:boolean}) {
  const [scenario,setScenario]=useState('success');
  const [configured,setConfigured]=useState(prototype),[publicKey,setPublicKey]=useState(''),[devices,setDevices]=useState<Device[]>([]),[consent,setConsent]=useState(false),[time,setTime]=useState('08:30'),[zone,setZone]=useState(Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Shanghai'),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{if(prototype)return;let active=true;void Promise.all([api.get<{configured:boolean;public_key:string|null}>('/reminders/config'),api.get<Device[]>(`/reminders/${workspaceId}`)]).then(([c,d])=>{if(active){setConfigured(c.configured);setPublicKey(c.public_key||'');setDevices(d);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[workspaceId,prototype,revision]);
  async function enable() {
    if(busy||!consent)return;setBusy(true);setError('');setNotice('');
    try {
      if(prototype){if(scenario==='denied')throw Error('模拟：通知权限已被拒绝，提醒未启用。');if(scenario==='failure')throw Error('模拟：服务器保存失败，提醒未启用，可保留时间重试。');new Intl.DateTimeFormat('zh-CN',{timeZone:zone});setDevices([{id:'sample-device',enabled:true,timezone:zone,send_time:time,last_delivery:{status:'pending',attempts:0,error:null,sent_at:null}}]);setNotice('模拟已保存；不会申请系统权限或发送通知。');return;}
      if(!configured)throw Error('服务器尚未配置推送通道，提醒未启用。');
      if(!window.isSecureContext||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('当前浏览器不支持后台推送，请在支持的 HTTPS 浏览器或主屏幕应用中开启。');
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw Error(permission==='denied'?'通知权限已被拒绝。可在浏览器设置中调整后重新开启。':'尚未授予通知权限，提醒未启用。');
      const registration=await navigator.serviceWorker.register('/reminder-sw.js');
      await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(publicKey)});
      await api.post(`/reminders/${workspaceId}`,{subscription:subscription.toJSON(),timezone:zone,send_time:time});
      setNotice('本设备的服务器提醒已开启。只有存在到期工作或复习时才发送，关闭页面后仍由服务器调度。');setRevision(n=>n+1);
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function pause(id:string) {if(busy)return;setBusy(true);setError('');try{if(!prototype)await api.delete(`/reminders/${workspaceId}/${id}`);setDevices(rows=>rows.map(d=>d.id===id?{...d,enabled:false}:d));setNotice('该设备的服务器提醒已暂停。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="workspace-panel calendar-connection"><h3>服务器到期提醒{prototype?' · 模拟':''}</h3><p>按保存的时区和时间检查到期工作与复习。系统权限、服务器通道和设备订阅均就绪后才启用。</p>
    {prototype&&<label>模拟提醒条件<select aria-label="模拟提醒条件" value={scenario} onChange={e=>setScenario(e.target.value)}><option value="success">成功</option><option value="denied">拒绝权限</option><option value="failure">保存失败</option></select></label>}
    {!configured&&<p>服务器尚未配置推送通道；当前不会发送通知。</p>}
    <label className="calendar-url">提醒时区<input aria-label="提醒时区" value={zone} maxLength={64} onChange={e=>setZone(e.target.value)}/></label><label className="calendar-url">每天检查时间<input aria-label="提醒时间" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>允许服务器向本设备发送到期提醒</label><div className="calendar-actions"><button disabled={busy||!consent||!configured||!time} onClick={()=>void enable()}>开启或更新本设备提醒</button><button disabled={busy} onClick={()=>setRevision(n=>n+1)}>重新读取提醒状态</button></div>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {devices.map((d,i)=><article key={d.id}><h4>设备提醒 {i+1} · {d.enabled?'已开启':'已暂停'}</h4><p>{d.timezone} · {d.send_time}</p>{d.last_delivery&&<p>{labels[d.last_delivery.status]||'状态待确认'}{d.last_delivery.sent_at?` · ${new Date(d.last_delivery.sent_at).toLocaleString()}`:''}{d.last_delivery.error&&` · ${d.last_delivery.error}`}</p>}{d.enabled&&<button disabled={busy} onClick={()=>void pause(d.id)}>暂停该设备提醒</button>}</article>)}
    <p className="execution-footnote">推送通道接收不等于本人已看到。拒绝权限、网络中断或设备限制会影响展示；服务器会保留失败与重试状态。</p>
  </section>;
}
