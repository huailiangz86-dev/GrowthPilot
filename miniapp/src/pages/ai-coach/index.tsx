import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Message { role: "user" | "assistant" | "system"; content: string; links?: { title: string; id: string }[]; intent?: string; }

const INTENT_LABELS: Record<string, string> = {
  knowledge: "📚 知识问答", analysis: "📊 交易分析",
  master: "🧠 大师视角", recommend: "📖 学习推荐",
  market: "📈 行情分析",
};

const QUICK_QUESTIONS = [
  { emoji: "📈", text: "当前大盘行情怎么看？" },
  { emoji: "🔥", text: "最近有什么热点板块？" },
  { emoji: "📊", text: "分析我最近的交易表现" },
  { emoji: "📖", text: "推荐我下一步该学什么" },
];

const HOT_QUESTIONS = [
  "当前市场主线题材是什么？",
  "板块轮动到了什么阶段？",
  "如何判断市场情绪周期？",
  "什么是打板？怎么选首板？",
  "止损应该设多少合适？",
  "用利弗莫尔的视角看我的操作",
  "MACD背离怎么看？",
  "什么是缠论中枢？",
];

export default function AiCoach() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "你好，我是你的 AI 交易教练。我熟悉 18 位交易大师的方法论，也了解你的交易记录。\n\n你可以：\n📈 问我大盘行情和板块分析\n📚 问交易知识和技术指标\n📊 让我分析你的交易记录\n🧠 用大师视角解读你的操作\n📖 推荐适合你的学习内容" },
  ]);
  const [themes, setThemes] = useState<string[]>([]);
  const [presetThemes, setPresetThemes] = useState<string[]>([]);
  const [showThemes, setShowThemes] = useState(false);

  useEffect(() => {
    request<string[]>({ url: "/ai-coach/themes" }).then(setThemes).catch(() => {});
    request<string[]>({ url: "/ai-coach/preset-themes" }).then(setPresetThemes).catch(() => {});
  }, []);

  const toggleTheme = async (t: string) => {
    const next = themes.includes(t) ? themes.filter((x) => x !== t) : [...themes, t];
    setThemes(next);
    request({ url: "/ai-coach/themes", method: "PUT", data: { themes: next } }).catch(() => {});
  };
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<string>("");

  useEffect(() => {
    scrollRef.current = `msg-${messages.length - 1}`;
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await request<{ reply: string; links?: { title: string; id: string }[]; intent?: string }>({
        url: "/ai-coach/chat",
        method: "POST",
        data: { message: text.trim(), history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })) },
      });
      const aiMsg: Message = { role: "assistant", content: res.reply, links: res.links, intent: res.intent };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "抱歉，暂时无法回答，请稍后再试。" }]);
    }
    setLoading(false);
  };

  const showQuickStart = messages.length <= 1;

  return (
    <View className="coach-page">
      <View className="coach-header">
        <Text className="coach-title">AI 交易教练</Text>
        <Text className="theme-btn" onClick={() => setShowThemes(!showThemes)}>
          {themes.length > 0 ? `关注 ${themes.length} 个主题` : "设置关注主题"}
        </Text>
      </View>

      {showThemes && (
        <View className="theme-panel">
          <Text className="theme-label">选择你关注的行业/主题（AI 将重点分析）</Text>
          <View className="theme-tags">
            {presetThemes.map((t) => (
              <Text key={t} className={`theme-tag ${themes.includes(t) ? "active" : ""}`}
                onClick={() => toggleTheme(t)}>{t}</Text>
            ))}
          </View>
        </View>
      )}

      <ScrollView scrollY className="chat-area" scrollIntoView={scrollRef.current}>
        {messages.map((msg, idx) => (
          <View key={idx} id={`msg-${idx}`} className={`msg-row ${msg.role}`}>
            {msg.role === "assistant" && <Text className="avatar">🤖</Text>}
            <View className={`bubble ${msg.role}`}>
              {msg.intent && INTENT_LABELS[msg.intent] && (
                <Text className="intent-tag">{INTENT_LABELS[msg.intent]}</Text>
              )}
              <Text className="bubble-text">{msg.content}</Text>
              {msg.links && msg.links.length > 0 && (
                <View className="bubble-links">
                  {msg.links.map((l, i) => (
                    <Text key={i} className="bubble-link"
                      onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${l.id}` })}>
                      📄 {l.title}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}

        {loading && (
          <View className="msg-row assistant">
            <Text className="avatar">🤖</Text>
            <View className="bubble assistant">
              <Text className="bubble-text typing">思考中...</Text>
            </View>
          </View>
        )}

        {/* Quick start cards */}
        {showQuickStart && (
          <View className="quick-section">
            <Text className="quick-label">今日推荐</Text>
            <View className="quick-cards">
              {QUICK_QUESTIONS.map((q, i) => (
                <View key={i} className="quick-card" onClick={() => sendMessage(q.text)}>
                  <Text className="quick-emoji">{q.emoji}</Text>
                  <Text className="quick-text">{q.text}</Text>
                </View>
              ))}
            </View>

            <Text className="quick-label">热门问题</Text>
            <View className="hot-list">
              {HOT_QUESTIONS.map((q, i) => (
                <View key={i} className="hot-item" onClick={() => sendMessage(q)}>
                  <Text className="hot-text">{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: "20px" }} />
      </ScrollView>

      {/* Input bar */}
      <View className="input-bar">
        <Input className="input-field" placeholder="问我任何交易问题..." value={input}
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={() => sendMessage(input)} confirmType="send" />
        <View className={`send-btn ${input.trim() ? "active" : ""}`} onClick={() => sendMessage(input)}>
          <Text>发送</Text>
        </View>
      </View>
    </View>
  );
}
