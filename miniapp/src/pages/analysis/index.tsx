import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

const TABS = ["统计", "模式", "情绪", "AI教练"];

export default function Analysis() {
  const [activeTab, setActiveTab] = useState(0);
  const [overview, setOverview] = useState<any>(null);
  const [buyStats, setBuyStats] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [emotionStats, setEmotionStats] = useState<any[]>([]);
  const [persona, setPersona] = useState<any>(null);

  useEffect(() => {
    request<any>({ url: "/stats/overview" }).then(setOverview).catch(() => {});
    request<any[]>({ url: "/tags/stats?category=buy_reason" }).then(setBuyStats).catch(() => {});
    request<any[]>({ url: "/patterns" }).then(setPatterns).catch(() => {});
    request<any[]>({ url: "/tags/stats?category=emotion" }).then(setEmotionStats).catch(() => {});
    request<any>({ url: "/persona/profile" }).then(setPersona).catch(() => {});
  }, []);

  return (
    <View className="analysis-page">
      {/* Sub Tabs */}
      <View className="sub-tabs">
        {TABS.map((t, i) => (
          <View key={t} className={`sub-tab ${activeTab === i ? "active" : ""}`} onClick={() => setActiveTab(i)}>
            <Text>{t}</Text>
          </View>
        ))}
      </View>

      <ScrollView scrollY className="content">
        {/* 统计 */}
        {activeTab === 0 && (
          <View className="tab-content">
            {overview && (
              <View className="stat-cards">
                <View className="stat-card"><Text className="val">{overview.win_rate ?? "--"}%</Text><Text className="label">胜率</Text></View>
                <View className="stat-card"><Text className="val">{overview.total_pnl ?? 0}</Text><Text className="label">总盈亏</Text></View>
                <View className="stat-card"><Text className="val">{overview.completed_trades ?? 0}</Text><Text className="label">已完成</Text></View>
              </View>
            )}
            <View className="section">
              <Text className="section-title">买入原因胜率</Text>
              {buyStats.length === 0 ? <Text className="hint">10 笔交易后解锁</Text> :
                buyStats.map((s) => (
                  <View key={s.tag_value} className="bar-row">
                    <Text className="bar-label">{s.tag_value}</Text>
                    <View className="bar-bg"><View className={`bar ${s.win_rate >= 50 ? "green" : "red"}`} style={{ width: `${s.win_rate}%` }} /></View>
                    <Text className={`bar-pct ${s.win_rate >= 50 ? "green" : "red"}`}>{s.win_rate}%</Text>
                  </View>
                ))
              }
            </View>
          </View>
        )}

        {/* 模式 */}
        {activeTab === 1 && (
          <View className="tab-content">
            {patterns.length === 0 ? <Text className="hint">30 笔交易后解锁 AI 模式发现</Text> :
              patterns.map((p) => (
                <View key={p.id} className={`pattern-card ${p.severity}`}>
                  <Text className="pattern-title">{p.title}</Text>
                  <Text className="pattern-desc">{p.description}</Text>
                </View>
              ))
            }
          </View>
        )}

        {/* 情绪 */}
        {activeTab === 2 && (
          <View className="tab-content">
            <Text className="section-title">情绪与胜率</Text>
            {emotionStats.length === 0 ? <Text className="hint">记录交易时选择情绪标签</Text> :
              emotionStats.map((s) => (
                <View key={s.tag_value} className="bar-row">
                  <Text className="bar-label">{s.tag_value}</Text>
                  <View className="bar-bg"><View className={`bar ${s.win_rate >= 50 ? "green" : "red"}`} style={{ width: `${s.win_rate}%` }} /></View>
                  <Text className={`bar-pct ${s.win_rate >= 50 ? "green" : "red"}`}>{s.win_rate}%</Text>
                </View>
              ))
            }
          </View>
        )}

        {/* AI 教练 / 交易风格 */}
        {activeTab === 3 && (
          <View className="tab-content">
            {persona?.unlocked ? (
              <>
                {/* Style Card */}
                <View className="style-card">
                  <Text className="style-type">{persona.style_type}</Text>
                  <Text className="style-desc">{persona.style_description}</Text>
                </View>

                {/* Radar Chart (bar-based for MVP) */}
                <View className="radar-section">
                  <Text className="section-title">交易者 DNA</Text>
                  {persona.dimension_labels && Object.entries(persona.dimensions).map(([key, val]: [string, any]) => (
                    <View key={key} className="dim-row">
                      <Text className="dim-label">{persona.dimension_labels[key] || key}</Text>
                      <View className="dim-bar-bg">
                        <View className="dim-bar" style={{ width: `${val}%` }} />
                      </View>
                      <Text className="dim-val">{val}</Text>
                    </View>
                  ))}
                </View>

                {/* Strengths */}
                {persona.strengths?.length > 0 && (
                  <View className="section">
                    <Text className="section-title">核心优势</Text>
                    {persona.strengths.map((s: any, i: number) => (
                      <View key={i} className="trait-item up">
                        <Text className="trait-name">{s.dim}</Text>
                        <Text className="trait-score">{s.score}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Improvements */}
                {persona.improvements?.length > 0 && (
                  <View className="section">
                    <Text className="section-title">成长方向</Text>
                    {persona.improvements.map((s: any, i: number) => (
                      <View key={i} className="trait-item down">
                        <Text className="trait-name">{s.dim}</Text>
                        <Text className="trait-score">{s.score}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View className="stats-row">
                  <Text>{persona.trade_count} 笔交易</Text>
                  <Text>{persona.review_count} 次复盘</Text>
                </View>
              </>
            ) : (
              <View className="unlock-hint">
                <Text className="unlock-icon">🔒</Text>
                <Text className="unlock-text">{persona?.message || "记录 20 笔交易解锁交易风格分析"}</Text>
                <Text className="unlock-progress">{persona?.trade_count || 0} / {persona?.required || 20}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
