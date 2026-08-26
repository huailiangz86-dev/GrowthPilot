import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Recommendation { id: string; title: string; reason: string; cover_emoji?: string; }

export default function ReviewResult() {
  const router = useRouter();
  const templateName = decodeURIComponent(router.params.template_name || "复盘");
  const tradeTitle = decodeURIComponent(router.params.trade_title || "");
  const reviewId = router.params.review_id || "";

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reviewId) { setLoading(false); return; }
    request<Recommendation[]>({ url: `/reviews/${reviewId}/recommendations` })
      .then((data) => { setRecs(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reviewId]);

  return (
    <ScrollView scrollY className="result-page">
      <View className="result-header">
        <Text className="result-icon">✅</Text>
        <Text className="result-title">复盘完成！</Text>
        <Text className="result-sub">使用了：{templateName}</Text>
        {tradeTitle && <Text className="result-trade">关联交易：{tradeTitle}</Text>}
      </View>

      <View className="rec-section">
        <Text className="rec-title">📖 AI 学习推荐</Text>
        <Text className="rec-desc">基于你的复盘内容，推荐以下学习</Text>

        {loading ? (
          <Text className="rec-loading">正在分析...</Text>
        ) : recs.length > 0 ? (
          recs.map((r) => (
            <View key={r.id} className="rec-card"
              onClick={() => Taro.navigateTo({ url: `/pages/knowledge-detail/index?id=${r.id}` })}>
              <Text className="rec-emoji">{r.cover_emoji || "📄"}</Text>
              <View className="rec-info">
                <Text className="rec-name">{r.title}</Text>
                <Text className="rec-reason">{r.reason}</Text>
              </View>
              <Text className="rec-arrow">&gt;</Text>
            </View>
          ))
        ) : (
          <Text className="rec-empty">暂无推荐，继续记录交易和复盘后将获得个性化推荐</Text>
        )}
      </View>

      <View className="result-actions">
        <View className="action-btn primary" onClick={() => Taro.switchTab({ url: "/pages/record/index" })}>
          <Text>查看记录</Text>
        </View>
        <View className="action-btn" onClick={() => Taro.switchTab({ url: "/pages/index/index" })}>
          <Text>返回首页</Text>
        </View>
      </View>

      <View className="disclaimer">
        <Text>以上推荐基于复盘内容自动生成，仅供学习参考。</Text>
      </View>
    </ScrollView>
  );
}
