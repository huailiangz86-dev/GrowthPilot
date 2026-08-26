import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface IndexData { name: string; symbol?: string; value: number; change: number; up: boolean; }
interface NewsItem { title: string; time: string; url: string; summary: string; source: string; }

export default function Market() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<IndexData[]>('/market/indices').catch(() => []),
      api.get<NewsItem[]>('/market/news?num=15').catch(() => []),
    ]).then(([idx, nws]) => {
      setIndices(idx || []);
      setNews(nws || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载中...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>市场行情</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
        {indices.map((idx) => (
          <div key={idx.name} style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>{idx.name}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: idx.up ? '#ff4d4f' : '#52c41a' }}>{idx.value?.toLocaleString()}</div>
            <div style={{ fontSize: 15, color: idx.up ? '#ff4d4f' : '#52c41a', marginTop: 6 }}>
              {idx.change > 0 ? '+' : ''}{idx.change}%
            </div>
          </div>
        ))}
      </div>

      {indices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#ccc' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📈</p>
          <p style={{ fontSize: 16 }}>暂无行情数据</p>
        </div>
      )}

      {/* Finance News */}
      {news.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>财经资讯</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {news.map((n, i) => (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" style={{
                background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #f0f0f0',
                textDecoration: 'none', display: 'block', transition: 'box-shadow 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 14, color: '#333', lineHeight: 1.5, flex: 1 }}>{n.title}</span>
                  <span style={{ fontSize: 12, color: '#bbb', flexShrink: 0, marginTop: 2 }}>{n.time}</span>
                </div>
                {n.summary && <div style={{ fontSize: 13, color: '#999', marginTop: 6, lineHeight: 1.4 }}>{n.summary.slice(0, 60)}...</div>}
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 13, color: '#bbb', marginTop: 16 }}>
        指数数据来源：腾讯财经（实时） · 资讯来源：新浪财经
      </div>
    </div>
  );
}
