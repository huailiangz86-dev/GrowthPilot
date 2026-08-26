import { useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface OnboardingStatus {
  completed: boolean; onboarded: boolean; current_day: number;
  path_id: string | null; path_name: string | null; total_days: number; completed_days: number[];
}
interface DayTask { day: number; type: string; title: string; description: string; article_title: string; }
interface PathDetail {
  id: string; name: string; description: string; total_days: number;
  stages: { name: string; days: DayTask[] }[];
}

const TYPE_ICON: Record<string, string> = { read: "📖", review: "📋", record: "📝", ai: "🤖" };
const TYPE_LABEL: Record<string, string> = { read: "阅读", review: "复盘", record: "实践", ai: "AI教练" };

export default function Learning() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [path, setPath] = useState<PathDetail | null>(null);
  const [articleMap, setArticleMap] = useState<Record<string, string>>({}); // title → id

  const load = () => {
    request<OnboardingStatus>({ url: "/onboarding/status" })
      .then((s) => {
        setStatus(s);
        if (s.onboarded && s.path_id) {
          request<PathDetail>({ url: `/onboarding/path/${s.path_id}` })
            .then((p) => {
              setPath(p);
              // Batch resolve all article titles to IDs
              const titles = p.stages.flatMap((st) => st.days.filter((d) => d.type === "read" && d.article_title).map((d) => d.article_title));
              if (titles.length > 0) {
                request<Record<string, string>>({ url: "/knowledge-base/resolve-titles", method: "POST", data: { titles } })
                  .then(setArticleMap).catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  };

  useEffect(load, []);
  useDidShow(load);

  const goTask = (day: DayTask) => {
    if (day.type === "review") {
      Taro.navigateTo({ url: "/pages/review-form/index?template=trade_post" });
    } else if (day.type === "record") {
      Taro.navigateTo({ url: "/pages/record-form/index" });
    } else if (day.type === "ai") {
      Taro.navigateTo({ url: "/pages/ai-coach/index" });
    } else if (day.type === "read") {
      const articleId = articleMap[day.article_title];
      if (articleId) {
        Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${articleId}` });
      } else {
        Taro.navigateTo({ url: "/pages/knowledge/index" });
      }
    }
  };

  const completeAndNext = async (dayNum: number) => {
    try {
      await request({ url: "/onboarding/complete-day", method: "POST" });
      Taro.showToast({ title: `Day ${dayNum} 完成！`, icon: "success" });
      load();
    } catch { /* handled */ }
  };

  if (!status || !status.onboarded) {
    return (
      <View className="learning-page">
        <View className="empty-state">
          <Text className="empty-icon">📚</Text>
          <Text className="empty-title">还没有学习计划</Text>
          <Text className="empty-desc">完成评估，获取专属学习路径</Text>
          <View className="empty-btn" onClick={() => Taro.navigateTo({ url: "/pages/onboarding/index" })}>
            <Text className="empty-btn-text">开始评估</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!path) return <View className="learning-page"><Text className="loading">加载中...</Text></View>;

  const completedSet = new Set(status.completed_days);
  const currentDay = status.current_day;
  const progress = Math.round((completedSet.size / status.total_days) * 100);

  return (
    <ScrollView scrollY className="learning-page">
      <View className="lp-header">
        <Text className="lp-name">{path.name}</Text>
        <Text className="lp-desc">{path.description}</Text>
        <View className="lp-progress">
          <View className="lp-bar"><View className="lp-fill" style={{ width: `${progress}%` }} /></View>
          <Text className="lp-pct">{progress}% · Day {currentDay}/{status.total_days}</Text>
        </View>
      </View>

      {/* Today's task highlight */}
      {!status.completed && path.stages.map((st) => st.days).flat().find((d) => d.day === currentDay) && (() => {
        const todayDay = path.stages.map((st) => st.days).flat().find((d) => d.day === currentDay)!;
        return (
          <View className="today-card">
            <View className="today-top">
              <Text className="today-label">今日任务</Text>
              <Text className="today-day">Day {currentDay}</Text>
            </View>
            <Text className="today-title">{todayDay.title}</Text>
            <Text className="today-desc">{todayDay.description}</Text>
            <View className="today-actions">
              <View className="today-go" onClick={() => goTask(todayDay)}>
                <Text className="today-go-text">{TYPE_ICON[todayDay.type]} 开始{TYPE_LABEL[todayDay.type]}</Text>
              </View>
              <View className="today-done" onClick={() => completeAndNext(currentDay)}>
                <Text className="today-done-text">✓ 完成</Text>
              </View>
            </View>
          </View>
        );
      })()}

      {status.completed && (
        <View className="complete-banner">
          <Text className="complete-icon">🎉</Text>
          <Text className="complete-text">恭喜完成全部学习计划！</Text>
        </View>
      )}

      {/* Stages */}
      {path.stages.map((stage, si) => {
        const stageCompleted = stage.days.every((d) => completedSet.has(d.day));
        const stageCurrent = stage.days.some((d) => d.day === currentDay);
        return (
          <View key={si} className="stage">
            <View className="stage-header">
              <View className={`stage-dot ${stageCompleted ? "done" : stageCurrent ? "current" : ""}`} />
              <Text className={`stage-name ${stageCompleted ? "done" : ""}`}>
                阶段{si + 1}：{stage.name}
              </Text>
              <Text className="stage-count">
                {stage.days.filter((d) => completedSet.has(d.day)).length}/{stage.days.length}
              </Text>
            </View>

            <View className="stage-days">
              {stage.days.map((d) => {
                const done = completedSet.has(d.day);
                const isCurrent = d.day === currentDay && !status.completed;
                return (
                  <View key={d.day} className={`day-item ${done ? "done" : ""} ${isCurrent ? "current" : ""}`}
                    onClick={() => goTask(d)}>
                    <View className={`day-num ${done ? "done" : isCurrent ? "current" : ""}`}>
                      <Text>{done ? "✓" : d.day}</Text>
                    </View>
                    <View className="day-info">
                      <Text className="day-title">{d.title}</Text>
                      <Text className="day-desc">{d.description}</Text>
                    </View>
                    <Text className="day-type">{TYPE_ICON[d.type]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <View style={{ height: "80px" }} />
    </ScrollView>
  );
}
