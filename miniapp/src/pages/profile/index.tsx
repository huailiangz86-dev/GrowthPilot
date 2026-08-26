import { useEffect, useState } from "react";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface ProfileData {
  persona_type: string;
  trade_count: number;
  review_count: number;
  pattern_count: number;
  strengths: { title: string; description: string }[];
  weaknesses: { title: string; description: string }[];
  unlocked: boolean;
}

interface TimelineEvent {
  type: string;
  title: string;
  date: string;
  severity?: string;
  summary?: string;
  tags?: any[];
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    request<ProfileData>({ url: "/persona/profile" }).then(setProfile).catch(() => {});
    request<TimelineEvent[]>({ url: "/persona/timeline" }).then(setTimeline).catch(() => {});
  }, []);

  return (
    <View className="profile-page">
      <Text className="page-title">个人分析</Text>

      {/* Persona Card */}
      {profile && (
        <View className="persona-card">
          <Text className="persona-type">{profile.persona_type}</Text>
          <View className="persona-stats">
            <View className="stat">
              <Text className="stat-val">{profile.trade_count}</Text>
              <Text className="stat-label">交易</Text>
            </View>
            <View className="stat">
              <Text className="stat-val">{profile.review_count}</Text>
              <Text className="stat-label">复盘</Text>
            </View>
            <View className="stat">
              <Text className="stat-val">{profile.pattern_count}</Text>
              <Text className="stat-label">发现</Text>
            </View>
          </View>
        </View>
      )}

      {/* Strengths */}
      {profile && profile.strengths.length > 0 && (
        <View className="section">
          <Text className="section-title">你的优势</Text>
          {profile.strengths.map((s, i) => (
            <View key={i} className="insight-card positive">
              <Text className="insight-title">{s.title}</Text>
              <Text className="insight-desc">{s.description}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Weaknesses */}
      {profile && profile.weaknesses.length > 0 && (
        <View className="section">
          <Text className="section-title">成长方向</Text>
          {profile.weaknesses.map((w, i) => (
            <View key={i} className="insight-card negative">
              <Text className="insight-title">{w.title}</Text>
              <Text className="insight-desc">{w.description}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Growth Timeline */}
      <View className="section">
        <Text className="section-title">成长时间线</Text>
        {timeline.length === 0 ? (
          <Text className="hint">记录交易和复盘后生成成长轨迹</Text>
        ) : (
          <ScrollView scrollY className="timeline">
            {timeline.map((e, i) => (
              <View key={i} className={`tl-item ${e.type}`}>
                <View className="tl-dot" />
                <View className="tl-content">
                  <Text className="tl-title">{e.title}</Text>
                  <Text className="tl-date">{new Date(e.date).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</Text>
                  {e.summary && <Text className="tl-summary">{e.summary.slice(0, 60)}</Text>}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
