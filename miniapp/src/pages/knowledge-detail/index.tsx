import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView, RichText, Textarea } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface ArticleDetail {
  id: string; title: string; summary: string; content_md: string;
  author: string; cover_emoji: string; reading_time_min: number;
  source_type: string; related_template_id: string;
}
interface ArticleBrief { id: string; title: string; }

function md2html(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\* (.+)$/gm, '<p style="padding-left:16px">• $1</p>')
    .replace(/^(\d+)\. (.+)$/gm, '<p style="padding-left:16px">$1. $2</p>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #e74c3c;padding-left:12px;color:#666;margin:8px 0">$1</blockquote>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export default function KnowledgeDetail() {
  const router = useRouter();
  const articleId = router.params.id || "";
  const bookName = router.params.book ? decodeURIComponent(router.params.book) : "";

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [siblings, setSiblings] = useState<ArticleBrief[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);

  useEffect(() => {
    if (!articleId) return;
    request<ArticleDetail>({ url: `/knowledge-base/articles/${articleId}` })
      .then((a) => {
        setArticle(a);
        request({ url: "/knowledge-base/progress", method: "POST", data: { article_id: articleId, status: "completed" } }).catch(() => {});
      })
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }));

    // Load existing notes & bookmark
    request<{ status: string; notes: string | null }>({ url: `/knowledge-base/progress/${articleId}` })
      .then((p) => { if (p?.notes) setNoteText(p.notes); })
      .catch(() => {});

    // Load sibling chapters for prev/next navigation
    if (bookName) {
      request<{ items: ArticleBrief[] }>({ url: "/knowledge-base/articles", data: { category: "classic", keyword: bookName, page_size: 200 } })
        .then((res) => {
          const chs = (res?.items || []).filter((a) => a.title.startsWith(`《${bookName}》`));
          setSiblings(chs);
          const idx = chs.findIndex((c) => c.id === articleId);
          setCurrentIdx(idx);
        })
        .catch(() => {});
    }
  }, [articleId]);

  const toggleBookmark = async () => {
    try {
      if (bookmarked) {
        await request({ url: `/knowledge-base/bookmarks/${articleId}`, method: "DELETE" });
      } else {
        await request({ url: "/knowledge-base/bookmarks", method: "POST", data: { article_id: articleId } });
      }
      setBookmarked(!bookmarked);
      Taro.showToast({ title: bookmarked ? "已取消收藏" : "已收藏", icon: "none" });
    } catch { /* handled */ }
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await request({ url: "/knowledge-base/progress", method: "POST", data: { article_id: articleId, status: "completed", notes: noteText.trim() } });
      Taro.showToast({ title: "笔记已保存", icon: "none" });
      setShowNoteInput(false);
    } catch { /* handled */ }
    setNoteSaving(false);
  };

  const goChapter = (id: string) => {
    Taro.redirectTo({ url: `/pages/knowledge-detail/index?id=${id}&book=${encodeURIComponent(bookName)}` });
  };

  if (!article) return <View className="kd-page"><Text className="loading">加载中...</Text></View>;

  const prevCh = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextCh = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;
  const chapterLabel = bookName ? `${currentIdx + 1} / ${siblings.length}` : "";

  return (
    <ScrollView scrollY className="kd-page">
      {/* Chapter indicator */}
      {bookName && (
        <View className="chapter-bar">
          <Text className="chapter-book">《{bookName}》</Text>
          <Text className="chapter-progress">{chapterLabel}</Text>
        </View>
      )}

      <View className="kd-header">
        <Text className="kd-title">{article.title.replace(/^《.+?》/, "").trim() || article.title}</Text>
        <View className="kd-meta">
          {article.author && <Text className="kd-author">{article.author}</Text>}
          <Text className="kd-time">{article.reading_time_min} 分钟阅读</Text>
        </View>
      </View>

      <View className="kd-content">
        <RichText nodes={md2html(article.content_md)} />
      </View>

      {article.related_template_id && (
        <View className="kd-action" onClick={() => Taro.navigateTo({ url: `/pages/review-form/index?template=${article.related_template_id}` })}>
          <Text className="kd-action-text">使用该大师模版复盘 →</Text>
        </View>
      )}

      {/* Prev / Next chapter navigation */}
      {bookName && (prevCh || nextCh) && (
        <View className="chapter-nav">
          {prevCh ? (
            <View className="nav-btn prev" onClick={() => goChapter(prevCh.id)}>
              <Text className="nav-arrow">‹</Text>
              <Text className="nav-label">上一章</Text>
            </View>
          ) : <View className="nav-btn disabled" />}

          <View className="nav-toc" onClick={() => Taro.navigateBack()}>
            <Text>目录</Text>
          </View>

          {nextCh ? (
            <View className="nav-btn next" onClick={() => goChapter(nextCh.id)}>
              <Text className="nav-label">下一章</Text>
              <Text className="nav-arrow">›</Text>
            </View>
          ) : <View className="nav-btn disabled" />}
        </View>
      )}

      <View className="kd-toolbar">
        <View className={`toolbar-btn ${bookmarked ? "active" : ""}`} onClick={toggleBookmark}>
          <Text>{bookmarked ? "★ 已收藏" : "☆ 收藏"}</Text>
        </View>
        <View className="toolbar-btn" onClick={() => setShowNoteInput(!showNoteInput)}>
          <Text>✏️ 添加笔记</Text>
        </View>
      </View>

      {showNoteInput && (
        <View className="note-panel">
          <Textarea
            className="note-input"
            placeholder="写下你的学习笔记..."
            value={noteText}
            onInput={(e) => setNoteText(e.detail.value)}
            maxlength={2000}
            autoHeight
          />
          <View className="note-actions">
            <View className="note-cancel" onClick={() => setShowNoteInput(false)}>
              <Text>取消</Text>
            </View>
            <View className={`note-save ${noteSaving ? "disabled" : ""}`} onClick={saveNote}>
              <Text>{noteSaving ? "保存中..." : "保存笔记"}</Text>
            </View>
          </View>
        </View>
      )}

      <View className="kd-disclaimer">
        <Text>本内容仅供学习参考，不构成投资建议。投资有风险，交易需谨慎。</Text>
      </View>

      <View style={{ height: "100px" }} />
    </ScrollView>
  );
}
