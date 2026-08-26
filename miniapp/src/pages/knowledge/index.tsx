import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Category { id: string; name: string; slug: string; icon: string; }
interface Article { id: string; title: string; summary: string; author: string; cover_emoji: string; reading_time_min: number; related_template_id: string; }

export default function Knowledge() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeSlug, setActiveSlug] = useState("master");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    request<Category[]>({ url: "/knowledge-base/categories" })
      .then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const params: Record<string, any> = { category: activeSlug, page_size: 200 };
    if (keyword.trim()) params.keyword = keyword.trim();
    request<{ items: Article[]; total: number }>({ url: "/knowledge-base/articles", data: params })
      .then((res) => setArticles(res?.items || []))
      .catch(() => setArticles([]));
  }, [activeSlug, keyword]);

  // Group classic articles by book name (extract from title: 《书名》第X章)
  const groupByBook = (items: Article[]) => {
    const groups: Record<string, Article[]> = {};
    for (const a of items) {
      const match = a.title.match(/^《(.+?)》/);
      const bookName = match ? match[1] : "其他";
      if (!groups[bookName]) groups[bookName] = [];
      groups[bookName].push(a);
    }
    return groups;
  };

  const isBookCategory = activeSlug === "classic";
  const bookGroups = isBookCategory ? groupByBook(articles) : {};

  return (
    <View className="knowledge-page">
      <View className="header">
        <Text className="header-title">知识库</Text>
        <Input className="search-input" placeholder="搜索知识..." value={keyword}
          onInput={(e) => setKeyword(e.detail.value)} />
      </View>

      <View className="cat-scroll">
        <View className="cat-tabs">
          {categories.map((c) => (
            <View key={c.slug} className={`cat-tab ${activeSlug === c.slug ? "active" : ""}`}
              onClick={() => setActiveSlug(c.slug)}>
              <Text className="cat-icon">{c.icon}</Text>
              <Text className="cat-name">{c.name}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView scrollY className="article-list">
        {articles.length === 0 ? (
          <View className="empty"><Text>暂无内容</Text></View>
        ) : isBookCategory ? (
          /* Book shelf — show book covers only */
          Object.entries(bookGroups).map(([bookName, chapters]) => (
            <View key={bookName} className="book-cover-card"
              onClick={() => Taro.navigateTo({ url: `/pages/knowledge-book/index?book=${encodeURIComponent(bookName)}` })}>
              <Text className="book-cover-emoji">{chapters[0]?.cover_emoji || "📖"}</Text>
              <View className="book-cover-info">
                <Text className="book-cover-name">《{bookName}》</Text>
                <Text className="book-cover-author">{chapters[0]?.author}</Text>
                <Text className="book-cover-chapters">{chapters.length} 章 · 约 {chapters.reduce((s, c) => s + c.reading_time_min, 0)} 分钟</Text>
              </View>
              <Text className="book-arrow">&gt;</Text>
            </View>
          ))
        ) : (
          /* Regular card list */
          articles.map((a) => (
            <View key={a.id} className="article-card"
              onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${a.id}` })}>
              <Text className="article-emoji">{a.cover_emoji || "📄"}</Text>
              <View className="article-info">
                <Text className="article-title">{a.title}</Text>
                <Text className="article-summary">{a.summary}</Text>
                <View className="article-meta">
                  {a.author && <Text className="meta-author">{a.author}</Text>}
                  <Text className="meta-time">{a.reading_time_min}分钟</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
