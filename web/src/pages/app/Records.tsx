import type React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface TradeContent {
  pnl?: number;
  direction?: string;
  market?: string;
  symbol?: string;
  entry_price?: number;
  exit_price?: number;
  quantity?: number;
}

interface TradeRecord {
  id: string;
  title: string;
  content: TradeContent;
  tags: Array<{ category: string; value: string }>;
  emotion?: string;
  occurred_at: string;
  scene: string;
}

interface Review {
  id: string;
  template?: string;
  did_right?: string;
  did_wrong?: string;
  answers?: Record<string, string>;
  review_date?: string;
  created_at?: string;
}

type FilterTab = 'all' | 'trades' | 'reviews';

const DIRECTION_OPTIONS = [
  { label: '买入', value: 'long' },
  { label: '卖出', value: 'short' },
];

const MARKET_OPTIONS = ['A', 'HK', 'US', 'CRYPTO'];

const EMOTION_OPTIONS = ['平静', '兴奋', '焦虑', '恐慌', '冲动', '犹豫'];

const BUY_REASON_OPTIONS = ['趋势突破', '抄底', '消息驱动', '技术信号', '跟风', '价值低估'];

interface TradeForm {
  title: string;
  direction: string;
  market: string;
  price: string;
  quantity: string;
  emotion: string;
  tags: string[];
}

const emptyForm: TradeForm = { title: '', direction: 'long', market: 'A', price: '', quantity: '', emotion: '', tags: [] };

export default function Records() {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TradeForm>({ ...emptyForm });
  const [formSubmitting, setFormSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<{ items: TradeRecord[]; total: number }>('/records?page_size=50&scene=trading').catch(() => ({ items: [], total: 0 })),
      api.get<{ items: Review[]; total: number }>('/reviews?page_size=50').catch(() => ({ items: [], total: 0 })),
    ]).then(([recRes, revRes]) => {
      setRecords(recRes?.items || []);
      setReviews(revRes?.items || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const updateForm = <K extends keyof TradeForm>(key: K, value: TradeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  const handleCreateRecord = async () => {
    if (!form.title.trim()) return;
    setFormSubmitting(true);
    const dirLabel = form.direction === 'long' ? '买入' : '卖出';
    const now = new Date();
    const offset = '+08:00';
    const pad = (n: number) => String(n).padStart(2, '0');
    const occurredAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${offset}`;
    try {
      await api.post('/records', {
        scene: 'trading',
        record_type: form.direction === 'long' ? 'buy' : 'sell',
        title: `${form.title.trim()} ${dirLabel}`,
        content: {
          direction: form.direction,
          market: form.market,
          ...(form.price ? { price: form.price } : {}),
          ...(form.quantity ? { quantity: form.quantity } : {}),
        },
        tags: form.tags.map((t) => ({ category: 'buy_reason', value: t })),
        emotion: form.emotion || undefined,
        occurred_at: occurredAt,
      });
      setForm({ ...emptyForm });
      setShowForm(false);
      loadData();
    } catch { /* handled */ }
    setFormSubmitting(false);
  };

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  const pnlColor = (val?: number) => {
    if (val === undefined || val === null) return '#333';
    return val > 0 ? '#27ae60' : val < 0 ? '#e74c3c' : '#333';
  };

  const pnlBgColor = (val?: number) => {
    if (val === undefined || val === null) return '#f8f8f8';
    return val > 0 ? 'rgba(39,174,96,0.06)' : val < 0 ? 'rgba(231,76,60,0.06)' : '#f8f8f8';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const totalPnl = records.reduce((sum, r) => sum + (r.content?.pnl ?? 0), 0);
  const winCount = records.filter(r => (r.content?.pnl ?? 0) > 0).length;
  const lossCount = records.filter(r => (r.content?.pnl ?? 0) < 0).length;

  return (
    <div>
      <div style={headerStyle}>
        <div>
          <h2 style={pageTitleStyle}>记录</h2>
          <p style={pageSubStyle}>记录和复盘你的每一笔交易</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', background: showForm ? '#666' : '#e74c3c', color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)', transition: 'all 0.15s',
          }}
        >
          {showForm ? '收起' : '+ 添加记录'}
        </button>
      </div>

      {/* Add trade form */}
      {showForm && (
        <div style={{
          background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20,
          border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: '0 0 20px' }}>记录交易</h3>

          {/* 标的名称 */}
          <div style={formFieldStyle}>
            <label style={formLabelStyle}>标的名称 <span style={{ color: '#ff4d4f' }}>*</span></label>
            <input
              type="text"
              placeholder="例如：永鼎股份"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
              style={formInputStyle}
            />
          </div>

          {/* 方向 + 市场 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={formLabelStyle}>方向</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {DIRECTION_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => updateForm('direction', opt.value)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 500,
                      cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                      background: form.direction === opt.value
                        ? (opt.value === 'long' ? '#e8f5e9' : '#fce4ec')
                        : '#f5f5f5',
                      color: form.direction === opt.value
                        ? (opt.value === 'long' ? '#27ae60' : '#e74c3c')
                        : '#999',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={formLabelStyle}>市场</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {MARKET_OPTIONS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => updateForm('market', m)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                      background: form.market === m ? '#fff5f5' : '#f5f5f5',
                      color: form.market === m ? '#e74c3c' : '#999',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 价格 + 数量 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={formLabelStyle}>价格</label>
              <input
                type="number"
                placeholder="买入价格"
                value={form.price}
                onChange={(e) => updateForm('price', e.target.value)}
                style={formInputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={formLabelStyle}>数量</label>
              <input
                type="number"
                placeholder="买入数量"
                value={form.quantity}
                onChange={(e) => updateForm('quantity', e.target.value)}
                style={formInputStyle}
              />
            </div>
          </div>

          {/* 情绪 */}
          <div style={formFieldStyle}>
            <label style={formLabelStyle}>情绪</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EMOTION_OPTIONS.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => updateForm('emotion', form.emotion === e ? '' : e)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: form.emotion === e ? '#fef3c7' : '#f5f5f5',
                    color: form.emotion === e ? '#d97706' : '#888',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* 买入原因 */}
          <div style={formFieldStyle}>
            <label style={formLabelStyle}>买入原因（可多选）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BUY_REASON_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => toggleTag(r)}
                  style={{
                    padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                    background: form.tags.includes(r) ? 'rgba(231,76,60,0.1)' : '#f5f5f5',
                    color: form.tags.includes(r) ? '#e74c3c' : '#888',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleCreateRecord}
            disabled={formSubmitting || !form.title.trim()}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
              background: (!form.title.trim() || formSubmitting) ? '#ccc' : '#e74c3c',
              color: '#fff', boxShadow: '0 4px 15px rgba(231,76,60,0.3)',
              opacity: formSubmitting ? 0.6 : 1, transition: 'all 0.15s',
            }}
          >
            {formSubmitting ? '提交中...' : '提交记录'}
          </button>
        </div>
      )}

      {/* Summary bar */}
      {records.length > 0 && (
        <div style={summaryBarStyle}>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>总笔数</span>
            <span style={summaryValueStyle}>{records.length}</span>
          </div>
          <div style={summaryDividerStyle} />
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>总盈亏</span>
            <span style={{ ...summaryValueStyle, color: pnlColor(totalPnl) }}>
              {totalPnl > 0 ? '+' : ''}{totalPnl.toLocaleString()}
            </span>
          </div>
          <div style={summaryDividerStyle} />
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>盈/亏</span>
            <span style={summaryValueStyle}>
              <span style={{ color: '#27ae60' }}>{winCount}</span>
              {' / '}
              <span style={{ color: '#e74c3c' }}>{lossCount}</span>
            </span>
          </div>
          <div style={summaryDividerStyle} />
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>复盘数</span>
            <span style={summaryValueStyle}>{reviews.length}</span>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={filterTabsStyle}>
        {([
          { key: 'all' as FilterTab, label: '全部', count: records.length + reviews.length },
          { key: 'trades' as FilterTab, label: '交易', count: records.length },
          { key: 'reviews' as FilterTab, label: '复盘', count: reviews.length },
        ]).map((tab) => (
          <button
            type="button"
            key={tab.key}
            style={activeFilter === tab.key ? activeFilterStyle : filterBtnStyle}
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.label}
            <span style={filterCountStyle}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {(activeFilter === 'all' || activeFilter === 'trades') && (
        <div>
          {activeFilter === 'all' && records.length > 0 && (
            <h3 style={sectionHeaderStyle}>记录</h3>
          )}
          {records.length === 0 ? (
            activeFilter === 'trades' && (
              <div style={emptyStyle}>
                <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📝</span>
                <p style={{ fontSize: 18, color: '#666', margin: '0 0 8px' }}>还没有记录</p>
                <p style={{ fontSize: 14, color: '#999', margin: 0 }}>开始记录你的第一笔交易吧</p>
              </div>
            )
          ) : (
            <div style={listStyle}>
              {records.map((r) => {
                const c = r.content || {};
                return (
                  <div key={r.id} style={{ ...recordCardStyle, borderLeft: `4px solid ${pnlColor(c.pnl)}` }}>
                    <div style={recordHeaderStyle}>
                      <div style={symbolWrapStyle}>
                        <span style={symbolStyle}>{r.title || c.symbol || '—'}</span>
                        {c.direction && (
                          <span style={{
                            ...directionStyle,
                            background: c.direction === 'long' ? '#e8f5e9' : '#fce4ec',
                            color: c.direction === 'long' ? '#27ae60' : '#e74c3c',
                          }}>
                            {c.direction === 'long' ? '做多' : '做空'}
                          </span>
                        )}
                        {c.market && (
                          <span style={statusStyle}>{c.market}</span>
                        )}
                        {r.emotion && (
                          <span style={{ ...directionStyle, background: '#fef3c7', color: '#d97706' }}>
                            {r.emotion}
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        {c.pnl !== undefined && (
                          <div style={pnlWrapStyle}>
                            <div style={{
                              ...pnlBoxStyle,
                              background: pnlBgColor(c.pnl),
                              color: pnlColor(c.pnl),
                            }}>
                              <span style={pnlAmountStyle}>
                                {c.pnl > 0 ? '+' : ''}{c.pnl.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={recordBodyStyle}>
                      {c.entry_price !== undefined && (
                        <div style={priceGroupStyle}>
                          <span style={priceLabel}>买入</span>
                          <span style={priceVal}>¥{c.entry_price.toLocaleString()}</span>
                        </div>
                      )}
                      {c.exit_price !== undefined && (
                        <div style={priceGroupStyle}>
                          <span style={priceLabel}>卖出</span>
                          <span style={priceVal}>¥{c.exit_price.toLocaleString()}</span>
                        </div>
                      )}
                      {c.quantity !== undefined && (
                        <div style={priceGroupStyle}>
                          <span style={priceLabel}>数量</span>
                          <span style={priceVal}>{c.quantity}</span>
                        </div>
                      )}
                      {r.occurred_at && (
                        <div style={priceGroupStyle}>
                          <span style={priceLabel}>日期</span>
                          <span style={priceVal}>{formatDate(r.occurred_at)}</span>
                        </div>
                      )}
                    </div>
                    {r.tags && r.tags.length > 0 && (
                      <div style={tagsRowStyle}>
                        {r.tags.map((t, i) => (
                          <span key={i} style={tagChipStyle}>
                            <span style={tagCatStyle}>{t.category === 'buy_reason' ? '买因' : t.category === 'sell_reason' ? '卖因' : t.category === 'emotion' ? '情绪' : t.category}</span>
                            {t.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(activeFilter === 'all' || activeFilter === 'reviews') && (
        <div style={activeFilter === 'all' ? { marginTop: 32 } : {}}>
          {activeFilter === 'all' && reviews.length > 0 && (
            <h3 style={sectionHeaderStyle}>复盘记录</h3>
          )}
          {reviews.length === 0 ? (
            activeFilter === 'reviews' && (
              <div style={emptyStyle}>
                <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📋</span>
                <p style={{ fontSize: 18, color: '#666', margin: '0 0 8px' }}>还没有复盘记录</p>
                <p style={{ fontSize: 14, color: '#999', margin: 0 }}>完成一笔交易后，选择大师框架进行复盘</p>
              </div>
            )
          ) : (
            <div style={listStyle}>
              {reviews.map((r) => (
                <div key={r.id} style={reviewCardStyle}>
                  <div style={reviewHeaderStyle}>
                    <span style={templateBadgeStyle}>
                      {r.template || '通用复盘'}
                    </span>
                    <span style={dateStyle}>{r.review_date || formatDate(r.created_at)}</span>
                  </div>
                  {r.did_right && (
                    <div style={reviewSectionStyle}>
                      <span style={reviewSectionLabelStyle}>做对了</span>
                      <p style={reviewContentStyle}>{r.did_right}</p>
                    </div>
                  )}
                  {r.did_wrong && (
                    <div style={reviewSectionStyle}>
                      <span style={{ ...reviewSectionLabelStyle, color: '#e74c3c' }}>做错了</span>
                      <p style={reviewContentStyle}>{r.did_wrong}</p>
                    </div>
                  )}
                  {r.answers && Object.keys(r.answers).length > 0 && !r.did_right && !r.did_wrong && (
                    <div style={reviewSectionStyle}>
                      {Object.entries(r.answers).slice(0, 3).map(([q, a]) => (
                        <div key={q} style={{ marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: '#999' }}>{q}</span>
                          <p style={reviewContentStyle}>{a}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state for "all" when both empty */}
      {activeFilter === 'all' && records.length === 0 && reviews.length === 0 && (
        <div style={emptyStyle}>
          <span style={{ fontSize: 56, display: 'block', marginBottom: 16 }}>📊</span>
          <p style={{ fontSize: 20, color: '#555', margin: '0 0 8px', fontWeight: 600 }}>开始你的记录之旅</p>
          <p style={{ fontSize: 14, color: '#999', margin: '0 0 20px', maxWidth: 360, lineHeight: 1.6 }}>
            记录每笔交易、选择大师框架复盘、让 AI 发现你的交易模式
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */

const loadingStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  height: 300, fontSize: 18, color: '#999',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 20,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px',
};

const pageSubStyle: React.CSSProperties = {
  fontSize: 14, color: '#888', margin: 0,
};

/* Summary bar */
const summaryBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 0,
  background: '#fff', borderRadius: 12, padding: '16px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 20,
  overflowX: 'auto',
};

const summaryItemStyle: React.CSSProperties = {
  flex: 1, textAlign: 'center', minWidth: 80,
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 12, color: '#999', display: 'block', marginBottom: 4,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: '#333',
};

const summaryDividerStyle: React.CSSProperties = {
  width: 1, height: 36, background: '#f0f0f0', flexShrink: 0,
};

/* Filter tabs */
const filterTabsStyle: React.CSSProperties = {
  display: 'flex', gap: 8, marginBottom: 24,
};

const filterBtnStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 20, border: '1px solid #e0e0e0',
  background: '#fff', color: '#666', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit', transition: 'all 0.15s',
};

const activeFilterStyle: React.CSSProperties = {
  ...filterBtnStyle,
  background: '#e74c3c', color: '#fff', borderColor: '#e74c3c',
};

const filterCountStyle: React.CSSProperties = {
  fontSize: 12, opacity: 0.7,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 600, color: '#888', margin: '0 0 12px',
  textTransform: 'uppercase' as const, letterSpacing: 1,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: '60px 20px',
  background: '#fff', borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const listStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
};

/* Trade card */
const recordCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '18px 22px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  transition: 'box-shadow 0.15s',
};

const recordHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 12,
};

const symbolWrapStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
};

const symbolStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, color: '#1a1a2e',
};

const directionStyle: React.CSSProperties = {
  fontSize: 12, padding: '2px 10px', borderRadius: 12, fontWeight: 500,
};

const statusStyle: React.CSSProperties = {
  fontSize: 12, padding: '2px 10px', borderRadius: 12,
};

const pnlWrapStyle: React.CSSProperties = {};

const pnlBoxStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 10,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
};

const pnlAmountStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700,
};

/* pnlPercentStyle removed - pnl percentage now computed inline */

const recordBodyStyle: React.CSSProperties = {
  display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8,
  padding: '10px 0', borderTop: '1px solid #f8f8f8',
};

const priceGroupStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
};

const priceLabel: React.CSSProperties = {
  fontSize: 11, color: '#bbb', textTransform: 'uppercase' as const,
};

const priceVal: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: '#555',
};

const dateStyle: React.CSSProperties = {
  fontSize: 13, color: '#bbb',
};

const tagsRowStyle: React.CSSProperties = {
  display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6,
};

const tagChipStyle: React.CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 10,
  background: 'rgba(231,76,60,0.06)', color: '#e74c3c',
  display: 'flex', alignItems: 'center', gap: 4,
};

const tagCatStyle: React.CSSProperties = {
  fontSize: 10, color: '#999', borderRight: '1px solid rgba(231,76,60,0.2)',
  paddingRight: 6, marginRight: 2,
};

/* notesStyle removed - no longer used with new data shape */

/* Review card */
const reviewCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '18px 22px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  borderLeft: '4px solid #667eea',
};

const reviewHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 10,
};

const templateBadgeStyle: React.CSSProperties = {
  fontSize: 14, padding: '4px 14px', borderRadius: 16,
  background: 'linear-gradient(135deg, rgba(102,126,234,0.1), rgba(118,75,162,0.1))',
  color: '#667eea', fontWeight: 600,
};

const reviewSectionStyle: React.CSSProperties = {
  marginBottom: 8,
};

const reviewSectionLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#27ae60', marginBottom: 4, display: 'block',
};

const reviewContentStyle: React.CSSProperties = {
  fontSize: 15, color: '#555', lineHeight: 1.7, margin: '0 0 8px',
  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

/* Add-trade form styles */
const formFieldStyle: React.CSSProperties = {
  marginBottom: 16,
};

const formLabelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: '#333', display: 'block', marginBottom: 8,
};

const formInputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e0e0e0',
  fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
};
