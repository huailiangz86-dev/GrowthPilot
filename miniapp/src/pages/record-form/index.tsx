import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

const SCENES = [
  { label: "股票", value: "trading", icon: "📈" },
  { label: "加密", value: "crypto", icon: "₿" },
  { label: "基金", value: "fund", icon: "📊" },
  { label: "开销", value: "expense", icon: "💰" },
];

const MARKETS = [
  { label: "A股", value: "A" },
  { label: "港股", value: "HK" },
  { label: "美股", value: "US" },
];

const TAG_PRESETS: Record<string, Record<string, string[]>> = {
  trading: {
    buy_reason: ["突破前高", "超跌反弹", "消息刺激", "抄底", "趋势突破", "均线信号", "基本面", "技术面"],
    sell_reason: ["止盈", "止损", "破均线", "情绪卖出", "尾盘卖出", "目标达到"],
  },
  crypto: {
    buy_reason: ["趋势突破", "消息驱动", "超跌反弹", "定投", "技术信号", "FOMO"],
    sell_reason: ["止盈", "止损", "恐慌卖出", "目标达到", "换仓"],
  },
  fund: {
    buy_reason: ["定投", "加仓", "配置调整", "看好行业"],
    sell_reason: ["赎回", "调仓", "止盈", "急用钱"],
  },
  expense: {
    category: ["餐饮", "交通", "购物", "娱乐", "住房", "医疗", "教育", "其他"],
  },
};

const EMOTIONS = ["兴奋", "焦虑", "冲动", "害怕", "平静"];

export default function RecordForm() {
  const [scene, setScene] = useState("trading");
  const [title, setTitle] = useState("");
  const [market, setMarket] = useState("A");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState("BUY");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCategory, setTagCategory] = useState("buy_reason");
  const [emotion, setEmotion] = useState("平静");
  const [submitting, setSubmitting] = useState(false);
  const [searchResults, setSearchResults] = useState<{ code: string; name: string; symbol: string; market: string }[]>([]);
  const [searchTimer, setSearchTimer] = useState<any>(null);

  const isExpense = scene === "expense";
  const currentTags = TAG_PRESETS[scene]?.[tagCategory] || TAG_PRESETS[scene]?.[Object.keys(TAG_PRESETS[scene] || {})[0]] || [];

  const toggleTag = (t: string) => setSelectedTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const handleSearch = (q: string) => {
    setTitle(q);
    if (searchTimer) clearTimeout(searchTimer);
    if (!q || q.length < 1 || isExpense) { setSearchResults([]); return; }
    const mkt = scene === "trading" ? market : (scene === "crypto" ? "" : "");
    const timer = setTimeout(async () => {
      try {
        const marketQ = mkt ? `&market=${mkt}` : "";
        const results = await request<any[]>({ url: `/trades/search-symbol?q=${encodeURIComponent(q)}&limit=6${marketQ}` });
        setSearchResults(results);
      } catch { setSearchResults([]); }
    }, 300);
    setSearchTimer(timer);
  };

  const selectSymbol = (item: { code: string; name: string; symbol: string; market: string }) => {
    setTitle(item.name);
    if (scene === "trading") setMarket(item.market);
    setSearchResults([]);
  };

  const handleSceneChange = (s: string) => {
    setScene(s); setSelectedTags([]);
    setTagCategory(s === "expense" ? "category" : "buy_reason");
  };

  const handleSubmit = async () => {
    if (!title && !amount) { Taro.showToast({ title: "请填写标的或金额", icon: "none" }); return; }
    if (!isExpense && !price) { Taro.showToast({ title: "请填写价格", icon: "none" }); return; }
    if (!isExpense && !quantity) { Taro.showToast({ title: "请填写数量", icon: "none" }); return; }
    if (!isExpense && selectedTags.length === 0) { Taro.showToast({ title: "请选择至少一个原因", icon: "none" }); return; }
    setSubmitting(true);

    try {
      const tags = selectedTags.map((t) => ({ category: tagCategory, value: t }));
      if (!isExpense) tags.push({ category: "emotion", value: emotion });

      const content: any = {};
      if (isExpense) {
        content.amount = amount ? parseFloat(amount) : 0;
        content.category = selectedTags[0] || "其他";
      } else {
        content.symbol_name = title; content.direction = direction;
        if (scene === "trading") content.market = market;
        if (price) content.price_enc = price;
        if (quantity) content.quantity_enc = quantity;
      }

      await request({
        url: "/records", method: "POST",
        data: {
          scene, record_type: isExpense ? "expense" : direction.toLowerCase(),
          title: isExpense ? `${selectedTags[0] || "开销"} ¥${amount}` : `${title} ${direction === "BUY" ? "买入" : "卖出"}`,
          content, tags, emotion: isExpense ? null : emotion,
          occurred_at: new Date().toISOString(),
        },
      });

      Taro.showToast({ title: "记录成功", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 600);
    } catch { /* handled */ }
    setSubmitting(false);
  };

  return (
    <ScrollView scrollY className="form-page">
      {/* Scene Selector */}
      <View className="scene-row">
        {SCENES.map((s) => (
          <View key={s.value} className={`scene-btn ${scene === s.value ? "active" : ""}`} onClick={() => handleSceneChange(s.value)}>
            <Text className="scene-icon">{s.icon}</Text>
            <Text className="scene-label">{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Smart Input: Screenshot + Text Parse */}
      {!isExpense && (
        <View className="smart-input">
          <View className="smart-row">
            <View className="smart-btn" onClick={async () => {
              try {
                const res = await Taro.chooseImage({ count: 1, sourceType: ["album", "camera"] });
                Taro.showLoading({ title: "识别中..." });
                const uploadRes = await Taro.uploadFile({
                  url: "http://127.0.0.1:8002/api/v1/ocr/screenshot",
                  filePath: res.tempFilePaths[0], name: "file",
                  header: { Authorization: `Bearer ${Taro.getStorageSync("gp_token")}` },
                });
                Taro.hideLoading();
                const data = JSON.parse(uploadRes.data);
                if (data.data?.recognized) {
                  const d = data.data;
                  if (d.symbol_name) setTitle(d.symbol_name);
                  if (d.price) setPrice(String(d.price));
                  if (d.quantity) setQuantity(String(d.quantity));
                  if (d.direction) setDirection(d.direction);
                  Taro.showToast({ title: "识别成功", icon: "success" });
                } else {
                  Taro.showToast({ title: "截图识别失败，试试文字输入", icon: "none" });
                }
              } catch { Taro.hideLoading(); }
            }}>
              <Text>📷 截图识别</Text>
            </View>
            <View className="smart-btn" onClick={() => {
              Taro.showModal({
                title: "智能输入",
                placeholderText: "如: 茅台 1685 买入 100股",
                editable: true,
                success: async (res) => {
                  if (res.confirm && res.content) {
                    Taro.showLoading({ title: "解析中..." });
                    try {
                      const data = await request<any>({ url: "/ocr/parse-text", method: "POST", data: { text: res.content } });
                      Taro.hideLoading();
                      if (data.recognized) {
                        if (data.symbol_name) setTitle(data.symbol_name);
                        if (data.price) setPrice(String(data.price));
                        if (data.quantity) setQuantity(String(data.quantity));
                        if (data.direction) setDirection(data.direction);
                        Taro.showToast({ title: "解析成功", icon: "success" });
                      }
                    } catch { Taro.hideLoading(); }
                  }
                },
              });
            }}>
              <Text>✏️ 文字智能输入</Text>
            </View>
          </View>
        </View>
      )}

      {/* Fields based on scene */}
      {isExpense ? (
        <View className="fields">
          <Input className="input large" type="digit" placeholder="金额" value={amount} onInput={(e) => setAmount(e.detail.value)} />
        </View>
      ) : (
        <View className="fields">
          {/* Direction */}
          <View className="dir-row">
            {["BUY", "SELL"].map((d) => (
              <View key={d} className={`dir-btn ${direction === d ? (d === "BUY" ? "buy" : "sell") : ""}`}
                onClick={() => { setDirection(d); setTagCategory(d === "BUY" ? "buy_reason" : "sell_reason"); setSelectedTags([]); }}>
                <Text>{d === "BUY" ? "买入" : "卖出"}</Text>
              </View>
            ))}
          </View>
          {/* Market selector (stock only) */}
          {scene === "trading" && (
            <View className="market-row">
              {MARKETS.map((m) => (
                <View key={m.value} className={`market-btn ${market === m.value ? "active" : ""}`} onClick={() => setMarket(m.value)}>
                  <Text>{m.label}</Text>
                </View>
              ))}
            </View>
          )}
          <View className="search-wrapper">
            <Input className="input" placeholder={scene === "crypto" ? "搜索币种 (BTC/ETH)" : scene === "fund" ? "搜索基金" : "搜索标的 (代码/名称)"}
              value={title} onInput={(e) => handleSearch(e.detail.value)} />
            {searchResults.length > 0 && (
              <View className="search-dropdown">
                {searchResults.map((item) => (
                  <View key={item.symbol} className="search-item" onClick={() => selectSymbol(item)}>
                    <Text className="search-name">{item.name}</Text>
                    <Text className="search-code">{item.code} · {item.market}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View className="row">
            <Input className="input half" type="digit" placeholder="价格 *" value={price} onInput={(e) => setPrice(e.detail.value)} />
            <Input className="input half" type="digit" placeholder="数量 *" value={quantity} onInput={(e) => setQuantity(e.detail.value)} />
          </View>
        </View>
      )}

      {/* Tags */}
      <View className="section">
        <Text className="section-title">{isExpense ? "类别" : direction === "BUY" ? "买入原因" : "卖出原因"}</Text>
        <View className="tag-grid">
          {currentTags.map((t) => (
            <View key={t} className={`tag ${selectedTags.includes(t) ? "selected" : ""}`} onClick={() => toggleTag(t)}>
              <Text>{t}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Emotion (not for expense) */}
      {!isExpense && (
        <View className="section">
          <Text className="section-title">情绪状态</Text>
          <View className="tag-grid">
            {EMOTIONS.map((e) => (
              <View key={e} className={`tag emotion ${emotion === e ? "selected" : ""}`} onClick={() => setEmotion(e)}>
                <Text>{e}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Submit */}
      <Button className="submit-btn" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "提交中..." : "保存记录"}
      </Button>

      <View style={{ height: "120px" }} />
    </ScrollView>
  );
}
