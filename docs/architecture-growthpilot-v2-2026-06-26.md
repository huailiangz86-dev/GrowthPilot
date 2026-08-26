# System Architecture: GrowthPilot v2

> **Historical reference:** This v2 architecture is superseded by `docs/README.md` and the active v3.1 Workspace-first architecture. Keep it for evolution history only; do not use it as implementation authority.

**Date:** 2026-06-26
**Version:** 2.0 (supersedes v1)

---

## Architecture Changes (v1 → v2)

| Component | v1 | v2 |
|-----------|-----|-----|
| scenes | trading only | **trading + crypto + fund + expense + forex** |
| 首页 | static dashboard | **信息枢纽（Banner + 资讯 + AI + 任务）** |
| 复盘 | 独立 Tab | **嵌入记录表单 + review_engine 不变** |
| 分析 | tag_engine only | **+ emotion_engine + persona_engine + ai_coach** |
| 增长 | 无 | **growth_engine（任务 + 签到 + 成就）** |
| 资讯 | 无 | **news_service（爬虫 + AI 摘要 + 精准推送）** |
| TabBar | 首页/交易/复盘/统计/我的 | **首页/记录/日历/分析/我的** |

**核心原则不变：** records 通用表 + scene 插件 + engines 场景无关

---

## Updated System Overview

```
┌──────────────────────────────────────────────────────┐
│                 微信小程序 (Taro 4)                     │
│  ┌────────┬────────┬────────┬────────┬────────┐      │
│  │ 首页   │ 记录   │ 日历   │ 分析   │ 我的    │      │
│  │ 信息   │ 全品类  │ 月/日  │ 4子Tab │ 个人   │      │
│  │ 枢纽   │ +复盘  │ 视图   │        │ +成就  │      │
│  └────────┴────────┴────────┴────────┴────────┘      │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────┐
│                  FastAPI Application                   │
│                                                        │
│  ┌─────────────── 通用引擎层 ────────────────┐        │
│  │ record_engine  tag_engine   review_engine  │        │
│  │ pattern_engine calendar_engine             │        │
│  └────────────────────────────────────────────┘        │
│                                                        │
│  ┌─────────────── 场景插件层 ────────────────┐        │
│  │ trading/  crypto/  fund/  expense/  forex/ │        │
│  └────────────────────────────────────────────┘        │
│                                                        │
│  ┌─────────────── v2 新增模块 ───────────────┐        │
│  │ news_service    → 资讯爬虫+AI摘要+推送     │        │
│  │ growth_engine   → 任务+签到+成就+进度      │        │
│  │ emotion_engine  → 情绪分析+趋势            │        │
│  │ persona_engine  → 性格总结+AI教练          │        │
│  │ banner_service  → Banner 管理              │        │
│  └────────────────────────────────────────────┘        │
│                                                        │
│  ┌─────────────── AI 层 ─────────────────────┐        │
│  │ llm_service  compliance_guard  prompt_loader│        │
│  └────────────────────────────────────────────┘        │
└──┬──────────────┬──────────────┬──────────────────────┘
   │              │              │
 PG 16         Redis 7+       Arq Worker
```

---

## New Data Models

### 现有表（不改）
- `users` — 加 `watchlist JSONB`（关注标的列表）
- `records` — 不改（scene 扩展枚举即可）
- `reviews` — 不改
- `tag_definitions` — 加新品类标签 seed
- `pattern_discoveries` — 不改
- `llm_calls` — 不改

### 新增表

```sql
-- 资讯
CREATE TABLE news_items (
    id              UUID PRIMARY KEY,
    source          VARCHAR(32) NOT NULL,    -- eastmoney/sina/coindesk
    title           VARCHAR(500) NOT NULL,
    summary         TEXT,                     -- AI 一句话摘要
    url             VARCHAR(1000),
    sentiment       VARCHAR(16),              -- positive/negative/neutral
    related_symbols JSONB DEFAULT '[]',       -- ["600519","BTC"]
    published_at    TIMESTAMPTZ NOT NULL,
    fetched_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_news_published ON news_items(published_at DESC);
CREATE INDEX idx_news_symbols ON news_items USING GIN(related_symbols);

-- Banner
CREATE TABLE banners (
    id          UUID PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    image_url   VARCHAR(500),
    link_type   VARCHAR(32),              -- page/url/upgrade
    link_target VARCHAR(500),
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    start_at    TIMESTAMPTZ,
    end_at      TIMESTAMPTZ
);

-- 每日签到
CREATE TABLE check_ins (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    check_date  DATE NOT NULL,
    streak      INTEGER DEFAULT 1,
    UNIQUE(user_id, check_date)
);
CREATE INDEX idx_checkins_user ON check_ins(user_id, check_date DESC);

-- 成就
CREATE TABLE achievements (
    id               UUID PRIMARY KEY,
    user_id          UUID NOT NULL,
    achievement_type VARCHAR(32) NOT NULL,
    unlocked_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, achievement_type)
);

-- 每日任务状态
CREATE TABLE daily_tasks (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    task_date   DATE NOT NULL,
    recorded    BOOLEAN DEFAULT FALSE,
    reviewed    BOOLEAN DEFAULT FALSE,
    analyzed    BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, task_date)
);

-- 用户关注标的
ALTER TABLE users ADD COLUMN IF NOT EXISTS watchlist JSONB DEFAULT '[]';
-- ["600519","BTC","AAPL"]
```

---

## New/Updated Engines

### news_service.py (新增)

```
职责：
1. 定时爬取资讯源（Arq 定时任务，每 30 分钟）
2. AI 生成一句话摘要
3. 提取相关标的（关键词匹配）
4. 标记情感（利好/利空/中性）
5. 根据用户 watchlist 推送相关资讯

数据源：
- 东方财富 RSS / 新浪财经 RSS → A 股
- CoinDesk / 金色财经 → 加密货币
- Yahoo Finance → 美股

API:
GET /api/v1/news?symbols=600519,BTC → 精准推送
GET /api/v1/news/trending → 热点资讯
```

### growth_engine.py (新增)

```
职责：
1. 每日任务管理（记录/复盘/查看分析）
2. 签到系统（连续签到计数）
3. 成就解锁判定
4. 成长进度计算

API:
GET  /api/v1/growth/tasks      → 今日任务状态
POST /api/v1/growth/tasks/{type}/complete → 完成任务
POST /api/v1/growth/check-in   → 签到
GET  /api/v1/growth/achievements → 成就列表
GET  /api/v1/growth/progress    → 成长进度百分比
```

### emotion_engine.py (新增)

```
职责：
1. 情绪-盈亏关联分析（SQL）
2. 情绪分布变化趋势（按月）
3. 复盘文本情感分析（LLM）
4. 最佳交易状态洞察

API:
GET /api/v1/analysis/emotion/correlation → 情绪盈亏关联
GET /api/v1/analysis/emotion/trend       → 情绪趋势
GET /api/v1/analysis/emotion/best-state  → 最佳状态
```

### persona_engine.py (新增)

```
职责：
1. AI 性格总结（每月，LLM）
2. 5 维雷达图数据
3. AI 教练对话（苏格拉底式）
4. 行为周报/月报生成
5. 复盘质量分析

API:
GET  /api/v1/analysis/persona       → 性格总结
POST /api/v1/analysis/coach/chat    → AI 教练对话
GET  /api/v1/analysis/report/weekly → 周报
GET  /api/v1/analysis/review-quality → 复盘质量
```

### banner_service.py (新增)

```
API:
GET /api/v1/banners → 活跃 Banner 列表（按 sort_order）
```

---

## New Scene Plugins

### 每个品类需要新增的内容

| 品类 | scene 值 | 标签 seed | content 结构 |
|------|---------|----------|-------------|
| 加密货币 | crypto | 策略/情绪/周期 | {coin,price_enc,quantity_enc,exchange} |
| 基金 ETF | fund | 配置原因/调仓原因 | {fund_name,amount_enc,action} |
| 日常开销 | expense | 类别 | {amount_enc,category,note} |
| 外汇 | forex | 策略/情绪 | {pair,price_enc,leverage,direction} |
| 期货 | futures | 策略/情绪 | {contract,price_enc,leverage,direction} |

**实现方式：**
- 新增 `scenes/crypto/`, `scenes/fund/`, `scenes/expense/` 目录
- 每个目录包含 `{scene}_service.py`（content 验证 + 加密）
- tag_engine 的 `seed_preset_tags()` 扩展新品类标签

---

## Updated API Endpoints

### 新增端点（v2）

```
# 资讯
GET    /api/v1/news                    # 精准推送（基于 watchlist）
GET    /api/v1/news/trending           # 热点

# 增长
GET    /api/v1/growth/tasks            # 今日任务
POST   /api/v1/growth/tasks/{type}/complete
POST   /api/v1/growth/check-in         # 签到
GET    /api/v1/growth/achievements     # 成就
GET    /api/v1/growth/progress         # 进度

# 深度分析
GET    /api/v1/analysis/emotion/correlation
GET    /api/v1/analysis/emotion/trend
GET    /api/v1/analysis/persona
POST   /api/v1/analysis/coach/chat
GET    /api/v1/analysis/report/weekly
GET    /api/v1/analysis/review-quality

# Banner
GET    /api/v1/banners

# 日历（已有）
GET    /api/v1/calendar/month
GET    /api/v1/calendar/day

# 资料库（已有）
GET    /api/v1/knowledge/search
GET    /api/v1/knowledge/summary
```

### 总端点预估：~45 个

---

## Updated Code Organization

```
backend/app/
├── core/                    # 不变
├── models/                  # +news_item, banner, check_in, achievement, daily_task
├── schemas/                 # +news, growth, analysis schemas
├── api/                     # +news, growth, analysis, banners routers
│
├── engines/                 # 通用引擎（不变 + 新增）
│   ├── record_engine.py     # 不变
│   ├── tag_engine.py        # +新品类标签 seed
│   ├── review_engine.py     # 不变
│   ├── pattern_engine.py    # 不变
│   ├── calendar_engine.py   # 已有（从 api/calendar.py 重构）
│   ├── growth_engine.py     # 新增：任务+签到+成就
│   ├── emotion_engine.py    # 新增：情绪分析
│   └── persona_engine.py    # 新增：性格+AI教练
│
├── scenes/                  # 场景插件
│   ├── trading/             # 已有
│   ├── crypto/              # 新增
│   ├── fund/                # 新增
│   ├── expense/             # 新增
│   └── forex/               # 新增
│
├── services/                # 新增服务
│   ├── news_service.py      # 资讯爬虫+AI摘要
│   └── banner_service.py    # Banner 管理
│
├── ai/                      # 不变
└── workers/tasks/            # +news_fetch_task, persona_task
```

---

## Implementation Priority

### Phase A: 核心体验升级（Week 1-2）
- EPIC-002: 全品类记录表单（含内嵌复盘）
- EPIC-003: 日历系统完善
- EPIC-004: 首页重设计（Banner + 概览 + 快捷操作）
- 新 TabBar 切换

### Phase B: 分析深度化（Week 2-3）
- EPIC-006: 情绪分析 + 性格总结 + AI 教练
- 分析页 4 子 Tab UI

### Phase C: 增长 + 资讯（Week 3-4）
- EPIC-007: 任务 + 签到 + 成就系统
- EPIC-005: 资讯爬虫 + 精准推送
- EPIC-001: 新手引导完善

---

## Cost Estimation (200 users)

| Item | Monthly Cost |
|------|-------------|
| ECS 2C4G | ¥200 |
| LLM (性格+教练+资讯摘要) | ¥80 |
| 资讯爬虫（RSS 免费，爬虫成本低） | ¥0 |
| OSS | ¥10 |
| **Total** | **¥290** |

---

**This architecture was created using BMAD Method v6**
