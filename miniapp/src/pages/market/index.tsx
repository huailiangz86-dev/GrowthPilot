import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, ScrollView } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

interface SymbolResult { code: string; name: string; symbol: string; market: string; }
interface KlineItem { date: string; open: number; high: number; low: number; close: number; volume: number; }

export default function Market() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [selected, setSelected] = useState<SymbolResult | null>(null);
  const [klines, setKlines] = useState<KlineItem[]>([]);
  const [period, setPeriod] = useState("1d");
  const [loading, setLoading] = useState(false);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [klineName, setKlineName] = useState("");

  let timer: any = null;

  const handleSearch = (q: string) => {
    setQuery(q);
    if (timer) clearTimeout(timer);
    if (q.length < 1) { setResults([]); return; }
    timer = setTimeout(async () => {
      try {
        const data = await request<SymbolResult[]>({ url: `/trades/search-symbol?q=${encodeURIComponent(q)}&limit=8` });
        setResults(data);
      } catch { setResults([]); }
    }, 300);
  };

  const selectSymbol = async (item: SymbolResult) => {
    setSelected(item);
    setResults([]);
    setQuery(`${item.name} ${item.code}`);
    loadKline(item.symbol, period);
  };

  const loadKline = async (symbol: string, p: string) => {
    setLoading(true);
    try {
      const data = await request<any>({ url: `/kline?symbol=${symbol}&period=${p}&count=60` });
      setKlines(data.klines || []);
      setKlineName(data.name || symbol);
      if (data.klines?.length > 0) {
        setLatestPrice(data.klines[data.klines.length - 1].close);
      }
    } catch { setKlines([]); }
    setLoading(false);
  };

  const changePeriod = (p: string) => {
    setPeriod(p);
    if (selected) loadKline(selected.symbol, p);
  };

  return (
    <View className="market-page">
      {/* Search */}
      <View className="search-area">
        <Input className="search-input" placeholder="搜索标的 (代码/名称)" value={query} onInput={(e) => handleSearch(e.detail.value)} />
        {results.length > 0 && (
          <View className="dropdown">
            {results.map((r) => (
              <View key={r.symbol} className="dropdown-item" onClick={() => selectSymbol(r)}>
                <Text className="item-name">{r.name}</Text>
                <Text className="item-code">{r.code} · {r.market}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* K-Line Chart */}
      {selected && (
        <View className="chart-area">
          <View className="chart-header">
            <View>
              <Text className="chart-name">{klineName}</Text>
              {latestPrice && <Text className="chart-price">{latestPrice}</Text>}
            </View>
            <View className="period-tabs">
              {[
                { label: "日K", value: "1d" },
                { label: "周K", value: "1w" },
                { label: "月K", value: "1M" },
              ].map((p) => (
                <Text key={p.value} className={`period-tab ${period === p.value ? "active" : ""}`} onClick={() => changePeriod(p.value)}>
                  {p.label}
                </Text>
              ))}
            </View>
          </View>

          {loading ? (
            <View className="loading"><Text>加载中...</Text></View>
          ) : klines.length === 0 ? (
            <View className="loading"><Text>暂无数据</Text></View>
          ) : (
            <>
              <View className="kline-chart">
                {klines.slice(-40).map((k, i) => {
                  const visible = klines.slice(-40);
                  const maxH = Math.max(...visible.map((x) => x.high));
                  const minL = Math.min(...visible.map((x) => x.low));
                  const range = maxH - minL || 1;
                  const isUp = k.close >= k.open;
                  const bodyTop = ((maxH - Math.max(k.open, k.close)) / range) * 100;
                  const bodyH = Math.max(1.5, (Math.abs(k.close - k.open) / range) * 100);
                  const wickTop = ((maxH - k.high) / range) * 100;
                  const wickH = ((k.high - k.low) / range) * 100;

                  return (
                    <View key={i} className="candle">
                      <View className="wick" style={{ top: `${wickTop}%`, height: `${wickH}%`, background: isUp ? "#ff4d4f" : "#52c41a" }} />
                      <View className={`body ${isUp ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyH}%` }} />
                    </View>
                  );
                })}
              </View>

              {/* Price range */}
              <View className="price-range">
                <Text className="range-high">{Math.max(...klines.slice(-40).map((k) => k.high)).toFixed(2)}</Text>
                <Text className="range-low">{Math.min(...klines.slice(-40).map((k) => k.low)).toFixed(2)}</Text>
              </View>

              {/* Recent data table */}
              <View className="data-table">
                <View className="table-header">
                  <Text className="col">日期</Text>
                  <Text className="col">开盘</Text>
                  <Text className="col">收盘</Text>
                  <Text className="col">涨跌</Text>
                </View>
                {klines.slice(-10).reverse().map((k, i) => {
                  const chg = ((k.close - k.open) / k.open * 100).toFixed(2);
                  const isUp = k.close >= k.open;
                  return (
                    <View key={i} className="table-row">
                      <Text className="col">{k.date.slice(5)}</Text>
                      <Text className="col">{k.open.toFixed(2)}</Text>
                      <Text className="col">{k.close.toFixed(2)}</Text>
                      <Text className={`col ${isUp ? "green" : "red"}`}>{isUp ? "+" : ""}{chg}%</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Quick action */}
          <View className="action-bar">
            <View className="action-btn" onClick={() => Taro.navigateTo({ url: "/pages/record-form/index" })}>
              <Text>记录这笔交易</Text>
            </View>
          </View>
        </View>
      )}

      {!selected && (
        <View className="empty">
          <Text className="empty-icon">📈</Text>
          <Text className="empty-text">搜索标的查看行情</Text>
          <Text className="empty-hint">支持 A股 · 港股 · 美股</Text>
        </View>
      )}
    </View>
  );
}
