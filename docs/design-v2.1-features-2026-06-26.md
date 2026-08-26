# GrowthPilot v2.1 Feature Design

> **Historical reference:** This v2.1 feature design is superseded by `docs/README.md` and the active v3.1 Workspace-first product documents. Keep it as feature history only.

**Date:** 2026-06-26
**Status:** Design Phase
**Scope:** 截图识别重做 + 复盘模版体系 + 交易风格形成

---

## Feature 1: 截图识别重做

### 当前问题
- 使用 Qwen VL（视觉模型）但 DashScope 免费版不支持 vision
- 识别不出图片内容
- 没有兜底方案

### 设计方案

**方案 A: 腾讯云 OCR（推荐）**
- 通用文字识别 → 提取文字 → 用 LLM 解析交易信息
- 腾讯 OCR 每月免费 1000 次
- 流程：截图 → 腾讯 OCR 提取文字 → Qwen 解析 JSON

**方案 B: 纯 LLM 文本分析**
- 用户拍照后手动输入关键信息
- LLM 辅助补全（输入"茅台 1685" → 自动补全其余字段）

**方案 C: 模板匹配**
- 预设主流券商截图模板（同花顺/东方财富/雪球等）
- 按模板裁剪区域 → OCR 识别
- 准确率高但维护成本大

### 推荐方案: A + B 结合

```
用户选择截图
    ↓
腾讯云 OCR 提取全部文字
    ↓
Qwen LLM 从文字中解析:
  - 标的名称/代码
  - 买入/卖出
  - 价格
  - 数量
  - 时间
    ↓
预填表单 → 用户确认/修改
    ↓
如果 OCR 失败 → 用户手动输入
```

### 技术实现

```python
# Step 1: 腾讯 OCR
async def ocr_image(image_bytes: bytes) -> str:
    """调用腾讯云通用文字识别，返回全部文字"""
    # POST https://ocr.tencentcloudapi.com
    # Action: GeneralBasicOCR
    # 返回识别到的所有文字行

# Step 2: LLM 解析
async def parse_trade_from_text(ocr_text: str) -> dict:
    """用 Qwen 从 OCR 文字中提取交易信息"""
    prompt = """
    从以下券商截图文字中提取交易信息，返回 JSON:
    {"symbol":"标的代码","symbol_name":"名称","direction":"BUY/SELL",
     "price":数字,"quantity":数字,"time":"时间"}

    文字内容:
    {ocr_text}
    """
```

### 需要的配置
- `TENCENT_SECRET_ID` + `TENCENT_SECRET_KEY`（腾讯云 API 密钥）
- 或者使用已有的 Qwen API Key + 文本模式（不用视觉模型）

### 前端改动
- 截图按钮流程不变
- 加 loading 状态提示"识别中..."
- 识别失败时显示"未能识别，请手动输入"

---

## Feature 2: 复盘模版体系

### 当前问题
- 复盘只有三个自由文本框（做对了/做错了/下次怎么做）
- 没有引导用户"应该从哪些维度复盘"
- 不同交易类型（日内/波段/长线）需要不同的复盘维度

### 设计方案

#### 模版结构

每个模版包含：
- 模版 ID + 名称
- 适用场景（交易类型）
- 结构化问题列表（必答 + 选答）
- 评分维度（后续 AI 分析用）

#### 预设模版

##### 模版 1: 单笔交易复盘（交易后立即使用）

```yaml
id: trade_post
name: "交易复盘"
description: "完成一笔交易后的即时复盘"
sections:
  - id: entry
    title: "入场分析"
    questions:
      - id: entry_logic
        label: "买入/卖出的逻辑是什么？"
        type: text
        required: true
        placeholder: "趋势突破、技术指标、消息驱动..."
      - id: entry_plan
        label: "入场前有没有计划？（目标价/止损价）"
        type: text
        required: false
        placeholder: "目标价 XX，止损价 XX"
      - id: entry_confidence
        label: "入场时的信心程度"
        type: rating  # 1-5星
        required: true

  - id: execution
    title: "执行评估"
    questions:
      - id: followed_plan
        label: "是否按计划执行？"
        type: select
        options: ["完全按计划", "部分偏离", "完全没按计划", "没有计划"]
        required: true
      - id: position_size
        label: "仓位是否合理？"
        type: select
        options: ["合理", "偏重", "偏轻"]
        required: false
      - id: timing
        label: "买卖时机如何？"
        type: select
        options: ["时机很好", "稍早", "稍晚", "明显错误"]
        required: false

  - id: reflection
    title: "反思总结"
    questions:
      - id: did_right
        label: "这笔交易做对了什么？"
        type: text
        required: true
      - id: did_wrong
        label: "这笔交易做错了什么？"
        type: text
        required: true
      - id: lesson
        label: "学到了什么？下次怎么改进？"
        type: text
        required: true
      - id: emotion_impact
        label: "情绪对这笔交易有影响吗？"
        type: select
        options: ["没有影响", "轻微影响", "明显影响", "完全被情绪控制"]
        required: true
```

##### 模版 2: 每日复盘

```yaml
id: daily_review
name: "每日复盘"
description: "每天结束时的整体回顾"
sections:
  - id: market
    title: "市场观察"
    questions:
      - id: market_sentiment
        label: "今天市场整体氛围？"
        type: select
        options: ["极度乐观", "偏乐观", "中性", "偏悲观", "极度恐慌"]
        required: true
      - id: market_observation
        label: "今天观察到什么重要信号？"
        type: text
        required: false

  - id: trades
    title: "交易回顾"
    questions:
      - id: trade_count
        label: "今天做了几笔交易？"
        type: number
        required: true
      - id: best_trade
        label: "今天最好的决策是什么？"
        type: text
        required: true
      - id: worst_trade
        label: "今天最差的决策是什么？"
        type: text
        required: true
      - id: followed_rules
        label: "是否遵守了自己的交易规则？"
        type: select
        options: ["完全遵守", "大部分遵守", "有违规", "严重违规"]
        required: true

  - id: mindset
    title: "心态评估"
    questions:
      - id: emotional_state
        label: "今天的情绪状态？"
        type: rating
        required: true
      - id: stress_level
        label: "压力水平？"
        type: rating
        required: false
      - id: sleep_quality
        label: "昨晚睡眠质量？"
        type: select
        options: ["很好", "一般", "差", "失眠"]
        required: false

  - id: plan
    title: "明日计划"
    questions:
      - id: tomorrow_plan
        label: "明天的交易计划？"
        type: text
        required: true
      - id: watchlist
        label: "明天关注的标的？"
        type: text
        required: false
```

##### 模版 3: 周度复盘

```yaml
id: weekly_review
name: "周度复盘"
description: "每周末的系统性回顾"
sections:
  - id: performance
    title: "绩效回顾"
    questions:
      - id: weekly_pnl
        label: "本周盈亏？"
        type: number
        required: true
      - id: win_loss_analysis
        label: "盈利交易 vs 亏损交易的共同点？"
        type: text
        required: true
      - id: best_pattern
        label: "本周哪个策略/模式表现最好？"
        type: text
        required: true
      - id: worst_pattern
        label: "本周哪个策略/模式表现最差？"
        type: text
        required: true

  - id: discipline
    title: "纪律评估"
    questions:
      - id: rule_adherence
        label: "本周整体纪律性评分（1-10）"
        type: rating
        required: true
      - id: impulsive_trades
        label: "有几笔冲动交易？"
        type: number
        required: true
      - id: improvement
        label: "比上周有什么进步？"
        type: text
        required: true

  - id: next_week
    title: "下周计划"
    questions:
      - id: focus_areas
        label: "下周重点改进什么？"
        type: text
        required: true
      - id: risk_budget
        label: "下周的风险预算？"
        type: text
        required: false
```

#### 数据模型

```sql
-- 模版定义（预设 + 用户自定义）
CREATE TABLE review_templates (
    id          VARCHAR(32) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    category    VARCHAR(32) NOT NULL, -- trade_post / daily / weekly / custom
    sections    JSONB NOT NULL,       -- 结构化问题定义
    is_system   BOOLEAN DEFAULT TRUE,
    user_id     UUID,                 -- NULL = 系统预设
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE
);

-- 复盘回答（扩展现有 reviews 表）
-- reviews.content 改为 JSONB，存储结构化回答:
-- {
--   "template_id": "trade_post",
--   "answers": {
--     "entry_logic": "趋势突破均线金叉",
--     "entry_confidence": 4,
--     "followed_plan": "完全按计划",
--     "did_right": "...",
--     "emotion_impact": "轻微影响"
--   }
-- }
```

#### 前端交互

```
复盘入口（3种触发）:
  1. 记录交易后 → 弹出"要复盘这笔交易吗？" → 加载 trade_post 模版
  2. 每日定时提醒 → 加载 daily_review 模版
  3. 手动触发 → 选择模版

模版复盘页面:
  ┌─────────────────────────────┐
  │ 交易复盘                     │
  ├─────────────────────────────┤
  │ ▸ 入场分析                   │
  │   买入逻辑: [____________]   │
  │   计划:     [____________]   │
  │   信心:     ★★★★☆           │
  ├─────────────────────────────┤
  │ ▸ 执行评估                   │
  │   按计划执行？[完全按计划 ▼]  │
  │   仓位合理？  [合理 ▼]       │
  ├─────────────────────────────┤
  │ ▸ 反思总结                   │
  │   做对了:   [____________]   │
  │   做错了:   [____________]   │
  │   学到了:   [____________]   │
  │   情绪影响？[轻微影响 ▼]     │
  ├─────────────────────────────┤
  │ [提交复盘]                   │
  └─────────────────────────────┘
```

---

## Feature 3: 交易风格形成

### 当前问题
- 只有简单的"探索中/稳健成长型/需要调整型"判断
- 没有从数据中真正形成交易风格画像
- 没有持续追踪风格变化

### 设计方案

#### 交易风格维度（6 维雷达图）

| 维度 | 计算方式 | 分值 0-100 |
|------|---------|-----------|
| **风险偏好** | 平均仓位占总资产比例 + 单笔最大亏损 | 高=激进 |
| **交易频率** | 月均交易次数 | 高=活跃 |
| **持仓耐心** | 平均持仓天数 | 高=长线 |
| **纪律性** | 复盘完成率 + 按计划执行比例 | 高=纪律好 |
| **情绪稳定性** | 情绪标签分布的稳定度 + 冲动交易占比 | 高=稳定 |
| **学习能力** | 同类错误重复率下降幅度 | 高=成长快 |

#### 风格类型（基于维度组合）

| 风格 | 特征 | 典型维度 |
|------|------|---------|
| **趋势猎手** | 顺势交易，耐心持仓 | 持仓耐心高 + 风险偏好中 |
| **短线战士** | 快进快出，交易频繁 | 交易频率高 + 持仓耐心低 |
| **价值守望者** | 基本面驱动，长期持有 | 持仓耐心高 + 交易频率低 |
| **波段冲浪者** | 把握波段节奏 | 交易频率中 + 持仓耐心中 |
| **纪律执行者** | 严格按规则交易 | 纪律性高 + 情绪稳定高 |
| **情绪交易者** | 容易被情绪驱动 | 情绪稳定性低 + 纪律性低 |

#### 风格形成流程

```
数据积累（至少 20 笔交易 + 5 次复盘）
    ↓
SQL 计算 6 维度分值
    ↓
匹配最近似的风格类型
    ↓
LLM 生成个性化描述:
  "你是一个【趋势猎手】型交易者。你擅长在上升趋势中抓住机会，
   平均持仓 8.5 天，胜率 62%。你的主要优势是耐心持仓，
   但在震荡市中容易焦虑减仓。建议：在震荡期减少操作频率。"
    ↓
存储到 persona_snapshots 表（按月快照）
    ↓
前端展示: 雷达图 + 风格标签 + 个性化描述 + 历史变化
```

#### 风格进化追踪

```
月度快照:
  2026-04: 情绪交易者 → 冲动交易占比 35%
  2026-05: 波段冲浪者 → 冲动下降到 18%，持仓天数增加
  2026-06: 纪律执行者 → 复盘完成率 80%，按计划执行 75%

成长时间线:
  "从情绪交易者进化为纪律执行者，用了 3 个月"
```

#### 数据模型

```sql
-- 扩展 persona_snapshots 表
-- 复用现有表，content 字段存:
-- {
--   "style_type": "趋势猎手",
--   "dimensions": {
--     "risk_appetite": 65,
--     "trade_frequency": 40,
--     "holding_patience": 78,
--     "discipline": 82,
--     "emotion_stability": 70,
--     "learning_ability": 55
--   },
--   "description": "AI 生成的个性化描述",
--   "strengths": ["耐心持仓", "趋势判断准确"],
--   "improvements": ["震荡期过度操作"],
--   "compared_to_last": {
--     "better": ["纪律性提升 15%"],
--     "worse": ["交易频率增加"]
--   }
-- }
```

#### SQL 计算示例

```sql
-- 风险偏好: 平均单笔投入占比（需要总资产数据，简化为平均单笔金额）
-- 交易频率: 最近 30 天交易次数
-- 持仓耐心: 有卖出的交易的平均持仓天数
-- 纪律性: 有复盘的交易占比
-- 情绪稳定性: 100 - (冲动+焦虑交易占比 × 100)
-- 学习能力: 最近 30 天 vs 之前 30 天的同类错误重复率变化
```

---

## Implementation Priority

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| 截图识别修复 | Low (换方案) | Medium | P1 |
| 复盘模版体系 | Medium (3个模版) | High | P0 |
| 交易风格形成 | Medium (SQL+LLM) | High | P0 |

### 实施顺序

```
Step 1: 复盘模版（最重要 — 决定数据质量）
  → 定义 3 个模版 YAML
  → 新建 review_templates 表
  → 前端模版化复盘页面

Step 2: 交易风格形成
  → 6 维度 SQL 计算
  → 风格类型匹配
  → LLM 描述生成
  → 前端雷达图 + 风格卡

Step 3: 截图识别
  → 腾讯 OCR + Qwen 文本解析
  → 前端流程不变
```

---

## 需要的新增/修改

### 后端
- `review_templates` 表 + seed 3 个预设模版
- `review_engine.py` 支持模版化回答（JSONB answers）
- `persona_engine.py` 重写 — 6 维度 SQL 计算 + 风格匹配 + LLM 描述
- `ocr.py` 改为 腾讯 OCR + Qwen 文本解析（替代 vision model）

### 前端
- 复盘页重写 — 根据模版渲染问题列表
- 个人分析页重写 — 雷达图 + 风格卡 + 进化时间线
- 截图识别修复

### 新增 Prompt YAML
- `prompts/review/trade_post.yaml` — 交易复盘 AI 分析
- `prompts/persona/style_v1.yaml` — 风格描述生成
- `prompts/ocr/parse_trade.yaml` — 从 OCR 文字解析交易信息

---

**This design document was created for GrowthPilot v2.1**
**Next: Implement Step 1 (复盘模版) → Step 2 (交易风格) → Step 3 (截图修复)**
