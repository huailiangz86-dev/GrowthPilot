import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../workspace/useWorkspace';
import { useExecution } from '../../execution/useExecution';
import './workspace.css';
import './Execution.css';

interface Receipt {active_seconds: number; finished_at: string | null}

export default function StudyRoute() {
  const {itemId = ''} = useParams();
  return <Study key={itemId} itemId={itemId}/>;
}

function Study({itemId}: {itemId: string}) {
  const { activeLearning, activeKnowledgeCards, refreshExecutionData } = useWorkspace();
  const { refresh } = useExecution();
  const item = activeLearning.find(value => value.id === itemId);
  const card = activeKnowledgeCards.find(value => value.learningItemId === itemId);
  const hasResource = Boolean(item?.sourceUrl || card?.sourceUrl || card?.content);
  const [sessionId] = useState(() => {
    const key = `gp-study-${itemId}`;
    const previous = sessionStorage.getItem(key);
    const id = previous && /^[0-9a-f-]{36}$/i.test(previous) ? previous : crypto.randomUUID();
    sessionStorage.setItem(key, id); return id;
  });
  const [seconds, setSeconds] = useState(0); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false); const [visible, setVisible] = useState(true);
  const finishedRef = useRef(false), queue = useRef<Promise<unknown>>(Promise.resolve());
  const cloudItem = Boolean(item && hasResource && /^[0-9a-f-]{36}$/i.test(item.id));
  useEffect(() => {
    if (!cloudItem) return;
    let disposed = false;
    const ping = (active: boolean) => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (finishedRef.current) return;
        const receipt = await api.post<Receipt>(`/learning-items/${itemId}/study`, {id: sessionId, active});
        if (!disposed) {setSeconds(receipt.active_seconds);setError('');setFinished(Boolean(receipt.finished_at));}
        if (receipt.finished_at) finishedRef.current = true;
      }).catch(error => {if (!disposed) setError(error instanceof Error ? error.message : '计时暂未同步，恢复连接后会继续。');});
    };
    const onVisible = () => { const active = !document.hidden && document.hasFocus(); setVisible(active); ping(active); };
    onVisible();
    const timer = window.setInterval(onVisible, 15000);
    document.addEventListener('visibilitychange', onVisible); window.addEventListener('focus', onVisible); window.addEventListener('blur', onVisible);
    return () => {
      disposed = true; clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('blur', onVisible);
      ping(false);
    };
  }, [cloudItem, itemId, sessionId]);
  const finish = async () => {
    setSaving(true); setError('');
    try {
      await queue.current;
      const receipt = await api.post<Receipt>(`/learning-items/${itemId}/study`, {id: sessionId, active: false, complete: true, note});
      setSeconds(receipt.active_seconds); finishedRef.current = true; setFinished(true);
      sessionStorage.removeItem(`gp-study-${itemId}`);
      await refreshExecutionData(); refresh();
    } catch (error) {setError(error instanceof Error ? error.message : '结果尚未保存，请重试。');}
    finally {setSaving(false);}
  };
  if (!item) return <section className="workspace-panel"><h2>正在读取学习内容</h2><p>确认此学习属于当前工作空间。</p><Link to="/app/knowledge">返回学习队列</Link></section>;
  const sourceUrl = item.sourceUrl ?? card?.sourceUrl;
  const safeSource = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined;
  return <div className="page-stack"><header className="page-intro"><div><span className="section-kicker">学习过程</span><h2>{item.title}</h2><p>阅读来源，留下可以验证或应用的结果。有效学习分钟会自动保存。</p></div><Link className="outline-action" to="/app/knowledge">返回队列</Link></header>
    <div className="study-layout"><section className="workspace-panel"><div className="panel-header"><h3>{card?.content ? '原始学习内容' : '学习资源'}</h3>{safeSource && <a className="outline-action" href={safeSource} target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a>}</div>
      {safeSource && <p className="execution-footnote">来源：<a href={safeSource} target="_blank" rel="noopener noreferrer">{safeSource}</a></p>}
      <div className="study-source">{card?.content ?? item.summary ?? ''}</div>
      {!safeSource && !card?.content && <p className="execution-error">当前仅有学习说明，尚未提供原始资源。可在学习队列中补充资源地址。</p>}
    </section><section className="workspace-panel study-result"><span className="section-kicker">自动记录的过程</span><strong className="study-timer">{Math.floor(seconds / 60)}<small> 分 {seconds % 60} 秒</small></strong><p className="execution-footnote">{finished ? '结果已保存' : !hasResource ? '尚未提供学习资源，计时未开始' : !cloudItem ? '本地草稿尚未同步，暂不能记录学习过程' : visible ? '学习页面计时中 · 每 15 秒保存' : '页面不在前台，计时已暂停'}。整分钟自动进入统计；外部课程页面的观看时间需从实际应用接入。</p>
      <label><span>实际学到了什么，准备如何应用？</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={4000} placeholder="例如：整理了三条访谈问题，下次访谈会先验证用户的实际行为。" disabled={finished}/></label>
      {error && <p className="execution-error" role="alert">{error}</p>}
      <button type="button" className="primary-action" disabled={saving || finished || !cloudItem || !note.trim()} onClick={() => {void finish();}}>{finished ? '学习结果已保存' : saving ? '保存中…' : '保存结果并完成本项学习'}</button>
      {finished && <p role="status" className="execution-footnote">学习结果和进度已回写，后台会自动刷新统计。</p>}
    </section></div>
  </div>;
}
