import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface Holding {
  symbol_name: string; market: string; scene: string;
  quantity: number; avg_cost: number; total_cost: number;
  buy_count: number; sell_count: number; realized_pnl: number;
  current_price: number | null; floating_pnl: number | null; floating_pnl_pct: number | null;
  status: string; last_date: string;
}

// 国内: 红=涨/盈, 绿=跌/亏
const pnlColor = (val: number) => val >= 0 ? "up" : "down";
const pnlSign = (val: number) => val >= 0 ? "+" : "";
const marketLabel: Record<string, string> = { A: "A股 (CNY)", HK: "港股 (HKD)", US: "美股 (USD)" };
const unitLabel: Record<string, string> = { A: "¥", HK: "HK$", US: "$" };

export default function Holdings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 自动刷新: 进入页面自动拉价格
  useEffect(() => {
    autoRefresh();
  }, []);

  const autoRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await request<Holding[]>({ url: "/portfolio/refresh-prices", method: "POST" });
      setHoldings(data);
    } catch {
      // Fallback: load without prices
      try {
        const data = await request<Holding[]>({ url: "/portfolio/holdings" });
        setHoldings(data);
      } catch { /* handled */ }
    }
    setRefreshing(false);
    setLoaded(true);
  };

  const openHoldings = holdings.filter((h) => h.status === "holding");
  const closedHoldings = holdings.filter((h) => h.status === "closed");

  // 按市场分组
  const groupByMarket = (list: Holding[]) => {
    const groups: Record<string, Holding[]> = {};
    list.forEach((h) => {
      const mkt = h.market || "A";
      if (!groups[mkt]) groups[mkt] = [];
      groups[mkt].push(h);
    });
    return groups;
  };

  const openGroups = groupByMarket(openHoldings);
  const closedGroups = groupByMarket(closedHoldings);

  // 按市场计算小计
  const marketSummary = (group: Holding[]) => {
    const invested = group.reduce((s, h) => s + h.total_cost, 0);
    const floating = group.reduce((s, h) => s + (h.floating_pnl || 0), 0);
    const realized = group.reduce((s, h) => s + h.realized_pnl, 0);
    const marketValue = group.reduce((s, h) => s + (h.current_price ? h.current_price * h.quantity : h.total_cost), 0);
    return { invested, floating, realized, marketValue, total: realized + floating };
  };

  return (
    <View className="holdings-page">
      {/* Refresh Bar */}
      <View className="refresh-bar">
        <Text className="page-title">我的持仓</Text>
        <Button className="refresh-btn" size="mini" loading={refreshing} onClick={autoRefresh}>
          {refreshing ? "刷新中" : "刷新价格"}
        </Button>
      </View>

      {!loaded ? (
        <View className="empty"><Text>加载中...</Text></View>
      ) : openHoldings.length === 0 ? (
        <View className="empty">
          <Text className="empty-text">暂无持仓</Text>
          <Text className="empty-hint">记录买入交易后自动生成持仓</Text>
        </View>
      ) : (
        /* 按市场分组展示 */
        Object.entries(openGroups).map(([mkt, group]) => {
          const sum = marketSummary(group);
          const unit = unitLabel[mkt] || "¥";
          return (
            <View key={mkt} className="market-group">
              {/* 市场头部 */}
              <View className="market-header">
                <Text className="market-name">{marketLabel[mkt] || mkt}</Text>
                <View className="market-stats">
                  <Text className="ms-item">投入 {unit}{sum.invested.toFixed(0)}</Text>
                  <Text className={`ms-item ${pnlColor(sum.total)}`}>
                    盈亏 {pnlSign(sum.total)}{unit}{sum.total.toFixed(0)}
                  </Text>
                </View>
              </View>

              {/* 持仓列表 */}
              {group.map((h) => (
                <View key={h.symbol_name} className="holding-card">
                  <View className="card-top">
                    <View>
                      <Text className="card-name">{h.symbol_name}</Text>
                      <Text className="card-meta">{h.quantity}股 · 均价{unit}{h.avg_cost}</Text>
                    </View>
                    <View className="card-right">
                      {h.current_price != null ? (
                        <>
                          <Text className="current-price">{unit}{h.current_price}</Text>
                          <Text className={`floating ${pnlColor(h.floating_pnl || 0)}`}>
                            {pnlSign(h.floating_pnl || 0)}{unit}{Math.abs(h.floating_pnl || 0).toFixed(0)}
                            <Text className="pct"> ({h.floating_pnl_pct?.toFixed(1)}%)</Text>
                          </Text>
                        </>
                      ) : (
                        <Text className="no-price">价格加载中</Text>
                      )}
                    </View>
                  </View>
                  <View className="card-bottom">
                    <Text className="detail">成本 {unit}{h.total_cost.toFixed(0)} · 买{h.buy_count}次</Text>
                    {h.realized_pnl !== 0 && (
                      <Text className={`realized ${pnlColor(h.realized_pnl)}`}>
                        已实现 {pnlSign(h.realized_pnl)}{unit}{Math.abs(h.realized_pnl).toFixed(0)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          );
        })
      )}

      {/* 已平仓 */}
      {closedHoldings.length > 0 && (
        <View className="closed-section">
          <Text className="section-title">已平仓 ({closedHoldings.length})</Text>
          {Object.entries(closedGroups).map(([mkt, group]) => (
            <View key={mkt}>
              {group.map((h) => (
                <View key={h.symbol_name} className="holding-card closed">
                  <View className="card-top">
                    <Text className="card-name">{h.symbol_name}</Text>
                    <Text className={`realized ${pnlColor(h.realized_pnl)}`}>
                      {pnlSign(h.realized_pnl)}{unitLabel[mkt] || "¥"}{Math.abs(h.realized_pnl).toFixed(0)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
