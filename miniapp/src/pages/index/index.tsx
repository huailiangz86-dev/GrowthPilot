import { useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Dashboard { today_trades: number; today_pnl: number; month_pnl: number; win_rate: number | null; ai_suggestion: string; ai_severity: string | null; month_trades?: number; recent_trades?: { title: string; pnl: number | null; date: string; direction: string; judgment: string }[]; }
interface NewsItem { id: string; title: string; summary: string | null; sentiment: string | null; }
interface TasksData { recorded: boolean; reviewed: boolean; analyzed: boolean; progress: number; }
interface OnboardingStatus {
  completed: boolean;
  onboarded: boolean;
  current_day: number;
  path_id: string | null;
  path_name: string | null;
  total_days: number;
  completed_days: number[];
  personal_context_completed?: boolean;
}
interface TodayTask { day: number; task_type: string; task_title: string; target_url: string; }

async function ensureLogin() {
  const token = Taro.getStorageSync("gp_token");
  if (token) return true;
  try {
    const loginRes = await Taro.login();
    const res = await new Promise<any>((resolve, reject) => {
      Taro.request({ url: "http://127.0.0.1:8002/api/v1/auth/wx-login", method: "POST", data: { code: loginRes.code }, success: (r) => resolve(r.data), fail: reject });
    });
    if (res?.data?.access_token) { Taro.setStorageSync("gp_token", res.data.access_token); return true; }
  } catch { /* ignore */ }
  return false;
}

export default function Index() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [tasks, setTasks] = useState<TasksData | null>(null);
  const [ready, setReady] = useState(false);
  const [obStatus, setObStatus] = useState<OnboardingStatus | null>(null);
  const [todayTask, setTodayTask] = useState<TodayTask | null>(null);

  const load = async () => {
    const ok = await ensureLogin();
    if (!ok) return;
    setReady(true);
    request<Dashboard>({ url: "/dashboard" }).then(setData).catch(() => {});
    request<NewsItem[]>({ url: "/news" }).then(setNews).catch(() => {});
    request<TasksData>({ url: "/growth/tasks" }).then(setTasks).catch(() => {});
    request<OnboardingStatus>({ url: "/onboarding/status" })
      .then((s) => { setObStatus(s); if (s.onboarded && !s.completed) request<TodayTask>({ url: "/onboarding/today-task" }).then(setTodayTask).catch(() => {}); })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);
  useDidShow(() => { if (ready) load(); });

  const d = data;
  const pnlColor = (v: number) => v > 0 ? "up" : v < 0 ? "down" : "";

  return (
    <ScrollView scrollY className="index">
      {/* ── 指数行情栏 ── */}
      <View className="market-bar">
        <View className="idx"><Text className="idx-name">上证</Text><Text className="idx-val up">3,280</Text></View>
        <View className="idx"><Text className="idx-name">深证</Text><Text className="idx-val up">10,850</Text></View>
        <View className="idx"><Text className="idx-name">创业板</Text><Text className="idx-val down">2,180</Text></View>
      </View>

      {/* ── 数据概览 ── */}
      <View className="stats">
        <View className="stat-card">
          <Text className={`stat-val ${pnlColor(d?.today_pnl ?? 0)}`}>
            {d ? (d.today_pnl >= 0 ? "+" : "") + d.today_pnl : "--"}
          </Text>
          <Text className="stat-label">今日盈亏</Text>
        </View>
        <View className="stat-card">
          <Text className="stat-val accent">{d?.win_rate != null ? d.win_rate + "%" : "--"}</Text>
          <Text className="stat-label">胜率</Text>
        </View>
        <View className="stat-card">
          <Text className={`stat-val ${pnlColor(d?.month_pnl ?? 0)}`}>
            {d?.month_pnl ? (d.month_pnl >= 0 ? "+" : "") + d.month_pnl : (d?.month_trades ?? 0) + "笔"}
          </Text>
          <Text className="stat-label">{d?.month_pnl ? "本月盈亏" : "本月交易"}</Text>
        </View>
      </View>

      {/* ── 6宫格快捷入口 ── */}
      <View className="grid-actions">
        {[
          { emoji: "📝", name: "记录交易", url: "/pages/record-form/index", bg: "red" },
          { emoji: "📋", name: "交易复盘", url: "/pages/review-form/index?template=trade_post", bg: "orange" },
          { emoji: "📚", name: "知识库", url: "/pages/knowledge/index", bg: "blue" },
          { emoji: "💬", name: "AI 教练", url: "/pages/ai-coach/index", bg: "purple" },
          { emoji: "📈", name: "查看行情", url: "/pages/market/index", bg: "cyan" },
          { emoji: "💰", name: "我的持仓", url: "/pages/holdings/index", bg: "green" },
        ].map((item) => (
          <View key={item.name} className="grid-item" onClick={() => {
            if (item.url.includes("switchTab")) Taro.switchTab({ url: item.url });
            else Taro.navigateTo({ url: item.url });
          }}>
            <View className={`grid-icon ${item.bg}`}><Text>{item.emoji}</Text></View>
            <Text className="grid-name">{item.name}</Text>
          </View>
        ))}
      </View>

      {/* ── 学习进度（紧凑一行） ── */}
      {obStatus && !obStatus.personal_context_completed && !obStatus.onboarded && (
        <View className="compact-card" onClick={() => Taro.navigateTo({ url: "/pages/onboarding/index" })}>
          <Text className="cc-icon">🎯</Text>
          <Text className="cc-text">开始你的个人成长计划，建立第一份上下文</Text>
          <Text className="cc-go">&gt;</Text>
        </View>
      )}
      {obStatus && obStatus.onboarded && !obStatus.completed && (
        <View className="compact-card" onClick={() => Taro.navigateTo({ url: "/pages/learning/index" })}>
          <Text className="cc-icon">📖</Text>
          <View className="cc-mid">
            <Text className="cc-text">{obStatus.path_name} · Day {obStatus.current_day}/{obStatus.total_days}</Text>
            {todayTask && <Text className="cc-task">{todayTask.task_title}</Text>}
          </View>
          <Text className="cc-go">&gt;</Text>
        </View>
      )}

      {/* ── 每日任务 ── */}
      {tasks && (
        <View className="task-card">
          <View className="task-top">
            <Text className="task-title">每日任务</Text>
            <Text className="task-pct">{tasks.progress}%</Text>
          </View>
          <View className="task-bar"><View className="task-fill" style={{ width: `${tasks.progress}%` }} /></View>
          <View className="task-items">
            <Text className={`task-i ${tasks.recorded ? "done" : ""}`}>{tasks.recorded ? "✓" : "○"} 记录交易</Text>
            <Text className={`task-i ${tasks.reviewed ? "done" : ""}`}>{tasks.reviewed ? "✓" : "○"} 写复盘</Text>
            <Text className={`task-i ${tasks.analyzed ? "done" : ""}`}>{tasks.analyzed ? "✓" : "○"} 查看分析</Text>
          </View>
        </View>
      )}

      {/* ── AI 分析 ── */}
      <View className="ai-card" onClick={() => Taro.navigateTo({ url: "/pages/ai-coach/index" })}>
        <View className="ai-top">
          <Text className="ai-label">🤖 AI 分析</Text>
          <Text className="ai-go">详细分析 &gt;</Text>
        </View>
        <Text className={`ai-insight ${d?.ai_severity === "negative" ? "warn" : ""}`}>
          {d?.ai_suggestion || "加载中..."}
        </Text>
      </View>

      {/* ── 关注资讯 ── */}
      {news.length > 0 && (
        <View className="news-section">
          <Text className="news-header">关注资讯</Text>
          {news.slice(0, 5).map((n) => (
            <View key={n.id} className="news-row">
              <Text className="news-title">{n.title}</Text>
              {n.sentiment && (
                <Text className={`news-tag ${n.sentiment}`}>
                  {n.sentiment === "positive" ? "利好" : n.sentiment === "negative" ? "利空" : "中性"}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={{ height: "120px" }} />
    </ScrollView>
  );
}
