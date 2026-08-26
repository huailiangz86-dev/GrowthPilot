import { View, Text } from "@tarojs/components";

export default function Coach() {
  return (
    <View style={{ minHeight: "100vh", background: "#f5f5f5", padding: "24px", textAlign: "center" }}>
      <View style={{ padding: "60px 0" }}>
        <Text style={{ fontSize: "48px", display: "block" }}>🤖</Text>
        <Text style={{ fontSize: "32px", fontWeight: "700", display: "block", marginTop: "16px" }}>AI 教练</Text>
        <Text style={{ fontSize: "26px", color: "#999", display: "block", marginTop: "12px" }}>记录更多交易后解锁 AI 教练对话</Text>
        <Text style={{ fontSize: "24px", color: "#bbb", display: "block", marginTop: "8px" }}>AI 将基于你的交易数据提供个性化建议</Text>
      </View>
    </View>
  );
}
