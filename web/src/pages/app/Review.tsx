import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Question { id: string; label: string; type: string; required: boolean; placeholder?: string; options?: string[]; max?: number; auto?: boolean; }
interface Section { id: string; title: string; questions: Question[]; }
interface Template { id: string; name: string; description: string; author?: string; philosophy?: string; category: string; sections?: Section[]; }
interface TradeRecord { id: string; title: string; content: { pnl?: number; direction?: string; market?: string }; occurred_at: string; emotion?: string; }

const CATEGORY_LABELS: Record<string, string> = { trade_post: '交易复盘', daily: '每日复盘', weekly: '周度复盘' };

export default function Review() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCat, setSelectedCat] = useState('trade_post');
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  useEffect(() => {
    api.get<Template[]>('/reviews/templates')
      .then((res) => setTemplates(res || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectTemplate = async (t: Template) => {
    try {
      const full = await api.get<Template>(`/reviews/templates/${t.id}`);
      setActiveTemplate(full);
      setAnswers({});
      setSubmitted(false);
      setSelectedTradeIds([]);
      // Load recent trades for linking
      setTradesLoading(true);
      api.get<{ items: TradeRecord[]; total: number }>('/records?page_size=50&scene=trading')
        .then((res) => setTrades(res?.items || []))
        .catch(() => setTrades([]))
        .finally(() => setTradesLoading(false));
    } catch {
      setActiveTemplate({ ...t, sections: [] });
    }
  };

  const toggleTrade = (id: string) => {
    setSelectedTradeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const formatTradeDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const setAnswer = (qId: string, val: string | number) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  };

  const handleSubmit = async () => {
    if (!activeTemplate) return;
    setSubmitting(true);
    try {
      await api.post('/reviews', {
        template_id: activeTemplate.id,
        answers,
        scene: 'trading',
        ...(selectedTradeIds.length > 0 ? { linked_record_ids: selectedTradeIds } : {}),
      });
      setSubmitted(true);
    } catch { /* handled */ }
    setSubmitting(false);
  };

  const filtered = templates.filter((t) => t.category === selectedCat);
  const cats = [...new Set(templates.map((t) => t.category))];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>;

  // Submitted state
  if (submitted) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>复盘完成！</h2>
        <p style={{ color: '#999', marginBottom: 24 }}>使用了：{activeTemplate?.name}</p>
        <button onClick={() => { setActiveTemplate(null); setSubmitted(false); }} style={btnStyle}>继续复盘</button>
      </div>
    );
  }

  // Review form
  if (activeTemplate?.sections) {
    const humanSections = activeTemplate.sections.map((s) => ({
      ...s,
      questions: s.questions.filter((q) => !q.auto),
    })).filter((s) => s.questions.length > 0);

    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setActiveTemplate(null)} style={{ ...btnSecStyle, padding: '6px 16px' }}>← 返回</button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{activeTemplate.name}</h2>
            {activeTemplate.author && <span style={{ fontSize: 13, color: '#e74c3c' }}>{activeTemplate.author}</span>}
          </div>
        </div>
        {activeTemplate.philosophy && (
          <div style={{ background: '#f8f9fc', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#888', fontStyle: 'italic' }}>
            "{activeTemplate.philosophy}"
          </div>
        )}

        {/* Trade selector */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #f0f0f0' }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#e74c3c', marginBottom: 16, paddingBottom: 10, borderBottom: '2px solid #ffeaea' }}>
            关联交易
            {selectedTradeIds.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#999', marginLeft: 8 }}>
                已选 {selectedTradeIds.length} 笔
              </span>
            )}
          </h3>
          {tradesLoading ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 14 }}>加载交易记录...</div>
          ) : trades.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#ccc', fontSize: 14 }}>暂无交易记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {trades.map((tr) => {
                const selected = selectedTradeIds.includes(tr.id);
                return (
                  <label
                    key={tr.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 8, cursor: 'pointer', userSelect: 'none',
                      border: selected ? '1px solid #e74c3c' : '1px solid #f0f0f0',
                      background: selected ? '#fff5f5' : '#fafafa',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTrade(tr.id)}
                      style={{ width: 16, height: 16, accentColor: '#e74c3c', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{tr.title}</span>
                        {tr.content?.direction && (
                          <span style={{
                            fontSize: 11, padding: '1px 8px', borderRadius: 10, fontWeight: 500,
                            background: tr.content.direction === 'long' ? '#e8f5e9' : '#fce4ec',
                            color: tr.content.direction === 'long' ? '#27ae60' : '#e74c3c',
                          }}>
                            {tr.content.direction === 'long' ? '买入' : '卖出'}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: '#999' }}>{formatTradeDate(tr.occurred_at)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {humanSections.map((section) => (
          <div key={section.id} style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #f0f0f0' }}>
            <h3 style={{ fontSize: 17, fontWeight: 600, color: '#e74c3c', marginBottom: 16, paddingBottom: 10, borderBottom: '2px solid #ffeaea' }}>{section.title}</h3>
            {section.questions.map((q) => (
              <div key={q.id} style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 14, color: '#333', display: 'block', marginBottom: 8 }}>
                  {q.label} {q.required && <span style={{ color: '#ff4d4f' }}>*</span>}
                </label>

                {q.type === 'text' && (
                  <textarea
                    placeholder={q.placeholder || ''}
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    style={{ width: '100%', minHeight: 80, padding: '10px 14px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                )}

                {q.type === 'number' && (
                  <input
                    type="number"
                    placeholder="输入数字"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswer(q.id, parseFloat(e.target.value) || 0)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14, width: 200 }}
                  />
                )}

                {q.type === 'select' && q.options && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {q.options.map((opt) => (
                      <button key={opt} onClick={() => setAnswer(q.id, opt)} style={{
                        padding: '8px 16px', borderRadius: 20, border: answers[q.id] === opt ? '1px solid #e74c3c' : '1px solid #eee',
                        background: answers[q.id] === opt ? '#fff5f5' : '#fafafa', color: answers[q.id] === opt ? '#e74c3c' : '#666',
                        fontSize: 13, cursor: 'pointer',
                      }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'rating' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: q.max || 5 }).map((_, i) => (
                      <span key={i} onClick={() => setAnswer(q.id, i + 1)} style={{
                        fontSize: 28, cursor: 'pointer', color: (answers[q.id] as number || 0) > i ? '#faad14' : '#ddd',
                      }}>★</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <button onClick={handleSubmit} disabled={submitting} style={{ ...btnStyle, width: '100%', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '提交中...' : '✔ 完成复盘'}
        </button>
      </div>
    );
  }

  // Template picker
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>选择复盘框架</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {cats.map((c) => (
          <button key={c} onClick={() => setSelectedCat(c)} style={{
            padding: '8px 20px', borderRadius: 20, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            background: selectedCat === c ? '#e74c3c' : '#f5f5f5', color: selectedCat === c ? '#fff' : '#666',
          }}>
            {CATEGORY_LABELS[c] || c}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((t) => (
          <div key={t.id} onClick={() => selectTemplate(t)} style={{
            background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #f0f0f0',
            borderLeft: '4px solid #e74c3c', cursor: 'pointer', transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{t.name}</span>
              {t.author && <span style={{ fontSize: 13, color: '#e74c3c' }}>{t.author}</span>}
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 6 }}>{t.description}</div>
            {t.philosophy && <div style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>"{t.philosophy}"</div>}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc', fontSize: 15 }}>该分类暂无模版</div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '14px 0', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 600,
  cursor: 'pointer', background: '#e74c3c', color: '#fff', boxShadow: '0 4px 15px rgba(231,76,60,0.3)',
};
const btnSecStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff',
  fontSize: 14, cursor: 'pointer', color: '#666',
};
