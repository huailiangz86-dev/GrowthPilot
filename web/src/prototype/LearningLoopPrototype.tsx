import {useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {LOOP_KEY, SOURCES, addDays, finishAttempt, freshLoop, readLoop, saveAnswer, startAttempt, suggestedAction,
  type LoopAttempt, type LoopState} from './learningLoopState';
import './LearningLoopPrototype.css';

const STEPS = ['选资料与目标', '自己答一次', '核对这次卡点', '实际用一次', '安排下次回访'];
const STAGES = ['setup', 'recall', 'check', 'practice', 'schedule'];
const ASSISTANCE = {independent: '本人独立作答', source: '看过原文或提示', ai: '借助外部 AI 草稿'};
function today() {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());}

export default function LearningLoopPrototype() {
  const [initial] = useState(() => {
    let raw: string | null = null;
    try {raw = localStorage.getItem(LOOP_KEY); return {state: readLoop(raw, today()), raw, error: ''};}
    catch {return {state: freshLoop(today()), raw, error: '旧草稿暂时无法读取，原内容未覆盖。可以先导出保留。'};}
  });
  const [state, setState] = useState(initial.state), stateRef = useRef(initial.state);
  const [error, setError] = useState(initial.error), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  const [failAI, setFailAI] = useState(false), [failSave, setFailSave] = useState(false), [hint, setHint] = useState(false);
  const [history, setHistory] = useState<string | null>(null);
  const a = state.current, active = STAGES.indexOf(state.stage);
  const latest = state.attempts.at(-1), action = a ? suggestedAction(a) : null;
  const source = a?.source ?? SOURCES[state.sourceVersion];
  function save(next: LoopState) {
    stateRef.current = next; setState(next);
    try {
      if (initial.error) throw Error('旧草稿无法读取，请先导出原内容；不会覆盖。');
      if (failSave) throw Error('模拟保存失败，输入仍在当前页面；刷新前请重试保存或导出。');
      localStorage.setItem(LOOP_KEY, JSON.stringify(next)); setError(''); return true;
    } catch (e) {setError(e instanceof Error ? e.message : '草稿无法保留，请先导出。'); return false;}
  }
  function edit(patch: Partial<LoopState>) {save({...stateRef.current, ...patch});}
  function editAttempt(patch: Partial<LoopAttempt>) {
    const current = stateRef.current.current;
    if (current) save({...stateRef.current, current: {...current, ...patch}});
  }
  function begin() {
    try {setHint(false); save(startAttempt(stateRef.current, crypto.randomUUID())); setNotice('本次只做一个问题。答案与这份原文版本一起保留。');}
    catch (e) {setError(String(e));}
  }
  async function review(withSimulation: boolean) {
    if (inFlight.current) return;
    try {
      const next = saveAnswer(stateRef.current);
      if (!save(next)) return;
      if (!withSimulation) {edit({stage: 'check'}); return;}
      inFlight.current = true; setBusy(true); setNotice('正在准备核对示例 · 模拟');
      await new Promise(resolve => setTimeout(resolve, 650));
      if (failAI) {setError('模拟回顾失败，已保存的答案与出处保留。可重试，或直接核对原文。'); return;}
      edit({stage: 'check'}); setNotice('已打开原文与核对清单。下方为示例引导，请本人判断。');
    } catch (e) {setError(String(e));}
    finally {inFlight.current = false; setBusy(false);}
  }
  function exportDraft() {
    const blob = new Blob([initial.error && initial.raw !== null ? initial.raw : JSON.stringify(stateRef.current, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '学习流程原型记录.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function finish() {
    try {if (save(finishAttempt(stateRef.current))) setNotice('本次练习与核对记录已保存。下次从这里继续。');}
    catch (e) {setError(String(e));}
  }
  return <main className="ll-root">
    <header className="ll-top"><Link to="/prototype">GrowthPilot / 原型</Link><span>完整学习流程 · 独立示例</span></header>
    <div className="ll-disclosure">示例资料与模拟反馈，仅在当前浏览器保存；不连接真实账户、模型或提醒服务。示例今天：{state.clock}。</div>
    <div className="ll-heading"><div><p className="ll-eyebrow">学习，接到下一次应用</p><h1>{state.stage === 'home' ? '把读过的，真正用一次。' : STEPS[active]}</h1><p>{state.stage === 'home' ? '留下一次自己的回答，核对一个卡点，下次回来接着练。' : state.goal || '先从一份资料、一个具体目标开始。'}</p></div><button className="ll-secondary" onClick={exportDraft}>导出我的原型记录</button></div>
    <div className="ll-status" aria-live="polite">{busy ? <p role="status">正在准备核对示例…</p> : notice && <p role="status">{notice}</p>}{error && <div role="alert"><p>{error}</p>{!initial.error && <button className="ll-secondary" disabled={busy} onClick={() => {if (save(stateRef.current)) setNotice('草稿已重新保存。');}}>重试保存草稿</button>}</div>}</div>
    {state.stage !== 'home' && <ol className="ll-progress" aria-label="学习流程">{STEPS.map((step, i) => <li key={step} aria-current={active === i ? 'step' : undefined}><span>{i + 1}</span>{step}</li>)}</ol>}
    <div className="ll-layout"><section className="ll-main">
      {state.stage === 'home' && <>
        <section className="ll-focus"><p className="ll-eyebrow">{a ? '继续未完成的一次' : latest ? '下一次练习' : '从一个小目标开始'}</p>
          <h2>{a ? a.question : latest ? latest.nextDate ? `${latest.nextDate <= state.clock ? '该回来核对了' : '下次回访'} · ${latest.nextDate}` : '本次未安排回访日期' : '我想用 AI 改进资料整理，先判断哪些结论可信。'}</h2>
          <p>{latest ? '上次答案、原文、本人核对和练习结果都在。再次练习会保留为新的一次。' : '不用先建工作空间或整理全部知识库。选一份示例资料，完成一次练习。'}</p>
          {a ? <button className="ll-primary" disabled={!!initial.error} onClick={() => edit({stage: a.checked ? 'schedule' : a.selfCheck ? 'practice' : a.answerSaved ? 'check' : 'recall'})}>继续上次练习</button> : <button className="ll-primary" disabled={!!initial.error} onClick={() => latest ? begin() : edit({stage: 'setup'})}>{latest ? '开始下一次练习' : '开始第一份资料'}</button>}
          {latest?.nextDate && latest.nextDate > state.clock && <button className="ll-text" onClick={() => edit({clock: latest.nextDate})}>体验到期回访 · 推进示例日期</button>}
        </section>
        <section className="ll-history"><h2>自己的练习记录 <small>{state.attempts.length} 次</small></h2>{!state.attempts.length && <p>完成后的原文、回答和实际结果会保留在这里。</p>}{state.attempts.map(item => <article key={item.id}><button className="ll-history-button" aria-expanded={history === item.id} onClick={() => setHistory(history === item.id ? null : item.id)}><span>{item.completedOn} · {ASSISTANCE[item.assistance]}</span><strong>{item.question}</strong><span>查看这次回答与结果 →</span></button>{history === item.id && <div className="ll-history-detail"><h3>这次的原文 · 版本 {item.source.version}</h3><blockquote>{item.source.text}</blockquote><h3>本人当时的答案</h3><p>{item.noRecall ? '本次没能想起，没有可比较的答案。' : item.answer}</p><h3>本人核对</h3><p>{({missing: '发现遗漏了限制', included: '认为已写明限制', uncertain: '还不确定'} as Record<string, string>)[item.selfCheck]}</p><h3>实际练习结果</h3><p>{item.result}</p><p>核对为本人完成，不代表自动判分或长期掌握。</p></div>}</article>)}</section>
      </>}
      {state.stage === 'setup' && <section className="ll-sheet"><h2>只带进这一次要用的资料</h2><button className="ll-source-choice" aria-pressed={state.sourceSelected} onClick={() => edit({sourceSelected: !state.sourceSelected})}><strong>{SOURCES[state.sourceVersion].title}</strong><span>3 段原文 · 版本 {state.sourceVersion} · {state.sourceSelected ? '已选中' : '点击选择'}</span></button>{state.sourceSelected && <blockquote>{source.text}</blockquote>}<label>这次想用它做什么？<input aria-label="本次应用目标" maxLength={240} value={state.goal} onChange={e => edit({goal: e.target.value})} placeholder="例如：为团队写一份有依据的试用建议" /></label><button className="ll-text" onClick={() => edit({goal: '为团队写一份有依据的 AI 整理工具试用建议', sourceSelected: true})}>使用示例资料和目标</button><button className="ll-primary" disabled={!state.sourceSelected || !state.goal.trim() || !!initial.error} onClick={begin}>开始自己作答</button></section>}
      {state.stage === 'recall' && a && <section className="ll-sheet"><p className="ll-eyebrow">一次自己的回答</p><h2>{a.question}</h2><label>先按自己的理解回答<textarea aria-label="本人实际答案" maxLength={6000} rows={5} value={a.answer} disabled={a.answerSaved || busy || a.noRecall} onChange={e => editAttempt({answer: e.target.value})} placeholder="能确认什么，暂时不能确认什么？" /></label><label className="ll-checkbox"><input type="checkbox" checked={a.noRecall} disabled={a.answerSaved || busy} onChange={e => editAttempt({noRecall: e.target.checked})} />这次没能想起，先留下这个事实</label>
        <label>这次用了哪些帮助？<select aria-label="作答帮助程度" disabled={a.answerSaved || busy} value={a.assistance} onChange={e => editAttempt({assistance: e.target.value as LoopAttempt['assistance']})}><option value="independent" disabled={a.hintSeen}>本人独立作答</option><option value="source">看过原文或提示</option><option value="ai">借助外部 AI 草稿</option></select></label>
        {!a.answerSaved && <button className="ll-text" onClick={() => {setHint(!hint); if (!a.hintSeen) editAttempt({hintSeen: true, assistance: a.assistance === 'ai' ? 'ai' : 'source'});}}>查看原文提示 · 会保留帮助标记</button>}{hint && !a.answerSaved && <blockquote>{a.source.text}</blockquote>}
        {a.answerSaved && <p>答案已经保留。刷新或重试沿用本次答案，不会产生第二次作答。</p>}
        <div className="ll-actions"><button className="ll-primary" disabled={busy || !!initial.error || (!a.noRecall && !a.answer.trim())} onClick={() => void review(true)}>{a.answerSaved ? '重试核对引导 · 模拟' : '保存答案并查看核对引导'}</button><button className="ll-secondary" disabled={busy || !!initial.error || (!a.noRecall && !a.answer.trim())} onClick={() => void review(false)}>直接核对原文</button></div>
      </section>}
      {state.stage === 'check' && a && <section className="ll-sheet"><h2>先核对依据，再判断这次卡点</h2><div className="ll-compare"><div><h3>本人实际答案</h3><p>{a.noRecall ? '本次没能想起。没有答案可供比较，不能据此诊断具体知识错误。' : a.answer}</p><small>{ASSISTANCE[a.assistance]}</small></div><div><h3>原文依据 · 版本 {a.source.version}</h3><blockquote>{a.source.text}</blockquote></div></div><p className="ll-note">下面是预设核对清单，不是模型对你答案的真实诊断：是否区分了自报感受与实际效果？是否保留无对照、未测实际耗时的限制？</p><fieldset><legend>本人核对后的判断</legend>{[['missing', '我发现遗漏了限制'], ['included', '我认为已经写明限制'], ['uncertain', '我还不确定，需要再练一次']].map(([value, label]) => <label className="ll-checkbox" key={value}><input type="radio" name="selfCheck" value={value} checked={a.selfCheck === value} onChange={() => editAttempt({selfCheck: value as LoopAttempt['selfCheck']})} />{label}</label>)}</fieldset><button className="ll-primary" disabled={!a.selfCheck || !!initial.error} onClick={() => edit({stage: 'practice'})}>选一个下一步，实际用一次</button></section>}
      {state.stage === 'practice' && a && action && <section className="ll-sheet"><p className="ll-eyebrow">只推进这一个动作</p><h2>{action.action}</h2><p>{action.why}</p><p className="ll-note">根据本人刚才的选择展示的规则式练习示例，未调用 AI。</p><details><summary>回看本次原文与答案</summary><blockquote>{a.source.text}</blockquote><p>{a.answer || '本次没能想起'}</p></details><label>我的实际练习或应用结果<textarea aria-label="实际练习结果" maxLength={8000} rows={6} value={a.result} onChange={e => editAttempt({result: e.target.value, checked: false})} placeholder="写下自己的建议，或粘贴本次实际应用的结果。" /></label><div className="ll-criterion"><h3>完成后这样核对</h3><p>{action.check}</p><label className="ll-checkbox"><input type="checkbox" checked={a.checked} onChange={e => editAttempt({checked: e.target.checked})} />我已对照以上条件检查了结果</label></div><button className="ll-primary" disabled={!a.result.trim() || !a.checked || !!initial.error} onClick={() => edit({stage: 'schedule'})}>保留结果，安排下次回来</button><button className="ll-text" onClick={() => edit({stage: 'check'})}>返回调整本人判断</button></section>}
      {state.stage === 'schedule' && a && <section className="ll-sheet"><p className="ll-eyebrow">把这次练习接到下一次</p><h2>下次换个情境，再试一次。</h2><p>已留下自己的答案与实际结果。一次完成不代表长期掌握。</p><label>下次回访安排<select aria-label="回访安排方式" value={a.schedule} onChange={e => editAttempt({schedule: e.target.value as LoopAttempt['schedule']})}><option value="suggested">两天后再练 · 规则示例</option><option value="manual">自己选择日期</option><option value="none">暂不安排日期</option></select></label>{a.schedule === 'manual' && <label>下次日期<input aria-label="下次回访日期" type="date" min={addDays(state.clock, 1)} value={a.nextDate} onChange={e => editAttempt({nextDate: e.target.value})} /></label>}<p>{a.schedule === 'suggested' ? `下次回访：${addDays(state.clock, 2)}` : a.schedule === 'none' ? '保留本次结果，不安排日期。' : `下次回访：${a.nextDate || '待选择'}`}</p><p className="ll-note">仅演示日期安排，不会发送提醒。回访时保留旧答案，新增一次练习。</p><button className="ll-primary" disabled={!!initial.error || (a.schedule === 'manual' && (!a.nextDate || a.nextDate <= state.clock))} onClick={finish}>保存本次练习与回访安排</button></section>}
    </section><aside className="ll-side"><p className="ll-eyebrow">这次保留什么</p><h2>{state.goal || '资料 → 自己的回答 → 实际结果'}</h2><p>来源：{state.sourceSelected ? `${source.title} / 版本 ${source.version}` : '尚未选择'}</p>{a && <p>作答：{a.answerSaved ? '已保留' : '等待本人回答'}<br />帮助：{ASSISTANCE[a.assistance]}</p>}{a && state.sourceVersion !== a.source.version && <p className="ll-note">示例资料已更新至版本 {state.sourceVersion}。本次继续核对作答时的版本 {a.source.version}，旧依据仍保留。</p>}<p>这里保留练习证据与本人判断，不生成能力分数。</p>{state.stage !== 'home' && <button className="ll-secondary" disabled={busy} onClick={() => {if (save({...stateRef.current, stage: 'home'})) setNotice('本次进度已保留，回来后可以继续。');}}>先停在这里，下次继续</button>}</aside></div>
    <details className="ll-tools"><summary>体验设置与失败恢复</summary><div className="ll-actions"><label className="ll-checkbox"><input type="checkbox" checked={failAI} onChange={e => setFailAI(e.target.checked)} />模拟回顾失败</label><label className="ll-checkbox"><input type="checkbox" checked={failSave} onChange={e => setFailSave(e.target.checked)} />模拟保存失败</label><button className="ll-secondary" disabled={busy} onClick={() => edit({sourceVersion: state.sourceVersion === 1 ? 2 : 1})}>模拟资料版本变化</button></div><p>失败时先保留输入。保存失败的内容在重试成功前仅在当前页面；刷新前可导出。此原型不修改正式资料、学习记录或数据库。</p></details>
  </main>;
}
