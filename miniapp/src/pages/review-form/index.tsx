import { useEffect, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { View, Text, Input, Textarea, Button, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Question { id: string; label: string; type: string; required: boolean; placeholder?: string; options?: string[]; max?: number; auto?: boolean; }
interface Section { id: string; title: string; questions: Question[]; }
interface TemplateBrief { id: string; name: string; description: string; category: string; author?: string; philosophy?: string; }
interface Template extends TemplateBrief { sections: Section[]; }
interface TradeItem { id: string; title: string; content: { pnl?: number; market?: string; direction?: string; symbol?: string }; occurred_at: string; }
interface TradeContext {
  record_id: string; title: string; symbol: string; trend?: string; latest_price?: number; change_pct?: number;
  volume_status?: string; latest_volume?: number; ma5?: number; ma10?: number; ma20?: number;
  industry?: string; entry_price?: string; pnl?: number; direction?: string;
}

const RANGE_OPTIONS = [
  { key: "today", label: "今天", days: 0 },
  { key: "3d", label: "3天", days: 3 },
  { key: "7d", label: "7天", days: 7 },
  { key: "30d", label: "30天", days: 30 },
];

function startOfDayCN(daysAgo: number): Date {
  const now = new Date();
  const cnNow = new Date(now.getTime() + 8 * 3600000);
  cnNow.setUTCHours(0, 0, 0, 0);
  cnNow.setUTCDate(cnNow.getUTCDate() - daysAgo);
  return new Date(cnNow.getTime() - 8 * 3600000);
}

export default function ReviewForm() {
  const router = useRouter();
  const templateParam = router.params.template || "trade_post";
  // If param is a category (trade_post), need to pick a master template first
  // If param is a specific ID (daily_review, livermore), load directly
  const isPickMode = templateParam === "trade_post";

  const [masterList, setMasterList] = useState<TemplateBrief[]>([]);
  const [activeId, setActiveId] = useState(isPickMode ? "" : templateParam);
  const [template, setTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  const [allTrades, setAllTrades] = useState<TradeItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [range, setRange] = useState(templateParam === "daily_review" ? "today" : "7d");
  const [keyword, setKeyword] = useState("");
  const [tradeCtx, setTradeCtx] = useState<TradeContext[]>([]);

  useEffect(() => {
    if (isPickMode) {
      // Load master templates for picking
      request<TemplateBrief[]>({ url: "/reviews/templates" })
        .then((list) => setMasterList((list || []).filter((t) => t.category === "trade_post")))
        .catch(() => {});
    } else {
      // Load specific template directly
      loadTemplate(templateParam);
    }
    // Load trades for linking
    request<{ items: TradeItem[] }>({ url: "/records", data: { scene: "trading", page_size: 50 } })
      .then((res) => setAllTrades(res?.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const opt = RANGE_OPTIONS.find((r) => r.key === range);
    if (!opt || !allTrades.length) { setTrades([]); return; }
    const cutoff = startOfDayCN(opt.days);
    const kw = keyword.trim().toLowerCase();
    setTrades(allTrades.filter((t) =>
      new Date(t.occurred_at) >= cutoff && (!kw || t.title.toLowerCase().includes(kw))
    ));
  }, [range, allTrades, keyword]);

  const loadTemplate = (id: string) => {
    setActiveId(id);
    setAnswers({});
    setSelectedIds([]);
    request<Template>({ url: `/reviews/templates/${id}` })
      .then(setTemplate)
      .catch(() => Taro.showToast({ title: "模版加载失败", icon: "none" }));
  };

  const toggleTrade = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // Fetch AI context when selected trades change
  useEffect(() => {
    if (selectedIds.length > 0) {
      request<TradeContext[]>({ url: `/reviews/trade-context?record_ids=${selectedIds.join(",")}` })
        .then((res) => setTradeCtx(res || []))
        .catch(() => setTradeCtx([]));
    } else {
      setTradeCtx([]);
    }
  }, [selectedIds]);

  const setAnswer = (qId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handleSubmit = async () => {
    if (!template) return;
    for (const section of template.sections) {
      for (const q of section.questions) {
        if (q.required && !q.auto && !answers[q.id]) {
          Taro.showToast({ title: `请填写: ${q.label}`, icon: "none" });
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const res = await request<{ id: string; template: string }>({
        url: "/reviews", method: "POST",
        data: { template_id: activeId, answers, scene: "trading", linked_record_ids: selectedIds },
      });
      const tplName = template?.name || activeId;
      const tradeTitle = allTrades.find((t) => selectedIds.includes(t.id))?.title || "";
      Taro.redirectTo({
        url: `/pages/review-result/index?review_id=${res.id}&template_name=${encodeURIComponent(tplName)}&trade_title=${encodeURIComponent(tradeTitle)}`,
      });
    } catch { /* handled */ }
    setSubmitting(false);
  };

  const pnlColor = (v: number) => v > 0 ? "up" : v < 0 ? "down" : "";
  const fmtDate = (s: string) => s.slice(5, 10).replace("-", "/");
  const needTrades = activeId !== "weekly_review";

  /** Map auto question ID to real TickFlow data */
  const getAutoValue = (qId: string, tc: TradeContext): { text: string; cls?: string } | null => {
    switch (qId) {
      // Trend/price
      case "trend_direction": case "screen1_trend": case "with_trend":
        return tc.trend ? { text: tc.trend } : null;
      case "trend_template":
        if (!tc.ma5) return null;
        return tc.trend?.includes("多头") ? { text: `多头排列 (MA5>${tc.ma5} MA10>${tc.ma10} MA20>${tc.ma20})` }
          : { text: `${tc.trend} (MA5=${tc.ma5} MA10=${tc.ma10} MA20=${tc.ma20})` };
      case "key_point": case "screen2_signal": case "screen3_entry": case "pattern":
        return tc.latest_price ? { text: `最新价 ${tc.latest_price} (${(tc.change_pct ?? 0) > 0 ? "+" : ""}${tc.change_pct}%)`, cls: pnlColor(tc.change_pct ?? 0) } : null;
      case "strength":
        return tc.change_pct != null ? { text: (tc.change_pct > 3 ? "强势" : tc.change_pct > 0 ? "偏强" : tc.change_pct > -3 ? "偏弱" : "弱势") + ` (${tc.change_pct}%)`, cls: pnlColor(tc.change_pct) } : null;
      // Volume
      case "volume_check": case "daily_volume":
        return tc.latest_volume != null ? { text: `${(tc.latest_volume / 10000).toFixed(0)}万手` } : null;
      case "volume_trend":
        return tc.volume_status ? { text: tc.volume_status } : null;
      case "capital_flow":
        return tc.volume_status ? { text: tc.volume_status } : null;
      case "seal_quality": case "board_type":
        return tc.change_pct != null ? { text: tc.change_pct >= 9.5 ? "涨停" : tc.change_pct <= -9.5 ? "跌停" : `涨跌幅 ${tc.change_pct}%`, cls: pnlColor(tc.change_pct) } : null;
      // Fundamentals
      case "fundamentals": case "profit_growth": case "monopoly":
        return tc.industry ? { text: tc.industry } : { text: "暂无基本面数据" };
      case "valuation_level":
        return { text: "暂无估值数据（需接入财报）" };
      case "moat":
        return tc.industry ? { text: `行业: ${tc.industry}` } : null;
      // Sector/market
      case "main_line": case "sector_rotation": case "limit_up_quality": case "sector_stage": case "sector_choice":
        return { text: "暂无板块数据（需接入行情）" };
      case "market_sentiment":
        return { text: "暂无情绪指标" };
      case "is_leader":
        return tc.latest_volume != null ? { text: `成交额 ${(tc.latest_volume / 10000).toFixed(0)}万手，${tc.volume_status || ""}` } : null;
      // Trade result
      case "actual_result":
        return tc.pnl != null ? { text: `${tc.pnl > 0 ? "+" : ""}${tc.pnl}`, cls: pnlColor(tc.pnl) } : null;
      case "risk_reward":
        return tc.entry_price && tc.latest_price ? { text: `入场${tc.entry_price} → 现价${tc.latest_price}` } : null;
      case "industry_trend":
        return tc.trend ? { text: tc.trend } : null;
      case "leverage_risk": case "drawdown":
        return null; // personal, not stock data
      default:
        return null;
    }
  };

  // ── Pick mode: show master template cards ──
  if (isPickMode && !template) {
    return (
      <ScrollView scrollY className="review-form">
        <View className="master-picker">
          <Text className="picker-title">选择复盘框架</Text>
          <Text className="picker-subtitle">每位大师代表一种交易哲学，选择最适合你的</Text>
          {masterList.map((m) => (
            <View key={m.id} className="master-card" onClick={() => Taro.navigateTo({ url: `/pages/review-form/index?template=${m.id}` })}>
              <View className="master-top">
                <Text className="master-name">{m.name}</Text>
                <Text className="master-author">{m.author}</Text>
              </View>
              <Text className="master-desc">{m.description}</Text>
              {m.philosophy && <Text className="master-quote">"{m.philosophy}"</Text>}
            </View>
          ))}
          {masterList.length === 0 && <Text className="picker-loading">加载模版中...</Text>}
        </View>
      </ScrollView>
    );
  }

  if (!template) return <View className="loading"><Text>加载中...</Text></View>;

  // ── Form mode ──
  return (
    <ScrollView scrollY className="review-form">
      <View className="form-header">
        <View className="form-header-top">
          <View>
            <Text className="form-title">{template.name}</Text>
            {template.author && <Text className="form-author">{template.author}</Text>}
          </View>
          {isPickMode && (
            <Text className="form-switch" onClick={() => Taro.navigateBack()}>换框架</Text>
          )}
        </View>
        {template.philosophy && <Text className="form-philosophy">"{template.philosophy}"</Text>}
      </View>

      {/* Trade selector */}
      {needTrades && (
        <View className="section">
          <Text className="section-title">关联交易</Text>
          <View className="trade-toolbar">
            <View className="range-tabs">
              {RANGE_OPTIONS.map((r) => (
                <Text key={r.key} className={`range-tab ${range === r.key ? "active" : ""}`}
                  onClick={() => setRange(r.key)}>{r.label}</Text>
              ))}
            </View>
            <Input className="trade-search" placeholder="搜索标的名称" value={keyword}
              onInput={(e) => setKeyword(e.detail.value)} />
          </View>
          {selectedIds.length > 0 && (
            <View className="selected-tags">
              <Text className="selected-label">已选 {selectedIds.length} 笔：</Text>
              {allTrades.filter((t) => selectedIds.includes(t.id)).map((t) => (
                <View key={t.id} className="selected-tag" onClick={() => toggleTrade(t.id)}>
                  <Text>{t.title} ✕</Text>
                </View>
              ))}
            </View>
          )}
          <ScrollView scrollY className="trade-scroll">
            {trades.length === 0 ? (
              <Text className="trade-empty">该时段暂无交易记录</Text>
            ) : (
              trades.map((t) => (
                <View key={t.id} className={`trade-card ${selectedIds.includes(t.id) ? "selected" : ""}`}
                  onClick={() => toggleTrade(t.id)}>
                  <Text className="trade-check">{selectedIds.includes(t.id) ? "✓" : "○"}</Text>
                  <View className="trade-info">
                    <Text className="trade-title">{t.title}</Text>
                    <Text className="trade-meta">{fmtDate(t.occurred_at)} · {t.content.direction === "long" ? "买入" : t.content.direction === "short" ? "卖出" : ""}</Text>
                  </View>
                  {t.content.pnl != null && (
                    <Text className={`trade-pnl ${pnlColor(t.content.pnl)}`}>
                      {t.content.pnl >= 0 ? "+" : ""}{t.content.pnl}
                    </Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Template sections */}
      {template.sections.map((section) => {
        const autoQs = section.questions.filter((q) => q.auto);
        const humanQs = section.questions.filter((q) => !q.auto);
        return (
        <View key={section.id} className="section">
          <Text className="section-title">{section.title}</Text>

          {/* Auto questions — show real data from TickFlow */}
          {autoQs.length > 0 && tradeCtx.length > 0 && (
            <View className="ai-data-block">
              {tradeCtx.map((tc) => {
                const rows = autoQs.map((q) => ({ q, val: getAutoValue(q.id, tc) })).filter((r) => r.val);
                if (rows.length === 0) return null;
                return (
                <View key={tc.record_id} className="ai-ctx-card">
                  <Text className="ai-ctx-name">{tc.title}</Text>
                  {rows.map(({ q, val }) => (
                      <View key={q.id} className="ai-data-row">
                        <Text className="ai-data-label">{q.label.replace(/？$/, "").replace(/\?$/, "")}</Text>
                        <Text className={`ai-data-value ${val!.cls || ""}`}>{val!.text}</Text>
                      </View>
                    ))}
                </View>
                );
              })}
            </View>
          )}

          {/* Human questions */}
          {humanQs.map((q) => (
            <View key={q.id} className="question">
              <Text className="q-label">
                {q.label} {q.required && <Text className="required">*</Text>}
              </Text>
              {q.type === "text" && (
                <Textarea className="q-textarea" placeholder={q.placeholder || ""} maxlength={2000}
                  value={answers[q.id] || ""} onInput={(e) => setAnswer(q.id, e.detail.value)} />
              )}
              {q.type === "number" && (
                <Input className="q-input" type="digit" placeholder="输入数字"
                  value={answers[q.id]?.toString() || ""} onInput={(e) => setAnswer(q.id, parseFloat(e.detail.value) || 0)} />
              )}
              {q.type === "select" && q.options && (
                <View className="q-options">
                  {q.options.map((opt) => (
                    <View key={opt} className={`q-option ${answers[q.id] === opt ? "selected" : ""}`}
                      onClick={() => setAnswer(q.id, opt)}>
                      <Text>{opt}</Text>
                    </View>
                  ))}
                </View>
              )}
              {q.type === "rating" && (
                <View className="q-rating">
                  {Array.from({ length: q.max || 5 }).map((_, i) => (
                    <Text key={i} className={`star ${(answers[q.id] || 0) > i ? "filled" : ""}`}
                      onClick={() => setAnswer(q.id, i + 1)}>★</Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
        );
      })}

      <View className="submit-bar">
        <Button className="submit-btn" disabled={submitting} onClick={handleSubmit}>
          <Text className="submit-icon">✔</Text>
          <Text>{submitting ? "提交中..." : "完成复盘"}</Text>
        </Button>
      </View>
      <View style={{ height: "120px" }} />
    </ScrollView>
  );
}
