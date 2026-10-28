import {useEffect, useState} from 'react';
import {useItemHelp, type HelpKind, type HelpResult} from './useItemHelp';
import './help.css';
import ExpertSkillDetails, {TeachingDetails} from './ExpertSkillDetails';
import {exerciseWithRubric, type LearningResult} from './expertSkillData';

export default function LearningHelp({workspaceId, itemId, version, pending, onAdopt}: {workspaceId: string; itemId: string; version: number; pending: boolean; onAdopt: (exercise: string) => void}) {
  const tab = sessionStorage.getItem('gp_help_tab') || crypto.randomUUID(); sessionStorage.setItem('gp_help_tab', tab);
  return <LearningHelpSession key={`${workspaceId}:${itemId}`} scope={`learning:${workspaceId}:${itemId}:${tab}`} workspaceId={workspaceId} itemId={itemId} version={version} pending={pending} onAdopt={onAdopt}/>;
}
function LearningHelpSession({scope, workspaceId, itemId, version, pending, onAdopt}: {scope: string; workspaceId: string; itemId: string; version: number; pending: boolean; onAdopt: (exercise: string) => void}) {
  const h = useItemHelp(scope), [consent, setConsent] = useState(false), [adopted, setAdopted] = useState(false);
  const [history, setHistory] = useState<HelpResult[]>([]), [historyError, setHistoryError] = useState('');
  const {saved} = h;
  const showingHistory = history.length > 0;
  useEffect(() => {
    if (!showingHistory) return;
    const update = () => {if (!document.hidden) void saved(workspaceId,itemId).then(rows=>setHistory(rows.filter(r=>r.kind!=='learning_diagnose'))).catch(() => {setHistory([]);setHistoryError('历史暂时无法核对，请重试读取。');});};
    window.addEventListener('focus',update);const timer=setInterval(update,15000);
    return () => {clearInterval(timer);window.removeEventListener('focus',update);};
  }, [showingHistory,saved,workspaceId,itemId]);
  const changedAnswer = h.help?.kind === 'learning_feedback' && h.help.input?.answer !== h.fields.answer;
  const result = h.accountCurrent && !pending && !changedAnswer && h.help?.source?.version === version && !h.help.redacted && h.help.status === 'completed' ? h.help.result as LearningResult : null;
  const start = (kind: HelpKind) => {setAdopted(false); void h.start({kind,consent:true,workspace_id:workspaceId,item_id:itemId,base_version:version,question:h.fields.question || '',...(kind === 'learning_feedback' ? {answer:h.fields.answer || ''} : {})});};
  return <section className="ih-panel"><h3>在这份材料上获得帮助</h3><p>解释和练习基于已保存的笔记与摘录；答案反馈对照练习和原文。一次帮助最多读取 2.4 万字（含标题、疑问与练习），请选择当前要学的部分。</p><label>这次想弄懂的地方<textarea aria-label="本次学习疑问" rows={2} maxLength={2000} value={h.fields.question || ''} onChange={e => {h.setField('question',e.target.value);setConsent(false);}}/></label><label className="hp-checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>让 AI 读取这份已保存的笔记、疑问与练习</label><div className="lf-actions"><button type="button" disabled={!consent || pending || !version || h.busy} onClick={() => start('learning_explain')}>解释这段材料</button><button type="button" disabled={!consent || pending || !version || h.busy} onClick={() => start('learning_practice')}>准备一道练习</button></div>
    <label>本人的实际答案<textarea aria-label="本人的实际答案" rows={4} maxLength={10000} value={h.fields.answer || ''} onChange={e => {h.setField('answer',e.target.value);setConsent(false);}}/></label><button type="button" disabled={!consent || pending || !version || h.busy || !h.fields.answer?.trim()} onClick={() => start('learning_feedback')}>对照原文给答案反馈</button><small>反馈会读取这次答案。答案草稿和已提交版本分别保留；不会自动改变学习阶段或完成任务。</small>
    {pending && <p role="status">先等待当前笔记与练习保存，旧帮助已隐藏。</p>}{h.busy && <p role="status">正在生成这份材料的帮助…</p>}
    {(h.error || h.storageError || h.help?.error) && <p role="alert">{h.storageError || h.error || h.help?.error}</p>}
    {(h.help?.redacted || (!pending && h.help?.source?.version && h.help.source.version !== version)) && <p>材料、练习或读取范围已改变，旧帮助已隐藏。请基于当前材料重新请求。</p>}
    {changedAnswer && <p>答案草稿已改变，上一份反馈已隐藏。保存的那次答案仍保留在帮助历史中。</p>}
    <div className="lf-actions">{h.payload && !h.busy && h.help?.status !== 'completed' && <button type="button" disabled={pending} onClick={() => void h.retry()}>重试原请求</button>}<button type="button" disabled={h.busy} onClick={() => void h.refresh()}>恢复本页 AI 结果</button><button type="button" onClick={h.backup}>导出答案草稿</button></div>
    <button type="button" disabled={h.busy} onClick={() => void h.saved(workspaceId,itemId).then(rows => {setHistory(rows.filter(r=>r.kind!=='learning_diagnose'));setHistoryError(rows.length ? '' : '还没有已保存的帮助。');}).catch(() => setHistoryError('暂时无法读取帮助历史，请稍后重试。'))}>查看已保存的帮助历史</button>{historyError && <p role="status">{historyError}</p>}
    {history.map(row => <details key={row.request_id} onToggle={e => {if(e.currentTarget.open) void h.saved(workspaceId,itemId).then(rows=>setHistory(rows.filter(r=>r.kind!=='learning_diagnose'))).catch(() => {setHistory([]);setHistoryError('历史暂时无法核对，请重试读取。');});}}><summary>{row.kind === 'learning_explain' ? '解释' : row.kind === 'learning_practice' ? '练习' : '答案反馈'} · {new Date(row.created_at).toLocaleString()} · {row.redacted || pending || row.source?.version !== version ? '依据已改变' : row.status === 'completed' ? '已保存' : row.status === 'processing' ? '处理中' : '可重试'}</summary>{h.accountCurrent && !row.redacted && !h.help?.redacted && !pending && row.source?.version === version ? <><p className="ih-text">{row.input?.answer && `本次实际答案：${row.input.answer}`}</p>{row.result && 'text' in row.result && <><p className="ih-text">{row.result.text}</p><TeachingDetails teaching={row.result.teaching}/><ExpertSkillDetails skill={row.result.skill}/></>}{row.result?.quotes.map((q,i) => <blockquote key={i}>{q}</blockquote>)}{row.input && <button type="button" onClick={() => {h.recover(row.input!);setHistory([]);}}>打开这份帮助</button>}</> : <p>原笔记、练习或读取范围已改变，正文与答案不再展示。</p>}</details>)}
    {result && <div className="ih-result"><h4>{h.help?.kind === 'learning_explain' ? '基于摘录的解释' : h.help?.kind === 'learning_practice' ? '待本人采用的练习' : '对这次实际答案的反馈'}</h4><p className="ih-text">{result.text}</p><TeachingDetails teaching={result.teaching}/><ExpertSkillDetails skill={result.skill}/><details><summary>所用笔记版本 {version} 与原文依据</summary>{result.quotes.map((quote,i) => <blockquote key={i}>{quote}</blockquote>)}{h.help?.input?.question && <><h4>本次提问</h4><p className="ih-text">{h.help.input.question}</p></>}{h.help?.input?.answer && <><h4>本次已提交的实际答案</h4><p className="ih-text">{h.help.input.answer}</p></>}</details>{h.help?.kind === 'learning_practice' && <button type="button" disabled={adopted || pending} onClick={() => {onAdopt(exerciseWithRubric(result, version));setAdopted(true);}}>采用到练习区</button>}<small>解释与示例由 AI 生成，可对照引用核对。没有读取外部链接，也不代表整体掌握程度。</small></div>}
  </section>;
}
