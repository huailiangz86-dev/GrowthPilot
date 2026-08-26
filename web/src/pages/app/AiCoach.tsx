import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface KnowledgeLink {
  id?: string;
  title: string;
  url?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: string;
  knowledge_links?: KnowledgeLink[];
}

const THEMES = [
  { id: 'general', label: '综合分析', icon: '📊', desc: '全方位交易分析' },
  { id: 'review', label: '交易复盘', icon: '📋', desc: '深度复盘单笔交易' },
  { id: 'psychology', label: '交易心理', icon: '🧠', desc: '情绪管理与纪律' },
  { id: 'risk', label: '风险管理', icon: '🛡️', desc: '仓位与止损策略' },
  { id: 'pattern', label: '模式发现', icon: '🔍', desc: '发现交易模式' },
  { id: 'learning', label: '学习推荐', icon: '📚', desc: '个性化学习建议' },
];

const QUICK_QUESTIONS = [
  '分析我最近的交易表现',
  '我的主要亏损原因是什么？',
  '推荐今天的学习内容',
  '如何改进我的仓位管理？',
  '帮我复盘上一笔交易',
  '我的交易情绪倾向如何？',
];

function parseKnowledgeLinks(text: string): { cleanText: string; links: KnowledgeLink[] } {
  const links: KnowledgeLink[] = [];
  // Match patterns like [推荐阅读: title](link) or 【推荐】title
  const linkRegex = /\[推荐阅读[：:]?\s*(.+?)\]\((.+?)\)/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({ title: match[1], url: match[2] });
  }
  const cleanText = text.replace(linkRegex, '').trim();
  return { cleanText, links };
}

function renderMessageContent(content: string): React.ReactNode {
  // Split by newlines and render
  return content.split('\n').map((line, j) => {
    // Bold
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return (
      <p key={j} style={{ margin: j === 0 ? 0 : '6px 0 0' }}>
        {parts.map((part, k) =>
          k % 2 === 1 ? <strong key={k}>{part}</strong> : part
        )}
      </p>
    );
  });
}

export default function AiCoach() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是你的 AI 交易教练。我可以帮你分析交易模式、复盘交易记录、推荐学习内容。\n\n你可以选择下方的主题开始对话，或直接提问。',
      timestamp: new Date(),
      intent: '欢迎',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showThemes, setShowThemes] = useState(true);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectTheme = (themeId: string) => {
    setActiveTheme(themeId);
    setShowThemes(false);
    const theme = THEMES.find(t => t.id === themeId);
    if (theme) {
      sendMessage(`我想聊聊${theme.label}方面的内容`, themeId);
    }
  };

  const sendMessage = async (text: string, theme?: string) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setShowThemes(false);

    try {
      const res = await api.post<{
        reply?: string;
        links?: Array<{ title: string; id: string }>;
        intent?: string;
      }>('/ai-coach/chat', {
        message: text.trim(),
        theme: theme || activeTheme,
        conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const replyText = res.reply || '抱歉，AI 教练暂时无法回复，请稍后再试。';
      const { cleanText, links } = parseKnowledgeLinks(replyText);

      // Convert API links (title+id) to KnowledgeLink format
      const apiLinks: KnowledgeLink[] = (res.links || []).map((l) => ({
        title: l.title,
        id: l.id,
        url: `/app/knowledge`,
      }));

      const assistantMsg: Message = {
        role: 'assistant',
        content: cleanText || replyText,
        timestamp: new Date(),
        intent: res.intent,
        knowledge_links: [...links, ...apiLinks],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        role: 'assistant',
        content: '连接失败，请确认后端服务已启动。你可以先浏览知识库学习。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatTime = (d: Date) => {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <div style={headerAvatarStyle}>AI</div>
          <div>
            <h2 style={titleStyle}>AI 交易教练</h2>
            <p style={subtitleStyle}>基于你的交易数据，提供个性化分析和建议</p>
          </div>
        </div>
        <button
          type="button"
          style={themeBtnStyle}
          onClick={() => setShowThemes(!showThemes)}
        >
          {showThemes ? '收起主题' : '选择主题'}
        </button>
      </div>

      {/* Theme selection panel */}
      {showThemes && (
        <div style={themesPanelStyle}>
          <div style={themesGridStyle}>
            {THEMES.map((theme) => (
              <button
                type="button"
                key={theme.id}
                style={{
                  ...themeCardStyle,
                  ...(activeTheme === theme.id ? themeCardActiveStyle : {}),
                }}
                onClick={() => selectTheme(theme.id)}
              >
                <span style={themeIconStyle}>{theme.icon}</span>
                <span style={themeLabelStyle}>{theme.label}</span>
                <span style={themeDescStyle}>{theme.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div ref={chatAreaRef} style={chatAreaStyle}>
        {messages.map((msg, i) => (
          <div key={i}>
            {/* Timestamp divider for first message or if gap > 5min */}
            {(i === 0 || (msg.timestamp.getTime() - messages[i - 1].timestamp.getTime() > 300000)) && (
              <div style={timeDividerStyle}>{formatTime(msg.timestamp)}</div>
            )}
            <div style={msg.role === 'user' ? userBubbleWrapStyle : assistantBubbleWrapStyle}>
              {msg.role === 'assistant' && <div style={avatarAssistantStyle}>AI</div>}
              <div style={bubbleColumnStyle}>
                {msg.role === 'assistant' && msg.intent && (
                  <span style={intentBadgeStyle}>{msg.intent}</span>
                )}
                <div style={msg.role === 'user' ? userBubbleStyle : assistantBubbleStyle}>
                  {renderMessageContent(msg.content)}
                </div>
                {/* Knowledge links */}
                {msg.knowledge_links && msg.knowledge_links.length > 0 && (
                  <div style={knowledgeLinksStyle}>
                    <span style={knowledgeHeaderStyle}>📚 推荐阅读</span>
                    {msg.knowledge_links.map((link, k) => (
                      <Link
                        key={k}
                        to={link.url || `/app/knowledge`}
                        style={knowledgeLinkItemStyle}
                      >
                        <span style={knowledgeLinkIconStyle}>📖</span>
                        <span>{link.title}</span>
                        <span style={knowledgeLinkArrowStyle}>→</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && <div style={avatarUserStyle}>我</div>}
            </div>
          </div>
        ))}
        {sending && (
          <div style={assistantBubbleWrapStyle}>
            <div style={avatarAssistantStyle}>AI</div>
            <div style={bubbleColumnStyle}>
              <div style={assistantBubbleStyle}>
                <div style={typingDotsStyle}>
                  <span style={typingDotStyle}>.</span>
                  <span style={{ ...typingDotStyle, animationDelay: '0.2s' }}>.</span>
                  <span style={{ ...typingDotStyle, animationDelay: '0.4s' }}>.</span>
                  <span style={typingTextStyle}> 正在思考</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions */}
      <div style={quickWrapStyle}>
        {QUICK_QUESTIONS.map((q) => (
          <button
            type="button"
            key={q}
            style={quickBtnStyle}
            onClick={() => sendMessage(q)}
            disabled={sending}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div style={inputAreaStyle}>
        <textarea
          style={textareaStyle}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题...（Enter 发送，Shift+Enter 换行）"
          rows={1}
          disabled={sending}
        />
        <button
          type="button"
          style={{
            ...sendBtnStyle,
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: 'calc(100vh - 104px)',
  maxHeight: 'calc(100vh - 104px)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f0f0f0',
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
};

const headerAvatarStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 14,
  background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, fontWeight: 700, flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13, color: '#888', margin: 0,
};

const themeBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8,
  border: '1px solid #e0e0e0', background: '#fff',
  color: '#666', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
};

/* Themes panel */
const themesPanelStyle: React.CSSProperties = {
  marginBottom: 12, padding: '16px',
  background: '#fafafa', borderRadius: 12,
  border: '1px solid #f0f0f0',
};

const themesGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
};

const themeCardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 4, padding: '14px 10px', borderRadius: 12,
  border: '1px solid #e8e8e8', background: '#fff',
  cursor: 'pointer', transition: 'all 0.15s',
  fontFamily: 'inherit',
};

const themeCardActiveStyle: React.CSSProperties = {
  borderColor: '#e74c3c',
  background: 'rgba(231,76,60,0.04)',
  boxShadow: '0 0 0 1px #e74c3c',
};

const themeIconStyle: React.CSSProperties = {
  fontSize: 24, marginBottom: 2,
};

const themeLabelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: '#333',
};

const themeDescStyle: React.CSSProperties = {
  fontSize: 11, color: '#999',
};

/* Chat */
const chatAreaStyle: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '12px 0',
  display: 'flex', flexDirection: 'column', gap: 12,
};

const timeDividerStyle: React.CSSProperties = {
  textAlign: 'center', fontSize: 12, color: '#ccc',
  margin: '8px 0',
};

const userBubbleWrapStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'flex-start',
};

const assistantBubbleWrapStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-start', gap: 10, alignItems: 'flex-start',
};

const bubbleColumnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '72%',
};

const avatarAssistantStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 12, flexShrink: 0,
  background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 700,
};

const avatarUserStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 12, flexShrink: 0,
  background: '#e74c3c', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 700,
};

const intentBadgeStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 10px', borderRadius: 10,
  background: 'rgba(102,126,234,0.1)', color: '#667eea',
  fontWeight: 500, alignSelf: 'flex-start',
};

const assistantBubbleStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '4px 16px 16px 16px',
  padding: '14px 18px', fontSize: 15, lineHeight: 1.7,
  color: '#333', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const userBubbleStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #e74c3c, #c0392b)', borderRadius: '16px 4px 16px 16px',
  padding: '14px 18px', fontSize: 15, lineHeight: 1.7,
  color: '#fff',
};

const typingDotsStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 0,
};

const typingDotStyle: React.CSSProperties = {
  fontSize: 24, color: '#999', lineHeight: 1,
};

const typingTextStyle: React.CSSProperties = {
  fontSize: 14, color: '#999', fontStyle: 'italic',
};

/* Knowledge links */
const knowledgeLinksStyle: React.CSSProperties = {
  background: '#f8f9ff', borderRadius: 12,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
  border: '1px solid #e8ecff',
};

const knowledgeHeaderStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#667eea', marginBottom: 2,
};

const knowledgeLinkItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderRadius: 8,
  background: '#fff', border: '1px solid #f0f0f0',
  fontSize: 14, color: '#333', textDecoration: 'none',
  cursor: 'pointer', transition: 'background 0.15s',
};

const knowledgeLinkIconStyle: React.CSSProperties = {
  fontSize: 16, flexShrink: 0,
};

const knowledgeLinkArrowStyle: React.CSSProperties = {
  marginLeft: 'auto', color: '#ccc', fontSize: 14,
};

/* Quick questions */
const quickWrapStyle: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0',
};

const quickBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 16, border: '1px solid #e0e0e0',
  background: '#fff', color: '#555', fontSize: 13, cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
  fontFamily: 'inherit',
};

/* Input */
const inputAreaStyle: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-end',
  padding: '12px 0', borderTop: '1px solid #f0f0f0',
};

const textareaStyle: React.CSSProperties = {
  flex: 1, padding: '10px 16px', borderRadius: 10,
  border: '1px solid #e0e0e0', fontSize: 15, resize: 'none',
  outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
  minHeight: 42, maxHeight: 120,
};

const sendBtnStyle: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
  color: '#fff', fontSize: 15, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  boxShadow: '0 2px 8px rgba(231,76,60,0.3)',
};
