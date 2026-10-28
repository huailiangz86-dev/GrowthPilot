import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { KnowledgeCard, KnowledgeCardContextLinkInput, KnowledgeCardInput, KnowledgeCardSummaryDraft, LearningItem, Task } from '../../workspace/workspaceData';
import { useWorkspace } from '../../workspace/useWorkspace';
import { api } from '../../api/client';
import './workspace.css';
import './Execution.css';

type LearningFilter = 'all' | 'in_progress' | 'queued' | 'completed';

export default function KnowledgeHub() {
  const {
    activeKnowledgeCards,
    activeLearning,
    activeGoals,
    activeTasks,
    addKnowledgeCard,
    retryKnowledgeCard,
    addKnowledgeCardToLearning,
    previewKnowledgeCardSummary,
    confirmKnowledgeCardSummary,
    updateKnowledgeCardContextLinks,
    addLearningItem,
  } = useWorkspace();
  const [filter, setFilter] = useState<LearningFilter>('all');
  const [showLearningComposer, setShowLearningComposer] = useState(false);
  const [showCaptureComposer, setShowCaptureComposer] = useState(false);
  const items = useMemo(() => activeLearning.filter((item) => filter === 'all' || item.status === filter), [activeLearning, filter]);
  const current = activeLearning.find((item) => item.status === 'in_progress') ?? activeLearning[0];
  const capturedCards = activeKnowledgeCards.filter((card) => card.status === 'captured');

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-kicker">KNOWLEDGE & LEARNING</span>
          <h2>先把值得理解的内容留下来</h2>
          <p>先保存原始来源；摘要建议和学习队列都由你决定是否采纳。</p>
        </div>
        <div className="page-intro-actions">
          <button type="button" className="outline-action" onClick={() => setShowLearningComposer((value) => !value)}>新建学习</button>
          <button type="button" className="primary-action" onClick={() => setShowCaptureComposer((value) => !value)}>捕获内容</button>
        </div>
      </header>

      {showCaptureComposer && (
        <KnowledgeCaptureComposer
          goals={activeGoals}
          onCancel={() => setShowCaptureComposer(false)}
          onSave={addKnowledgeCard}
        />
      )}
      {showLearningComposer && <LearningComposer goals={activeGoals} onCancel={() => setShowLearningComposer(false)} onCreate={addLearningItem} />}

      <section className="learning-overview">
        <div className="learning-overview-feature">
          <span className="section-kicker">CONTINUE LEARNING</span>
          <h3>{current?.title ?? '你的学习队列会出现在这里'}</h3>
          <p>{current?.summary ?? '可以先捕获一条原始内容，再决定是否把它变成学习入口。'}</p>
          {current && <div className="learning-overview-meta"><span className="mini-progress"><i style={{ width: `${current.progress}%`, background: 'var(--blue)' }} /></span><strong>{current.progress}%</strong><small>{current.durationLabel}</small></div>}
          {current ? (
            <>
              <Link className="primary-action" to={`/app/learn/${current.id}`}>打开学习内容 ↗</Link>
              <p className="execution-footnote">页面内的有效学习时间自动保存，进度在提交实际结果后回写。</p>
            </>
          ) : (
            <button type="button" className="primary-action" onClick={() => setShowCaptureComposer(true)}>捕获第一条内容</button>
          )}
        </div>
        <div className="learning-overview-side">
          <span className="section-kicker">KNOWLEDGE SIGNALS</span>
          <div><strong>{activeKnowledgeCards.length}</strong><span>知识卡片</span></div>
          <div><strong>{capturedCards.length}</strong><span>待处理</span></div>
          <p>{activeGoals[0] ? `学习可以显式连接到「${activeGoals[0].title}」。` : '先保留原始内容，关联目标可以之后再补。'}</p>
        </div>
      </section>

      <section className="workspace-panel knowledge-card-library">
        <div className="panel-header">
          <div><span className="section-kicker">CAPTURED SOURCES</span><h3>待处理的知识卡片</h3></div>
          <span className="muted-note">摘要需要你主动生成并确认</span>
        </div>
        <div className="knowledge-card-grid">
          {activeKnowledgeCards.map((card) => (
            <KnowledgeCardRow
              card={card}
              key={card.id}
              onQueue={addKnowledgeCardToLearning}
              onRetry={retryKnowledgeCard}
              onPreview={previewKnowledgeCardSummary}
              onConfirm={confirmKnowledgeCardSummary}
              goals={activeGoals}
              tasks={activeTasks}
              onContextLink={updateKnowledgeCardContextLinks}
            />
          ))}
          {activeKnowledgeCards.length === 0 && (
            <div className="empty-state">
              <strong>还没有知识卡片</strong>
              <span>保存一段文本或网页地址，之后再决定如何学习和整理。</span>
            </div>
          )}
        </div>
      </section>

      <section className="workspace-panel learning-library">
        <div className="panel-header">
          <div><span className="section-kicker">YOUR QUEUE</span><h3>学习队列</h3></div>
          <div className="filter-tabs" role="tablist" aria-label="学习状态筛选">
            {[['all', '全部'], ['in_progress', '进行中'], ['queued', '待学习'], ['completed', '已完成']].map(([key, label]) => (
              <button type="button" className={filter === key ? 'filter-tab is-active' : 'filter-tab'} key={key} onClick={() => setFilter(key as LearningFilter)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="learning-grid">
          {items.map((item) => <LearningCard item={item} key={item.id} />)}
          {items.length === 0 && <div className="empty-state"><strong>队列暂时为空</strong><span>从一张知识卡片开始，或直接创建一个学习入口。</span></div>}
        </div>
      </section>

      <section className="learning-capture-band">
        <div><span className="section-kicker">CAPTURE FIRST</span><strong>先保存来源，再决定要不要把它变成行动。</strong></div>
        <Link to="/app?capture=1" className="outline-action">快速记录 →</Link>
      </section>
    </div>
  );
}

function KnowledgeCardRow({
  card,
  onQueue,
  onRetry,
  onPreview,
  onConfirm,
  goals,
  tasks,
  onContextLink,
}: {
  card: KnowledgeCard;
  onQueue: (cardId: string) => Promise<boolean>;
  onRetry: (cardId: string) => Promise<boolean>;
  onPreview: (cardId: string) => Promise<KnowledgeCardSummaryDraft | null>;
  onConfirm: (cardId: string, draft: KnowledgeCardSummaryDraft) => Promise<boolean>;
  goals: ReturnType<typeof useWorkspace>['activeGoals'];
  tasks: Task[];
  onContextLink: (cardId: string, input: KnowledgeCardContextLinkInput) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<KnowledgeCardSummaryDraft | null>(null);
  const [showContextLinks, setShowContextLinks] = useState(false);
  const [linkedGoalId, setLinkedGoalId] = useState(card.goalId ?? '');
  const [linkedTaskId, setLinkedTaskId] = useState(card.taskId ?? '');
  const localOnly = card.id.startsWith('knowledge-');
  const pendingQueue = card.learningItemId?.startsWith('learning-');
  const sourceLabel = card.sourceType === 'url' ? '网页地址' : '原始文本';
  const sourcePreview = card.sourceType === 'url' ? card.sourceUrl : card.content;
  const aiLabel = card.aiStatus === 'confirmed'
    ? '摘要已确认'
    : card.aiStatus === 'failed'
      ? '摘要可重试'
      : card.aiStatus === 'preview_ready'
        ? '摘要待确认'
        : '尚未生成摘要';
  const linkedGoal = goals.find((item) => item.id === card.goalId);
  const linkedTask = tasks.find((item) => item.id === card.taskId);

  const run = (action: (cardId: string) => Promise<boolean>) => {
    setBusy(true);
    setError('');
    void action(card.id).then((ok) => {
      if (!ok) setError('同步未完成，原始内容已保留。');
    }).finally(() => setBusy(false));
  };

  const generateSummary = () => {
    setBusy(true);
    setError('');
    void onPreview(card.id).then((nextDraft) => {
      if (nextDraft) setDraft(nextDraft);
      else setError('摘要暂未生成，原始内容仍已保留，可稍后重试。');
    }).finally(() => setBusy(false));
  };

  const editConfirmedSummary = () => {
    setDraft({
      summary: card.aiSummary ?? '',
      concepts: card.aiConcepts,
      tags: card.aiTags,
    });
    setError('');
  };

  const confirmSummary = () => {
    if (!draft?.summary.trim()) {
      setError('请先补充一段摘要。');
      return;
    }
    setBusy(true);
    setError('');
    void onConfirm(card.id, draft).then((ok) => {
      if (ok) setDraft(null);
      else setError('确认未同步，当前草稿仍在这里。');
    }).finally(() => setBusy(false));
  };

  const saveContextLinks = () => {
    setBusy(true);
    setError('');
    void onContextLink(card.id, { goalId: linkedGoalId, taskId: linkedTaskId }).then((ok) => {
      if (ok) setShowContextLinks(false);
      else setError('关联未同步，当前选择仍保留。');
    }).finally(() => setBusy(false));
  };

  return (
    <article className="knowledge-card">
      <div className="knowledge-card-top">
        <span className="learning-type">{sourceLabel}</span>
        <span className={card.status === 'queued' ? 'knowledge-card-status is-queued' : 'knowledge-card-status'}>{card.status === 'queued' ? '已入队' : '待处理'}</span>
      </div>
      <h4>{card.title}</h4>
      <p>{sourcePreview || '已保存来源，内容待补充。'}</p>
      <small>{card.goalId ? '已关联目标' : '未关联目标'} · {card.createdLabel}</small>
      <div className={card.aiStatus === 'failed' ? 'knowledge-card-ai-status is-failed' : 'knowledge-card-ai-status'}>{aiLabel}</div>
      {card.aiSummary && !draft && (
        <div className="knowledge-card-summary">
          <strong>摘要</strong>
          <p>{card.aiSummary}</p>
          {(card.aiConcepts.length > 0 || card.aiTags.length > 0) && (
            <div className="knowledge-card-terms">
              {[...card.aiConcepts, ...card.aiTags].map((term) => <span key={term}>{term}</span>)}
            </div>
          )}
          <small>来源：此卡片的原始文本</small>
        </div>
      )}
      {card.aiStatus === 'confirmed' && !draft && (
        <div className="knowledge-card-context">
          <span>可供当前 Workspace 引用</span>
          {(linkedGoal || linkedTask) && (
            <small>
              {linkedGoal ? `目标：${linkedGoal.title}` : ''}
              {linkedGoal && linkedTask ? ' · ' : ''}
              {linkedTask ? `任务：${linkedTask.title}` : ''}
            </small>
          )}
        </div>
      )}
      {draft && (
        <div className="knowledge-summary-editor">
          <label><span>摘要</span><textarea value={draft.summary} maxLength={4000} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
          <label><span>关键概念 <small>用逗号分隔</small></span><input value={draft.concepts.join('，')} maxLength={960} onChange={(event) => setDraft({ ...draft, concepts: splitTerms(event.target.value) })} /></label>
          <label><span>标签 <small>用逗号分隔</small></span><input value={draft.tags.join('，')} maxLength={960} onChange={(event) => setDraft({ ...draft, tags: splitTerms(event.target.value) })} /></label>
          <small>来源：此卡片的原始文本</small>
          <div className="knowledge-summary-actions">
            <button type="button" className="text-button" disabled={busy} onClick={() => setDraft(null)}>拒绝建议</button>
            <button type="button" className="text-button" disabled={busy} onClick={confirmSummary}>{busy ? '确认中' : '确认摘要'}</button>
          </div>
        </div>
      )}
      {showContextLinks && (
        <div className="knowledge-context-editor">
          <label><span>关联目标 <small>可清除</small></span><select value={linkedGoalId} onChange={(event) => setLinkedGoalId(event.target.value)}><option value="">暂不关联</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
          <label><span>关联任务 <small>可清除</small></span><select value={linkedTaskId} onChange={(event) => setLinkedTaskId(event.target.value)}><option value="">暂不关联</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <div className="knowledge-summary-actions">
            <button type="button" className="text-button" disabled={busy} onClick={() => setShowContextLinks(false)}>取消</button>
            <button type="button" className="text-button" disabled={busy} onClick={saveContextLinks}>{busy ? '保存中' : '保存关联'}</button>
          </div>
        </div>
      )}
      {error && <span className="knowledge-card-error">{error}</span>}
      <div className="knowledge-card-actions">
        {localOnly ? (
          <button type="button" className="text-button" disabled={busy} onClick={() => run(onRetry)}>{busy ? '同步中' : '重试同步'}</button>
        ) : (
          <>
            {card.sourceType === 'text' && !draft && (
              <button type="button" className="text-button" disabled={busy} onClick={card.aiSummary ? editConfirmedSummary : generateSummary}>
                {busy ? '处理中' : card.aiSummary ? '编辑摘要' : card.aiStatus === 'failed' || card.aiStatus === 'preview_ready' ? '重试生成摘要' : '生成摘要'}
              </button>
            )}
            {card.aiStatus === 'confirmed' && !draft && (
              <button type="button" className="text-button" disabled={busy} onClick={() => setShowContextLinks((value) => !value)}>
                {showContextLinks ? '收起关联' : '关联行动'}
              </button>
            )}
            {card.sourceType === 'url' && <span>网页地址待抓取后再生成摘要</span>}
            {card.status === 'captured' || pendingQueue ? (
              <button type="button" className="text-button" disabled={busy} onClick={() => run(onQueue)}>{busy ? '加入中' : pendingQueue ? '重试加入队列' : '加入学习队列'}</button>
            ) : (
              <span>学习入口已创建</span>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function splitTerms(value: string) {
  return Array.from(new Set(value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function LearningCard({
  item,
}: {
  item: LearningItem;
}) {
  return (
    <article className="learning-card">
      <div className="learning-card-top">
        <span className="learning-type">{item.kind === 'article' ? 'ARTICLE' : item.kind === 'course' ? 'COURSE' : item.kind === 'book' ? 'BOOK' : 'NOTE'}</span>
        <span className={`learning-status status-${item.status}`}>{item.status === 'in_progress' ? '进行中' : item.status === 'queued' ? '待学习' : '已完成'}</span>
      </div>
      <h4>{item.title}</h4>
      <LearningResource item={item} />
      <p>{item.summary || '尚未补充说明。先开始，之后再留下你学到的内容。'}</p>
      <div className="learning-card-foot"><span className="mini-progress"><i style={{ width: `${item.progress}%`, background: 'var(--blue)' }} /></span><small>{item.progress}% · {item.durationLabel}</small></div>
      <Link className="text-button learning-card-action" to={`/app/learn/${item.id}`}>打开学习内容 ↗</Link>
      <small className="execution-footnote">有原始资源后，后台会自动安排学习行动。</small>
    </article>
  );
}

function KnowledgeCaptureComposer({
  goals,
  onCancel,
  onSave,
}: {
  goals: ReturnType<typeof useWorkspace>['activeGoals'];
  onCancel: () => void;
  onSave: (input: KnowledgeCardInput) => Promise<boolean>;
}) {
  const [sourceType, setSourceType] = useState<KnowledgeCard['sourceType']>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    void onSave({
      title,
      sourceType,
      content: sourceType === 'text' ? content : undefined,
      sourceUrl: sourceType === 'url' ? sourceUrl : undefined,
      goalId: goalId || undefined,
    }).then((ok) => {
      if (ok) onCancel();
      else setError('保存未同步，原始内容已暂存在当前 Workspace，可在卡片上重试。');
    }).finally(() => setSaving(false));
  };

  return (
    <section className="workspace-panel growth-composer knowledge-capture-composer">
      <div className="panel-header"><div><span className="section-kicker">CAPTURE SOURCE</span><h3>保存一条原始知识来源</h3></div></div>
      <form onSubmit={handleSubmit}>
        <div className="knowledge-source-switch" role="group" aria-label="知识来源类型">
          <button type="button" className={sourceType === 'text' ? 'is-active' : ''} onClick={() => setSourceType('text')}>文本</button>
          <button type="button" className={sourceType === 'url' ? 'is-active' : ''} onClick={() => setSourceType('url')}>网页地址</button>
        </div>
        <div className="growth-composer-grid">
          <label><span>标题 <small>可跳过</small></span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={sourceType === 'url' ? '例如：用户访谈方法' : '例如：关于产品发现的一段判断'} maxLength={240} /></label>
          <label><span>关联目标 <small>可跳过</small></span><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">暂不关联</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
        </div>
        {sourceType === 'text'
          ? <label><span>原始文本</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴一段值得以后理解、验证或复用的原始内容。" maxLength={8000} /></label>
          : <label><span>网页地址</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/article" maxLength={2000} /></label>}
        {error && <p className="knowledge-capture-error">{error}</p>}
        <div className="growth-composer-footer"><button type="button" className="text-button" onClick={onCancel}>取消</button><button type="submit" className="primary-action" disabled={saving || (sourceType === 'text' ? !content.trim() : !sourceUrl.trim())}>{saving ? '保存中' : '保存知识卡片'}</button></div>
      </form>
    </section>
  );
}

function LearningComposer({ goals, onCancel, onCreate }: { goals: ReturnType<typeof useWorkspace>['activeGoals']; onCancel: () => void; onCreate: ReturnType<typeof useWorkspace>['addLearningItem'] }) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [kind, setKind] = useState<LearningItem['kind']>('note');
  const [goalId, setGoalId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [saving,setSaving] = useState(false), [error,setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);setError('');
    void onCreate({
      title,
      summary,
      kind,
      sourceUrl,
      relatedGoalId: goalId || undefined,
      durationMinutes: durationMinutes ? Math.max(1, Math.min(10080, Number(durationMinutes) || 1)) : undefined,
    }).then(ok => {if(ok) onCancel();else setError('学习内容尚未同步到后台，草稿已保留。');}).finally(() => setSaving(false));
  };

  return <section className="workspace-panel growth-composer"><div className="panel-header"><div><span className="section-kicker">NEW LEARNING ITEM</span><h3>确认一个要继续理解的入口</h3></div></div><form onSubmit={handleSubmit}><div className="growth-composer-grid"><label><span>类型</span><select value={kind} onChange={(event) => setKind(event.target.value as LearningItem['kind'])}><option value="note">笔记</option><option value="article">文章</option><option value="course">课程</option><option value="book">书籍</option></select></label><label><span>关联目标 <small>可跳过</small></span><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">暂不关联</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label><span>预计分钟 <small>可跳过</small></span><input type="number" min="1" max="10080" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label></div><label><span>学习标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：读完一章关于用户研究的方法" maxLength={240} /></label><label><span>原始学习资源地址</span><input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" maxLength={2000}/></label><label><span>为什么要学 <small>可跳过</small></span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="它想帮助你推进什么？" maxLength={1200} /></label>{error && <p role="alert" className="execution-error">{error}</p>}<div className="growth-composer-footer"><button type="button" className="text-button" onClick={onCancel}>取消</button><button type="submit" className="primary-action" disabled={saving || !title.trim()}>{saving ? '保存中…' : '加入学习队列'}</button></div></form></section>;
}

function LearningResource({item}: {item: LearningItem}) {
  const {refreshExecutionData} = useWorkspace();
  const [editing,setEditing] = useState(false), [source,setSource] = useState(item.sourceUrl ?? '');
  const [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();setSaving(true);setError('');
    try {await api.patch(`/learning-items/${item.id}/source`, {source_url: source});await refreshExecutionData();setEditing(false);}
    catch(error) {setError(error instanceof Error ? error.message : '保存资源失败');}
    finally {setSaving(false);}
  };
  return <div>{item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-button">打开原始资源 ↗</a>}
    <button type="button" className="text-button" disabled={item.id.startsWith('learning-')} onClick={()=>setEditing(value=>!value)}>{item.sourceUrl ? '修改资源' : '补充学习资源'}</button>
    {editing && <form onSubmit={event=>{void save(event);}} className="calendar-url"><input type="url" aria-label="学习资源地址" required value={source} onChange={event=>setSource(event.target.value)} maxLength={2000} placeholder="https://…"/><button className="outline-action" disabled={saving}>{saving?'保存中…':'保存地址'}</button></form>}
    {error && <p role="alert" className="execution-error">{error}</p>}
  </div>;
}
