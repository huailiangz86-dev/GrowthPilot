import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface KlineItem { date: string; open: number; high: number; low: number; close: number; volume: number; }
interface KlineData { symbol: string; name: string; klines: KlineItem[]; trade_date: string | null; }

export default function RecordDetail() {
  const router = useRouter();
  const recordId = router.params.id || "";
  const [record, setRecord] = useState<any>(null);
  const [kline, setKline] = useState<KlineData | null>(null);
  const [period, setPeriod] = useState("1d");

  useEffect(() => {
    if (recordId) request<any>({ url: `/records/${recordId}` }).then(setRecord).catch(() => {});
  }, [recordId]);

  useEffect(() => {
    if (!record || record.scene === "expense") return;
    const symbolName = record.content?.symbol_name || record.title?.split(" ")[0] || "";
    const mkt = record.content?.market || "A";
    request<any[]>({ url: `/trades/search-symbol?q=${encodeURIComponent(symbolName)}&market=${mkt}&limit=1` })
      .then((results) => {
        if (results.length > 0) {
          const sym = results[0].symbol;
          const tradeDate = record.occurred_at?.slice(0, 10) || "";
          request<KlineData>({ url: `/kline?symbol=${sym}&period=${period}&count=60&trade_date=${tradeDate}` })
            .then(setKline).catch(() => {});
        }
      }).catch(() => {});
  }, [record, period]);

  if (!record) return <View style={{ padding: "40px", textAlign: "center" }}><Text>加载中...</Text></View>;

  const pnl = record.content?.pnl;
  const reasons = (record.tags || []).filter((t: any) => t.category !== "emotion").map((t: any) => t.value);
  const emotion = (record.tags || []).find((t: any) => t.category === "emotion")?.value;
  const tradeDate = record.occurred_at?.slice(0, 10) || "";

  return (
    <ScrollView scrollY className="detail-page">
      {/* Header: title + pnl inline */}
      <View className="header">
        <View className="header-left">
          <Text className="header-title">{record.title}</Text>
          <Text className="header-date">{new Date(record.occurred_at).toLocaleString("zh-CN")}</Text>
        </View>
        {pnl != null && (
          <Text className={`header-pnl ${pnl >= 0 ? "green" : "red"}`}>
            {pnl >= 0 ? "+" : ""}{pnl}
          </Text>
        )}
      </View>

      {/* Tags inline */}
      <View className="tags-bar">
        {reasons.map((t: string, i: number) => <Text key={i} className="tag">{t}</Text>)}
        {emotion && <Text className="tag emotion">{emotion}</Text>}
      </View>

      {/* K-Line (main content) */}
      {kline && kline.klines.length > 0 && (
        <View className="kline-section">
          <View className="kline-header">
            <Text className="kline-name">{kline.name}</Text>
            <View className="period-tabs">
              {["1d", "1w", "1M"].map((p) => (
                <Text key={p} className={`period-tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
                  {p === "1d" ? "日K" : p === "1w" ? "周K" : "月K"}
                </Text>
              ))}
            </View>
          </View>

          <View className="kline-chart">
            {kline.klines.slice(-30).map((k, i) => {
              const allVisible = kline.klines.slice(-30);
              const maxH = Math.max(...allVisible.map((x) => x.high));
              const minL = Math.min(...allVisible.map((x) => x.low));
              const range = maxH - minL || 1;
              const isUp = k.close >= k.open;
              const bodyTop = ((maxH - Math.max(k.open, k.close)) / range) * 100;
              const bodyH = Math.max(2, (Math.abs(k.close - k.open) / range) * 100);
              const wickTop = ((maxH - k.high) / range) * 100;
              const wickH = ((k.high - k.low) / range) * 100;
              const isTradeDay = k.date?.slice(0, 10) === tradeDate;

              return (
                <View key={i} className={`candle ${isTradeDay ? "trade-day" : ""}`}>
                  <View className="wick" style={{ top: `${wickTop}%`, height: `${wickH}%`, background: isUp ? "#ff4d4f" : "#52c41a" }} />
                  <View className={`body ${isUp ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyH}%` }} />
                  {isTradeDay && <View className="marker" />}
                </View>
              );
            })}
          </View>

          <View className="kline-footer">
            <Text className="kline-label">最新: {kline.klines[kline.klines.length - 1].close}</Text>
            <Text className="kline-label">▲ = 你的交易日</Text>
          </View>
        </View>
      )}

      {/* Review */}
      {(record.content?.did_right || record.content?.did_wrong) && (
        <View className="review-section">
          <Text className="section-title">复盘笔记</Text>
          {record.content.did_right && (
            <View className="review-line right">
              <Text className="label">做对了</Text>
              <Text className="text">{record.content.did_right}</Text>
            </View>
          )}
          {record.content.did_wrong && (
            <View className="review-line wrong">
              <Text className="label">做错了</Text>
              <Text className="text">{record.content.did_wrong}</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: "60px" }} />
    </ScrollView>
  );
}
