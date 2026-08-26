# System Architecture: GrowthPilot v1

> **Historical reference:** This v1 architecture is superseded by `docs/README.md` and the active v3.1 Workspace-first architecture. Keep it for evolution history only; do not use it as implementation authority.

**Date:** 2026-06-26
**Architect:** Zhang
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

GrowthPilot v1 采用**模块化单体 + 插件式场景引擎**架构。核心设计：底层是通用的「记录-标签-复盘-分析」引擎，交易只是第一个加载的「场景插件」。v2 扩展职业/技能场景时只需新增模板和标签集，不重写引擎。

**架构原则：**
1. **场景即插件** — 交易/职业/技能是引擎上的模板，不是硬编码模块
2. **标签是一等公民** — 所有分析能力建立在结构化标签之上
3. **AI 异步不阻塞** — 模式发现在后台计算，前端不等待
4. **数据分区** — 不同场景的数据逻辑隔离，为隐私保护预留

---

## Architectural Drivers

| Priority | NFR | Impact |
|----------|-----|--------|
| **P0** | NFR-004 模块化 | 决定数据模型和组件设计 — 复盘引擎必须场景无关 |
| **P0** | NFR-003 合规 | AI 输出过滤层 |
| **P0** | NFR-002 安全 | 价格加密 + user_id 隔离 |
| **P0** | NFR-007 AI 成本 | 标签统计靠 SQL，不靠 LLM；只有复盘对话和模式发现用 LLM |
| **P1** | NFR-001 性能 | 标签统计要快（Redis 缓存） |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│              微信小程序 (Taro 4)                  │
│  ┌────────┬────────┬────────┬────────┬────────┐ │
│  │ 首页   │ 交易   │ 复盘   │ 统计   │ 我的   │ │
│  └───┬────┴───┬────┴───┬────┴───┬────┴───┬────┘ │
└──────┼────────┼────────┼────────┼────────┼──────┘
       │ HTTPS  │        │        │        │
       ▼        ▼        ▼        ▼        ▼
┌─────────────────────────────────────────────────┐
│           FastAPI Application                    │
│                                                  │
│  ┌──────────────────────────────────────┐       │
│  │        通用引擎层 (Core Engine)        │       │
│  │  ┌──────────┬──────────┬──────────┐  │       │
│  │  │ 记录引擎  │ 标签引擎  │ 复盘引擎  │  │       │
│  │  │ Record   │ Tag      │ Review   │  │       │
│  │  │ Engine   │ Engine   │ Engine   │  │       │
│  │  └──────────┴──────────┴──────────┘  │       │
│  └──────────────────┬───────────────────┘       │
│                     │                            │
│  ┌──────────────────┴───────────────────┐       │
│  │       场景插件层 (Scene Plugins)       │       │
│  │  ┌──────────┐  ┌─────┐  ┌─────┐     │       │
│  │  │ 交易场景  │  │ 职业 │  │ 技能 │     │       │
│  │  │ (v1 激活) │  │(v3) │  │(v2) │     │       │
│  │  └──────────┘  └─────┘  └─────┘     │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│  ┌──────────────────────────────────────┐       │
│  │         AI 分析层                     │       │
│  │  ┌──────────┬──────────┬──────────┐  │       │
│  │  │ 标签统计  │ 模式发现  │ AI 复盘   │  │       │
│  │  │ (SQL)    │ (SQL+AI) │ (LLM)    │  │       │
│  │  └──────────┴──────────┴──────────┘  │       │
│  │  ┌──────────┐                        │       │
│  │  │合规过滤   │                        │       │
│  │  └──────────┘                        │       │
│  └──────────────────────────────────────┘       │
└──┬──────────────┬──────────────┬────────────────┘
   ▼              ▼              ▼
┌──────┐    ┌──────────┐   ┌──────────┐
│PG 16 │    │ Redis 7+ │   │Arq Worker│
└──────┘    └──────────┘   └──────────┘
```

**Pattern:** 模块化单体 + 插件式场景引擎

**Rationale:** v1 只有交易场景，单体足够。但通过「引擎层 + 插件层」的分离，v2 加职业/技能场景时只需要：(1) 新增场景配置 (2) 新增标签集 (3) 新增复盘模板。核心引擎 0 改动。

---

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Taro 4 (React) + TypeScript | 微信小程序，复用 EdgeBook 经验 |
| **Backend** | FastAPI + SQLAlchemy 2.0 async | 验证过的高性能栈 |
| **Database** | PostgreSQL 16 | 关系型 + JSONB 灵活存储标签 |
| **Cache** | Redis 7+ | 标签统计缓存 + 额度计数 |
| **Task Queue** | Arq | AI 模式发现异步计算 |
| **LLM** | Qwen (主) / DeepSeek (备) | 已有 API Key |
| **Deploy** | 阿里云 ECS + systemd | 验证过的部署方式 |

---

## Core Engine: 通用数据模型

**这是架构最关键的设计 — 场景无关的通用模型：**

### records（通用记录表）

```sql
CREATE TABLE records (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    scene       VARCHAR(32) NOT NULL,     -- 'trading' / 'career' / 'skill'
    record_type VARCHAR(32) NOT NULL,     -- 场景内子类型: 'buy'/'sell'/'project'/'course'

    -- 通用字段
    title       VARCHAR(200) NOT NULL,    -- "贵州茅台 买入" / "Q2 项目复盘"
    content     JSONB NOT NULL DEFAULT '{}', -- 场景特有数据（价格/数量等）

    -- 标签（核心！）
    tags        JSONB NOT NULL DEFAULT '[]', -- [{"category":"buy_reason","value":"突破前高"},...]
    emotion     VARCHAR(16),              -- 情绪标签

    -- 元数据
    occurred_at TIMESTAMPTZ NOT NULL,     -- 事件发生时间（交易时间/项目完成时间）
    proof_hash  VARCHAR(64) NOT NULL,
    proof_ts    INTEGER NOT NULL,

    -- 附件
    attachments JSONB DEFAULT '[]',       -- [{"type":"image","key":"oss://..."}]

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_records_user_scene ON records(user_id, scene, occurred_at DESC);
CREATE INDEX idx_records_tags ON records USING GIN(tags);
```

### 交易场景的 content 结构

```json
{
  "symbol": "600519",
  "symbol_name": "贵州茅台",
  "market": "A",
  "direction": "BUY",
  "price_enc": "aes256...",
  "quantity_enc": "aes256...",
  "sell_price_enc": "aes256...",
  "sell_time": "2026-06-25T15:00:00",
  "pnl": 1200,
  "pnl_pct": 5.2,
  "paired_record_id": "uuid..."
}
```

### 标签系统（tags JSONB）

```json
[
  {"category": "buy_reason", "value": "突破前高"},
  {"category": "buy_reason", "value": "趋势突破"},
  {"category": "sell_reason", "value": "止盈"},
  {"category": "emotion", "value": "平静"}
]
```

**为什么用 JSONB 而非关联表？**
- 标签是记录的属性，不是独立实体
- GIN 索引支持高效查询 `tags @> '[{"category":"buy_reason","value":"抄底"}]'`
- 自定义标签不需要 DDL 变更
- v2 新场景（职业/技能）只需新增 category，不改表结构

### tag_definitions（标签定义表）

```sql
CREATE TABLE tag_definitions (
    id          UUID PRIMARY KEY,
    user_id     UUID,                     -- NULL = 系统预设, 非 NULL = 用户自定义
    scene       VARCHAR(32) NOT NULL,     -- 'trading' / 'career' / 'all'
    category    VARCHAR(32) NOT NULL,     -- 'buy_reason' / 'sell_reason' / 'emotion'
    value       VARCHAR(64) NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,

    UNIQUE(user_id, scene, category, value)
);
```

**预设标签（v1 交易场景）：**

| category | values |
|----------|--------|
| buy_reason | 突破前高, 超跌反弹, 消息刺激, 抄底, 趋势突破, 均线信号, 基本面, 技术面 |
| sell_reason | 止盈, 止损, 破均线, 情绪卖出, 尾盘卖出, 目标达到, 趋势结束 |
| emotion | 兴奋, 焦虑, 冲动, 害怕, 平静 |

### reviews（通用复盘表）

```sql
CREATE TABLE reviews (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    scene       VARCHAR(32) NOT NULL,
    template    VARCHAR(32) NOT NULL,     -- 'trading_daily' / 'trading_post' / 'project'

    -- 复盘内容
    did_right   TEXT,                      -- 做对了什么
    did_wrong   TEXT,                      -- 做错了什么
    next_plan   TEXT,                      -- 下次怎么做
    notes       TEXT,                      -- 额外笔记

    -- 标签 + 附件
    tags        JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',

    -- AI 分析
    ai_analysis JSONB,                    -- AI 生成的分析结果
    ai_conversation JSONB DEFAULT '[]',   -- 对话历史

    -- 关联记录（可选）
    linked_record_ids JSONB DEFAULT '[]', -- 关联的交易/项目记录

    review_date DATE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_user_scene ON reviews(user_id, scene, review_date DESC);
```

### 其他表

```sql
-- 用户
CREATE TABLE users (
    id              UUID PRIMARY KEY,
    wx_openid       VARCHAR(128) UNIQUE,
    nickname        VARCHAR(64) DEFAULT '',
    avatar_url      VARCHAR(512) DEFAULT '',
    markets         JSONB DEFAULT '["A"]',    -- 选择的市场
    review_schedule VARCHAR(16) DEFAULT 'manual', -- 'post_trade'/'daily'/'manual'
    review_time     TIME DEFAULT '20:00',
    is_beta_user    BOOLEAN DEFAULT FALSE,
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AI 模式发现结果
CREATE TABLE pattern_discoveries (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    scene       VARCHAR(32) NOT NULL,
    pattern_type VARCHAR(32) NOT NULL,    -- 'tag_winrate'/'time_pattern'/'holding_pattern'/'emotion_pattern'/'streak_pattern'
    title       VARCHAR(200) NOT NULL,    -- "抄底胜率仅28%"
    description TEXT NOT NULL,
    data        JSONB NOT NULL,           -- 统计数据
    sample_size INTEGER NOT NULL,
    severity    VARCHAR(16) NOT NULL,     -- 'positive'/'negative'/'neutral'
    is_read     BOOLEAN DEFAULT FALSE,
    discovered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patterns_user ON pattern_discoveries(user_id, scene, discovered_at DESC);

-- LLM 调用追踪
CREATE TABLE llm_calls (
    id          UUID PRIMARY KEY,
    user_id     UUID,
    purpose     VARCHAR(64),
    model       VARCHAR(64),
    prompt_version VARCHAR(32),
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_yuan   FLOAT DEFAULT 0,
    latency_ms  INTEGER DEFAULT 0,
    status      VARCHAR(16) DEFAULT 'success',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## System Components

### Component 1: Record Engine（记录引擎）

**Purpose:** 通用记录 CRUD — 场景无关

**Responsibilities:**
- 创建/编辑/删除/查询记录
- 标签绑定和验证
- 时间戳存证
- 附件管理（截图/文件）
- 场景 content 验证（交易场景验证价格/数量，职业场景验证项目名等）

**FRs:** FR-002, FR-003, FR-004, FR-005, FR-012, FR-013

### Component 2: Tag Engine（标签引擎）

**Purpose:** 标签管理 + 标签统计（"震撼时刻"的数据源）

**Responsibilities:**
- 标签定义管理（系统预设 + 用户自定义）
- 标签统计计算（按 category 分组的胜率/盈亏）
- 标签交叉分析（buy_reason × emotion 矩阵）
- 统计缓存（Redis，新记录时失效）

**FRs:** FR-008, FR-010

**关键 SQL（标签胜率统计）：**
```sql
-- 按买入原因标签统计胜率
SELECT
    tag->>'value' AS tag_value,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins,
    ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / COUNT(*) * 100, 1) AS win_rate,
    ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
FROM records, jsonb_array_elements(tags) AS tag
WHERE user_id = :user_id
    AND scene = 'trading'
    AND tag->>'category' = 'buy_reason'
    AND content->>'pnl' IS NOT NULL
    AND deleted_at IS NULL
GROUP BY tag->>'value'
ORDER BY total DESC;
```

### Component 3: Review Engine（复盘引擎）

**Purpose:** 通用复盘 — 场景通过模板区分

**Responsibilities:**
- 复盘创建（灵活触发：交易后/每日/手动）
- 复盘模板管理（v1 只有交易模板，架构支持多模板）
- AI 对话复盘
- 复盘历史和搜索

**FRs:** FR-006, FR-007

### Component 4: Pattern Discovery Engine（模式发现引擎）

**Purpose:** 从数据中自动发现行为模式 — 产品最值钱的部分

**Responsibilities:**
- 标签胜率模式（"抄底胜率 28%"） — 纯 SQL
- 时间模式（"下午 2 点后亏损率 65%"） — 纯 SQL
- 持仓模式（"持仓 >3 天收益 +110%"） — 纯 SQL
- 连续行为模式（"连亏 3 笔后加仓胜率 18%"） — SQL + 简单逻辑
- 情绪行为模式（"焦虑时亏损 +42%"） — 纯 SQL
- AI 高阶模式（跨维度关联） — LLM（Arq 异步）

**关键设计：** 大多数模式发现**不需要 LLM**，纯 SQL 统计即可。只有复杂关联和自然语言描述才用 LLM。这大幅降低 AI 成本。

**FRs:** FR-009, FR-016, FR-017

### Component 5: AI Layer

**Sub-components:**

| Module | Purpose | 调用频率 |
|--------|---------|---------|
| llm_service | 统一 LLM 调用 | 每次 AI 对话 |
| prompt_loader | YAML Prompt 管理 | — |
| compliance_guard | 投资建议过滤 | 每条 AI 输出 |
| pattern_analyzer | SQL 统计 + LLM 描述 | 每 30 笔交易异步 |

**FRs:** FR-007, FR-009

### Component 6: Trading Scene Plugin（交易场景插件）

**Purpose:** 交易特有的逻辑

**Responsibilities:**
- 交易 content 验证和加密（价格/数量 AES-256）
- 买入/卖出自动配对 + 盈亏计算
- 标的搜索（多市场）
- 交易特有统计（收益曲线/最大回撤/盈亏比）
- 截图 OCR 交易识别

**FRs:** FR-002, FR-003, FR-010, FR-012

---

## API Design

### Auth
```
POST   /api/v1/auth/wx-login         # 微信登录
GET    /api/v1/auth/me                # 用户信息
PATCH  /api/v1/auth/me                # 更新设置
```

### Records（通用记录）
```
POST   /api/v1/records                # 创建记录（scene+content+tags）
GET    /api/v1/records                # 列表（分页+筛选 scene/tags/date）
GET    /api/v1/records/{id}           # 详情
PATCH  /api/v1/records/{id}           # 编辑（补填卖出/修改标签）
DELETE /api/v1/records/{id}           # 软删除
```

### Trading（交易场景专属）
```
POST   /api/v1/trading/pair           # 自动配对买卖
POST   /api/v1/trading/ocr            # 截图 OCR
GET    /api/v1/trading/search-symbol   # 标的搜索
POST   /api/v1/trading/import         # 文件批量导入
```

### Tags
```
GET    /api/v1/tags                    # 获取标签定义（按 scene/category）
POST   /api/v1/tags                    # 创建自定义标签
DELETE /api/v1/tags/{id}               # 删除自定义标签
```

### Reviews（复盘）
```
POST   /api/v1/reviews                 # 创建复盘
GET    /api/v1/reviews                 # 复盘历史
GET    /api/v1/reviews/{id}            # 复盘详情
POST   /api/v1/reviews/{id}/chat       # AI 复盘对话
```

### Stats & Patterns（统计 + 模式发现）
```
GET    /api/v1/stats/overview          # 核心指标
GET    /api/v1/stats/tags              # 标签统计（震撼时刻）
GET    /api/v1/stats/tags/cross        # 标签交叉分析
GET    /api/v1/stats/pnl-curve         # 收益曲线
GET    /api/v1/patterns                # 已发现的模式列表
POST   /api/v1/patterns/discover       # 触发模式发现（异步）
```

### Dashboard
```
GET    /api/v1/dashboard               # 首页数据（今日盈亏+AI 建议+任务状态）
```

---

## Code Organization

```
GrowthPilot/
├── docs/                             # BMAD 文档
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/                     # config, database, redis, security, encryption
│   │   ├── models/                   # SQLAlchemy: user, record, review, pattern, tag_def, llm_call
│   │   ├── schemas/                  # Pydantic v2
│   │   ├── api/                      # Routers: auth, records, trading, tags, reviews, stats, patterns, dashboard
│   │   │
│   │   ├── engines/                  # ← 通用引擎（场景无关）
│   │   │   ├── record_engine.py      # 记录 CRUD
│   │   │   ├── tag_engine.py         # 标签管理 + 统计
│   │   │   ├── review_engine.py      # 复盘 CRUD + 模板
│   │   │   └── pattern_engine.py     # 模式发现（SQL + AI）
│   │   │
│   │   ├── scenes/                   # ← 场景插件
│   │   │   ├── trading/              # 交易场景
│   │   │   │   ├── trading_service.py  # 配对/盈亏/加密
│   │   │   │   ├── trading_stats.py    # 收益曲线/盈亏比
│   │   │   │   ├── symbol_service.py   # 标的搜索
│   │   │   │   └── ocr_service.py      # 截图识别
│   │   │   ├── career/               # v3 职业场景（空）
│   │   │   └── skill/                # v2 技能场景（空）
│   │   │
│   │   ├── ai/                       # AI 层
│   │   │   ├── llm_service.py
│   │   │   ├── prompt_loader.py
│   │   │   ├── compliance_guard.py
│   │   │   └── pattern_analyzer.py   # SQL 统计 + LLM 描述
│   │   │
│   │   ├── workers/                  # Arq 任务
│   │   │   └── tasks/
│   │   │       ├── pattern_task.py   # 模式发现（异步）
│   │   │       ├── review_task.py    # AI 复盘（异步）
│   │   │       └── report_task.py    # 周月报告（定时）
│   │   │
│   │   └── middleware/
│   ├── prompts/
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
│
├── miniapp/                          # Taro 小程序
│   └── src/
│       ├── pages/                    # 首页/交易/复盘/统计/我的
│       ├── components/
│       ├── api/
│       ├── stores/
│       └── hooks/
│
├── .claude/                          # 开发规范
└── deploy.sh
```

**关键目录分离：**
- `engines/` — 通用引擎，场景无关，v2+ 不改
- `scenes/trading/` — 交易场景特有逻辑，v2 加 `scenes/career/` 即可
- `ai/` — AI 层独立，所有场景共用

---

## Pattern Discovery: SQL vs LLM 分工

**成本关键决策：** 大部分模式发现不需要 LLM。

| 模式类型 | 实现方式 | 成本 |
|----------|---------|------|
| 标签胜率（"抄底 28%"） | **纯 SQL** GROUP BY + COUNT | ¥0 |
| 标签交叉（"突破+平静=82%"） | **纯 SQL** 两层 GROUP BY | ¥0 |
| 时间模式（"下午2点后亏65%"） | **纯 SQL** EXTRACT(HOUR) | ¥0 |
| 持仓模式（"持仓>3天+110%"） | **纯 SQL** 日期差计算 | ¥0 |
| 连续模式（"连亏3笔后加仓"） | **SQL + Python** 窗口函数 | ¥0 |
| 情绪关联（"焦虑时亏42%"） | **纯 SQL** WHERE emotion | ¥0 |
| 自然语言描述 | **LLM** 将统计结果转为用户友好文字 | ~¥0.02/条 |
| 复杂跨维度关联 | **LLM** 发现非显式模式 | ~¥0.10/次 |

**结论：** 100 用户 × 每月 5 次模式发现 = ~500 次。纯 SQL 部分 ¥0，LLM 描述部分 ~¥10/月。远低于 NFR-007 的 ¥500 预算。

---

## NFR Coverage

### NFR-004: 模块化（最关键）

**Solution:**
- `records` 表用 `scene` + `content JSONB` 实现场景无关存储
- `tags` 用 JSONB 数组 + GIN 索引，新标签类别不需要 DDL
- `engines/` 目录与 `scenes/` 目录严格分离
- 复盘模板化：`reviews.template` 字段区分场景

**Validation:** v2 加职业场景时，只需要：新增 `scenes/career/`，新增标签定义，新增复盘模板。engines/ 零改动。

### NFR-001: 性能

**Solution:**
- 标签统计结果 Redis 缓存（TTL 5min，新记录时失效）
- 模式发现异步（Arq task），结果存 pattern_discoveries 表
- 交易记录创建同步 < 1s

### NFR-002: 安全

**Solution:**
- 交易价格/数量 AES-256 加密存 content JSONB
- 所有查询强制 user_id 过滤
- JWT 7 天过期

### NFR-003: 合规

**Solution:**
- compliance_guard 双重检查
- 所有 AI 输出附免责声明

### NFR-007: AI 成本

**Solution:**
- 模式发现主要靠 SQL，LLM 只做自然语言描述
- 预估月成本 < ¥50（100 用户）

---

## Trade-offs

### Decision 1: JSONB tags vs 关联表

**Choice:** JSONB 数组 + GIN 索引
**Gain:** 灵活（新标签不改表），查询简单（@> 操作符），自定义标签零成本
**Lose:** 聚合查询比关联表稍慢（但 GIN 索引弥补），无外键约束
**Rationale:** 标签是记录的属性而非独立实体，JSONB 更自然

### Decision 2: 通用 records 表 vs 每场景独立表

**Choice:** 通用 records 表 + scene 字段 + content JSONB
**Gain:** v2 新场景零 DDL，引擎代码通用
**Lose:** content 结构不由数据库约束（靠应用层验证）
**Rationale:** 模块化扩展是核心 NFR，牺牲少量数据库约束换取极大的灵活性

### Decision 3: 模式发现 SQL 优先 vs LLM 优先

**Choice:** SQL 统计为主，LLM 只做描述和高阶分析
**Gain:** 成本降低 90%+，速度更快，结果更准确（数据不会"幻觉"）
**Lose:** 复杂非线性模式可能遗漏
**Rationale:** 标签统计是确定性计算，不该用概率模型。LLM 擅长生成描述文字，不擅长数学。

---

## FR Traceability

| FR | Component | Notes |
|----|-----------|-------|
| FR-001 登录 | User Service | 微信登录 |
| FR-002 交易记录 | Record Engine + Trading Plugin | 通用引擎+交易 content 验证 |
| FR-003 截图导入 | Trading Plugin (OCR) | Should Have |
| FR-004 文件导入 | Trading Plugin (Import) | Could Have |
| FR-005 交易管理 | Record Engine | 通用 CRUD |
| FR-006 灵活复盘 | Review Engine | 模板化复盘 |
| FR-007 AI 复盘 | AI Layer + Review Engine | LLM 对话 |
| FR-008 标签统计 | Tag Engine | 纯 SQL |
| FR-009 模式发现 | Pattern Engine | SQL + LLM |
| FR-010 统计中心 | Tag Engine + Trading Stats | 复合 |
| FR-011 首页 | Dashboard API | 聚合 |
| FR-012 多市场 | Trading Plugin | 标的搜索 |
| FR-013 存证 | Record Engine | SHA-256 hash |
| FR-014 内测 | User Service | beta flag |
| FR-015 设置 | User Service | JSONB settings |
| FR-016 模式提醒 | Pattern Engine | 实时检查 |
| FR-017 正面强化 | Pattern Engine | 完成时触发 |
| FR-018 周月报告 | Report Task (Arq) | 定时 |

---

## Cost Estimation (Monthly, 100 users)

| Item | Cost |
|------|------|
| 阿里云 ECS 2C4G | ¥200 |
| LLM (复盘对话 ~300 次/月) | ¥30 |
| LLM (模式描述 ~500 条/月) | ¥10 |
| OSS (截图存储) | ¥10 |
| **Total** | **¥250** |

内测期无收入，月成本 ¥250 可承受。

---

**This document was created using BMAD Method v6 - Phase 3 (Solutioning)**

## Next Steps

Run `/bmad:sprint-planning` to break 5 epics into sprints for 2-4 week delivery.
