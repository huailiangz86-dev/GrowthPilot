---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - docs/prd-growthpilot-personal-agent-os-2026-08-06.md
  - docs/brainstorming-personal-agent-os-20260803.md
  - docs/ux-design-growthpilot-personal-agent-os-2026-08-08.md
  - docs/epics-growthpilot-personal-agent-os-2026-08-08.md
  - .claude/CLAUDE.md
workflowType: architecture
project_name: GrowthPilot Personal Agent OS
user_name: zhang
date: 2026-08-09
status: draft - ready for product review
---

# System Architecture: GrowthPilot Personal Agent OS

**Date:** 2026-08-09
**Version:** 3.1
**Status:** Draft - Ready for Product Review
**Scope:** Workspace-first 架构、Growth OS、Capability Registry、Agent 编排、数据模型、API 边界、旧模块迁移

---

## Executive Summary

GrowthPilot v3.1 从“Memory-first Personal Agent OS”校正为“Workspace-first AI Personal Workspace + Growth OS”。架构中心从旧 v2 的 `records + scenes + trading/growth/news/persona` 切换为 `Workspace + Project + Goal/Plan + Task + Knowledge + Capability + Memory + Agent Orchestrator`。

Workspace 是用户看得见、每天使用的承载层；Growth OS 是跨工作、学习和生活事件的规划与分析层；Memory 是长期上下文和引用层；Capability Registry 是 App、Connection、Plugin、Skill、Agent Expert 的统一能力层。

核心决策：

1. Workspace 是默认产品入口，所有主要对象通过 Workspace / Project 组织；领域表保存当前状态，Workspace Event 保存事实，Memory 保存跨域长期上下文和可引用内容。
2. 不引入复杂 Agent 框架，使用 FastAPI + Pydantic + Prompt YAML + LLM Service 自建轻量 Orchestrator。
3. 沿用现有 FastAPI、SQLAlchemy async、PostgreSQL、Redis、Arq、Taro 4 技术栈，避免重开项目。
4. 新系统新增 `Workspace`、`Capability Registry`、`app/agents/` 和 Memory 引擎层，旧交易功能降级为 legacy 插件，不再定义主架构。
5. 所有 AI 输出必须带可追溯引用，重要建议需说明使用了哪些 Workspace、Project、Memory、Task、Goal、Knowledge 或 Agent Run。

---

## Project Context Analysis

### Requirements Overview

新 PRD 包含 21 条功能需求，分为 9 个架构域：

| Domain | FRs | Architectural Meaning |
|--------|-----|------------------------|
| Workspace/Onboarding | FR-001, FR-019 | 建立用户初始上下文、Workspace、Project 和首批行动 |
| Memory Agent | FR-002 to FR-004 | 统一记忆写入、检索、实体关系、健康度 |
| Reflection Agent | FR-005 to FR-008 | 晨间、微复盘、晚间、周期回顾形成每日数据闭环 |
| Task Agent | FR-009 to FR-010 | 任务 CRUD、推荐、能量匹配、目标对齐 |
| Goal Agent | FR-011 to FR-012 | 目标结构化、拆解、进度和风险预警 |
| Knowledge/Work Agent | FR-013 to FR-014 | 知识卡片、外部工具事件进入 Memory |
| Global AI/Dashboard/Mine | FR-015 to FR-018, FR-021 | Agent Router、首页聚合、成长数据、导出删除 |
| Capability Registry | FR-020 | App、Connection、Plugin、Skill、Agent Expert 的目录、授权和调用 |

### Non-Functional Drivers

| Requirement | Architectural Decision |
|-------------|------------------------|
| 每天 < 10 分钟 | 核心流程必须轻表单、异步 AI、可跳过非必填字段 |
| Dashboard <= 2 秒 | 聚合接口预计算今日摘要，避免首屏实时多 Agent 串联 |
| Memory 检索 P95 <= 1.5 秒 | PostgreSQL JSONB + 全文索引 + pgvector 混合检索 |
| AI 失败不阻塞保存 | 保存用户输入与 AI 总结解耦，AI 通过 Arq 异步补全 |
| 删除后不可检索 | Memory 和派生实体必须支持软删除过滤与异步清理 |
| AI 建议可追溯 | 回复结构必须包含 citations/ref_ids |
| 成本控制 | 先检索、再决定是否调用 LLM，批处理周/月回顾 |

### Complexity Assessment

**Complexity level:** High

主要复杂点：

- 长期个人数据模型复杂，且需要跨任务、目标、复盘、知识统一检索。
- Agent 输出质量依赖引用与上下文构建，不只是普通聊天。
- 旧项目已有交易成长代码，需要迁移边界，不能直接推倒重来。
- 隐私、删除、导出、user_id 隔离是基础能力，不是后补项。
- 前端需要同时支持小程序和 Web 预览/管理端，交互是每日高频。

### Existing Technical Baseline

项目已存在：

- Backend: FastAPI, SQLAlchemy 2.0 async, PostgreSQL, Redis, Arq, Pydantic v2
- Miniapp: Taro 4 + React + TypeScript + Sass
- Web: Vite + React + TypeScript
- AI: `llm_service.py`, `prompt_loader.py`, `prompt_router.py`, `llm_calls`
- Domain remnants: trading records, review, knowledge, growth, persona, news

Current version checks on 2026-08-08:

- FastAPI release notes list 0.140.13 as the latest visible release line.
- SQLAlchemy 2.0 documentation lists 2.0.51 as the current release; 2.0.52 appears in the changelog without a release date.
- Taro main repository package metadata shows 4.2.1, while this project is pinned at 4.2.0.
- PostgreSQL 16 documentation is current at 16.14 and PostgreSQL 16 remains supported.
- pgvector changelog lists 0.8.2 as the latest visible release.

Architecture decision: do not force broad dependency upgrades in the architecture phase. Record current stable targets and upgrade only inside dedicated implementation stories.

---

## Starter Template Evaluation

This is a brownfield migration, so no external starter template is selected.

**Selected starter:** existing GrowthPilot codebase.

Rationale:

- The backend already has the correct async FastAPI foundation.
- The miniapp already uses Taro 4 with React and TypeScript.
- AI provider abstraction, prompt loading, LLM call traceability, auth, and ApiResponse patterns already exist.
- The cost of re-scaffolding is higher than adding the Workspace-first domain and event/context layers inside the existing repo.

The first implementation story must create the new architectural spine inside the existing repo, not initialize a new app.

---

## System Overview

```
┌───────────────────────────────────────────────────────────────┐
│                       Clients                                  │
│  Web React Main Workspace               Miniapp Taro 4         │
│  Workspace / Dashboard / Goal / Task    Today / Capture /     │
│  Plan / Knowledge / Apps / Extensions    Morning / Evening UI │
└───────────────────────────────┬───────────────────────────────┘
                                │ REST / JSON / ApiResponse[T]
┌───────────────────────────────▼───────────────────────────────┐
│                         FastAPI                                │
│                                                               │
│  api/                                                         │
│  memory  reflections  tasks  goals  agent  dashboard          │
│  knowledge  integrations  export  legacy_trading              │
│                                                               │
│  agents/                                                      │
│  orchestrator  intent_router  memory_agent  reflection_agent  │
│  task_agent  goal_agent  knowledge_agent  work_agent          │
│                                                               │
│  engines/                                                     │
│  memory_engine  retrieval_engine  context_engine              │
│  reflection_engine  task_engine  goal_engine                  │
│  knowledge_engine  report_engine                              │
│                                                               │
│  ai/                                                          │
│  llm_service  prompt_loader  json_guard  privacy_guard         │
└───────────────┬──────────────────────┬────────────────────────┘
                │                      │
        PostgreSQL 16 + pgvector       Redis
        durable memory / graph         session context / cache
                │                      │
                └──────────┬───────────┘
                           │
                         Arq
       async extraction / embedding / summaries / reports
```

---

## Core Architectural Decisions

### ADR-001: Workspace Domain with Event and Memory Context

**Decision:** Workspace and domain tables are the canonical source for current state. `workspace_events` is the append-only activity record, `memory_entries` is the contextualized long-term projection used by Agents, and `growth_insights` is the evidence-backed analysis projection.

**Rationale:** 用户使用的是工作台，不是 Memory 管理页。领域对象必须能直接驱动工作和成长；Event、Memory 和 Insight 让这些事实可以跨域理解、回看和分析，而不要求用户重复维护。

**Implications:**

- Agent 不能直接彼此调用，必须通过领域命令、ContextEngine、Memory、domain tables 和 events 协作。
- 所有可被 AI 引用的事实都必须有领域来源 ID；需要长期引用时再映射到 `memory_entry.id`。
- Dashboard 和 Global AI 读取聚合上下文，不直接拼接各表散数据；首页的当前状态以 Workspace/Project/Plan/Task/Knowledge 为准。

### ADR-002: Prompt-based Lightweight Agent Framework

**Decision:** 不使用 LangChain、AutoGen 等重型 Agent 框架。新增 `app/agents/`，用显式 Python 类和 Pydantic schema 编排。

**Rationale:** 项目是个人 Agent OS，第一阶段更需要可控、可追踪、一致实现。复杂框架会模糊数据边界和错误路径。

**Pattern:**

```
AgentRequest -> IntentRouter -> AgentHandler -> ContextEngine
             -> LLMService -> JsonGuard -> Memory citations -> AgentResponse
```

### ADR-003: PostgreSQL JSONB + pgvector Hybrid Retrieval

**Decision:** Memory 存储在 PostgreSQL。结构化字段用列和 JSONB，语义检索用 pgvector，关键词检索用 PostgreSQL full-text/trigram。

**Rationale:** 项目已有 PostgreSQL，MVP 阶段不新增 Qdrant/Weaviate 服务，降低维护成本。

**Fallback:** 如果开发环境暂时无法启用 pgvector，Phase 1 可先交付 JSONB + 全文检索，但 API 和模型必须保留 embedding 字段与检索接口边界。

### ADR-004: Async AI Enrichment

**Decision:** 用户写入类操作必须先保存事实，再异步补全 AI 摘要、实体、关系、embedding、周/月报告。

**Rationale:** PRD 要求核心流程轻量，AI 失败不能阻塞保存。

**Implementation boundary:**

- 同步：保存 Workspace / Project / Plan / Task / Goal / Knowledge / Reflection 等领域事实及对应 `workspace_event`。
- 异步：Memory projection、embedding、entity extraction、relation extraction、reflection summary、weekly report 和 Growth Insight。

### ADR-005: Explicit Citation Contract

**Decision:** 所有 Agent 回复必须返回 `citations`，可引用 Workspace、Project、Plan、Task、Goal、Reflection、Knowledge、Memory 或 Capability Run 的来源。

**Response shape:**

```json
{
  "answer": "string",
  "intent": "task|goal|reflection|knowledge|memory|general",
  "citations": [
    {
      "source_type": "workspace|project|plan|task|goal|reflection|knowledge|memory|capability_run",
      "source_id": "uuid",
      "quote": "short excerpt",
      "reason": "why this source was used"
    }
  ],
  "suggested_actions": []
}
```

### ADR-006: Keep Legacy Trading, But Demote It

**Decision:** 旧交易功能保留为 legacy plugin，不再作为 v3 架构中心。

**Migration rule:**

- `records`, `reviews`, `trading`, `stats`, `analysis` 不删除。
- 新 Dashboard 默认不展示交易主线。
- 交易/投资相关 AI 输出继续走 `compliance_guard`。
- Legacy trading 可写入 Memory，例如“今天复盘了一笔交易”，但 Memory Agent 不依赖 trading tables。

### ADR-007: Privacy Guard Replaces Compliance Guard for New Core

**Decision:** 新 Personal Agent OS core 新增 `privacy_guard`。交易合规仍保留在 legacy trading。

**privacy_guard responsibilities:**

- 检查可检索数据范围。
- 删除/导出/外部集成权限校验。
- 限制敏感 Memory 在分享和报告中的暴露。

#### Story 1.3 当前实现边界

- `users.settings.privacy_scope` 是用户级设置，结构为 `{ "enabled_sources": string[] }`；它不属于单个 Workspace，也不创建新的领域表。
- `privacy_scope.py` 是当前轻量 privacy guard 边界：规范化来源、默认值、Memory provenance 映射和未知来源拒绝。未来 ContextEngine / RetrievalEngine 必须在查询前调用它。
- 当前允许来源键为 `tasks`、`goals`、`plans`、`learning`、`knowledge_cards`、`reflections`、`memories`。本轮只提供 Memory provenance 的 SQL 过滤辅助，不声称已有完整 ContextEngine。
- 旧 `ai_coach.py` 是 legacy trading coach，仍由其既有合规边界管理；它不作为 Story 1.3 的 Personal Agent 检索验收对象。
- 确保 LLM prompt 不携带已删除或未授权数据。

### ADR-008: ApiResponse Stays Mandatory

**Decision:** 所有新增 API 延续 `ApiResponse[T]` 包装，不直接返回裸数据。

**Rationale:** 与现有项目规则一致，降低前端接入差异。

### ADR-009: Web-First Dual Surface

**Decision:** React Web 是 Personal Agent OS 的主工作台，Taro miniapp 是轻量伴随入口。

**Implications:**

- Workspace、Dashboard、Task、Goal/Plan、Global AI、Knowledge、Apps、Extensions、Insights 和 Mine 等复杂能力优先落 Web；Memory 只保留必要的数据管理体验。
- 小程序只承载一句话记录、晨间/晚间轻流程、提醒和快速查看。
- Web 与小程序共享 API、命名、语义和 Memory 契约，但不追求功能等价。
- 前端类型长期应由 OpenAPI 生成，短期可手写但必须集中在 `api/client.ts` 或 `generated/types.ts`。

### ADR-010: Workspace-First Product Domain

**Decision:** `workspace`、`project` 和 `workspace_resource` 是用户可见的一等领域对象；Goal、Plan、Task、Knowledge、Reflection 和 Memory 可以关联到 Workspace/Project，但不互相复制上下文。

**Rationale:** 用户真正使用的是工作台，而不是一组孤立的成长模块。Workspace 提供工作、学习和成长事实的组织边界，也为首页、权限和未来外部连接提供稳定上下文。

**Implications:**

- Dashboard API 必须先聚合 Workspace/Project 状态，再展示 Goal/Task/Knowledge/Insight。
- Onboarding 必须创建最小 Workspace 图，而不是只保存 Profile。
- 默认导航围绕 Home、Workspace、Task、Growth、Knowledge、Apps、Extensions、Insights、Mine。
- Memory 仍是长期上下文，但默认入口移动到 Mine/数据管理。

### ADR-011: Capability Registry for Apps, Plugins and Skills

**Decision:** 用统一的 `capability_registry` 管理 App Link、Connection、Plugin、Skill、Agent Expert 和 Workflow 的元数据、来源、依赖、权限、Workspace 范围及启用状态。

**Rationale:** WorkBuddy/OpenClaw 类产品的能力不是散落链接，而是可发现、可授权、可组合和可审计的 Agent 能力。统一注册表可以让 Web 首页提供入口，同时限制高风险执行。

**Implications:**

- App Link 只负责打开外部软件/网页/目录；Connection 才拥有数据读取权限。
- Plugin/Skill 必须有 `source`、`version`、`permissions`、`dependencies`、`status` 和 `workspace_scope`。
- Agent 调用能力前返回 permission summary；需要外部副作用时必须用户确认。
- 第一阶段只做内置能力和目录管理，不直接开放未经审核的安装执行。

### ADR-012: Event-to-Growth Projection

**Decision:** 工作、学习、任务、计划、复盘和 Agent 运行都产生统一事件；确认后的用户输入和事件共同生成 Memory，Growth Insight 则是带证据的可查询分析投影。

**Rationale:** 用户不应为了“记录成长”再填写一套重复表单。系统应从真实活动判断目标推进、学习投入、阻塞和行为模式。

**Implications:**

- 领域写入先保存事实和事件，再异步生成摘要、实体、引用和洞察。
- 每个 Insight 必须保存依据对象 ID，至少能追溯到 Task、Goal、Knowledge、Reflection、Workspace Event 或 Memory。
- Dashboard 使用预计算的 Today Context，避免首屏串行调用多个 Agent。

---

## Data Architecture

### Canonical Relationship Contract

The following rules keep the Web workbench coherent while allowing Memory and Insight to remain derived/context layers:

| Relationship | Rule |
|--------------|------|
| User -> Workspace | Every user can own multiple Workspaces; one active Workspace is selected for the current session. |
| Workspace -> Project | A Project belongs to exactly one Workspace. Resources, Tasks, Plans and Knowledge default to the active Workspace. |
| Goal -> Plan | A Goal may have many time-bounded Growth Plans. A Plan may optionally focus on one Project. |
| Plan -> Task / Knowledge | A Plan links executable Tasks and relevant Learning/Knowledge items; the links are optional so capture remains lightweight. |
| Domain object -> Workspace Event | Confirmed create/update/complete/defer/reflection/learning/capability actions emit one idempotent event. |
| Workspace Event -> Memory | Events may create or update a Memory projection asynchronously; deleting the source removes it from retrieval. |
| Event + domain evidence -> Growth Insight | Insights are computed projections with explicit evidence references and an expiry/status. |
| Capability -> Workspace | App Links, Connections, Plugins, Skills and Agent Experts are registered once and enabled within explicit Workspace scope. |

Current state belongs to the domain object. `workspace_events`, `memory_entries` and `growth_insights` must never become a second competing source of truth for Project, Plan, Task or Goal status.

### New Tables

#### workspaces

Purpose: first-class personal workspaces and user-visible context boundaries.

Fields: `id`, `user_id`, `name`, `description`, `workspace_type`, `status`, `icon`, `active_project_id nullable`, `last_opened_at`, `created_at`, `updated_at`, `archived_at`.

#### projects

Purpose: current work or life projects inside a Workspace.

Fields: `id`, `workspace_id`, `user_id`, `name`, `description`, `status`, `priority`, `progress`, `next_action`, `goal_id`, `due_at`, `last_activity_at`, `created_at`, `updated_at`, `archived_at`.

#### workspace_resources

Purpose: links to local directories, files, web pages, documents, repositories and recent outputs without forcing full sync in MVP.

Fields: `id`, `workspace_id`, `project_id`, `user_id`, `resource_type`, `title`, `uri`, `provider`, `metadata`, `permission_scope`, `last_seen_at`, `created_at`, `updated_at`, `deleted_at`.

#### capability_registry

Purpose: unified registry for App Links, Connections, Plugins, Skills, Agent Experts and Workflows.

Fields: `id`, `user_id nullable`, `capability_type`, `name`, `slug`, `description`, `source`, `version`, `status`, `dependencies`, `permissions`, `workspace_scope`, `config_schema`, `entrypoint`, `last_used_at`, `created_at`, `updated_at`.

Statuses: `available`, `needs_setup`, `enabled`, `disabled`, `blocked`, `revoked`.

#### capability_runs

Purpose: audit invocation of a Plugin, Skill, App connector or Agent workflow.

Fields: `id`, `user_id`, `capability_id`, `workspace_id`, `project_id nullable`, `agent_run_id nullable`, `input_summary`, `permission_snapshot`, `side_effect_level`, `status`, `output_ref`, `error_message`, `started_at`, `completed_at`.

Low-risk internal executor contract: an executor may only run after a Capability Run is `confirmed` and the capability remains enabled in the same active Workspace. Its bounded result is stored in `output_ref` with an explicit `execution_state`; it must retain evidence references and must not create or update other domain objects unless a later, separately confirmed action owns that write.

Brief action conversion contract: a completed brief may record `brief.fact_actions[event_id]` only after the user explicitly supplies a Task title. The conversion creates one Task in the same Workspace (and the Run's optional Project), keeps a concise brief-fact citation in the Task description, and appends a separate capability action event. It cannot reread arbitrary events or create a second Task for the same fact.

Brief goal conversion contract: a completed brief may record `brief.fact_goal_actions[event_id]` only after the user explicitly supplies a Goal title. It creates one Goal in the same Workspace (and the Run's optional Project) with no inferred dimension, deadline, importance or metric, keeps a concise brief-fact citation in the Goal description, and appends a separate capability action event. Task and Goal conversions are independent; each action type has its own one-to-one guard.

Brief plan conversion contract: a completed brief may record `brief.fact_plan_actions[event_id]` only after the user explicitly supplies a Plan title, chooses a period, and selects an existing Goal in the same Workspace. It creates one Growth Plan in that Workspace, links only the selected Goal and the Run's optional Project, retains a concise brief-fact citation in the Plan description, and appends a separate capability action event. It must not create a Goal, Task, milestone, duration or other Plan fields by inference; Task, Goal and Plan conversions remain independent with one-to-one guards per action type.

Brief knowledge conversion contract: a completed brief may record `brief.fact_knowledge_actions[event_id]` only after the user explicitly confirms a Knowledge Card title and editable text content. The card uses `source_type=text`, reuses only the Run's optional Project, and may link an existing Goal in the same Workspace only when the user selects it. The card content must retain the brief, Run and source event citation; the conversion must not infer a summary, enqueue learning, create Memory or create any other object, and each action type keeps its own one-to-one guard.

Brief memory conversion contract: a completed brief may record `brief.fact_memory_actions[event_id]` only after the user explicitly confirms Memory content, type, importance and tags. It creates one user-scoped Memory entry with `source=capability_brief` and `source_id=Capability Run ID`; the content retains a concise brief, Run and source event citation, and the fact occurrence time is used as `occurred_at`. It must not create or update Workspace domain objects, infer summary/entities/embedding, or write a second Memory for the same fact; the action type has its own one-to-one guard.

#### workspace_events

Purpose: normalized event stream for work, learning, task, goal, reflection, knowledge and capability activity.

Fields: `id`, `user_id`, `workspace_id nullable`, `project_id nullable`, `event_type`, `source_type`, `source_id nullable`, `payload`, `idempotency_key`, `correlation_id nullable`, `occurred_at`, `created_at`, `privacy_scope`, `processed_at`.

Event types include: `project_updated`, `task_completed`, `task_deferred`, `knowledge_saved`, `learning_completed`, `reflection_submitted`, `goal_progressed`, `capability_run`, `resource_added`, `agent_suggested`.

#### growth_plans

Purpose: actionable plan linking Goal, Project, Task and Knowledge across a period.

Fields: `id`, `user_id`, `workspace_id`, `project_id nullable`, `goal_id nullable`, `title`, `period_type`, `start_at`, `due_at`, `status`, `progress`, `ai_generated`, `source_event_id nullable`, `created_at`, `updated_at`, `archived_at`.

#### growth_insights

Purpose: precomputed work, learning and growth analysis shown on Dashboard/Insights.

Fields: `id`, `user_id`, `workspace_id nullable`, `insight_type`, `title`, `body`, `severity`, `confidence`, `evidence_refs`, `suggested_actions`, `period_start`, `period_end`, `status`, `created_at`, `expires_at`.

#### knowledge_items

Purpose: canonical work and learning knowledge items. During migration this can be an adapter over the existing `knowledge_*` tables.

Fields: `id`, `user_id`, `workspace_id`, `project_id nullable`, `goal_id nullable`, `task_id nullable`, `title`, `content`, `source_uri nullable`, `item_type`, `status`, `learning_state`, `summary nullable`, `tags`, `concepts`, `next_review_at nullable`, `memory_entry_id nullable`, `created_at`, `updated_at`, `deleted_at`.

#### memory_entries

Purpose: unified long-term memory source.

Key fields:

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | primary key |
| user_id | UUID | required, indexed |
| workspace_id | UUID nullable | workspace context; null only for pre-onboarding/global records |
| project_id | UUID nullable | current project context |
| type | varchar | episodic, semantic, procedural, working, emotional |
| source | varchar | manual, reflection, task, goal, knowledge, work, system, legacy_trading |
| source_id | UUID nullable | original domain object |
| content | text | user-visible memory content |
| summary | text nullable | AI condensed content |
| embedding | vector(1536) nullable | pgvector, dimension may change via migration |
| embedding_model | varchar nullable | provider/model tracking |
| entities | JSONB | extracted entities |
| relations | JSONB | extracted lightweight relations |
| tags | JSONB | string tags or typed tags |
| emotion | varchar nullable | positive, neutral, negative, mixed |
| energy_level | integer nullable | 1 to 10 |
| importance | integer | 1 to 5 |
| confidence | numeric | 0 to 1 |
| occurred_at | timestamptz | when it happened |
| created_at | timestamptz | when stored |
| updated_at | timestamptz | last edited |
| deleted_at | timestamptz nullable | retrieval filter must exclude |

Indexes:

- `idx_memory_user_created`
- `idx_memory_user_source`
- `idx_memory_user_type`
- `idx_memory_tags_gin`
- `idx_memory_entities_gin`
- `idx_memory_embedding_ivfflat` or HNSW after enough rows

Memory is not the canonical source for current task, goal or project state. It stores durable context and citations derived from those sources.

#### memory_graph_nodes

Purpose: durable entity graph.

Fields: `id`, `user_id`, `entity`, `entity_type`, `aliases`, `properties`, `confidence`, `last_seen_at`, `created_at`, `updated_at`, `deleted_at`.

#### memory_graph_edges

Purpose: durable relation graph.

Fields: `id`, `user_id`, `source_node_id`, `target_node_id`, `relation_type`, `weight`, `evidence_memory_ids`, `created_at`, `updated_at`, `deleted_at`.

#### reflections

Purpose: daily and micro reflection canonical records.

Fields:

- `id`, `user_id`, `workspace_id`, `project_id nullable`, `goal_id nullable`, `task_id nullable`, `reflection_type`
- `reflection_date`, `started_at`, `completed_at`
- `energy_level`, `completion_score`, `mood`
- `intention`, `went_well`, `went_wrong`, `tomorrow_adjustment`, `note`
- `ai_summary`, `memory_entry_id`
- `created_at`, `updated_at`, `deleted_at`

Types: `morning`, `micro`, `evening`, `weekly`, `monthly`.

#### tasks

Purpose: general task system, replacing trading-specific daily tasks.

Fields:

- `id`, `user_id`, `title`, `description`
- `status`: todo, doing, done, deferred, blocked, canceled
- `priority`, `energy_required`, `time_block`
- `workspace_id`, `project_id nullable`, `goal_id nullable`, `plan_id nullable`, `due_at`, `scheduled_for`
- `ai_generated`, `recommendation_reason`, `source_event_id nullable`
- `defer_reason`, `completed_at`
- `memory_entry_id`, `created_at`, `updated_at`, `deleted_at`

#### goals

Purpose: long-term direction and decomposition.

Fields:

- `id`, `user_id`, `workspace_id`, `project_id nullable`, `parent_goal_id nullable`
- `dimension`, `title`, `description`
- `goal_type`: yearly, quarterly, monthly, weekly, milestone
- `importance`, `status`, `target_metric`, `current_value`
- `start_at`, `due_at`
- `ai_decomposition`, `memory_entry_id`
- `created_at`, `updated_at`, `deleted_at`

#### goal_progress

Purpose: progress snapshots and AI risk assessment.

Fields: `id`, `user_id`, `workspace_id`, `goal_id`, `progress_value`, `progress_note`, `risk_level`, `ai_assessment`, `evidence_refs`, `source_event_id nullable`, `created_at`.

#### agent_runs

Purpose: trace every Agent execution.

Fields:

- `id`, `user_id`, `workspace_id nullable`, `project_id nullable`, `agent_name`, `intent`
- `input_text`, `context_refs`, `output_text`
- `model`, `prompt_version`, `llm_call_id`
- `status`, `error_message`, `created_at`

#### agent_feedback

Purpose: improve citation and suggestion quality.

Fields: `id`, `user_id`, `agent_run_id`, `source_id`, `feedback_type`, `comment`, `created_at`.

#### outbox_events

Purpose: reliable async enrichment.

Fields:

- `id`, `user_id`, `event_type`, `aggregate_type`, `aggregate_id`
- `payload`, `status`, `attempts`, `next_run_at`, `created_at`, `processed_at`

### Existing Tables To Reuse

| Existing | v3 Role |
|----------|---------|
| users | add profile/context/reminder/privacy fields if missing |
| llm_calls | keep as AI audit table |
| knowledge_* | migrate into Knowledge Agent gradually |
| daily_tasks/check_ins/achievements | can be replaced or mapped to new tasks/milestones |
| records/reviews | legacy trading, optional Memory source |
| news/persona/pattern | legacy investment analysis unless reused deliberately |

---

## API Architecture

### New API Groups

```
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/{id}
PATCH  /api/v1/workspaces/{id}
POST   /api/v1/workspaces/{id}/select
GET    /api/v1/workspaces/{id}/projects
POST   /api/v1/projects
PATCH  /api/v1/projects/{id}
GET    /api/v1/workspaces/{id}/resources
POST   /api/v1/workspaces/{id}/resources

POST   /api/v1/onboarding/context/preview
POST   /api/v1/onboarding/context/complete
GET    /api/v1/onboarding/daily-preferences
PUT    /api/v1/onboarding/daily-preferences

GET    /api/v1/capabilities
GET    /api/v1/capabilities/{id}
POST   /api/v1/capabilities/{id}/enable
POST   /api/v1/capabilities/{id}/disable
POST   /api/v1/capabilities/{id}/connect
POST   /api/v1/capabilities/{id}/run/preview
POST   /api/v1/capabilities/{id}/run/confirm
GET    /api/v1/capability-runs
POST   /api/v1/capabilities/runs/{id}/execute  # low-risk internal executor only
POST   /api/v1/capabilities/runs/{id}/brief-facts/{event_id}/tasks
POST   /api/v1/capabilities/runs/{id}/brief-facts/{event_id}/goals

GET    /api/v1/dashboard/command-center
GET    /api/v1/dashboard/today             # compatibility alias during migration

GET    /api/v1/memory
POST   /api/v1/memory
GET    /api/v1/memory/{id}
PATCH  /api/v1/memory/{id}
DELETE /api/v1/memory/{id}
POST   /api/v1/memory/search
GET    /api/v1/memory/health

POST   /api/v1/reflections/morning/start
POST   /api/v1/reflections/morning/complete
POST   /api/v1/reflections/micro
POST   /api/v1/reflections/evening/complete
GET    /api/v1/reflections/weekly
GET    /api/v1/reflections/monthly
```

GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/complete
POST   /api/v1/tasks/{id}/defer
POST   /api/v1/tasks/recommend

GET    /api/v1/goals
POST   /api/v1/goals
PATCH  /api/v1/goals/{id}
POST   /api/v1/goals/{id}/decompose
GET    /api/v1/goals/{id}/progress
POST   /api/v1/goals/{id}/progress

GET    /api/v1/growth-plans
POST   /api/v1/growth-plans
PATCH  /api/v1/growth-plans/{id}
GET    /api/v1/knowledge-items
POST   /api/v1/knowledge-items
PATCH  /api/v1/knowledge-items/{id}

POST   /api/v1/agent/chat
POST   /api/v1/agent/command
POST   /api/v1/agent/actions
POST   /api/v1/agent/feedback

GET    /api/v1/export
POST   /api/v1/privacy/delete-scope
```

### Story 1.2 Daily Preferences Contract（已完成）

- 用户级 `users.settings.daily_preferences` 保存 `{ timezone, morning_time, evening_time }`。`timezone` 必须是有效 IANA 标识，两个时间为 `HH:MM`；读取时对历史空值或无效值回退至 `Asia/Shanghai`、`08:30`、`21:30`。
- `GET` / `PUT /api/v1/onboarding/daily-preferences` 都由 JWT 推导用户。写入只覆盖此设置子树，不修改 Onboarding、Profile 或任意 Workspace 领域对象；响应固定 `notification_enabled=false`，直到后续通知权限与投递 Story 实现。
- `dashboard/command-center` 读取该时区计算 UTC 的当日查询窗口，并用同一当地日期筛选 Reflection。`POST /reflections` 对非补记内容由服务端按该时区写入当天日期；补记继续使用用户提交日期。
- Web 将偏好集中在 Workspace state，使首页、成长计划、Morning / Evening 与本地乐观写入使用同一时区。当前不接入浏览器通知、Worker、Cron、第三方推送或补偿投递。

### API Response Pattern

All responses:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Errors:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "记忆不存在或已删除",
    "details": {}
  }
}
```

### User Isolation

Every query must include `user_id` filtering. No Agent, engine, or API may accept a user-provided `user_id` as authority. Use `get_current_user_id`.

---

## Agent Architecture

### Agent Contracts

Every Agent implements:

```python
class AgentHandler(Protocol):
    name: str

    async def handle(
        self,
        request: AgentRequest,
        context: AgentContext,
        session: AsyncSession,
    ) -> AgentResponse:
        ...
```

### AgentRequest

Fields:

- `user_id`
- `input_text`
- `intent_hint`
- `source`: command_bar, dashboard, global_ai, workspace, reflection, task, goal, knowledge
- `client_context`: page, selected object ids, workspace_id, project_id, timezone
- `requested_action`: answer, plan, create_task, create_goal, save_knowledge, run_capability, capture

### AgentContext

Fields:

- `profile`
- `active_workspace`
- `active_project`
- `today_context`
- `recent_memories`
- `active_goals`
- `active_plans`
- `today_tasks`
- `relevant_knowledge`
- `available_capabilities`
- `recent_agent_runs`
- `privacy_scope`

### AgentResponse

Fields:

- `answer`
- `intent`
- `citations`
- `suggested_actions`
- `memory_writes`
- `workspace_changes`
- `task_changes`
- `goal_or_plan_changes`
- `capability_preview`
- `warnings`

### Routing Rules

| Intent | Handler |
|--------|---------|
| workspace_create, project_setup, resource_organize | WorkspaceAgent |
| today_plan, task_prioritization, execution_help | TaskAgent |
| goal_progress, goal_decomposition, alignment_check | GoalAgent |
| daily_review, weekly_summary, behavior_pattern | ReflectionAgent |
| memory_search, personal_fact_question | MemoryAgent |
| knowledge_lookup, content_summary | KnowledgeAgent |
| work_report, external_tool_summary | WorkAgent |
| app_open, plugin_lookup, skill_lookup, workflow_run | CapabilityAgent |
| unknown | MemoryAgent with low-confidence answer |

### Agent Interaction Rule

Agents do not call each other directly. Shared context must flow through:

- `ContextEngine`
- Workspace Events
- Memory entries
- Domain tables
- Outbox events

---

## Core Data Flows

### AI Onboarding Flow

```text
raw sentence
  -> OnboardingAgent extracts context
  -> preview Workspace + Project + Goal + GrowthPlan + initial Tasks + Learning entry
  -> user confirms / corrects / rejects
  -> commit domain facts and workspace_events
  -> optionally write initial Memory entries for confirmed context
  -> enqueue Dashboard Context projection
```

AI enrichment must never be required to render the basic generated workspace. If the model fails, save the original sentence and create a minimal workspace draft that the user can continue from.

### Command Center Flow

```text
Workspace / Project / Goal / Plan / Task / Knowledge / Events
  -> ContextEngine builds TodayContext
  -> DashboardEngine projects active work, next actions, learning and insights
  -> optional AgentInsight job adds citations and suggested actions
  -> Web renders populated or explicit empty states
```

### Capability Invocation Flow

```text
CommandBar intent
  -> CapabilityAgent finds eligible App / Plugin / Skill
  -> permission + dependency + side-effect preview
  -> user confirms or rejects
  -> capability_runs audit record
  -> result linked to Workspace / Project / Task / Knowledge / Memory
```

### Morning Flow

```
User opens morning start
  -> API reads active goals, recent memory, yesterday reflection
  -> TaskAgent recommends up to 3 tasks
  -> User confirms intention and energy
  -> Reflection saved
  -> workspace_event appended
  -> Outbox schedules Memory projection and embedding/entity extraction
```

### Micro Reflection Flow

```
User taps micro record
  -> saves emotion + one sentence + optional task/goal link
  -> workspace_event appended
  -> optional task status update and second event
  -> async Memory projection and enrichment
```

### Evening Flow

```
User completes evening reflection
  -> Reflection saved
  -> workspace_event appended
  -> ReflectionAgent generates async summary
  -> Memory projection created/updated
  -> Task/Goal progress recalculated
  -> next-day context prepared
```

### Global AI Flow

```
User asks a question
  -> IntentRouter classifies
  -> ContextEngine retrieves memories and domain objects
  -> Agent produces answer with citations
  -> agent_runs and llm_calls recorded
  -> user can convert answer into a confirmed task/goal/plan/knowledge action or explicit capture
```

### Delete Flow

```
User deletes memory or scope
  -> mark deleted_at in source table
  -> mark derived memory/entities/edges as deleted or stale
  -> retrieval filters exclude deleted data immediately
  -> async cleanup updates embeddings/indexes
```

---

## Implementation Patterns & Consistency Rules

### Naming

| Area | Rule | Example |
|------|------|---------|
| Python files | snake_case | `memory_engine.py` |
| Classes | PascalCase | `MemoryAgent` |
| Functions | snake_case | `create_memory_entry` |
| DB tables | plural snake_case | `memory_entries` |
| DB columns | snake_case | `memory_entry_id` |
| API routes | plural kebab or plural nouns | `/api/v1/reflections/micro` |
| JSON fields | snake_case | `energy_level` |
| Prompt files | snake_case yaml | `prompts/agents/task_agent.yaml` |

### Backend Layering

Allowed dependencies:

```
api -> engines/services/agents -> models/schemas/core/ai
agents -> engines -> models/ai
engines -> models/core/ai
models -> core.database only
```

Forbidden dependencies:

- `models` importing `api`, `engines`, or `agents`
- `agents` importing frontend-specific schemas
- Personal Agent core importing `scenes/trading`
- Legacy trading importing new Agent handlers

### Prompt Pattern

All Agent prompts live under:

```
backend/prompts/agents/
  orchestrator.yaml
  memory_agent.yaml
  reflection_agent.yaml
  task_agent.yaml
  goal_agent.yaml
  knowledge_agent.yaml
  work_agent.yaml
```

Rules:

- Prompt versions must be explicit in YAML.
- LLM calls must go through `ai/llm_service.py`.
- JSON outputs must pass `json_guard`.
- Prompt must include citation requirement where applicable.

### Memory Write Pattern

Any domain event worth long-term context must call `memory_engine.create_from_source(...)` instead of writing raw `memory_entries` directly.

Good:

```python
await memory_engine.create_from_source(
    session=session,
    user_id=user_id,
    source="reflection",
    source_id=reflection.id,
    content=memory_text,
)
```

Avoid:

```python
session.add(MemoryEntry(...))
```

### Retrieval Pattern

All retrieval must flow through `retrieval_engine`. Do not let Agents handcraft SQL retrieval.

Retrieval order:

1. Privacy/user scope filter
2. Hard filters: time, source, type, deleted_at
3. Keyword/full-text candidates
4. Vector candidates where available
5. Rerank by recency, importance, semantic score
6. Return cited sources

### Error Handling

- Use existing `AppException` for domain errors.
- API layer converts all errors to `ApiResponse`.
- AI failures produce recoverable warnings if user data is already saved.
- Background jobs write errors to `outbox_events.error_message`.

### Date/Time

- Store timestamps as timezone-aware UTC.
- Client sends timezone in context.
- Daily boundaries use user timezone, default Asia/Shanghai.

### Privacy Enforcement

Every Agent call must receive `privacy_scope` from `privacy_guard`.

No prompt may include:

- deleted Memory
- data from disconnected integrations
- legacy trading financial details unless explicitly inside legacy trading flow
- export/share content not confirmed by user

---

## Project Structure & Boundaries

### Target Backend Structure

```
backend/app/
├── api/
│   ├── agent.py
│   ├── dashboard.py
│   ├── workspaces.py
│   ├── projects.py
│   ├── growth_plans.py
│   ├── knowledge.py
│   ├── insights.py
│   ├── events.py
│   ├── capabilities.py
│   ├── memory.py
│   ├── reflections.py
│   ├── tasks.py
│   ├── goals.py
│   ├── integrations.py
│   ├── export.py
│   └── legacy_trading.py
├── agents/
│   ├── __init__.py
│   ├── base.py
│   ├── orchestrator.py
│   ├── intent_router.py
│   ├── workspace_agent.py
│   ├── capability_agent.py
│   ├── memory_agent.py
│   ├── reflection_agent.py
│   ├── task_agent.py
│   ├── goal_agent.py
│   ├── knowledge_agent.py
│   └── work_agent.py
├── engines/
│   ├── workspace_engine.py
│   ├── capability_engine.py
│   ├── memory_engine.py
│   ├── retrieval_engine.py
│   ├── context_engine.py
│   ├── reflection_engine.py
│   ├── task_engine.py
│   ├── goal_engine.py
│   ├── dashboard_engine.py
│   └── report_engine.py
├── models/
│   ├── workspace.py
│   ├── project.py
│   ├── growth_plan.py
│   ├── knowledge.py
│   ├── insight.py
│   ├── workspace_event.py
│   ├── capability.py
│   ├── memory.py
│   ├── reflection.py
│   ├── task.py
│   ├── goal.py
│   ├── agent.py
│   └── integration.py
├── schemas/
│   ├── workspace.py
│   ├── project.py
│   ├── growth_plan.py
│   ├── knowledge.py
│   ├── insight.py
│   ├── capability.py
│   ├── agent.py
│   ├── memory.py
│   ├── reflection.py
│   ├── task.py
│   ├── goal.py
│   ├── dashboard.py
│   └── integration.py
├── ai/
│   ├── llm_service.py
│   ├── prompt_loader.py
│   ├── json_guard.py
│   └── privacy_guard.py
├── workers/tasks/
│   ├── memory_tasks.py
│   ├── reflection_tasks.py
│   ├── report_tasks.py
│   └── integration_tasks.py
└── scenes/
    └── trading/              # legacy only

backend/prompts/
├── agents/
└── legacy_trading/
```

### Target Web Structure

```
web/src/
├── pages/app/
│   ├── Dashboard/             # Command Center
│   ├── Workspace/
│   ├── Tasks/
│   ├── GrowthPlan/
│   ├── Knowledge/
│   ├── Apps/
│   ├── Extensions/            # Plugins / Skills / Agents
│   ├── Insights/
│   └── Mine/
├── components/workspace/
│   ├── WorkspaceSwitcher/
│   ├── CommandBar/
│   ├── ProjectSummary/
│   ├── RecentActivity/
│   ├── CapabilityLauncher/
│   └── AgentRunStatus/
├── stores/
│   ├── workspace-store.ts
│   ├── today-store.ts
│   └── agent-store.ts
└── api/generated/
```

### Target Miniapp Structure

小程序是高频伴随端，不是 Web 的缩小版。它只承载“记录、提醒、今日执行”三类动作；需要组织 Workspace、浏览目录、管理计划、阅读知识库、查看洞察或管理能力时，通过深链接回 Web。

```
miniapp/src/
├── pages/
│   ├── today/
│   ├── capture/
│   ├── morning/
│   ├── evening/
│   ├── tasks/
│   └── reminders/
├── components/
│   ├── EnergySlider/
│   ├── TaskList/
│   ├── QuickCapture/
│   └── ReminderPrompt/
├── api/
│   ├── client.ts
│   └── generated/
├── stores/
│   ├── auth-store.ts
│   ├── today-store.ts
│   └── agent-store.ts
└── utils/
```

### Requirement Mapping

| Requirement | Backend Location | Frontend Location |
|-------------|------------------|-------------------|
| FR-001 Onboarding/Profile | `api/onboarding.py`, `workspace_engine.py`, `models/user.py`, `memory_engine.py` | `pages/onboarding/`, `pages/app/Dashboard/` |
| FR-002 Memory write | `api/memory.py`, `engines/memory_engine.py` | shared `QuickCapture` / `GrowthPlan` flows |
| FR-003 Memory search | `retrieval_engine.py`, `api/memory.py` | shared `CommandBar`, `pages/app/Knowledge/` |
| FR-004 Memory health | `dashboard_engine.py`, `memory_engine.py` | `pages/app/Insights/`, `pages/app/Mine/` |
| FR-005 Morning | `reflection_engine.py`, `task_agent.py` | `pages/app/GrowthPlan/` and `pages/app/Tasks/` |
| FR-006 Micro reflection | `api/reflections.py`, `memory_engine.py` | shared `QuickCapture` |
| FR-007 Evening | `reflection_engine.py`, `report_engine.py` | `pages/app/GrowthPlan/` |
| FR-008 Weekly/monthly | `report_engine.py`, `workers/tasks/report_tasks.py` | `pages/app/Insights/` |
| FR-009 Task CRUD | `api/tasks.py`, `task_engine.py` | `pages/app/Tasks/` |
| FR-010 Task recommendation | `agents/task_agent.py` | `pages/app/GrowthPlan/`, `pages/app/Tasks/` |
| FR-011 Goal decomposition | `api/goals.py`, `goal_agent.py` | `pages/app/GrowthPlan/` |
| FR-012 Goal progress | `goal_engine.py`, `dashboard_engine.py` | `pages/app/GrowthPlan/`, `pages/app/Dashboard/` |
| FR-013 Knowledge | existing `knowledge_engine.py` plus Memory integration | `pages/app/Knowledge/` |
| FR-014 Workspaces / Work integrations | `api/workspaces.py`, `api/projects.py`, `api/integrations.py`, `workspace_engine.py`, `work_agent.py` | `pages/app/Workspace/`, `pages/app/Apps/` |
| FR-015 Global AI | `api/agent.py`, `agents/orchestrator.py` | shared `CommandBar` and `ActivityCenter` |
| FR-016 Dashboard | `api/dashboard.py`, `dashboard_engine.py`, `context_engine.py` | `pages/app/Dashboard/` |
| FR-017 Mine | `dashboard_engine.py`, `api/export.py` | `pages/app/Insights/`, `pages/app/Mine/` |
| FR-018 Privacy/export | `privacy_guard.py`, `api/export.py` | `pages/app/Mine/` |
| FR-019 Workspace / Project | `models/workspace.py`, `api/workspaces.py`, `api/projects.py`, `workspace_engine.py` | `pages/app/Workspace/`, `pages/app/Dashboard/` |
| FR-020 App / Plugin / Skill | `models/capability.py`, `api/capabilities.py`, `capability_engine.py`, `capability_agent.py` | `pages/app/Apps/`, `pages/app/Extensions/` |
| FR-021 Command Center | `api/dashboard.py`, `dashboard_engine.py`, `context_engine.py` | `pages/app/Dashboard/`, shared `CommandBar` |

---

## Migration Strategy

### Phase A: Add Core Without Breaking Legacy

- Add Workspace, Project, Resource, Capability, Event, Memory, Reflection, Task, Goal, Plan and Agent tables/APIs only as required by active stories.
- Do not delete old trading APIs.
- Register new routers behind `/api/v1`.
- Build the Web Shell and Command Center first; keep miniapp pages limited to companion flows.

### Phase B: Make Memory the Shared Context Projection

- Workspace, project, task, knowledge, morning/evening/micro flows write normalized events and relevant Memory.
- Knowledge cards write Memory.
- Legacy trading writes Memory only through adapter.
- Dashboard reads precomputed Workspace/Project domain data and Memory citations.

### Phase C: Retire Old Main Navigation

- New Web navigation: Home / Workspace / Task / Growth / Knowledge / Apps / Extensions / Insights / Mine.
- Old trading pages move under Mine -> Historical Tools or optional legacy capability.
- Old `growth_engine` tasks migrate or freeze.

### Phase D: Govern Capabilities

- Register Apps, Connections, Plugins, Skills, Agent Experts and Workflows in `capability_registry`.
- Add permission summaries, workspace scopes, enable/disable controls and capability run audit records.
- Keep third-party installation and high-risk local execution disabled until trust and sandbox policy are implemented.

### Phase E: Clean Up

- Remove duplicated v2 homepage and analysis assumptions.
- Split prompts into `agents/` and `legacy_trading/`.
- Keep compliance guard only around legacy investment content.

---

## Security, Privacy, and Reliability

### Security

- All queries include authenticated `user_id`.
- Use existing JWT/current user dependency.
- External integrations store tokens encrypted.
- Sensitive config remains backend-only.

### Privacy

- Default Agent retrieval excludes deleted, disconnected, and out-of-scope data.
- Export endpoints stream only current user's data.
- Share/report generation must require explicit user confirmation.
- Memory citations show enough context to be useful but not excessive private content.

### Reliability

- Synchronous writes commit user input before AI jobs.
- Outbox events are retryable and idempotent.
- Agent failures write `agent_runs.status = failed`.
- UI displays saved state even if AI summary is pending.

---

## Architecture Validation Results

### Coherence Validation

- Existing FastAPI + SQLAlchemy async stack supports the new API and engine structure.
- PostgreSQL + pgvector fits the Workspace domain plus durable Memory context without adding a new database service.
- Redis and Arq provide the required cache/session and async enrichment paths.
- Prompt-based Agent classes align with current `llm_service` and `prompt_loader`.
- Legacy trading is isolated, preventing old compliance and scene assumptions from dominating v3.

### Requirements Coverage

- FR-001 to FR-021 each map to explicit backend and frontend locations.
- NFR performance is covered through precomputed dashboard, async AI, and retrieval engine.
- NFR privacy is covered through `privacy_guard`, deleted filters, export/delete APIs, and user isolation.
- AI quality is covered through citations, feedback, agent_runs, and llm_calls.

### Implementation Readiness

Ready for revised story breakdown, with these prerequisites:

1. Finalize Workspace/Project/Resource/Capability schemas and user scope rules.
2. Add the Web Shell and Command Center state contract before adding more isolated pages.
3. Add the minimal Workspace, Goal/Plan, Task and Knowledge models required for a populated first Dashboard.
4. Keep Memory, retrieval and citations as the shared context layer; add pgvector only when retrieval stories require it.
5. Add `agents/base.py`, `workspace_agent.py`, `capability_agent.py`, `context_engine.py` and `orchestrator.py` around the existing LLM service.
6. Build Morning/Evening/Micro pages after the Workspace and Dashboard have real domain data.

### Known Gaps

| Gap | Priority | Resolution |
|-----|----------|------------|
| Embedding provider/model not selected | Important | Decide in implementation story; keep `embedding_model` tracked |
| Workspace capability trust model not specified | Important | Implement capability registry, permission summary and audit contract before external installation |
| Integration permissions not detailed | Later | Define when Work Agent enters scope |
| Web vs miniapp parity unclear | Resolved | Web is the complete workspace; miniapp is a lightweight companion |

### Readiness Assessment

**Overall status:** Draft - Ready for Product Review.

Architecture can guide implementation after the revised PRD, UX and Epics are approved. The first implementation target is Web Workspace Shell + Command Center, not another Memory management story.

---

## Next BMAD Steps

1. Review the revised PRD/UX/Architecture as one product-correction set.
2. Confirm the active document set and the Web/miniapp boundary.
3. Create an implementation-ready story for Workspace/Project/Resource/Capability foundation.
4. Only after product approval, implement Web Shell, Command Center and AI Onboarding in the revised dependency order.

---

**Created using BMAD Method v6**
