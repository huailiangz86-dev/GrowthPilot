import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Holding { symbol: string; name: string; quantity: number; avg_cost: number; current_price: number; pnl: number; market: string; }
interface PortfolioSummary { total_value: number; total_pnl: number; }

export default function Holdings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ holdings: Holding[]; summary: PortfolioSummary }>('/portfolio/holdings')
      .then((res) => {
        setHoldings(res?.holdings || []);
        setSummary(res?.summary || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pnlColor = (v: number) => v > 0 ? '#ff4d4f' : v < 0 ? '#52c41a' : '#333';

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>我的持仓</h2>

      {/* Summary */}
      {summary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>总市值</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>¥{summary.total_value.toLocaleString()}</div>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>总盈亏</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: pnlColor(summary.total_pnl) }}>{summary.total_pnl > 0 ? '+' : ''}¥{summary.total_pnl.toLocaleString()}</div>
          </div>
        </div>
      )}

      {holdings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#ccc' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>💰</p>
          <p style={{ fontSize: 16 }}>暂无数据</p>
          <p style={{ fontSize: 14, color: '#bbb', marginTop: 8 }}>记录交易后，买入未卖出的标的会显示在这里</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {holdings.map((h) => {
            const marketValue = h.current_price * h.quantity;
            const pnlPct = h.avg_cost > 0 ? ((h.current_price - h.avg_cost) / h.avg_cost * 100) : 0;
            return (
              <div key={h.symbol} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{h.name} <span style={{ fontSize: 13, color: '#999' }}>{h.symbol}</span></div>
                  <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>{h.quantity}股 · 成本{h.avg_cost} · 现价{h.current_price}</div>
                  <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>市值 ¥{marketValue.toLocaleString()} · {h.market}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: pnlColor(h.pnl) }}>{h.pnl > 0 ? '+' : ''}{h.pnl.toLocaleString()}</div>
                  <div style={{ fontSize: 13, color: pnlColor(pnlPct) }}>{pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
