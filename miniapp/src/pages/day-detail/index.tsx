import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Trade {
  id: string; title: string; direction: string; symbol_name: string;
  pnl: number | null; reasons: string[]; emotion: string | null; time: string;
}
interface Review {
  id: string; did_right: string | null; did_wrong: string | null; next_plan: string | null; notes: string | null;
}
interface DayData {
  date: string;
  trades: Trade[];
  reviews: Review[];
  summary: { trade_count: number; total_pnl: number; review_count: number };
}

export default function DayDetail() {
  const router = useRouter();
  const date = router.params.date || "";
  const [data, setData] = useState<DayData | null>(null);

  useEffect(() => {
    if (date) {
      request<DayData>({ url: `/calendar/day?date=${date}` }).then(setData).catch(() => {});
    }
  }, [date]);

  if (!data) return <View style={{ padding: "40px", textAlign: "center" }}><Text>加载中...</Text></View>;

  const s = data.summary;

  return (
    <View className="day-detail">
      {/* Day Header */}
      <View className="day-header">
        <Text className="day-date">{date}</Text>
        <View className="day-summary">
          <View className="sum-item">
            <Text className={`sum-val ${s.total_pnl >= 0 ? "green" : "red"}`}>
              {s.total_pnl >= 0 ? "+" : ""}{s.total_pnl}
            </Text>
            <Text className="sum-label">盈亏</Text>
          </View>
          <View className="sum-item">
            <Text className="sum-val">{s.trade_count}</Text>
            <Text className="sum-label">交易</Text>
          </View>
          <View className="sum-item">
            <Text className="sum-val">{s.review_count}</Text>
            <Text className="sum-label">复盘</Text>
          </View>
        </View>
      </View>

      <ScrollView scrollY className="content">
        {/* Trades Section */}
        {data.trades.length > 0 && (
          <View className="section">
            <Text className="section-title">交易记录</Text>
            {data.trades.map((t) => (
              <View key={t.id} className="trade-item">
                <View className="trade-top">
                  <View>
                    <Text className={`trade-dir ${t.direction === "BUY" ? "buy" : "sell"}`}>
                      {t.direction === "BUY" ? "买入" : "卖出"}
                    </Text>
                    <Text className="trade-name">{t.symbol_name}</Text>
                    <Text className="trade-time">{t.time}</Text>
                  </View>
                  {t.pnl != null && (
                    <Text className={`trade-pnl ${t.pnl >= 0 ? "green" : "red"}`}>
                      {t.pnl >= 0 ? "+" : ""}{t.pnl}
                    </Text>
                  )}
                </View>
                <View className="trade-tags">
                  {t.reasons.map((r, i) => <Text key={i} className="tag">{r}</Text>)}
                  {t.emotion && <Text className="tag emotion">{t.emotion}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Reviews Section */}
        {data.reviews.length > 0 && (
          <View className="section">
            <Text className="section-title">复盘日记</Text>
            {data.reviews.map((r) => (
              <View key={r.id} className="review-item">
                {r.did_right && (
                  <View className="review-line right">
                    <Text className="line-label">做对了</Text>
                    <Text className="line-text">{r.did_right}</Text>
                  </View>
                )}
                {r.did_wrong && (
                  <View className="review-line wrong">
                    <Text className="line-label">做错了</Text>
                    <Text className="line-text">{r.did_wrong}</Text>
                  </View>
                )}
                {r.next_plan && (
                  <View className="review-line plan">
                    <Text className="line-label">下次</Text>
                    <Text className="line-text">{r.next_plan}</Text>
                  </View>
                )}
                {r.notes && <Text className="review-notes">{r.notes}</Text>}
              </View>
            ))}
          </View>
        )}

        {data.trades.length === 0 && data.reviews.length === 0 && (
          <View className="empty"><Text>当天无交易和复盘记录</Text></View>
        )}
      </ScrollView>
    </View>
  );
}
