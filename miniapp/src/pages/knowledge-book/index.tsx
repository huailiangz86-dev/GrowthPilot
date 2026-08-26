import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Article { id: string; title: string; summary: string; author: string; cover_emoji: string; reading_time_min: number; }

export default function KnowledgeBook() {
  const router = useRouter();
  const bookName = decodeURIComponent(router.params.book || "");

  const [chapters, setChapters] = useState<Article[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!bookName) return;
    request<{ items: Article[] }>({ url: "/knowledge-base/articles", data: { category: "classic", keyword: bookName, page_size: 200 } })
      .then((res) => {
        // Filter exact book match and sort
        const matched = (res?.items || []).filter((a) => a.title.startsWith(`《${bookName}》`));
        setChapters(matched);
        // Fetch reading progress for all chapters
        if (matched.length > 0) {
          const ids = matched.map((a) => a.id).join(",");
          request<Record<string, string>>({ url: `/knowledge-base/reading-progress?article_ids=${ids}` })
            .then(setProgressMap)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [bookName]);

  const totalTime = chapters.reduce((s, c) => s + c.reading_time_min, 0);
  const completedCount = chapters.filter((c) => progressMap[c.id] === "completed").length;
  const author = chapters[0]?.author || "";
  const emoji = chapters[0]?.cover_emoji || "📖";
  // Get first chapter's summary as book intro
  const firstSummary = chapters[0]?.summary || "";

  return (
    <ScrollView scrollY className="book-page">
      {/* Book Cover */}
      <View className="cover">
        <View className="cover-icon"><Text>{emoji}</Text></View>
        <Text className="cover-title">《{bookName}》</Text>
        <Text className="cover-author">{author}</Text>
        <View className="cover-stats">
          <View className="stat">
            <Text className="stat-num">{chapters.length}</Text>
            <Text className="stat-label">章节</Text>
          </View>
          <View className="stat-divider" />
          <View className="stat">
            <Text className="stat-num">{totalTime}</Text>
            <Text className="stat-label">分钟</Text>
          </View>
          <View className="stat-divider" />
          <View className="stat">
            <Text className="stat-num">{completedCount}/{chapters.length}</Text>
            <Text className="stat-label">已读</Text>
          </View>
        </View>
      </View>

      {/* Start Reading Button */}
      {chapters.length > 0 && (
        <View className="start-btn" onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${chapters[0].id}&book=${encodeURIComponent(bookName)}` })}>
          <Text className="start-text">开始阅读</Text>
        </View>
      )}

      {/* Table of Contents */}
      <View className="toc">
        <Text className="toc-title">目录</Text>
        {chapters.map((ch, idx) => {
          const chTitle = ch.title.replace(/^《.+?》/, "").trim();
          return (
            <View key={ch.id} className={`toc-item ${progressMap[ch.id] === "completed" ? "completed" : ""}`}
              onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${ch.id}&book=${encodeURIComponent(bookName)}` })}>
              <Text className={`toc-num ${progressMap[ch.id] === "completed" ? "done" : ""}`}>
                {progressMap[ch.id] === "completed" ? "✓" : idx + 1}
              </Text>
              <View className="toc-info">
                <Text className="toc-ch-title">{chTitle || ch.title}</Text>
                <Text className="toc-summary">{ch.summary}</Text>
              </View>
              <Text className="toc-time">{ch.reading_time_min}分钟</Text>
            </View>
          );
        })}
      </View>

      <View className="disclaimer">
        <Text>本书内容为 AI 基于公开资料的解读精华，不代表原著完整内容，建议购买原书阅读。</Text>
      </View>

      <View style={{ height: "80px" }} />
    </ScrollView>
  );
}
