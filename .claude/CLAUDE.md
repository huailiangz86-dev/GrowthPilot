# GrowthPilot 项目说明

GrowthPilot（成长领航）是 AI 个人成长教练平台。v1 聚焦 AI 交易教练：标签式交易记录 + 灵活复盘 + AI 模式发现。

## 权威文档

- `docs/prd-growthpilot-2026-06-26.md` — 产品需求
- `docs/architecture-growthpilot-2026-06-26.md` — 技术架构
- `docs/sprint-plan-growthpilot-2026-06-26.md` — Sprint 排期
- `docs/brainstorming-growthpilot-2026-06-26.md` — 头脑风暴

## 新需求全流程（铁律）

任何新功能必须走完整 BMAD：brainstorm → research → PRD → architecture → sprint → dev

## 技术栈

- **后端** FastAPI + SQLAlchemy 2.0 async + Arq + Pydantic v2
- **前端** Taro 4 (React) + TypeScript
- **数据** PostgreSQL 16 + Redis 7+
- **LLM** Qwen(主) / DeepSeek(备)
- **数据库** growthpilot_dev / growthpilot_test, Redis db 6/7

## 架构核心：场景插件化

```
engines/ — 通用引擎（场景无关，v2+ 不改）
  record_engine.py, tag_engine.py, review_engine.py, pattern_engine.py
scenes/ — 场景插件（交易/职业/技能）
  trading/, career/, skill/
ai/ — AI 层（所有场景共用）
```

**记录表 records 是通用表**，用 scene + content JSONB 区分场景。标签用 tags JSONB + GIN 索引。

## 红线清单

### R-01: AI 输出零投资建议
所有 AI 输出必须过 compliance_guard。免责声明自动追加。

### R-02: 交易价格加密
records.content 中的 price/quantity 字段 AES-256 加密。

### R-03: 用户数据隔离
所有查询必须包含 user_id 过滤。

### R-04: AI 调用可追踪
所有 LLM 调用记录到 llm_calls 表。

### R-05: 模式发现 SQL 优先
标签统计用 SQL（JSONB GIN），不用 LLM。LLM 只做自然语言描述。

### R-06: 标签是一等公民
买入原因/卖出原因/情绪 用标签多选，不用自由文本。这是"震撼统计"的基础。

### R-07: 复盘引擎场景无关
reviews 表用 template 字段区分场景。engines/ 不 import scenes/。

### R-08: 存证不可变
records.proof_hash 创建后不可修改。

## 协作规则

1. 不绕开 engines/ → scenes/ 的分层
2. Prompt 从 prompts/*.yaml 加载
3. LLM 调用走 ai/llm_service.py
4. 新场景只加 scenes/xxx/ 和标签定义，不改 engines/
5. API 响应用 ApiResponse[T] 包装
6. 前端 API 类型从 generated/types.ts import

## 常见错误

1. API 响应必须用 ApiResponse 包装
2. httpx 必须 trust_env=False
3. Arq 任务用 status() + result_info()
4. Pydantic v2 语法（@field_validator, model_dump）
5. SQLAlchemy 2.0 async（select + await session.execute）
6. 标签查询用 GIN：`tags @> '[{"category":"buy_reason","value":"抄底"}]'`
