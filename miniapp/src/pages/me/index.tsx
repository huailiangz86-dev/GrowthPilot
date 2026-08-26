import Taro from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import "./index.scss";

export default function Me() {
  return (
    <ScrollView scrollY className="me-page">
      <Text className="page-title">我的</Text>

      <View className="beta-badge">
        <Text>内测用户 · 全功能免费</Text>
      </View>

      <View className="menu-group">
        {[
          { label: "成长报告", desc: "月度交易·复盘·学习对比", page: "/pages/growth-report/index" },
          { label: "学习路径", desc: "查看学习计划和进度", page: "/pages/learning/index" },
          { label: "我的笔记", desc: "知识学习中的笔记记录", page: "/pages/my-notes/index" },
          { label: "我的持仓", desc: "持仓盈亏+浮动盈亏", page: "/pages/holdings/index" },
          { label: "个人分析", desc: "交易风格+成长轨迹", page: "/pages/profile/index" },
          { label: "成就徽章", desc: "查看成长里程碑", page: "/pages/achievements/index" },
        ].map((item, i) => (
          <View key={i} className="menu-item" onClick={() => Taro.navigateTo({ url: item.page })}>
            <View className="menu-info">
              <Text className="menu-label">{item.label}</Text>
              <Text className="menu-desc">{item.desc}</Text>
            </View>
            <Text className="menu-arrow">&gt;</Text>
          </View>
        ))}
      </View>

      <View className="menu-group">
        {[
          { label: "投资品类", value: "股票·加密" },
          { label: "自定义标签", value: "" },
          { label: "数据导出", value: "" },
          { label: "关于", value: "v2.0" },
        ].map((item, i) => (
          <View key={i} className="setting-item">
            <Text className="setting-label">{item.label}</Text>
            <Text className="setting-value">{item.value}</Text>
          </View>
        ))}
      </View>

      <View className="promo-card">
        <Text>内测结束后采用订阅制（Pro ¥39/月 · Premium ¥99/月），当前用户享终身优惠</Text>
      </View>

      <View style={{ height: "80px" }} />
    </ScrollView>
  );
}
