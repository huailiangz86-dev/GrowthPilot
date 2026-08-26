import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import './Memory.css';

interface Memory {
  id: string;
  content: string;
  summary: string | null;
  memory_type: string;
  source: string;
  tags: string[];
  derived_status: Record<string, string>;
  importance: number;
  confidence: number;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

interface MemoryListResponse {
  items: Memory[];
  total: number;
}

type MemoryPeriod = 'all' | 'today' | 'week' | 'month' | 'custom';

interface MemoryFilters {
  keyword: string;
  period: MemoryPeriod;
  startDate: string;
  endDate: string;
}

const EMPTY_MEMORY_FILTERS: MemoryFilters = {
  keyword: '',
  period: 'all',
  startDate: '',
  endDate: '',
};

const MEMORY_PERIOD_OPTIONS: Array<{ value: MemoryPeriod; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'custom', label: '自定义' },
];

function formatMemoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function tagsFromText(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter((item, index, items) => item && items.indexOf(item) === index)
    .slice(0, 12);
}

function hasPendingDerivedData(memory: Memory) {
  return Object.values(memory.derived_status).some((status) => status === 'pending' || status === 'stale');
}

function hasActiveMemoryFilters(filters: MemoryFilters) {
  return Boolean(filters.keyword || filters.period !== 'all');
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [importance, setImportance] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTagsText, setEditTagsText] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [undoMemory, setUndoMemory] = useState<Memory | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchPeriod, setSearchPeriod] = useState<MemoryPeriod>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeFilters, setActiveFilters] = useState<MemoryFilters>(EMPTY_MEMORY_FILTERS);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  const undoTimer = useRef<number | null>(null);

  const remaining = useMemo(() => 4000 - content.length, [content.length]);

  const loadMemories = async (filters: MemoryFilters = activeFilters) => {
    setLoading(true);
    try {
      const result = await api.get<MemoryListResponse>('/memory', {
        limit: 50,
        keyword: filters.keyword || undefined,
        period: filters.period,
        start_date: filters.period === 'custom' ? filters.startDate || undefined : undefined,
        end_date: filters.period === 'custom' ? filters.endDate || undefined : undefined,
        timezone_offset_minutes: -new Date().getTimezoneOffset(),
      });
      setMemories(result.items);
      setTotal(result.total);
      setError('');
    } catch {
      setError('暂时无法读取 Memory，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemories();
    return () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    };
  }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters: MemoryFilters = {
      keyword: searchKeyword.trim(),
      period: searchPeriod,
      startDate: customStartDate,
      endDate: customEndDate,
    };

    if (nextFilters.period === 'custom' && (!nextFilters.startDate || !nextFilters.endDate)) {
      setError('请选择自定义时间范围的开始和结束日期。');
      return;
    }
    if (
      nextFilters.period === 'custom'
      && nextFilters.startDate > nextFilters.endDate
    ) {
      setError('自定义时间范围的开始日期不能晚于结束日期。');
      return;
    }

    setActiveFilters(nextFilters);
    await loadMemories(nextFilters);
  };

  const clearSearch = () => {
    setSearchKeyword('');
    setSearchPeriod('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setActiveFilters(EMPTY_MEMORY_FILTERS);
    void loadMemories(EMPTY_MEMORY_FILTERS);
  };

  const focusComposer = () => {
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    composeRef.current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (!normalizedContent || saving) return;

    setSaving(true);
    setError('');
    setSavedMessage('');

    try {
      const memory = await api.post<Memory>('/memory', {
        content: normalizedContent,
        tags: tagsFromText(tagsText),
        importance,
      });
      if (hasActiveMemoryFilters(activeFilters)) {
        await loadMemories(activeFilters);
      } else {
        setMemories((current) => [memory, ...current]);
        setTotal((current) => current + 1);
      }
      setContent('');
      setTagsText('');
      setImportance(3);
      setSavedMessage('已保存到你的个人 Memory');
    } catch {
      setError('这条内容还没有保存成功，请再试一次。');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditTagsText(memory.tags.join('、'));
    setEditOccurredAt(toDateTimeLocal(memory.occurred_at));
    setPendingDeleteId(null);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditTagsText('');
    setEditOccurredAt('');
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>, memoryId: string) => {
    event.preventDefault();
    const normalizedContent = editContent.trim();
    if (!normalizedContent || editSaving) return;

    const occurredAt = new Date(editOccurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setError('请选择有效的发生时间。');
      return;
    }

    setEditSaving(true);
    setError('');
    try {
      const updated = await api.patch<Memory>(`/memory/${memoryId}`, {
        content: normalizedContent,
        tags: tagsFromText(editTagsText),
        occurred_at: occurredAt.toISOString(),
      });
      if (hasActiveMemoryFilters(activeFilters)) {
        await loadMemories(activeFilters);
      } else {
        setMemories((current) => current.map((memory) => (memory.id === updated.id ? updated : memory)));
      }
      setSavedMessage('Memory 已更新，派生上下文会继续整理。');
      cancelEdit();
    } catch {
      setError('这条 Memory 还没有更新成功，请再试一次。');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (memory: Memory) => {
    if (pendingDeleteId !== memory.id) return;

    try {
      await api.delete<{ deleted: boolean; id: string; undo_until: string }>(`/memory/${memory.id}`);
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      setTotal((current) => Math.max(0, current - 1));
      setPendingDeleteId(null);
      if (editingId === memory.id) cancelEdit();
      setUndoMemory(memory);
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoMemory(null), 8000);
    } catch {
      setError('删除没有完成，请再试一次。');
    }
  };

  const handleRestore = async () => {
    if (!undoMemory || restoring) return;

    setRestoring(true);
    setError('');
    try {
      const restored = await api.post<Memory>(`/memory/${undoMemory.id}/restore`);
      setMemories((current) => [restored, ...current]);
      setTotal((current) => current + 1);
      setUndoMemory(null);
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    } catch {
      setError('撤销没有完成，这条 Memory 仍保持删除状态。');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="memory-page">
      <header className="memory-page-header">
        <div>
          <span className="memory-eyebrow">PERSONAL MEMORY / {total.toString().padStart(2, '0')}</span>
          <h2>把此刻留下来。</h2>
          <p>一句话也可以。之后的目标、任务和复盘，都能从这些真实片段出发。</p>
        </div>
        <Link to="/app" className="memory-back-link">回到今日工作台</Link>
      </header>

      <div className="memory-layout">
        <section className="memory-compose-panel">
          <div className="compose-heading">
            <div>
              <span className="memory-section-label">CAPTURE A THOUGHT</span>
              <h3>写下今天值得记住的事</h3>
            </div>
            <span className="compose-mark" aria-hidden="true">+</span>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="memory-content-field" htmlFor="memory-content">
              <span>这一刻，我想记住</span>
              <textarea
                id="memory-content"
                ref={composeRef}
                value={content}
                maxLength={4000}
                onChange={(event) => {
                  setContent(event.target.value);
                  setSavedMessage('');
                }}
                placeholder="例如：今天终于把产品首页的第一版做出来了，虽然还不完整，但我发现自己更适合先做出一个可以被看见的版本。"
                autoFocus
              />
              <span className="memory-character-count">{remaining} 字可用</span>
            </label>

            <div className="memory-form-row">
              <label className="memory-input-field" htmlFor="memory-tags">
                <span>标签 <em>可选</em></span>
                <input
                  id="memory-tags"
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="项目、情绪、洞察"
                />
              </label>
              <div className="importance-field">
                <span>重要程度</span>
                <div className="importance-options" role="group" aria-label="选择重要程度">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      type="button"
                      key={level}
                      className={level === importance ? 'importance-option selected' : 'importance-option'}
                      onClick={() => setImportance(level)}
                      aria-label={`${level} 分`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {savedMessage && <p className="memory-success" role="status">{savedMessage}</p>}
            {error && <p className="memory-error" role="alert">{error}</p>}

            <button type="submit" className="memory-save-button" disabled={!content.trim() || saving}>
              {saving ? '正在保存...' : '保存这条 Memory'}
              {!saving && <span aria-hidden="true">↗</span>}
            </button>
          </form>

          <p className="compose-footnote">手动记录不会触发外部动作，只会成为你的私有成长上下文。</p>
        </section>

        <section className="memory-list-panel">
          <div className="memory-list-heading">
            <div>
              <span className="memory-section-label">YOUR THREAD</span>
              <h3>最近留下的片段</h3>
            </div>
            <span className="memory-total">{total} 条</span>
          </div>

          <form className="memory-search-form" onSubmit={(event) => void handleSearch(event)}>
            <div className="memory-search-main">
              <label className="memory-search-input" htmlFor="memory-search">
                <span className="memory-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="memory-search"
                  type="search"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜索内容、摘要或标签"
                  aria-label="搜索 Memory"
                />
              </label>
              <button type="submit" className="memory-search-button" disabled={loading}>
                {loading ? '整理中...' : '检索'}
                {!loading && <span aria-hidden="true">↗</span>}
              </button>
            </div>

            <div className="memory-period-options" role="group" aria-label="选择 Memory 时间范围">
              {MEMORY_PERIOD_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={searchPeriod === option.value ? 'memory-period-option selected' : 'memory-period-option'}
                  onClick={() => setSearchPeriod(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {searchPeriod === 'custom' && (
              <div className="memory-custom-dates">
                <label htmlFor="memory-start-date">
                  <span>从</span>
                  <input
                    id="memory-start-date"
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </label>
                <label htmlFor="memory-end-date">
                  <span>到</span>
                  <input
                    id="memory-end-date"
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </label>
              </div>
            )}
          </form>

          {loading ? (
            <div className="memory-list-state">正在整理你的 Memory...</div>
          ) : memories.length === 0 ? (
            <div className="memory-list-state memory-empty-state">
              <span className="empty-line" aria-hidden="true">—</span>
              <strong>{hasActiveMemoryFilters(activeFilters) ? '没有找到相符的片段' : '这里还很安静'}</strong>
              <p>
                {hasActiveMemoryFilters(activeFilters)
                  ? '换一个关键词或时间范围，也可以直接留下新的记录。'
                  : '写下第一条之后，你会开始看到自己的成长轨迹。'}
              </p>
              <div className="memory-empty-actions">
                {hasActiveMemoryFilters(activeFilters) && (
                  <button type="button" className="memory-subtle-button" onClick={clearSearch}>
                    清除检索
                  </button>
                )}
                <button type="button" className="memory-empty-create" onClick={focusComposer}>
                  写下一条 Memory <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="memory-list">
              {memories.map((memory) => (
                <article className="memory-item" key={memory.id}>
                  <div className="memory-item-meta">
                    <div className="memory-meta-group">
                      <span>{formatMemoryDate(memory.occurred_at)}</span>
                      <span className="memory-source">{memory.source === 'manual' ? '手动记录' : memory.source}</span>
                      {hasPendingDerivedData(memory) && <span className="memory-processing">上下文整理中</span>}
                    </div>
                    {editingId !== memory.id && pendingDeleteId !== memory.id && (
                      <div className="memory-item-actions">
                        <button type="button" onClick={() => beginEdit(memory)}>编辑</button>
                        <button type="button" onClick={() => setPendingDeleteId(memory.id)}>删除</button>
                      </div>
                    )}
                  </div>

                  {editingId === memory.id ? (
                    <form className="memory-edit-form" onSubmit={(event) => handleEditSubmit(event, memory.id)}>
                      <label htmlFor={`edit-memory-${memory.id}`}>
                        <span>内容</span>
                        <textarea
                          id={`edit-memory-${memory.id}`}
                          value={editContent}
                          maxLength={4000}
                          onChange={(event) => setEditContent(event.target.value)}
                        />
                      </label>
                      <div className="memory-edit-row">
                        <label htmlFor={`edit-tags-${memory.id}`}>
                          <span>标签</span>
                          <input
                            id={`edit-tags-${memory.id}`}
                            value={editTagsText}
                            onChange={(event) => setEditTagsText(event.target.value)}
                          />
                        </label>
                        <label htmlFor={`edit-date-${memory.id}`}>
                          <span>发生时间</span>
                          <input
                            id={`edit-date-${memory.id}`}
                            type="datetime-local"
                            value={editOccurredAt}
                            onChange={(event) => setEditOccurredAt(event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="memory-edit-actions">
                        <button type="button" className="memory-subtle-button" onClick={cancelEdit}>取消</button>
                        <button type="submit" className="memory-confirm-button" disabled={!editContent.trim() || editSaving}>
                          {editSaving ? '保存中...' : '保存修改'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{memory.summary || memory.content}</p>
                      {memory.tags.length > 0 && (
                        <div className="memory-tags">
                          {memory.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                        </div>
                      )}
                    </>
                  )}

                  {pendingDeleteId === memory.id && (
                    <div className="memory-delete-confirm">
                      <span>确认删除这条 Memory？</span>
                      <div>
                        <button type="button" className="memory-subtle-button" onClick={() => setPendingDeleteId(null)}>
                          取消
                        </button>
                        <button type="button" className="memory-danger-button" onClick={() => void handleDelete(memory)}>
                          确认删除
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {undoMemory && (
        <div className="memory-undo-toast" role="status">
          <span>已删除一条 Memory</span>
          <button type="button" onClick={() => void handleRestore()} disabled={restoring}>
            {restoring ? '撤销中...' : '撤销'}
          </button>
        </div>
      )}
    </div>
  );
}
