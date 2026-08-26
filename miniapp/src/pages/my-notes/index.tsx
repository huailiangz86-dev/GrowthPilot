import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface NoteItem { article_id: string; title: string; cover_emoji: string; notes: string; read_at: string | null; }

export default function MyNotes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);

  useEffect(() => {
    request<NoteItem[]>({ url: "/knowledge-base/my-notes" }).then(setNotes).catch(() => {});
  }, []);

  return (
    <ScrollView scrollY className="notes-page">
      <View className="notes-header">
        <Text className="notes-title">我的笔记</Text>
        <Text className="notes-count">{notes.length} 条</Text>
      </View>

      {notes.length === 0 ? (
        <View className="empty">
          <Text className="empty-icon">📝</Text>
          <Text className="empty-text">还没有笔记</Text>
          <Text className="empty-desc">阅读知识文章时可以添加笔记</Text>
        </View>
      ) : (
        notes.map((n) => (
          <View key={n.article_id} className="note-card"
            onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${n.article_id}` })}>
            <View className="note-top">
              <Text className="note-emoji">{n.cover_emoji || "📄"}</Text>
              <Text className="note-article">{n.title}</Text>
            </View>
            <Text className="note-content">{n.notes}</Text>
            {n.read_at && <Text className="note-date">{new Date(n.read_at).toLocaleDateString("zh-CN")}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}
