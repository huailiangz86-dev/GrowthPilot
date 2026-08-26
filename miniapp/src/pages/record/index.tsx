import { useCallback, useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

const CATEGORIES = [
  { label: "全部", key: "all" },
  { label: "交易", key: "trading" },
  { label: "复盘", key: "review" },
  { label: "加密", key: "crypto" },
  { label: "基金", key: "fund" },
  { label: "开销", key: "expense" },
];
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface RecordItem {
  id: string; title: string; content: any; tags: any[]; emotion: string | null;
  occurred_at: string; scene: string; _type: "record";
}
interface ReviewItem {
  id: string; template: string; did_right: string | null; did_wrong: string | null;
  answers: any; review_date: string; created_at: string; scene: string; _type: "review";
}
type ListItem = RecordItem | ReviewItem;

interface DayData { date: string; trades: number; pnl: number; reviews: number; has_data: boolean; }

const TEMPLATE_NAMES: Record<string, string> = {
  livermore: "利弗莫尔法", dalio: "达利奥法", douglas: "道格拉斯法", seykota: "塞科塔法",
  minervini: "米勒维尼法", elder: "埃尔德法", tharp: "范·撒普法",
  yangjia: "养家心法", fengliu: "冯柳·弱者体系", xuxiang: "徐翔·涨停复盘",
  linyuan: "林园·价值复盘", duanyongping: "段永平·商业模式",
  chenxiaoqun: "陈小群·龙头战法", zhangmengzhu: "章盟主·板块作战",
  zhaolaoge: "赵老哥·打板心法", geweidong: "葛卫东·攻守兼备",
  fangxinxia: "方新侠·大资金趋势", ruihexian: "瑞鹤仙·强势股战法",
  daily_review: "每日复盘", weekly_review: "周度复盘", trade_post: "交易复盘",
};

export default function Record() {
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [items, setItems] = useState<ListItem[]>([]);
  const [activeKey, setActiveKey] = useState("all");
  const [total, setTotal] = useState(0);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<DayData[]>([]);
  const [monthPnl, setMonthPnl] = useState(0);

  const loadList = useCallback(async () => {
    const merged: ListItem[] = [];

    if (activeKey !== "review") {
      // Load trade records
      const sceneQ = activeKey === "all" ? "" : `&scene=${activeKey}`;
      try {
        const data = await request<any>({ url: `/records?page_size=50${sceneQ}` });
        for (const r of data.items || []) {
          merged.push({ ...r, _type: "record" as const });
        }
      } catch { /* handled */ }
    }

    if (activeKey === "all" || activeKey === "review") {
      // Load reviews
      try {
        const data = await request<any>({ url: "/reviews?page_size=50" });
        for (const r of data.items || []) {
          merged.push({ ...r, _type: "review" as const });
        }
      } catch { /* handled */ }
    }

    // Sort by date descending
    merged.sort((a, b) => {
      const da = a._type === "record" ? a.occurred_at : (a as ReviewItem).created_at;
      const db = b._type === "record" ? b.occurred_at : (b as ReviewItem).created_at;
      return new Date(db).getTime() - new Date(da).getTime();
    });

    setItems(merged);
    setTotal(merged.length);
  }, [activeKey]);

  const loadCalendar = async () => {
    try {
      const data = await request<any>({ url: `/calendar/month?year=${year}&month=${month}&market=ALL` });
      setDays(data.days || []);
      setMonthPnl(data.summary?.month_pnl || 0);
    } catch { /* handled */ }
  };

  useEffect(() => { if (viewMode === "list") loadList(); else loadCalendar(); }, [viewMode, activeKey, year, month]);
  useDidShow(() => { if (viewMode === "list") loadList(); else loadCalendar(); });

  const pnlColor = (v: number) => v > 0 ? "up" : v < 0 ? "down" : "";
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const firstDayOffset = (() => { const d = new Date(year, month - 1, 1).getDay(); return d === 0 ? 6 : d - 1; })();

  const renderRecord = (r: RecordItem) => {
    const pnl = r.content?.pnl;
    const reasons = (r.tags || []).filter((t: any) => t.category !== "emotion").map((t: any) => t.value);
    const emotion = (r.tags || []).find((t: any) => t.category === "emotion")?.value;
    const date = new Date(r.occurred_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const sceneLabel = { trading: "股票", crypto: "加密", fund: "基金", expense: "开销" }[r.scene] || r.scene;

    return (
      <View key={r.id} className="card" onClick={() => Taro.navigateTo({ url: `/pages/record-detail/index?id=${r.id}` })}>
        <View className="card-top">
          <View>
            <View className="card-title-row">
              <Text className="scene-badge">{sceneLabel}</Text>
              <Text className="card-title">{r.title}</Text>
            </View>
            <Text className="card-date">{date}</Text>
          </View>
          {pnl != null ? (
            <Text className={`pnl ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}{pnl}</Text>
          ) : r.scene === "expense" ? (
            <Text className="pnl down">-{r.content?.amount || 0}</Text>
          ) : null}
        </View>
        <View className="card-tags">
          {reasons.slice(0, 3).map((t: string, i: number) => <Text key={i} className="tag">{t}</Text>)}
          {emotion && <Text className="tag emotion">{emotion}</Text>}
        </View>
      </View>
    );
  };

  const renderReview = (r: ReviewItem) => {
    const tplName = TEMPLATE_NAMES[r.template] || r.template;
    const date = new Date(r.created_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const summary = r.did_right || r.did_wrong || "";

    return (
      <View key={`rv-${r.id}`} className="card review-card" onClick={() => Taro.navigateTo({ url: `/pages/review-detail/index?id=${r.id}` })}>
        <View className="card-top">
          <View>
            <View className="card-title-row">
              <Text className="scene-badge review-badge">复盘</Text>
              <Text className="card-title">{tplName}</Text>
            </View>
            <Text className="card-date">{date}</Text>
          </View>
        </View>
        {summary && (
          <View className="card-tags">
            <Text className="review-summary">{summary.length > 40 ? summary.slice(0, 40) + "..." : summary}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="record-page">
      <View className="view-switch">
        <View className={`switch-btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>
          <Text>列表</Text>
        </View>
        <View className={`switch-btn ${viewMode === "calendar" ? "active" : ""}`} onClick={() => setViewMode("calendar")}>
          <Text>日历</Text>
        </View>
      </View>

      {viewMode === "list" ? (
        <>
          <View className="cat-tabs">
            {CATEGORIES.map((c) => (
              <View key={c.key} className={`cat-tab ${activeKey === c.key ? "active" : ""}`}
                onClick={() => setActiveKey(c.key)}>
                <Text>{c.label}</Text>
              </View>
            ))}
          </View>

          <ScrollView scrollY className="list">
            {items.length === 0 ? (
              <View className="empty"><Text className="empty-text">暂无记录</Text></View>
            ) : (
              <>
                <Text className="total">{total} 条记录</Text>
                {items.map((item) =>
                  item._type === "record" ? renderRecord(item as RecordItem) : renderReview(item as ReviewItem)
                )}
              </>
            )}
          </ScrollView>
        </>
      ) : (
        <View className="calendar-view">
          <View className="month-nav">
            <Text className="nav-arrow" onClick={() => { if (month === 1) { setYear(year - 1); setMonth(12); } else setMonth(month - 1); }}>&lt;</Text>
            <View className="month-center">
              <Text className="month-text">{year}年{month}月</Text>
              <Text className={`month-pnl ${pnlColor(monthPnl)}`}>
                {monthPnl >= 0 ? "+" : ""}{monthPnl.toFixed(0)}
              </Text>
            </View>
            <Text className="nav-arrow" onClick={() => { if (month === 12) { setYear(year + 1); setMonth(1); } else setMonth(month + 1); }}>&gt;</Text>
          </View>

          <View className="weekdays">{WEEKDAYS.map((w) => <Text key={w} className="wd">{w}</Text>)}</View>

          <View className="day-grid">
            {Array.from({ length: firstDayOffset }).map((_, i) => <View key={`e${i}`} className="day-cell empty" />)}
            {days.map((d) => {
              const dayNum = parseInt(d.date.split("-")[2]);
              return (
                <View key={d.date}
                  className={`day-cell ${d.has_data ? "has-data" : ""} ${d.date === todayStr ? "today" : ""} ${d.pnl > 0 ? "profit" : d.pnl < 0 ? "loss" : ""}`}
                  onClick={() => Taro.navigateTo({ url: `/pages/day-detail/index?date=${d.date}` })}>
                  <Text className={`day-num ${d.date === todayStr ? "today-num" : ""}`}>{dayNum}</Text>
                  {d.trades > 0 && <Text className={`day-pnl ${pnlColor(d.pnl)}`}>{d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(0)}</Text>}
                  {d.reviews > 0 && <View className="review-dot" />}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
