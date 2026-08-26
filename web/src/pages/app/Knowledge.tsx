import type React from 'react';
import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  article_count?: number;
}

interface Article {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  content_md?: string;
  category_id?: string;
  category?: string;
  tags?: string[];
  author?: string;
  cover_emoji?: string;
  reading_time_min?: number;
  source_type?: string;
  related_template_id?: string;
  created_at?: string;
}

function renderMarkdown(text: string): string {
  let html = text;
  // Headings: ## heading
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:18px;font-weight:600;color:#1a1a2e;margin:24px 0 10px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:22px;font-weight:700;color:#1a1a2e;margin:28px 0 12px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:26px;font-weight:700;color:#1a1a2e;margin:32px 0 14px;">$1</h1>');
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#333;">$1</strong>');
  // Italic: *text*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Blockquotes: > text
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #e74c3c;padding:10px 16px;margin:14px 0;background:#fafafa;color:#555;font-style:italic;border-radius:0 8px 8px 0;">$1</blockquote>');
  // Unordered lists: - item
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:4px;color:#555;">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="padding-left:20px;margin:12px 0;">${match}</ul>`);
  // Ordered lists: 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;padding-left:4px;color:#555;">$1</li>');
  // Code inline: `code`
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:14px;color:#e74c3c;">$1</code>');
  // Horizontal rule: ---
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e8e8e8;margin:20px 0;" />');
  // Paragraphs (newlines)
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.8;">');
  html = html.replace(/\n/g, '<br/>');
  html = `<p style="margin:12px 0;line-height:1.8;">${html}</p>`;
  return html;
}

export default function Knowledge() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.get<Category[]>('/knowledge-base/categories')
      .then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = activeCategory === 'all' ? 'page_size=200' : `category=${activeCategory}&page_size=200`;
    const kw = searchQuery.trim() ? `&keyword=${encodeURIComponent(searchQuery.trim())}` : '';
    api.get<{ items: Article[]; total: number }>(`/knowledge-base/articles?${params}${kw}`)
      .then((res) => setArticles(res?.items || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeCategory, searchQuery]);

  const filteredArticles = articles;

  // Group articles by author for classic/book categories
  const isClassicCategory = useMemo(() => {
    const cat = categories.find(c => c.id === activeCategory);
    return cat?.name?.includes('经典') || cat?.name?.includes('book') || cat?.name?.includes('classic');
  }, [categories, activeCategory]);

  const groupedByBook = useMemo(() => {
    if (!isClassicCategory) return null;
    const groups: Record<string, Article[]> = {};
    for (const a of filteredArticles) {
      const groupKey = a.author || '其他';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(a);
    }
    return groups;
  }, [filteredArticles, isClassicCategory]);

  const handleSelectArticle = async (article: Article) => {
    // If article already has content, show it directly
    if (article.content) {
      setSelectedArticle(article);
      return;
    }
    // Try fetching full article
    setDetailLoading(true);
    try {
      const full = await api.get<Article>(`/knowledge-base/articles/${article.id}`);
      setSelectedArticle({ ...article, ...full, content: full.content_md ?? full.content ?? article.content });
    } catch {
      setSelectedArticle(article);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  // Article detail view
  if (selectedArticle) {
    return (
      <div style={detailContainerStyle}>
        <div style={detailSidebarStyle}>
          <button type="button" style={backBtnStyle} onClick={() => setSelectedArticle(null)}>
            ← 返回列表
          </button>
          <div style={detailSideListStyle}>
            {filteredArticles.slice(0, 20).map((a) => (
              <div
                key={a.id}
                style={{
                  ...sideListItemStyle,
                  ...(a.id === selectedArticle.id ? sideListItemActiveStyle : {}),
                }}
                onClick={() => handleSelectArticle(a)}
              >
                <span style={sideListTitleStyle}>{a.title}</span>
                {a.reading_time_min != null && <span style={sideListMetaStyle}>{a.reading_time_min}min</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={detailMainStyle}>
          <article style={articleDetailStyle}>
            <h1 style={articleDetailTitleStyle}>{selectedArticle.title}</h1>
            {selectedArticle.tags && selectedArticle.tags.length > 0 && (
              <div style={tagRowStyle}>
                {selectedArticle.tags.map((t) => (
                  <span key={t} style={tagStyle}>{t}</span>
                ))}
              </div>
            )}
            {selectedArticle.reading_time_min && (
              <div style={readTimeInfoStyle}>
                阅读时间约 {selectedArticle.reading_time_min} 分钟
              </div>
            )}
            {detailLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>加载内容中...</div>
            ) : (
              <div
                style={articleContentStyle}
                dangerouslySetInnerHTML={{
                  __html: selectedArticle.content
                    ? renderMarkdown(selectedArticle.content)
                    : '<p style="color:#999">暂无内容</p>',
                }}
              />
            )}
          </article>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={pageTitleStyle}>知识库</h2>
      <p style={pageDescStyle}>{articles.length}篇精选文章，覆盖交易核心知识体系</p>

      {/* Search */}
      <div style={searchBarStyle}>
        <div style={searchWrapStyle}>
          <span style={searchIconStyle}>🔍</span>
          <input
            type="text"
            placeholder="搜索文章标题、摘要或标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
          {searchQuery && (
            <button
              type="button"
              style={searchClearStyle}
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <div style={searchResultCountStyle}>
            找到 {filteredArticles.length} 篇相关文章
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div style={tabsStyle}>
        <button
          type="button"
          style={activeCategory === 'all' ? activeTabStyle : tabStyle}
          onClick={() => setActiveCategory('all')}
        >
          全部 ({articles.length})
        </button>
        {categories.map((cat) => (
          <button
            type="button"
            key={cat.id}
            style={activeCategory === cat.slug ? activeTabStyle : tabStyle}
            onClick={() => setActiveCategory(cat.slug)}
          >
            {cat.name}
            {cat.article_count !== undefined && (
              <span style={tabCountStyle}>{cat.article_count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Article list */}
      {filteredArticles.length === 0 ? (
        <div style={emptyStyle}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>📖</span>
          <p style={{ fontSize: 16, color: '#888', margin: 0 }}>
            {searchQuery ? '没有找到匹配的文章' : '暂无文章'}
          </p>
        </div>
      ) : groupedByBook ? (
        // Book-style grouping
        <div style={bookGroupsStyle}>
          {Object.entries(groupedByBook).map(([bookTitle, bookArticles]) => (
            <div key={bookTitle} style={bookGroupStyle}>
              <div style={bookGroupHeaderStyle}>
                <span style={bookIconStyle}>📖</span>
                <div>
                  <h3 style={bookTitleStyle}>{bookTitle}</h3>
                  <span style={bookCountStyle}>{bookArticles.length} 篇文章</span>
                </div>
              </div>
              <div style={bookArticlesStyle}>
                {bookArticles.map((article, idx) => (
                  <div
                    key={article.id}
                    style={bookArticleItemStyle}
                    onClick={() => handleSelectArticle(article)}
                  >
                    <span style={bookChapterNumStyle}>{idx + 1}</span>
                    <div style={{ flex: 1 }}>
                      <h4 style={bookArticleTitleStyle}>{article.title}</h4>
                      {article.summary && (
                        <p style={bookArticleSummaryStyle}>{article.summary}</p>
                      )}
                    </div>
                    {article.reading_time_min && (
                      <span style={readTimeStyle}>{article.reading_time_min}min</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={articleListStyle}>
          {filteredArticles.map((article) => (
            <div
              key={article.id}
              style={articleCardStyle}
              onClick={() => handleSelectArticle(article)}
            >
              <h3 style={articleTitleStyle}>
                {article.cover_emoji && <span style={{ marginRight: 6 }}>{article.cover_emoji}</span>}
                {article.title}
              </h3>
              {article.summary && (
                <p style={articleSummaryStyle}>{article.summary}</p>
              )}
              <div style={articleMetaStyle}>
                {article.category && (
                  <span style={categoryBadgeStyle}>{article.category}</span>
                )}
                {article.tags && article.tags.slice(0, 3).map((t) => (
                  <span key={t} style={smallTagStyle}>{t}</span>
                ))}
                {article.author && (
                  <span style={readTimeStyle}>{article.author}</span>
                )}
                {article.reading_time_min != null && (
                  <span style={readTimeStyle}>{article.reading_time_min}分钟</span>
                )}
              </div>
            </div>
          ))}
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

const pageTitleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px',
};

const pageDescStyle: React.CSSProperties = {
  fontSize: 15, color: '#888', margin: '0 0 24px',
};

const searchBarStyle: React.CSSProperties = {
  marginBottom: 20,
};

const searchWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  maxWidth: 520,
};

const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  fontSize: 16,
  pointerEvents: 'none',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 40px 12px 40px',
  borderRadius: 10, border: '1px solid #e0e0e0',
  fontSize: 15, outline: 'none', background: '#fff',
  transition: 'border-color 0.2s',
};

const searchClearStyle: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  background: 'none',
  border: 'none',
  fontSize: 16,
  color: '#bbb',
  cursor: 'pointer',
  padding: 4,
};

const searchResultCountStyle: React.CSSProperties = {
  fontSize: 13, color: '#999', marginTop: 8,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24,
};

const tabStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 20, border: '1px solid #e0e0e0',
  background: '#fff', color: '#666', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit', transition: 'all 0.15s',
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: '#e74c3c', color: '#fff', borderColor: '#e74c3c',
};

const tabCountStyle: React.CSSProperties = {
  fontSize: 12, opacity: 0.7,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: 60, color: '#999', fontSize: 16,
  background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const articleListStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16,
};

const articleCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s', border: '1px solid #f0f0f0',
};

const articleTitleStyle: React.CSSProperties = {
  fontSize: 17, fontWeight: 600, color: '#1a1a2e', margin: '0 0 8px', lineHeight: 1.4,
};

const articleSummaryStyle: React.CSSProperties = {
  fontSize: 14, color: '#888', lineHeight: 1.6, margin: '0 0 12px',
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const articleMetaStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
};

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: 12, padding: '2px 10px', borderRadius: 12,
  background: '#f0f0f0', color: '#666',
};

const smallTagStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 10,
  background: 'rgba(231,76,60,0.06)', color: '#e74c3c',
};

const readTimeStyle: React.CSSProperties = {
  fontSize: 12, color: '#aaa',
};

/* Book grouping styles */
const bookGroupsStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 24,
};

const bookGroupStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 16, overflow: 'hidden',
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
};

const bookGroupHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '20px 24px', background: 'linear-gradient(135deg, #f8f9ff, #fff0f0)',
  borderBottom: '1px solid #f0f0f0',
};

const bookIconStyle: React.CSSProperties = {
  fontSize: 32,
};

const bookTitleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: 0,
};

const bookCountStyle: React.CSSProperties = {
  fontSize: 13, color: '#999',
};

const bookArticlesStyle: React.CSSProperties = {
  padding: '0',
};

const bookArticleItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '14px 24px', borderBottom: '1px solid #f8f8f8',
  cursor: 'pointer', transition: 'background 0.15s',
};

const bookChapterNumStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%',
  background: '#f0f0f0', color: '#888',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 600, flexShrink: 0,
};

const bookArticleTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 500, color: '#333', margin: '0 0 2px',
};

const bookArticleSummaryStyle: React.CSSProperties = {
  fontSize: 13, color: '#999', margin: 0,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  maxWidth: 400,
};

/* Detail view */
const detailContainerStyle: React.CSSProperties = {
  display: 'flex', gap: 0, minHeight: 'calc(100vh - 104px)',
  margin: '-24px', // offset parent padding
};

const detailSidebarStyle: React.CSSProperties = {
  width: 280, flexShrink: 0, background: '#fafafa',
  borderRight: '1px solid #f0f0f0', padding: '20px 0',
  overflowY: 'auto', display: 'flex', flexDirection: 'column',
};

const detailSideListStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
};

const sideListItemStyle: React.CSSProperties = {
  padding: '10px 20px', cursor: 'pointer',
  borderLeft: '3px solid transparent',
  transition: 'background 0.15s',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};

const sideListItemActiveStyle: React.CSSProperties = {
  background: 'rgba(231,76,60,0.06)',
  borderLeftColor: '#e74c3c',
};

const sideListTitleStyle: React.CSSProperties = {
  fontSize: 14, color: '#555', lineHeight: 1.4,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  maxWidth: 200,
};

const sideListMetaStyle: React.CSSProperties = {
  fontSize: 12, color: '#ccc', flexShrink: 0,
};

const detailMainStyle: React.CSSProperties = {
  flex: 1, padding: '24px 32px', overflowY: 'auto',
};

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#e74c3c',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  padding: '10px 20px', fontFamily: 'inherit',
};

const articleDetailStyle: React.CSSProperties = {
  maxWidth: 720, margin: '0 auto',
};

const articleDetailTitleStyle: React.CSSProperties = {
  fontSize: 28, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px', lineHeight: 1.3,
};

const tagRowStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16,
};

const tagStyle: React.CSSProperties = {
  fontSize: 12, padding: '3px 12px', borderRadius: 12,
  background: 'rgba(231,76,60,0.08)', color: '#e74c3c',
};

const readTimeInfoStyle: React.CSSProperties = {
  fontSize: 13, color: '#bbb', marginBottom: 24,
  paddingBottom: 20, borderBottom: '1px solid #f0f0f0',
};

const articleContentStyle: React.CSSProperties = {
  fontSize: 16, lineHeight: 1.8, color: '#444',
};
