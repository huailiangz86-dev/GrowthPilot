import type React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface MonthData {
  year: number;
  month: number;
  trade_count: number;
  win_rate: number;
  total_pnl: number;
  review_count: number;
  learn_count: number;
  top_emotion?: string;
  emotion_dist?: Record<string, number>;
}

interface Deltas {
  trade_count: number;
  win_rate: number;
  total_pnl: number;
  review_count: number;
  learn_count: number;
}

interface GrowthReportData {
  current: MonthData;
  previous: MonthData | null;
  deltas: Deltas;
}

export default function GrowthReport() {
  const [data, setData] = useState<GrowthReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<GrowthReportData>('/growth-report/monthly')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  if (!data) {
    return (
      <div>
        <h2 style={pageTitleStyle}>成长报告</h2>
        <div style={emptyStyle}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📈</span>
          <p style={{ fontSize: 16, color: '#888', margin: 0 }}>暂无数据，记录更多交易后将生成成长报告</p>
        </div>
      </div>
    );
  }

  const { current, previous, deltas } = data;
  const periodLabel = `${current.year}年${current.month}月`;
  const prevLabel = previous ? `${previous.year}年${previous.month}月` : '';

  const formatDelta = (val: number, suffix = '') => {
    if (val > 0) return `+${val}${suffix}`;
    if (val < 0) return `${val}${suffix}`;
    return `0${suffix}`;
  };

  const deltaColor = (val: number, inverse = false) => {
    const positive = inverse ? val < 0 : val > 0;
    const negative = inverse ? val > 0 : val < 0;
    if (positive) return '#27ae60';
    if (negative) return '#e74c3c';
    return '#888';
  };

  // Emotion distribution
  const emotionEntries = current.emotion_dist
    ? Object.entries(current.emotion_dist).sort((a, b) => b[1] - a[1])
    : [];
  const emotionTotal = emotionEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <h2 style={pageTitleStyle}>成长报告</h2>
      <p style={pageSubStyle}>量化你的交易成长，追踪改进轨迹</p>

      {/* Report header */}
      <div style={reportHeaderStyle}>
        <h3 style={reportPeriodStyle}>{periodLabel}</h3>
        <div style={reportStatsStyle}>
          <div style={reportStatStyle}>
            <span style={reportStatValStyle}>{current.trade_count}</span>
            <span style={reportStatLabelStyle}>交易笔数</span>
          </div>
          <div style={reportStatDivStyle} />
          <div style={reportStatStyle}>
            <span style={reportStatValStyle}>{(current.win_rate * 100).toFixed(1)}%</span>
            <span style={reportStatLabelStyle}>胜率</span>
          </div>
          <div style={reportStatDivStyle} />
          <div style={reportStatStyle}>
            <span style={{
              ...reportStatValStyle,
              color: current.total_pnl >= 0 ? '#2ecc71' : '#ff6b6b',
            }}>
              {current.total_pnl >= 0 ? '+' : ''}¥{current.total_pnl.toLocaleString()}
            </span>
            <span style={reportStatLabelStyle}>总盈亏</span>
          </div>
        </div>
      </div>

      {/* Month-over-month comparison */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>
          环比变化
          {prevLabel && <span style={{ fontSize: 13, fontWeight: 400, color: '#999', marginLeft: 8 }}>vs {prevLabel}</span>}
        </h3>
        <div style={comparisonGridStyle}>
          <div style={comparisonItemStyle}>
            <span style={compLabelStyle}>交易笔数</span>
            <span style={compCurrStyle}>{current.trade_count}</span>
            <span style={{ ...compDeltaStyle, color: deltaColor(deltas.trade_count) }}>
              {formatDelta(deltas.trade_count)}
            </span>
          </div>
          <div style={comparisonItemStyle}>
            <span style={compLabelStyle}>胜率</span>
            <span style={compCurrStyle}>{(current.win_rate * 100).toFixed(1)}%</span>
            <span style={{ ...compDeltaStyle, color: deltaColor(deltas.win_rate) }}>
              {formatDelta(Number((deltas.win_rate * 100).toFixed(1)), '%')}
            </span>
          </div>
          <div style={comparisonItemStyle}>
            <span style={compLabelStyle}>盈亏</span>
            <span style={compCurrStyle}>¥{current.total_pnl.toLocaleString()}</span>
            <span style={{ ...compDeltaStyle, color: deltaColor(deltas.total_pnl) }}>
              {formatDelta(deltas.total_pnl)}
            </span>
          </div>
          <div style={comparisonItemStyle}>
            <span style={compLabelStyle}>复盘数</span>
            <span style={compCurrStyle}>{current.review_count}</span>
            <span style={{ ...compDeltaStyle, color: deltaColor(deltas.review_count) }}>
              {formatDelta(deltas.review_count)}
            </span>
          </div>
          <div style={comparisonItemStyle}>
            <span style={compLabelStyle}>学习数</span>
            <span style={compCurrStyle}>{current.learn_count}</span>
            <span style={{ ...compDeltaStyle, color: deltaColor(deltas.learn_count) }}>
              {formatDelta(deltas.learn_count)}
            </span>
          </div>
        </div>
      </div>

      {/* Emotion distribution */}
      {emotionEntries.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            情绪分布
            {current.top_emotion && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#999', marginLeft: 8 }}>
                主要情绪: {current.top_emotion}
              </span>
            )}
          </h3>
          <div style={emotionListStyle}>
            {emotionEntries.map(([emotion, count]) => {
              const pct = emotionTotal > 0 ? Math.round((count / emotionTotal) * 100) : 0;
              return (
                <div key={emotion} style={emotionItemStyle}>
                  <div style={emotionInfoStyle}>
                    <span style={emotionNameStyle}>{emotion}</span>
                    <span style={emotionCountStyle}>{count} 次</span>
                  </div>
                  <div style={emotionBarOuterStyle}>
                    <div style={{
                      ...emotionBarInnerStyle,
                      width: `${pct}%`,
                    }} />
                  </div>
                  <span style={emotionPctStyle}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key metrics cards */}
      <div style={metricsGridStyle}>
        <div style={metricCardStyle}>
          <span style={metricIconStyle}>📝</span>
          <div>
            <span style={metricLabelStyle}>复盘次数</span>
            <span style={metricValStyle}>{current.review_count}</span>
          </div>
        </div>
        <div style={metricCardStyle}>
          <span style={metricIconStyle}>📚</span>
          <div>
            <span style={metricLabelStyle}>学习次数</span>
            <span style={metricValStyle}>{current.learn_count}</span>
          </div>
        </div>
        {current.top_emotion && (
          <div style={metricCardStyle}>
            <span style={metricIconStyle}>😊</span>
            <div>
              <span style={metricLabelStyle}>主要情绪</span>
              <span style={metricValStyle}>{current.top_emotion}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Styles ── */

const loadingStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  height: 300, fontSize: 18, color: '#999',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: 60,
  background: '#fff', borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px',
};

const pageSubStyle: React.CSSProperties = {
  fontSize: 15, color: '#888', margin: '0 0 24px',
};

const reportHeaderStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
  borderRadius: 16, padding: '28px 28px', marginBottom: 24,
  color: '#fff',
};

const reportPeriodStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 500, opacity: 0.8, margin: '0 0 20px',
};

const reportStatsStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 0,
};

const reportStatStyle: React.CSSProperties = {
  flex: 1, textAlign: 'center',
};

const reportStatValStyle: React.CSSProperties = {
  fontSize: 28, fontWeight: 700, display: 'block', marginBottom: 4,
};

const reportStatLabelStyle: React.CSSProperties = {
  fontSize: 13, opacity: 0.7,
};

const reportStatDivStyle: React.CSSProperties = {
  width: 1, height: 40, background: 'rgba(255,255,255,0.15)', flexShrink: 0,
};

const sectionStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: '0 0 16px',
};

const comparisonGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12,
};

const comparisonItemStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  padding: '14px 16px', background: '#fafafa', borderRadius: 10,
};

const compLabelStyle: React.CSSProperties = {
  fontSize: 12, color: '#999',
};

const compCurrStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: '#333',
};

const compDeltaStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600,
};

/* Emotion */
const emotionListStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14,
};

const emotionItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
};

const emotionInfoStyle: React.CSSProperties = {
  width: 100, flexShrink: 0,
};

const emotionNameStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: '#333', display: 'block',
};

const emotionCountStyle: React.CSSProperties = {
  fontSize: 12, color: '#999',
};

const emotionBarOuterStyle: React.CSSProperties = {
  flex: 1, height: 10, borderRadius: 5, background: '#f0f0f0',
  overflow: 'hidden',
};

const emotionBarInnerStyle: React.CSSProperties = {
  height: '100%', borderRadius: 5, transition: 'width 0.5s ease',
  background: 'linear-gradient(90deg, #667eea, #764ba2)',
};

const emotionPctStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, width: 50, textAlign: 'right', color: '#555',
};

/* Metrics */
const metricsGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12, marginBottom: 24,
};

const metricCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '16px 20px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  display: 'flex', alignItems: 'center', gap: 14,
};

const metricIconStyle: React.CSSProperties = {
  fontSize: 28,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 12, color: '#999', display: 'block', marginBottom: 2,
};

const metricValStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: '#333',
};
