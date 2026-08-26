import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface ReviewDetail {
  id: string; scene: string; template: string;
  did_right: string | null; did_wrong: string | null; next_plan: string | null;
  answers: Record<string, any> | null; review_date: string; created_at: string;
}

interface Template { id: string; name: string; description: string; sections: { id: string; title: string; questions: { id: string; label: string; type: string; options?: string[] }[] }[]; author?: string; philosophy?: string; }

const TEMPLATE_NAMES: Record<string, string> = {
  livermore: "利弗莫尔法", dalio: "达利奥法", douglas: "道格拉斯法", seykota: "塞科塔法",
  minervini: "米勒维尼法", elder: "埃尔德法", tharp: "范·撒普法",
  yangjia: "养家心法", fengliu: "冯柳·弱者体系", xuxiang: "徐翔·涨停复盘",
  linyuan: "林园·价值复盘", duanyongping: "段永平·商业模式",
  chenxiaoqun: "陈小群·龙头战法", zhangmengzhu: "章盟主·板块作战",
  zhaolaoge: "赵老哥·打板心法", geweidong: "葛卫东·攻守兼备",
  fangxinxia: "方新侠·大资金趋势", ruihexian: "瑞鹤仙·强势股战法",
  daily_review: "每日复盘", weekly_review: "周度复盘",
};

export default function ReviewDetailPage() {
  const router = useRouter();
  const reviewId = router.params.id || "";

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (!reviewId) return;
    request<ReviewDetail>({ url: `/reviews/${reviewId}` })
      .then((r) => {
        setReview(r);
        // Load template for question labels
        request<Template>({ url: `/reviews/templates/${r.template}` })
          .then(setTemplate).catch(() => {});
      })
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }));
  }, [reviewId]);

  if (!review) return <View className="review-detail"><Text className="loading">加载中...</Text></View>;

  const tplName = TEMPLATE_NAMES[review.template] || review.template;
  const date = new Date(review.created_at).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const answers = review.answers || {};

  return (
    <ScrollView scrollY className="review-detail">
      {/* Header */}
      <View className="header">
        <Text className="header-title">{tplName}</Text>
        {template?.author && <Text className="header-author">{template.author}</Text>}
        <Text className="header-date">{date}</Text>
      </View>

      {/* Answers by template sections */}
      {template ? template.sections.map((sec) => {
        const sectionAnswers = sec.questions.filter((q) => answers[q.id]);
        if (sectionAnswers.length === 0) return null;
        return (
          <View key={sec.id} className="section">
            <Text className="section-title">{sec.title}</Text>
            {sectionAnswers.map((q) => {
              const val = answers[q.id];
              return (
                <View key={q.id} className="answer-item">
                  <Text className="answer-label">{q.label}</Text>
                  {typeof val === "number" && q.type === "rating" ? (
                    <Text className="answer-stars">{"★".repeat(val)}{"☆".repeat((5) - val)}</Text>
                  ) : (
                    <Text className="answer-value">{String(val)}</Text>
                  )}
                </View>
              );
            })}
          </View>
        );
      }) : (
        /* Fallback: show raw answers if template not loaded */
        <>
          {review.did_right && (
            <View className="section">
              <Text className="section-title">做对了什么</Text>
              <Text className="answer-value">{review.did_right}</Text>
            </View>
          )}
          {review.did_wrong && (
            <View className="section">
              <Text className="section-title">做错了什么</Text>
              <Text className="answer-value">{review.did_wrong}</Text>
            </View>
          )}
          {review.next_plan && (
            <View className="section">
              <Text className="section-title">下次改进</Text>
              <Text className="answer-value">{review.next_plan}</Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: "80px" }} />
    </ScrollView>
  );
}
