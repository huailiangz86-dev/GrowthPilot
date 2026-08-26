import type React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface NoteItem {
  article_id: string;
  title: string;
  cover_emoji?: string;
  notes: string;
  read_at: string;
}

export default function MyNotes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.get<NoteItem[]>('/knowledge-base/my-notes')
      .then((res) => setNotes(res || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredNotes = notes.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) ||
      n.notes.toLowerCase().includes(q);
  });

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  if (selectedNote) {
    return (
      <div>
        <button type="button" style={backBtnStyle} onClick={() => setSelectedNote(null)}>
          ← 返回笔记列表
        </button>
        <div style={noteDetailStyle}>
          <h1 style={noteDetailTitleStyle}>
            {selectedNote.cover_emoji && <span style={{ marginRight: 8 }}>{selectedNote.cover_emoji}</span>}
            {selectedNote.title}
          </h1>
          <div style={noteDetailMetaStyle}>
            <span style={noteDateStyle}>{selectedNote.read_at}</span>
          </div>
          <div style={noteDetailContentStyle}>
            {selectedNote.notes.split('\n').map((line, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0' }}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={headerStyle}>
        <div>
          <h2 style={pageTitleStyle}>我的笔记</h2>
          <p style={pageSubStyle}>记录学习心得和交易感悟</p>
        </div>
      </div>

      {/* Search */}
      <div style={searchBarStyle}>
        <span style={searchIconStyle}>🔍</span>
        <input
          type="text"
          placeholder="搜索笔记..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <div style={emptyStyle}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>✏️</span>
          <p style={{ fontSize: 16, color: '#888', margin: 0 }}>
            {searchQuery ? '没有找到匹配的笔记' : '暂无数据'}
          </p>
        </div>
      ) : (
        <div style={notesGridStyle}>
          {filteredNotes.map((note) => (
            <div
              key={note.article_id}
              style={noteCardStyle}
              onClick={() => setSelectedNote(note)}
            >
              <h3 style={noteTitleStyle}>
                {note.cover_emoji && <span style={{ marginRight: 6 }}>{note.cover_emoji}</span>}
                {note.title}
              </h3>
              <p style={notePreviewStyle}>{note.notes}</p>
              <div style={noteFooterStyle}>
                <span style={noteDateSmallStyle}>{note.read_at}</span>
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

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 20,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px',
};

const pageSubStyle: React.CSSProperties = {
  fontSize: 15, color: '#888', margin: 0,
};

const searchBarStyle: React.CSSProperties = {
  position: 'relative', maxWidth: 480, marginBottom: 24,
};

const searchIconStyle: React.CSSProperties = {
  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
  fontSize: 16, pointerEvents: 'none',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px 12px 40px',
  borderRadius: 10, border: '1px solid #e0e0e0',
  fontSize: 15, outline: 'none', background: '#fff',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center', padding: 60,
  background: '#fff', borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const notesGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16,
};

const noteCardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
  transition: 'transform 0.15s, box-shadow 0.15s',
  border: '1px solid #f0f0f0',
  display: 'flex', flexDirection: 'column', gap: 10,
};

const noteTitleStyle: React.CSSProperties = {
  fontSize: 17, fontWeight: 600, color: '#1a1a2e', margin: 0, lineHeight: 1.4,
};

const notePreviewStyle: React.CSSProperties = {
  fontSize: 14, color: '#888', lineHeight: 1.6, margin: 0,
  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const noteFooterStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
};

const noteDateSmallStyle: React.CSSProperties = {
  fontSize: 12, color: '#ccc',
};

/* Detail styles */
const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#e74c3c',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  padding: '4px 0', marginBottom: 20, fontFamily: 'inherit',
};

const noteDetailStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '32px 36px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const noteDetailTitleStyle: React.CSSProperties = {
  fontSize: 26, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px',
};

const noteDetailMetaStyle: React.CSSProperties = {
  display: 'flex', gap: 16, marginBottom: 24,
  paddingBottom: 20, borderBottom: '1px solid #f0f0f0',
};

const noteDateStyle: React.CSSProperties = {
  fontSize: 14, color: '#999',
};

const noteDetailContentStyle: React.CSSProperties = {
  fontSize: 16, lineHeight: 1.8, color: '#444',
};
