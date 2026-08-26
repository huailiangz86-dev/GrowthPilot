import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface MonthData {
  year: number; month: number; trade_count: number; win_rate: number;
  total_pnl: number; review_count: number; learn_count: number;
  top_emotion: string; emotion_dist: Record<string, number>;
}
interface ReportData {
  current: MonthData; previous: MonthData;
  deltas: { trade_count: number; win_rate: number; total_pnl: number; review_count: number; learn_count: number };
}

export default function GrowthReport() {
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    request<ReportData>({ url: "/growth-report/monthly" }).then(setReport).catch(() => {});
  }, []);

  if (!report) return <View className="report-page"><Text className="loading">加载中...</Text></View>;

  const { current: c, previous: p, deltas: d } = report;
  const arrow = (v: number) => v > 0 ? "↑" : v < 0 ? "↓" : "→";
  const deltaColor = (v: number) => v > 0 ? "up" : v < 0 ? "down" : "";
  const pnlColor = (v: number) => v > 0 ? "up" : v < 0 ? "down" : "";

  return (
    <ScrollView scrollY className="report-page">
      <View className="report-header">
        <Text className="report-title">{c.year}年{c.month}月 成长报告</Text>
        <Text className="report-sub">与上月对比</Text>
      </View>

      {/* Key metrics */}
      <View className="metrics">
        <View className="metric-card">
          <Text className="metric-value">{c.trade_count}</Text>
          <Text className="metric-label">交易笔数</Text>
          <Text className={`metric-delta ${deltaColor(d.trade_count)}`}>
            {arrow(d.trade_count)} {Math.abs(d.trade_count)}%
          </Text>
        </View>
        <View className="metric-card">
          <Text className={`metric-value ${pnlColor(c.win_rate - 50)}`}>{c.win_rate}%</Text>
          <Text className="metric-label">胜率</Text>
          <Text className={`metric-delta ${deltaColor(d.win_rate)}`}>
            {arrow(d.win_rate)} {Math.abs(d.win_rate)}%
          </Text>
        </View>
        <View className="metric-card">
          <Text className={`metric-value ${pnlColor(c.total_pnl)}`}>
            {c.total_pnl > 0 ? "+" : ""}{c.total_pnl}
          </Text>
          <Text className="metric-label">总盈亏</Text>
          <Text className={`metric-delta ${deltaColor(d.total_pnl)}`}>
            {arrow(d.total_pnl)} {Math.abs(d.total_pnl)}
          </Text>
        </View>
      </View>

      {/* Learning & Review */}
      <View className="section">
        <Text className="section-title">学习与复盘</Text>
        <View className="progress-rows">
          <View className="progress-row">
            <Text className="pr-icon">📋</Text>
            <View className="pr-info">
              <Text className="pr-label">复盘次数</Text>
              <View className="pr-bar-wrap">
                <View className="pr-bar" style={{ width: `${Math.min(c.review_count * 10, 100)}%` }} />
              </View>
            </View>
            <View className="pr-nums">
              <Text className="pr-value">{c.review_count}次</Text>
              <Text className={`pr-delta ${deltaColor(d.review_count)}`}>
                {arrow(d.review_count)}{Math.abs(d.review_count)}%
              </Text>
            </View>
          </View>
          <View className="progress-row">
            <Text className="pr-icon">📖</Text>
            <View className="pr-info">
              <Text className="pr-label">学习知识</Text>
              <View className="pr-bar-wrap">
                <View className="pr-bar blue" style={{ width: `${Math.min(c.learn_count * 5, 100)}%` }} />
              </View>
            </View>
            <View className="pr-nums">
              <Text className="pr-value">{c.learn_count}篇</Text>
              <Text className={`pr-delta ${deltaColor(d.learn_count)}`}>
                {arrow(d.learn_count)}{Math.abs(d.learn_count)}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Emotion */}
      <View className="section">
        <Text className="section-title">情绪分布</Text>
        <Text className="emotion-main">本月主导情绪：{c.top_emotion}</Text>
        <View className="emotion-bars">
          {Object.entries(c.emotion_dist).sort((a, b) => b[1] - a[1]).map(([emotion, count]) => (
            <View key={emotion} className="emotion-row">
              <Text className="emo-name">{emotion}</Text>
              <View className="emo-bar-wrap">
                <View className="emo-bar" style={{ width: `${Math.min((count / c.trade_count) * 100, 100)}%` }} />
              </View>
              <Text className="emo-count">{count}次</Text>
            </View>
          ))}
        </View>
      </View>

      {/* vs Last Month */}
      <View className="section">
        <Text className="section-title">月度对比</Text>
        <View className="compare-table">
          <View className="compare-header">
            <Text className="ch-label">指标</Text>
            <Text className="ch-prev">{p.month}月</Text>
            <Text className="ch-cur">{c.month}月</Text>
            <Text className="ch-delta">变化</Text>
          </View>
          {[
            { label: "交易笔数", prev: p.trade_count, cur: c.trade_count, delta: `${d.trade_count > 0 ? "+" : ""}${d.trade_count}%` },
            { label: "胜率", prev: `${p.win_rate}%`, cur: `${c.win_rate}%`, delta: `${d.win_rate > 0 ? "+" : ""}${d.win_rate}%` },
            { label: "总盈亏", prev: p.total_pnl, cur: c.total_pnl, delta: d.total_pnl },
            { label: "复盘次数", prev: p.review_count, cur: c.review_count, delta: `${d.review_count > 0 ? "+" : ""}${d.review_count}%` },
            { label: "学习篇数", prev: p.learn_count, cur: c.learn_count, delta: `${d.learn_count > 0 ? "+" : ""}${d.learn_count}%` },
          ].map((row) => (
            <View key={row.label} className="compare-row">
              <Text className="cr-label">{row.label}</Text>
              <Text className="cr-prev">{row.prev}</Text>
              <Text className="cr-cur">{row.cur}</Text>
              <Text className={`cr-delta ${typeof row.delta === "number" ? pnlColor(row.delta) : ""}`}>{row.delta}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="disclaimer">
        <Text>成长报告基于你的使用数据自动生成，持续记录和复盘将获得更准确的分析。</Text>
      </View>

      <View style={{ height: "80px" }} />
    </ScrollView>
  );
}
