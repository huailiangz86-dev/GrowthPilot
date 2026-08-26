import { View, Text } from "@tarojs/components";

export default function Achievements() {
  const badges = [
    { name: "初次记录", desc: "记录第一笔交易", done: false },
    { name: "连续 7 天", desc: "连续签到 7 天", done: false },
    { name: "10 笔达人", desc: "累计 10 笔交易", done: false },
    { name: "首次复盘", desc: "完成第一次复盘", done: false },
    { name: "AI 初体验", desc: "首次查看 AI 分析", done: false },
    { name: "50 笔达人", desc: "累计 50 笔交易", done: false },
    { name: "100 笔达人", desc: "累计 100 笔交易", done: false },
    { name: "性格觉醒", desc: "首次生成性格分析", done: false },
  ];

  return (
    <View style={{ minHeight: "100vh", background: "#f5f5f5", padding: "24px" }}>
      <Text style={{ fontSize: "36px", fontWeight: "700", display: "block", marginBottom: "24px" }}>成就徽章</Text>
      <View style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {badges.map((b, i) => (
          <View key={i} style={{
            width: "calc(50% - 6px)", padding: "20px", background: b.done ? "#f6ffed" : "#fff",
            borderRadius: "14px", textAlign: "center", opacity: b.done ? 1 : 0.5,
          }}>
            <Text style={{ fontSize: "36px", display: "block" }}>{b.done ? "🏆" : "🔒"}</Text>
            <Text style={{ fontSize: "26px", fontWeight: "600", display: "block", marginTop: "8px" }}>{b.name}</Text>
            <Text style={{ fontSize: "20px", color: "#999", display: "block", marginTop: "4px" }}>{b.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
