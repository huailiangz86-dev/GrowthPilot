import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import "./index.scss";

export default function Add() {
  // Re-trigger on show (tab switch)
  useDidShow(() => {});

  return (
    <ScrollView scrollY className="add-page">
      {/* Record */}
      <View className="section-header"><Text>记录</Text></View>
      <View className="action-list">
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/record-form/index" })}>
          <View className="action-icon red"><Text>📝</Text></View>
          <View className="action-info">
            <Text className="action-name">记录交易</Text>
            <Text className="action-desc">股票、加密货币、基金、开销</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
      </View>

      {/* Review — by type, not by template */}
      <View className="section-header"><Text>复盘</Text></View>
      <View className="action-list">
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/review-form/index?template=trade_post" })}>
          <View className="action-icon green"><Text>📋</Text></View>
          <View className="action-info">
            <Text className="action-name">交易复盘</Text>
            <Text className="action-desc">选择大师框架，针对具体交易复盘</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/review-form/index?template=daily_review" })}>
          <View className="action-icon orange"><Text>📅</Text></View>
          <View className="action-info">
            <Text className="action-name">每日复盘</Text>
            <Text className="action-desc">每天结束时的整体回顾</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/review-form/index?template=weekly_review" })}>
          <View className="action-icon purple"><Text>📊</Text></View>
          <View className="action-info">
            <Text className="action-name">周度复盘</Text>
            <Text className="action-desc">每周末的系统性回顾</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
      </View>

      {/* Other */}
      <View className="section-header"><Text>其他</Text></View>
      <View className="action-list">
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/holdings/index" })}>
          <View className="action-icon red"><Text>💰</Text></View>
          <View className="action-info">
            <Text className="action-name">我的持仓</Text>
            <Text className="action-desc">查看持仓盈亏</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
        <View className="action-item" onClick={() => Taro.navigateTo({ url: "/pages/market/index" })}>
          <View className="action-icon cyan"><Text>📈</Text></View>
          <View className="action-info">
            <Text className="action-name">查看行情</Text>
            <Text className="action-desc">K线图 · A股/港股/美股</Text>
          </View>
          <Text className="arrow">&gt;</Text>
        </View>
      </View>
    </ScrollView>
  );
}
