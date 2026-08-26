import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface DayData { date: string; trades: number; pnl: number; wins: number; losses: number; reviews: number; has_data: boolean; }
interface MonthData { days: DayData[]; summary: { month_pnl: number; month_trades: number; currency: string; market: string; }; }

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const MARKETS = [
  { label: "全部", value: "ALL" },
  { label: "A股", value: "A" },
  { label: "港股", value: "HK" },
  { label: "美股", value: "US" },
];

// 国内: 红=涨/盈, 绿=跌/亏
const pnlColor = (val: number) => val > 0 ? "up" : val < 0 ? "down" : "";

export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<DayData[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [market, setMarket] = useState("ALL");

  const load = async () => {
    try {
      const data = await request<MonthData>({ url: `/calendar/month?year=${year}&month=${month}&market=${market}` });
      setDays(data.days);
      setSummary(data.summary);
    } catch { setDays([]); }
  };

  useEffect(() => { load(); }, [year, month, market]);

  const prevMonth = () => { if (month === 1) { setYear(year - 1); setMonth(12); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setYear(year + 1); setMonth(1); } else setMonth(month + 1); };

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const cur = summary?.currency || "¥";

  return (
    <View className="calendar-page">
      {/* Market Tabs */}
      <View className="market-tabs">
        {MARKETS.map((m) => (
          <View key={m.value} className={`market-tab ${market === m.value ? "active" : ""}`} onClick={() => setMarket(m.value)}>
            <Text>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* Month Header + Summary */}
      <View className="month-header">
        <Text className="nav-btn" onClick={prevMonth}>&lt;</Text>
        <View className="month-info">
          <Text className="month-title">{year}年{month}月</Text>
          {summary && (
            <View className="month-summary">
              <Text className={`month-pnl ${pnlColor(summary.month_pnl)}`}>
                {market === "ALL" ? "≈¥" : cur}{summary.month_pnl >= 0 ? "+" : ""}{summary.month_pnl.toFixed(0)}
              </Text>
              <Text className="month-trades">{summary.month_trades}笔交易</Text>
            </View>
          )}
        </View>
        <Text className="nav-btn" onClick={nextMonth}>&gt;</Text>
      </View>

      {/* Weekdays */}
      <View className="weekdays">
        {WEEKDAYS.map((w) => <Text key={w} className="weekday">{w}</Text>)}
      </View>

      {/* Day Grid */}
      <View className="day-grid">
        {Array.from({ length: offset }).map((_, i) => <View key={`e-${i}`} className="day-cell empty" />)}
        {days.map((d) => {
          const dayNum = parseInt(d.date.split("-")[2]);
          const isToday = d.date === todayStr;

          return (
            <View key={d.date}
              className={`day-cell ${d.has_data ? "has-data" : ""} ${isToday ? "today" : ""} ${d.pnl > 0 ? "profit-day" : d.pnl < 0 ? "loss-day" : ""}`}
              onClick={() => Taro.navigateTo({ url: `/pages/day-detail/index?date=${d.date}` })}>
              <Text className={`day-num ${isToday ? "today-num" : ""}`}>{dayNum}</Text>
              {d.trades > 0 && (
                <Text className={`day-pnl ${pnlColor(d.pnl)}`}>
                  {d.pnl >= 0 ? "+" : ""}{Math.abs(d.pnl) > 999 ? (d.pnl / 1000).toFixed(1) + "k" : d.pnl.toFixed(0)}
                </Text>
              )}
              {d.trades > 0 && <Text className="day-trades">{d.trades}笔</Text>}
              {d.reviews > 0 && <View className="review-dot" />}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View className="legend">
        <View className="legend-item"><View className="dot up-bg" /><Text>盈利日</Text></View>
        <View className="legend-item"><View className="dot down-bg" /><Text>亏损日</Text></View>
        <View className="legend-item"><View className="review-dot" /><Text>有复盘</Text></View>
        {market === "ALL" && <View className="legend-item"><Text className="hint">≈¥ 已按汇率折算</Text></View>}
      </View>
    </View>
  );
}
