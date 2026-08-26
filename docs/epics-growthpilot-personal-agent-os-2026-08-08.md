---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/prd-growthpilot-personal-agent-os-2026-08-06.md
  - docs/architecture-growthpilot-personal-agent-os-2026-08-08.md
  - docs/ux-design-growthpilot-personal-agent-os-2026-08-08.md
  - docs/brainstorming-personal-agent-os-20260803.md
  - .claude/CLAUDE.md
workflowType: epics-and-stories
project_name: GrowthPilot Personal Agent OS
user_name: zhang
date: 2026-08-09
status: draft - ready for product review
---

# GrowthPilot AI Personal Workspace - Epic Breakdown

## Overview

本文档把 AI Personal Workspace + Growth OS 的 PRD、Architecture 和 UX 规范拆成用户价值导向的 Epic。当前优先级从“Memory 先行”校正为“Web 工作台先行”：

```
Workspace Shell -> Command Center -> Command Bar -> AI Onboarding -> Goal/Plan/Task -> Reflection -> Knowledge/Insights -> Capability Registry
```

Memory 是共享上下文底座；Apps、Plugins、Skills 和 Agent Experts 是能力层；Work、Knowledge 和 Growth 都在 Workspace 中发生。Legacy Trading 继续保留，但不再定义默认导航。

---

## Requirements Inventory

### Functional Requirements

**FR-001 用户启动与个人上下文初始化**

用户通过一句自然语言描述当前工作、目标和阻塞，AI 生成首个 Workspace、Project、Goal、Plan、Task、Learning 入口和首批 Memory，用户只做确认、纠正或拒绝。

**FR-002 Memory 写入**

手动输入、晨间启动、微复盘、晚间复盘、任务完成、目标更新和外部事件都可以沉淀为统一 Memory。

**FR-003 Memory 智能检索**

支持语义、关键词、时间和实体关联检索，AI 回复展示可追溯的 Memory 引用。

**FR-004 Memory 健康度**

展示 Memory 的数量、新鲜度、覆盖度和关联度，并生成可执行的补充建议。

**FR-005 晨间启动**

用户记录能量和今日意图，AI 基于目标、任务和近期 Memory 推荐最多 3 个今日任务。

**FR-006 日间微复盘**

用户用类型、状态和一句话记录进展、决策、情绪或灵感，可关联任务或目标。

**FR-007 晚间复盘**

用户记录完成度、做对了什么、做错了什么、明日调整和今日情绪，AI 生成总结并更新上下文。

**FR-008 周期回顾**

系统生成周回顾和月回顾，展示主题、任务完成、情绪趋势、里程碑和调整建议。

**FR-009 任务管理**

支持任务 CRUD、目标关联、能量等级、时间块、完成、推迟、取消和阻塞状态。

**FR-010 AI 每日任务推荐**

每天最多推荐 3 个核心任务，说明推荐依据，并根据用户接受和完成情况优化后续建议。

**FR-011 目标录入与拆解**

支持自然语言创建目标，设定维度、周期、重要性、截止时间和衡量方式，AI 拆解到月/周。

**FR-012 目标进度与预警**

展示目标进度、趋势和风险，检查任务与目标的对齐关系，并支持目标暂停、修改和放弃。

**FR-013 Knowledge Agent**

支持知识卡片、网页收藏、AI 摘要、标签、知识检索和与 Memory/目标的关联。

**FR-014 Workspace / Work Agent**

支持个人 Workspace、Project、目录/资源和外部工具连接，将工作事实写入统一事件和 Memory，并生成工作进展或周报草稿。

**FR-015 Global AI / Agent Router**

支持任务、目标、复盘、知识和个人记忆问答，回复带引用，并可转为 Task、Goal、Memory 或 Knowledge Card。

**FR-016 Command Center Dashboard**

首页聚合今日简报、进行中 Workspace/Project、最多 3 个推荐任务、成长计划、知识学习、最近活动、AI 洞察和工作/应用/插件/Skill 快捷入口。

**FR-017 Mine 与成长数据**

展示目标完成率、任务完成率、复盘天数、Memory 数量、能力趋势、里程碑、提醒和集成状态。

**FR-018 隐私、导出和删除**

用户可以导出、删除和控制个人数据；删除或断开集成后的数据不得继续被 Agent 检索。

**FR-019 Workspace 与 Project**

支持用户创建和切换 Workspace、Project、目录/资源指针，并将 Goal、Plan、Task、Knowledge、Memory 和活动关联到工作上下文。

**FR-020 App、Plugin、Skill 与 Agent 能力中心**

支持统一发现、启用、停用和授权常用软件、连接器、Plugins、Skills、Agent Experts 和自动化流程，并记录调用审计。

**FR-021 Command Center**

支持从首页通过自然语言输入创建行动或调用能力，并聚合工作、待办、成长、学习、活动和下一步。

### NonFunctional Requirements

**NFR-001 每日负担**

Morning <= 2 分钟，Micro Reflection <= 20 秒，Evening <= 3 分钟；核心流程总时长 < 10 分钟。

**NFR-002 性能**

Dashboard 首屏 <= 2 秒，核心保存接口 <= 1 秒，Memory 检索 P95 <= 1.5 秒。

**NFR-003 异步可靠性**

AI 失败不能阻塞用户保存；embedding、实体、关系、报告通过可重试的后台任务处理。

**NFR-004 用户隔离**

所有查询包含 user_id 过滤，Agent 不能使用用户传入的 user_id 作为授权依据。

**NFR-005 隐私安全**

删除、断开集成和隐私范围必须立即影响检索范围，敏感数据不能默认进入分享或导出。

**NFR-006 AI 可追溯**

重要 AI 输出必须带 citations、prompt version、model 和 LLM call 记录。

**NFR-007 AI 成本**

先检索再调用 LLM；周/月回顾、摘要和实体提取支持异步批处理。

**NFR-008 UX 一致性**

支持 375px 移动端基线、44px 最小触摸目标、WCAG AA 对比度、键盘访问和完整的 loading/empty/pending/error/offline 状态。

### Additional Requirements

#### Architecture

- 沿用 FastAPI、SQLAlchemy async、PostgreSQL、Redis、Arq、Taro 4、React、TypeScript。
- Brownfield 项目不重新初始化 starter。
- 新增 Workspace-first 数据模型：workspaces、projects、workspace_resources、workspace_events、growth_plans、tasks、goals、reflections、knowledge_items、memory_entries、capability_registry、capability_runs、agent_runs、agent_feedback、outbox_events。
- PostgreSQL JSONB + pgvector + 全文检索组成混合检索。
- 新增 app/agents、Workspace/Capability/Memory/Reflection/Task/Goal engines 和 privacy_guard。
- Agent 之间不直接调用，通过 ContextEngine、Memory、领域数据和 outbox events 协作。
- 所有新增 API 使用 `/api/v1` 和 `ApiResponse[T]`。
- Prompt 统一位于 `backend/prompts/agents/`，LLM 调用统一走 `ai/llm_service.py`。
- 旧交易功能保留为 legacy plugin，交易相关 AI 仍走 compliance_guard。
- 新增 AI 输出必须有 citations，异步任务必须可重试、幂等。

#### UX

- Web 默认导航为：首页 / 工作台 / 待办 / 成长计划 / 知识学习 / 应用中心 / 扩展能力 / 洞察 / 我的。
- 小程序只承载一句话记录、Morning、Evening、提醒和今日任务查看。
- Micro Capture 是全局浮动入口，Morning/Evening 从首页或提醒进入。
- Dashboard 是 Command Center，必须展示进行中 Workspace/Project、任务、成长计划、知识学习、最近活动和能力入口。
- AI 推断字段必须可编辑，所有副作用动作必须由用户确认。
- 保存用户输入和生成 AI 内容解耦，AI pending 不阻塞主流程。
- 失败状态不能丢失输入；网络异常支持草稿和重试。
- 默认设计方向为 Calm Command Center，避免交易 App 视觉、大面积渐变和卡片套卡片。
- 旧交易入口放入“我的 -> 历史工具 -> 交易记录”。
- App、Plugin、Skill 和 Agent Expert 必须显示权限、来源、依赖、启用状态和 Workspace 范围。

---

## Proposed Epic List

### Epic 0: 建立 Web 工作台骨架

用户能够进入一个稳定的 Web 工作台，在首页看到主要入口、当前工作空间、全局 AI、应用、扩展能力和最近活动。

**FRs covered:** FR-016, FR-019, FR-020, FR-021

**User value:** 用户第一次进入就能理解产品是一个可以组织工作和成长的工作台，而不是一组资料表或空页面。

**Natural dependency:** 只依赖认证和现有 Web 基础；可以用 fixture/最小数据先交付，不等待所有 Agent 完成。

### Epic 1: AI 生成首个个人工作空间

用户用一句自然语言描述当前工作、目标和阻塞，AI 生成首个 Workspace、Project、Goal、Plan、Task、Learning 入口和首批 Memory，用户只做确认、纠正或拒绝。

**FRs covered:** FR-001, FR-018, FR-019

**User value:** 用户不用填写复杂个人资料，完成 Onboarding 后立即得到可以开始工作的首页。

**Natural dependency:** 依赖 Epic 0 的 Shell 和 Command Center；数据对象只创建当前流程需要的最小集合。

### Epic 2: 拥有一份会记住我的个人 Memory

用户能够用一句话保存事实，之后通过自然语言、时间、关键词和关联对象找回自己的记忆。

**FRs covered:** FR-002, FR-003, FR-004

**User value:** 用户不再需要反复解释自己，系统开始形成可检索、可引用、可反馈的个人上下文。

**Natural dependency:** 使用 Epic 1 的用户隔离和 Workspace/Project 上下文；Memory 管理入口位于 Mine，不定义主导航。

### Epic 3: 每天用几分钟完成反思闭环

用户能够完成晨间启动、日间微记录、晚间复盘和周期回顾，并在第二天看到更有上下文的建议。

**FRs covered:** FR-005, FR-006, FR-007, FR-008

**User value:** 用户形成一个低负担的每日闭环，记录会自动进入 Memory，而不是成为额外管理工作。

**Natural dependency:** 使用 Epic 1 的 Workspace/Plan/Goal 和 Epic 2 的 Memory；每日流程必须回写 Workspace Event。

### Epic 4: 把想法变成今天可执行的任务

用户能够维护任务、按能量和时间组织任务，并接受有依据的每日任务推荐。

**FRs covered:** FR-009, FR-010

**User value:** 用户从“事情很多”变成“今天先做这几件”，并能看见完成、推迟和阻塞的原因。

**Natural dependency:** 可读取 Workspace/Project、Goal/Plan、Memory 和 Reflection；任务是首页和工作台的核心对象。

### Epic 5: 让长期目标持续驱动行动

用户能够用自然语言创建目标，得到可编辑的周期拆解，并查看目标进度、风险和任务对齐。

**FRs covered:** FR-011, FR-012

**User value:** 用户不再只管理零散任务，能够理解每日行动与长期方向之间的关系。

**Natural dependency:** 使用 Epic 4 的任务关联，并驱动 Project、Knowledge 和 Learning Queue。

### Epic 6: Command Center 统一聚合工作与成长

用户能够在一个低噪音 Command Center 看到当前 Workspace/Project、今日简报、核心任务、成长计划、知识学习、最近活动、AI 洞察和能力入口。

**FRs covered:** FR-016, FR-017

**User value:** 用户打开产品后不需要浏览多个模块，就能完成当天的判断和下一步行动。

**Natural dependency:** 首页 Shell 可独立交付；完整聚合依赖 Epic 1 到 Epic 5，但必须先定义稳定的 Dashboard Context 合约。

### Epic 7: 与一个真正记得我的 AI 对话

用户能够提出关于任务、目标、复盘、知识和个人经历的问题，并把回答转为下一步行动。

**FRs covered:** FR-015

**User value:** 用户获得一个基于个人上下文的统一入口，而不是分别进入多个 Agent 页面。

**Natural dependency:** 依赖 Workspace Context、Memory 检索和 Capability Registry；Command Bar 先支持 Task/Goal/Plan/Knowledge/Memory/Workspace 六类意图。

### Epic 8: 让知识自动进入个人大脑

用户能够保存网页或内容，获得 AI 摘要、知识卡片和与目标/Memory 的关联。

**FRs covered:** FR-013

**User value:** 用户的知识输入不再孤立，能在之后的对话、任务和目标中被重新使用。

**Priority:** Phase 2

### Epic 9: 把工作事实接入个人工作空间

用户能够管理项目目录、常用软件入口和少量授权连接，让工作事实进入 Workspace Event/Memory 并辅助生成进展报告。

**FRs covered:** FR-014

**User value:** 用户不需要手工复制工作进展，系统可以基于真实工作事实辅助回顾。

**Priority:** Phase 2-3

### Epic 10: 保留并隔离历史交易能力

用户能够访问已有交易记录、复盘和投资分析，同时新 Personal Agent 的通用体验不会被交易场景主导。

**FRs covered:** 旧 GrowthPilot v1/v2 能力，不属于 v3 新增 FR

**User value:** 保护已有数据和功能资产，同时让产品完成从交易成长到全成长体系的定位迁移。

**Priority:** Migration / Legacy

### Epic 11: 管理可组合的 App、Plugin、Skill 和 Agent

用户能够在一个能力中心发现、启用、停用和授权软件入口、连接器、Plugins、Skills、Agent Experts 和自动化流程，并查看调用记录。

**FRs covered:** FR-020, FR-021

**User value:** 用户知道工作台能做什么、哪些能力已启用、需要什么权限，也能把重复工作沉淀为可复用能力。

**Natural dependency:** 依赖 Epic 0 的入口、Epic 1 的 Workspace 范围和 Epic 7 的 Command Bar；高风险执行和第三方安装后置。

---

## FR Coverage Map

| Requirement | Epic | Notes |
|-------------|------|-------|
| FR-001 | Epic 1 | AI creates first Workspace and initial actions |
| FR-002 | Epic 2 | Unified Memory write |
| FR-003 | Epic 2, Epic 7 | Retrieval is core, AI is entry |
| FR-004 | Epic 2, Epic 6 | Health data displayed in Mine |
| FR-005 | Epic 3, Epic 4 | Morning recommends Task |
| FR-006 | Epic 3, Epic 2 | Micro reflection writes Memory |
| FR-007 | Epic 3, Epic 2 | Evening writes Memory |
| FR-008 | Epic 3, Epic 6 | Reports displayed in Mine |
| FR-009 | Epic 4 | Task CRUD |
| FR-010 | Epic 4, Epic 3 | Recommendation from Morning |
| FR-011 | Epic 5 | Goal creation and decomposition |
| FR-012 | Epic 5, Epic 6 | Progress and dashboard |
| FR-013 | Epic 8 | Deferred Knowledge Agent |
| FR-014 | Epic 9 | Workspace resources and work integrations |
| FR-015 | Epic 7 | Global AI and routing |
| FR-016 | Epic 0, Epic 6 | Web Shell and Command Center |
| FR-017 | Epic 6 | Mine and growth data |
| FR-018 | Epic 1, Epic 2, Epic 7, Epic 11 | Cross-cutting privacy and capability permissions |
| FR-019 | Epic 0, Epic 1, Epic 9 | Workspace / Project / Resource |
| FR-020 | Epic 0, Epic 11 | App / Plugin / Skill Registry |
| FR-021 | Epic 0, Epic 6, Epic 7, Epic 11 | Command Center and action routing |

---

## Phase 1 Boundary

Phase 1 只实现一个“有内容、能开始工作、能产生成长数据”的 Web 版本：

1. Epic 0: Web Workspace Shell 和 Command Center。
2. Epic 1: AI Onboarding 生成 Workspace、Project、Goal、Plan、Task、Learning 入口。
3. Epic 4: Task 最小闭环。
4. Epic 5: Goal / Growth Plan 最小闭环。
5. Epic 2: Memory 作为统一事件上下文和 Mine 管理能力。
6. Epic 3: Morning、Micro Capture、Evening 最小闭环。
7. Epic 7: Global AI Command Bar 最小路由和引用。
8. Epic 8: 只交付首个 Learning 入口和最小学习队列；完整知识捕获、摘要和复习能力后置到 Knowledge Sprint。

Phase 1 不实现：

- 多工具全量同步和复杂本地文件执行。
- 第三方 Plugin/Skill 自动安装市场。
- 多 Agent 长时间后台自治和高风险外部副作用。
- 复杂知识图谱可视化、社区、成就徽章、多人协作。
- 新交易功能；旧交易只保留历史工具入口。

---

## Epic 0: 建立 Web 工作台骨架

### Story 0.1: 使用 Web Workspace Shell

作为 Web 用户，
我希望看到稳定的工作台导航、Workspace 切换、全局 AI 和能力入口，
以便我能从一个首页进入所有主要工作。

**Acceptance Criteria:**

- **Given** 用户已登录
- **When** 打开 `/app`
- **Then** 页面显示 Web-first 侧边栏：首页、工作台、待办、成长计划、知识学习、应用中心、扩展能力、洞察、我的。
- **And** Global AI Command Bar 和 Activity Center 在桌面端可访问。
- **And** 旧交易工具不出现在默认主导航。
- **And** 移动宽度下侧边栏可折叠，主要入口仍可访问。

### Story 0.2: 查看 Command Center 首页

作为个人工作台用户，
我希望首页显示当前工作、计划、待办、知识和下一步，
以便我不需要在多个页面之间寻找今天要做的事。

**Acceptance Criteria:**

- **Given** Dashboard Context 已加载
- **When** 首页渲染
- **Then** 显示今日简报、进行中 Workspace/Project、最多 3 个推荐任务、成长计划、知识队列、最近活动和能力入口。
- **And** 至少显示一项进行中内容和一项可执行下一步。
- **And** AI 洞察显示依据；AI 内容 pending 时基础数据仍可使用。
- **And** 无数据时显示创建动作和跳过入口，而不是空白占位。

### Story 0.3: 从 Command Bar 创建行动

作为用户，
我希望用一句自然语言表达想做的事，
以便 AI 能将其转换为 Task、Goal、Plan、Knowledge、Workspace 操作或一次记录。

**Acceptance Criteria:**

- **Given** 用户在首页 Command Bar 输入自然语言
- **When** AI 返回理解结果
- **Then** 显示意图、关联 Workspace/Project、建议动作和依据。
- **And** 用户可以确认、修改一句话、只记录或拒绝。
- **And** 需要调用 App/Plugin/Skill 时显示能力、权限和副作用预览。
- **And** 失败时保留原始输入并提供重试。

### Story 0.4: 持久化 Workspace、Project 与活动事实

作为个人工作台用户，
我希望已确认的工作空间和项目被保存为真实、可隔离的领域对象，
以便我能在不同设备和后续页面中持续使用同一份工作上下文。

**Acceptance Criteria:**

- **Given** 用户已登录
- **When** 用户创建、更新或归档一个 Workspace
- **Then** 只读写当前用户拥有的 Workspace 数据
- **And** Workspace 保存名称、描述、类型、状态、图标、最近打开时间和归档时间
- **And** 创建、更新、归档各追加一条用户隔离的 Workspace Event

- **Given** 用户拥有一个未归档的 Workspace
- **When** 用户创建、更新或归档其中的 Project
- **Then** Project 保存 Workspace 归属、名称、描述、状态、优先级、进度、下一步、截止时间和归档时间
- **And** 请求不能用外部传入的 user_id 改变对象归属
- **And** 对应写入与 Project Event 在同一事务中提交

- **Given** 用户请求 Workspace 的项目或活动
- **When** API 返回结果
- **Then** 只返回当前用户且未归档的领域对象，除非用户显式请求查看已归档对象
- **And** 活动响应提供事件类型、来源对象、最小负载和发生时间
- **And** 此 Story 不同步创建 Memory 或 Insight；后续异步投影以 Workspace Event 为唯一输入之一

## Epic 1: 建立安全、可编辑的个人上下文

用户能够快速进入系统，告诉系统当前在做什么、想往哪里去、卡在哪里，并拥有对个人数据的控制权。

### Story 1.1: 用一句话创建初始个人上下文

As a first-time user,
I want to describe my current situation in one natural-language input,
So that the system can create a useful starting workspace without a long form.

**Acceptance Criteria:**

**Given** 用户首次进入 GrowthPilot Web Workspace
**When** 用户输入一段关于当前工作、目标、学习方向或阻塞的自然语言
**Then** 系统生成 Workspace、Project/主题、Goal、Growth Plan、最多三个 Task 和一个 Learning 入口
**And** 用户可以整体确认、拒绝某个对象或用一句话纠正 AI 理解
**And** 只有用户确认的对象才写入正式领域数据；拒绝不会自动创建对象
**And** 原始输入先作为 onboarding draft 保存；用户确认后写入 workspace_event，需要长期引用时再生成 onboarding Memory

**Given** AI 结构化失败或超时
**When** 用户点击继续
**Then** 系统仍保存原始输入并创建最小 Workspace 草稿
**And** 不因 AI 失败阻塞进入有基础入口的 Command Center

#### Story 1.1 当前增量实现边界

- 本轮只将用户确认的 `Workspace` 与可选 `Project` 写入真实领域表；Goal、Growth Plan、Task 和 Learning 仍保留为前端可编辑草稿，等待各自 Story 建立领域模型后再持久化。
- `POST /api/v1/onboarding/context/complete` 从 JWT 派生用户归属，不接受客户端传入 `user_id`；Project 不能脱离已确认的 Workspace 创建。
- Workspace、Project、其创建 Event、`onboarding_confirmed` Event 与现有 Onboarding Memory 必须在同一事务中提交。`onboarding_confirmed` 仅保存原始输入和已确认对象的最小事实。
- 浏览器先建立本地工作台作为回退；只有服务端确认成功后才清除本地原话草稿。失败时保留原话和本地工作台，并允许用户重试同步，不重复创建已确认的 Workspace / Project。

### Story 1.2: 设置提醒时间和时区

As a user,
I want to set my Morning and Evening reminder preferences,
So that the daily loop fits my actual schedule.

**Acceptance Criteria:**

**Given** 用户完成或跳过初始上下文
**When** 用户设置 Morning 时间、Evening 时间和时区
**Then** 系统保存用户级提醒设置
**And** 日期边界按用户时区计算
**And** 用户可以在 Mine 中修改设置

**Given** 用户拒绝通知权限
**When** 用户完成设置
**Then** 核心流程仍可从 Dashboard 手动进入
**And** 页面明确显示通知未开启而不是伪装为已开启

#### Story 1.2 当前增量实现边界（已完成）

- 只新增用户级 `daily_preferences` 读写契约，保存有效 IANA 时区、Morning 时间和 Evening 时间；不创建 Workspace、Reminder、Memory、Event 或任务对象，也不改写现有 Onboarding/Profile 设置。
- Dashboard 当日聚合和非补记的 Reflection 日期按保存的用户时区计算；设置为空或无效时回退 `Asia/Shanghai`、`08:30`、`21:30`。补记仍显式保留用户提供日期。
- Web 只在 Mine 展示并修改偏好，同时明确系统通知未开启；Dashboard 继续提供手动 Morning / Evening 入口。当前不请求通知权限、不发送推送、不使用 Worker/Cron，也不记录“已提醒”事实。

### Story 1.3: 管理个人数据范围

As a user,
I want to control which personal data the Agent can use,
So that I can keep agency over sensitive context.

**Acceptance Criteria:**

**Given** 用户打开隐私设置
**When** 用户选择允许 Agent 使用的来源范围
**Then** 系统保存 privacy scope
**And** 后续 Agent 检索只能读取授权来源
**And** 页面显示当前启用的数据来源

**Given** 用户关闭一个数据来源
**When** 用户保存设置
**Then** 新的 Agent 请求不再读取该来源
**And** 已生成的历史回复不会被伪造为重新生成

#### Story 1.3 当前增量实现合同

- 只新增用户级 `users.settings.privacy_scope`，保存 `enabled_sources`；本轮支持 `tasks`、`goals`、`plans`、`learning`、`knowledge_cards`、`reflections`、`memories` 七类来源，缺少历史配置时默认全部开启。
- API 使用 `GET/PUT /api/v1/onboarding/privacy-scope`，只更新 `privacy_scope` 子树，不创建 Workspace、Event、Memory 或任何领域对象。
- Mine 提供来源勾选和保存反馈。关闭来源只约束后续 Personal Agent / Context 检索；既有 Agent 回复、Run 审计和引用记录不重写。
- 新检索代码必须调用 `privacy_scope` 边界；Memory provenance 映射到对应来源，未知 provenance 默认拒绝。当前旧 `ai_coach.py` 属于 legacy trading coach，本切片不将其宣称为新 Personal Agent，也不扩大旧交易数据读取范围。
- 本切片不实现导出、删除、分享、通知、第三方连接或真实 LLM 调用；不新增数据库表或迁移。

### Story 1.4: 导出和删除个人数据

As a user,
I want to export or delete my personal data,
So that I can leave the system with control over my information.

**Acceptance Criteria:**

**Given** 用户请求导出
**When** 导出任务创建成功
**Then** 系统异步生成当前用户可读的数据包
**And** 导出包含 Memory、Reflection、Task、Goal 和 Knowledge 数据
**And** 不包含其他用户数据

**Given** 用户删除一条 Memory 或一个数据范围
**When** 用户确认删除
**Then** 原始记录立即标记 deleted
**And** 检索接口立即排除该记录
**And** 派生实体、引用和 embedding 进入异步清理队列

---

## Epic 2: 拥有一份会记住我的个人 Memory

用户能够用一句话保存事实，之后通过自然语言、时间、关键词和关联对象找回自己的记忆。

### Story 2.1: 创建一条手动 Memory

As a user,
I want to save a short thought or fact,
So that it becomes part of my long-term context.

**Acceptance Criteria:**

**Given** 用户已登录且 privacy scope 可用
**When** 用户输入一句话并提交
**Then** 系统创建 memory_entry
**And** 保存 user_id、source=manual、type、occurred_at 和 content
**And** 页面立即显示已保存状态

**Given** 用户提交空内容
**When** 用户点击保存
**Then** 系统阻止提交并显示可理解的提示
**And** 不创建空 Memory

### Story 2.2: 查看、编辑和删除 Memory

As a user,
I want to manage my saved memories,
So that the personal context remains accurate and under my control.

**Acceptance Criteria:**

**Given** 用户打开 Memory 列表
**When** 系统加载数据
**Then** 只返回当前用户且未删除的 Memory
**And** 列表显示来源、时间、摘要和关联标签

**Given** 用户编辑 Memory
**When** 用户保存修改
**Then** content、tags 和 occurred_at 更新
**And** embedding 和实体状态标记为 stale
**And** 异步任务负责重新生成派生数据

**Given** 用户删除 Memory
**When** 用户确认
**Then** 立即从列表和检索结果移除
**And** 支持短时间撤销

### Story 2.3: 按关键词和时间检索 Memory

As a user,
I want to find memories by keyword and time,
So that I can quickly recover what happened.

**Acceptance Criteria:**

**Given** 用户输入关键词或选择时间范围
**When** 用户执行搜索
**Then** 系统返回匹配的 Memory
**And** 支持今天、本周、本月和自定义日期范围
**And** 结果按相关度与新鲜度排序

**Given** 没有匹配结果
**When** 搜索完成
**Then** 页面显示空状态和一个可直接创建 Memory 的入口

### Story 2.4: 语义检索和引用结果

As an Agent,
I want to retrieve semantically relevant memories,
So that answers can use context beyond exact keywords.

**Acceptance Criteria:**

**Given** pgvector 可用
**When** retrieval_engine 收到自然语言查询
**Then** 系统返回满足 user_id、privacy scope 和 deleted_at 过滤的候选 Memory
**And** 结果包含相似度、来源、时间和 citation id

**Given** pgvector 不可用
**When** 检索请求执行
**Then** 系统降级到全文和关键词检索
**And** API 响应仍保持相同结构
**And** 页面不因检索模式变化而崩溃

### Story 2.5: 异步生成摘要、实体和 embedding

As a user,
I want the system to enrich memories in the background,
So that saving a memory stays fast while retrieval improves over time.

**Acceptance Criteria:**

**Given** Memory 创建成功
**When** outbox event 被写入
**Then** Arq 任务异步处理 summary、entities、relations 和 embedding
**And** 任务具备幂等键
**And** 任务失败可重试并记录错误

**Given** enrichment 仍在处理
**When** 用户查看 Memory
**Then** 页面显示“正在整理”状态
**And** 原始内容可正常查看和编辑

### Story 2.6: 查看 Memory 健康度

As a user,
I want to see whether my Memory is fresh and balanced,
So that I know what context is missing.

**Acceptance Criteria:**

**Given** 用户打开 Mine 的 Memory 健康度
**When** 系统完成聚合
**Then** 显示数量、新鲜度、目标/任务/情绪/知识覆盖度和关联度
**And** 每个指标都提供简短解释

**Given** 某个维度数据不足
**When** 健康度报告生成
**Then** 系统提供 1-3 条可执行补充建议
**And** 建议可以直接进入 Micro Capture 或 Goal/Task 页面

### Story 2.7: 对 AI 引用提供反馈

As a user,
I want to mark an AI citation as useful or unhelpful,
So that future context selection improves.

**Acceptance Criteria:**

**Given** AI 回复展示 citations
**When** 用户点击有用或无用
**Then** 系统保存 agent_feedback、source_id 和 feedback_type
**And** 当前回复不被刷新或丢失

**Given** 用户未提供反馈
**When** 回复关闭
**Then** 不阻塞对话流程
**And** agent_run 仍完整记录

---

## Epic 3: 每天用几分钟完成反思闭环

用户能够完成晨间启动、日间微记录、晚间复盘和周期回顾，并在第二天看到更有上下文的建议。

### Story 3.1: 完成晨间启动

As a user,
I want to record my energy and today's intention,
So that the system can help me start with a clear direction.

**Acceptance Criteria:**

**Given** 用户进入当天尚未完成的 Morning
**When** 用户选择能量、输入意图并提交
**Then** 系统创建 morning reflection
**And** 保存 energy_level、intention、reflection_date 和 user timezone
**And** 创建对应 Memory

**Given** 用户跳过意图文本
**When** 用户提交
**Then** 允许保存能量和空意图
**And** 页面不显示阻塞性错误

### Story 3.2: 完成日间 Micro Capture

As a user,
I want to record a progress, decision, emotion, or idea in seconds,
So that important context is not lost during the day.

**Acceptance Criteria:**

**Given** 用户从任意主页面打开 Micro Capture
**When** 用户选择类型、状态并输入一句话
**Then** 系统创建 micro reflection 和 Memory
**And** 可选关联一个 Task 或 Goal
**And** 保存后回到打开前的页面

**Given** 用户关闭 Sheet 或网络失败
**When** 输入内容尚未提交
**Then** 草稿保留在本地
**And** 用户可以恢复、重试或放弃草稿

### Story 3.3: 完成晚间复盘

As a user,
I want to review what went well and what to adjust,
So that each day produces a useful next step.

**Acceptance Criteria:**

**Given** 用户进入当天 Evening
**When** 用户填写完成度、三个简短问题和情绪并提交
**Then** 系统创建 evening reflection
**And** 更新当天任务和目标上下文
**And** 创建或更新对应 Memory

**Given** 用户只填写完成度和情绪
**When** 用户提交
**Then** 允许保存
**And** 可选文本字段保持为空

#### Story 3.1-3.3 当前增量实现边界

- 新建独立 `workspace_reflections` 表与用户隔离 API，类型限定为 `morning`、`micro`、`evening`；不得复用遗留交易 `records` 或 `reviews`。
- 所有 Reflection 必须归属未归档 Workspace；Micro 可选关联同 Workspace 的 Project、Goal 或 Task，Morning / Evening 以 `reflection_date` 表示所属日期。
- Morning 和 Evening 对同一 Workspace、同一日期、同一类型使用幂等 upsert；Micro 每条表达创建独立事实。保存均在同一事务写入用户隔离 Workspace Event。
- Web 登录后读取当前 Workspace 的真实 Reflection；保存时优先同步服务端，失败时保留本地事实和未提交的 Micro Capture 草稿。
- 本切片不调用 AI 生成总结、不写入 Memory、不推断任务或目标进度、不实现提醒和补记统计。

### Story 3.4: 异步生成复盘总结

As a user,
I want an AI summary after saving my reflection,
So that I can see a concise interpretation without waiting.

**Acceptance Criteria:**

**Given** Evening 保存成功
**When** AI summary job 被调度
**Then** 页面显示 pending 状态并允许离开
**And** 任务完成后显示一句总结、明日调整和 citations
**And** AI 失败时显示“已保存，稍后补全”

**Given** 总结生成
**When** 系统写入 ai_summary
**Then** 记录 model、prompt_version、llm_call_id 和 source memory ids

### Story 3.5: 查看周回顾和月回顾

As a user,
I want a weekly or monthly review,
So that I can notice patterns beyond a single day.

**Acceptance Criteria:**

**Given** 周/月回顾任务已生成
**When** 用户打开回顾
**Then** 显示周期主题、任务完成、能量/情绪趋势、关键 Memory 和里程碑
**And** 每条 AI 洞察可展开引用

**Given** 周期数据不足
**When** 回顾生成
**Then** 明确标记样本不足
**And** 不生成确定性过高的结论

### Story 3.6: 处理提醒、补记和缺席

As a user,
I want to return after missing a reflection,
So that the system helps me resume without guilt.

**Acceptance Criteria:**

**Given** 用户错过 Morning 或 Evening
**When** 用户下一次打开 Dashboard
**Then** 显示可选的补记入口
**And** 不显示失败连击或惩罚性文案

**Given** 用户提交补记
**When** 系统保存
**Then** reflection 标记为补充记录
**And** 统计不伪装为按时完成

---

## Epic 4: 把想法变成今天可执行的任务

用户能够维护任务、按能量和时间组织任务，并接受有依据的每日任务推荐。

### Story 4.1: 创建和编辑任务

As a user,
I want to create and edit a task,
So that I can turn intentions into concrete work.

**Acceptance Criteria:**

**Given** 用户打开 Task 页面
**When** 用户输入标题并保存
**Then** 创建 task，默认状态为 todo
**And** 支持设置 priority、energy_required、time_block、due_at 和 goal_id
**And** 保存成功后出现在对应列表

**Given** 用户编辑任务
**When** 用户保存修改
**Then** 只更新当前用户的任务
**And** 已完成任务的 completed_at 不被无意清空

#### Story 4.1 当前增量实现边界

- 新建 Workspace Task 领域表和 API，不复用遗留交易 `daily_tasks`；遗留日检继续作为历史能力，不进入默认工作台主线。
- 第一笔持久化 Task 必须归属一个未归档 Workspace，可选关联同一 Workspace 的 Project；`goal_id` 和 `plan_id` 仅保留为后续 Story 5.1 的可空关联字段，不创建不存在的 Goal 或 Plan。
- 创建和编辑只允许当前 JWT 用户访问；创建、编辑和后续状态转换均在同一事务追加用户隔离的 Workspace Event。
- 本 Story 先实现创建、读取和编辑；完成、推迟、阻塞与原因记录属于 Story 4.2，必须通过专用状态操作维护 `completed_at`，普通编辑不得无意清空它。

### Story 4.2: 完成、推迟和阻塞任务

As a user,
I want to change task status with a reason,
So that the system learns how my execution actually works.

**Acceptance Criteria:**

**Given** 任务状态为 todo 或 doing
**When** 用户点击完成
**Then** 状态变为 done 并记录 completed_at
**And** 可选触发一句话 Micro Capture

**Given** 用户推迟或标记阻塞
**When** 用户提交原因
**Then** 保存 defer_reason 或 blocked reason
**And** 任务从当前核心列表移动到对应状态区

#### Story 4.2 当前增量实现边界

- 状态动作使用专用接口：`/complete`、`/defer`、`/block`；普通 Task 编辑接口不接受 `status` 或 `completed_at`。
- 完成只允许从 `todo` 或 `doing` 进入 `done`，并记录 `completed_at`；重复完成保持幂等，不重复追加完成事件。
- 推迟保留任务为 `todo`，记录 `defer_reason` 和新的可选 `due_at`；阻塞进入 `blocked` 并记录原因。
- 每次有效状态动作在同一事务追加用户隔离 Workspace Event；当前不自动创建 Micro Capture，待 Reflection Story 接入。

#### Story 4.3 当前增量实现边界

- Task 页面使用当前 Workspace 的完整任务列表 API；Command Center 的 3 条任务限制只属于首页读模型，不得成为 Task 页面数据上限。
- 新增任务沿用当前本地乐观交互，但登录状态下先调用真实创建 API；服务端返回的 ID、时间和关联字段覆盖本地临时对象，失败时保留本地对象并继续可编辑。
- 页面提供“按时间块 / 按能量”两种组织方式；时间块优先使用 `time_block`，能量优先使用 `energy_required`，字段缺失统一进入未安排分组。
- 分组只改变展示顺序，不改变用户手动状态、截止时间或本地任务顺序；本切片不自动推断能量、不生成 AI 排序。

### Story 4.3: 按能量和时间组织今日任务

As a user,
I want to see today's tasks grouped by energy and time,
So that the list matches how I can work today.

**Acceptance Criteria:**

**Given** 今日任务存在
**When** 用户打开 Task 页面
**Then** 默认按时间块或能量分组
**And** 每组最多展示 5 个任务后提供展开入口
**And** 用户可以切换分组方式

**Given** 今日能量来自 Morning
**When** 页面加载
**Then** 当前能量与任务 energy_required 可见
**And** 不强制改变用户手动排序

### Story 4.4: 获取每日 AI 任务推荐

As a user,
I want up to three prioritized task recommendations,
So that I know what to do next without planning everything manually.

**Acceptance Criteria:**

**Given** 用户有活动目标、任务或近期 Memory
**When** 用户请求今日推荐
**Then** 返回最多 3 个推荐任务
**And** 每个推荐包含 recommendation_reason
**And** 推荐解释引用目标、截止日期、能量或近期记录

**Given** 上下文不足
**When** 用户请求推荐
**Then** 系统提示样本不足并允许手动添加任务
**And** 不生成虚构的个人事实

### Story 4.5: 在 Focus 状态执行任务

As a user,
I want a distraction-light focus state,
So that I can execute one task without browsing the whole system.

**Acceptance Criteria:**

**Given** 用户从任务行点击开始
**When** Focus 页面打开
**Then** 只显示当前任务、计时、暂停、完成和退出
**And** 支持进入 Micro Capture

**Given** 用户完成任务
**When** 点击完成
**Then** 任务更新为 done
**And** 用户可立即写一句完成感受
**And** 返回 Task 或 Dashboard

---

## Epic 5: 让长期目标持续驱动行动

用户能够用自然语言创建目标，得到可编辑的周期拆解，并查看目标进度、风险和任务对齐。

### Story 5.1: 用自然语言创建目标

As a user,
I want to create a goal in natural language,
So that I do not have to understand the internal goal schema.

**Acceptance Criteria:**

**Given** 用户打开新增目标
**When** 用户输入目标描述
**Then** AI 提取 title、dimension、goal_type、due_at、importance 和 target_metric
**And** 用户可以修改提取结果
**And** 只有用户确认后才创建 Goal

**Given** AI 无法识别周期或衡量方式
**When** 用户确认
**Then** 允许保存缺失字段
**And** 页面提示后续可补充

#### Story 5.1 当前增量实现边界

- 新建 Goal 领域表和用户隔离 CRUD API。Goal 必须归属未归档 Workspace，可选关联同一 Workspace 的 Project。
- 第一版由用户确认的标题和可选描述、维度、类型、截止时间、重要性、目标指标组成；字段缺失允许保存，AI 结构化和拆解不阻塞创建。
- 创建和编辑在同一事务写入 Workspace Event；Goal 进度、里程碑、拆解和 Plan 关联分别留待后续 Story。

### Story 5.2: 生成并确认目标拆解

As a user,
I want to decompose a goal into milestones and smaller goals,
So that a long-term direction becomes actionable.

**Acceptance Criteria:**

**Given** Goal 已创建
**When** 用户点击 AI 拆解
**Then** 系统生成月/周或里程碑建议
**And** 每个建议显示其与父目标的关系
**And** 用户可以逐项接受、编辑或拒绝

**Given** 用户拒绝全部拆解
**When** 用户提交
**Then** 保留原目标
**And** 不创建未经确认的子目标

#### Story 5.2 当前增量实现边界

- 新建 Growth Plan 领域表和用户隔离 CRUD API。Plan 必须归属未归档 Workspace，并关联同一 Workspace 的 Goal；Project 关联可选。
- 第一版由用户确认计划标题、描述、周期、周数和里程碑后写入；AI 拆解建议和逐项接受流程在后续交互 Story 实现。
- 创建和编辑在同一事务写入 Workspace Event。基于 Task / Learning / Reflection 的自动进度计算留待后续聚合 Story。

#### Story 5.1 / 5.2 当前增量实现边界

- Growth Plan 页面登录后读取当前 Workspace 的完整 Goal 与 Growth Plan 列表；Dashboard 首屏聚合继续保持轻量读模型，二者不能因为字段精简而丢失真实对象。
- 用户先确认 Goal 的标题、描述和可选截止日期，再创建 Goal；用户选择已有 Goal 后确认计划标题、周期、周数和里程碑，再创建 Growth Plan。
- 创建沿用本地乐观交互，服务端成功后用返回对象替换临时 ID；请求失败时保留本地对象作为离线回退。
- 本切片不调用 AI 自动提取 Goal 字段、不生成自动拆解建议、不根据 Task / Learning / Reflection 推断或写回进度。

### Story 5.3: 查看目标进度和里程碑

As a user,
I want to see goal progress and the next milestone,
So that I know whether my actions are moving the goal forward.

**Acceptance Criteria:**

**Given** Goal 有任务或进度记录
**When** 用户打开目标详情
**Then** 展示当前进度、最近里程碑、下一步任务和关联 Memory
**And** 进度来源可追溯

**Given** Goal 没有进度数据
**When** 用户打开详情
**Then** 显示“尚未开始”空状态
**And** 提供添加进度或创建下一步任务入口

### Story 5.4: 识别目标偏离并给出预警

As a user,
I want to know when a goal is drifting,
So that I can adjust before it becomes invisible.

**Acceptance Criteria:**

**Given** Goal 有截止时间和进度历史
**When** 系统执行周期检查
**Then** 生成 on_track、at_risk 或 delayed 状态
**And** 风险提示包含计算依据
**And** 用户可以调整目标、截止时间或下一步任务

**Given** 数据样本不足
**When** 系统执行检查
**Then** 标记为 insufficient_data
**And** 不显示确定性延期结论

---

## Epic 6: 每天打开就知道最重要的事

用户能够在一个低噪音 Dashboard 看到今日能量、重点目标、核心任务、AI 洞察和快捷动作。

### Story 6.1: 查看今日 Dashboard

As a user,
I want one screen that summarizes today,
So that I can decide what matters without opening multiple modules.

**Acceptance Criteria:**

**Given** 用户已登录
**When** 用户打开首页
**Then** 首屏显示问候、日期、当前 Workspace/Project、今日简报、成长计划、知识学习入口、最多 3 个任务、最近活动和快捷操作
**And** 默认不显示行情、资讯流或交易统计
**And** 首屏请求只返回当前用户数据

**Given** 某一数据域为空
**When** Dashboard 加载
**Then** 显示对应空状态和一个明确行动
**And** 其他区块仍可正常使用

#### Story 6.1 当前增量实现边界

- 新增只读 `GET /api/v1/dashboard/command-center?workspace_id=...`，一次返回当前用户 Workspace、Project、Goal、Growth Plan、最多 3 个未完成 Task 和最近 Workspace Event。
- 聚合接口只读真实领域当前状态，不调用 AI、不读取遗留交易 Dashboard；空域返回空数组和稳定字段，前端可继续使用本地回退。
- 所有查询按 JWT 用户和未归档 Workspace 隔离；本轮暂不把 Knowledge、Reflection 和 Insight 假数据混入真实聚合。

### Story 6.2: 查看带引用的 AI 洞察

As a user,
I want to see one useful insight with its evidence,
So that the system feels grounded in my reality.

**Acceptance Criteria:**

**Given** 今日上下文有足够 Memory、Task 或 Goal
**When** Dashboard 加载完成
**Then** 显示一条 AI 洞察
**And** 洞察包含可展开的 citation
**And** 用户可以进入详情或标记引用有用/无用

**Given** 数据不足或 AI pending
**When** Dashboard 加载
**Then** 显示样本不足或正在整理状态
**And** 不显示虚构洞察

### Story 6.3: 使用首页快捷操作

As a user,
I want quick access to Morning, Evening, Micro Capture and Task actions,
So that frequent actions require minimal navigation.

**Acceptance Criteria:**

**Given** 用户在 Dashboard
**When** 点击快捷操作
**Then** 直接进入对应流程
**And** 返回后保留 Dashboard 原滚动位置或刷新相关区块

**Given** 用户从 Micro Capture 返回
**When** Memory 保存成功
**Then** 首页显示最新记录的轻量确认
**And** 不强制跳转到 Memory 详情

### Story 6.6: 聚合今日执行闭环

As a user,
I want to see today's execution loop in one place,
So that I know what has been completed and what is the smallest useful next step.

**Acceptance Criteria:**

**Given** 当前 Workspace 中存在任务、学习、快速记录或晨晚复盘事实
**When** 用户打开 Dashboard 或完成其中任一动作后返回首页
**Then** 首页显示任务完成、快速记录、学习进展、Morning 和 Evening 的当日状态
**And** 每项状态只引用对应领域对象或 Workspace Event，不以 Memory 或 Insight 覆盖当前状态
**And** 用户可以从对应状态直接进入任务、快速记录、学习或复盘流程

**Given** 当日闭环尚未完成
**When** 系统生成下一步建议
**Then** 规则按 Morning、未完成高优任务、进行中学习、缺失的快速记录和 Evening 的顺序选择一个低负担动作
**And** 建议显示其事实依据，例如“今天还有 2 个高优待办”或“尚未留下学习进展”
**And** 该规则建议不标记为 AI 洞察

**Given** 用户完成任务、更新学习进度、保存快速记录或保存晨晚复盘
**When** 写入成功
**Then** 领域对象和对应 Workspace Event 被更新
**And** Dashboard 在不刷新页面的情况下更新闭环状态与下一步

#### Story 6.6 当前增量实现边界

- Command Center 读模型在最多 3 个未完成任务外，保留有限的当日完成任务事实、少量学习队列项，以及当日的 Morning、Micro Capture、Evening 事实；完整任务、学习和复盘历史仍分别由 `/tasks`、`/learning-items`、`/reflections` 列表 API 提供。
- 学习项优先包含当日更新和进行中的条目；复盘保留 Morning、Evening 和有限数量的当日 Micro Capture，以支持首页规则化闭环，不把 Memory、Insight 或旧交易数据当作当前状态来源。
- Web 先使用 Command Center 的学习与复盘数据建立首屏闭环；完整列表请求成功后以完整领域对象覆盖该降级集合。任一列表请求失败时，Dashboard 数据继续可用，且不删除本地未同步事实。
- 本切片不新增 AI 排序、学习推荐、复盘总结或自动改写任务、目标、计划进度。

### Story 6.4: 查看 Mine 成长概览

As a user,
I want to see my progress over time,
So that growth is visible without gamification.

**Acceptance Criteria:**

**Given** 用户打开 Mine
**When** 聚合数据加载
**Then** 显示目标完成率、任务完成率、复盘天数、Memory 数量、能力趋势和里程碑
**And** 指标旁有时间范围或计算说明

**Given** 没有足够历史数据
**When** Mine 加载
**Then** 显示已积累数据和下一步建议
**And** 不显示虚假的趋势图

#### Story 6.4 当前增量实现边界

- Mine 首先基于当前 Workspace 已水合的 Goal、Growth Plan、Task、Learning Item 和 Morning / Evening Reflection 生成规则化概览；不读取遗留交易统计、Memory 数量、Activity 文案或 AI Insight 来替代领域事实。
- Goal / Plan 进度展示各对象 `progress` 的平均值；任务完成率为 `done / 全部任务`；学习进度为 Learning Item `progress` 的平均值；复盘天数为有 Morning 或 Evening 的去重 `reflection_date` 数量。没有对象时显示“尚未开始记录”，不以 0% 冒充负向表现。
- 里程碑仅显示已在 Growth Plan 中定义的节点数量；本切片没有逐项完成状态，不把任务、学习或复盘自动推断为里程碑完成。
- Web 使用完整领域列表构建概览，登录同步失败时可继续展示当前本地 Workspace 数据。当前不新增分析 API、能力雷达、预测趋势、周/月报告、导出或 Agent 建议。

### Story 6.5: 切换新版导航并访问历史交易工具

As a returning GrowthPilot user,
I want the new navigation to be clear while keeping my old trading data accessible,
So that the product can evolve without losing existing value.

**Acceptance Criteria:**

**Given** 用户使用新版 Web Personal Agent OS
**When** 查看主导航
**Then** 侧边栏为：首页、工作台、待办、成长计划、知识学习、应用中心、扩展能力、洞察、我的
**And** Memory 和交易工具不占默认主入口

**Given** 用户进入 Mine -> 历史工具
**When** 点击交易记录
**Then** 可以访问原有交易数据和复盘功能
**And** 交易 AI 仍走 legacy compliance_guard

**Given** 用户使用 Miniapp companion
**When** 查看小程序入口
**Then** 只提供今日任务、Morning、Evening、快速记录和提醒
**And** 需要完整工作台能力时通过深链接打开 Web

---

## Epic 7: 与一个真正记得我的 AI 对话

用户能够提出关于任务、目标、复盘、知识和个人经历的问题，并把回答转为下一步行动。

### Story 7.1: 打开全局 AI 对话

As a user,
I want to ask a personal question from any main page,
So that I do not need to locate the correct Agent manually.

**Acceptance Criteria:**

**Given** 用户在任意主页面
**When** 点击 Global AI
**Then** 打开移动端全屏或 Sheet，Web 打开快捷键入口或右侧抽屉
**And** 输入框自动获得合理焦点
**And** 保留当前页面上下文

### Story 7.2: 按意图路由到 Agent

As a user,
I want my question routed to the right capability,
So that the answer uses the correct personal context.

**Acceptance Criteria:**

**Given** 用户输入关于任务、目标、复盘、知识或记忆的问题
**When** Agent Router 处理请求
**Then** 识别 intent 并路由到对应 Agent
**And** ContextEngine 只提供 privacy scope 允许的数据
**And** agent_run 记录 intent、model、prompt_version 和状态

**Given** intent 置信度不足
**When** Router 无法确定
**Then** 使用 MemoryAgent 的通用问答路径
**And** 以低确定性语气回答
**And** 提供澄清或转换为其他动作的入口

### Story 7.3: 展示回答、依据和引用

As a user,
I want to inspect why the Agent answered this way,
So that I can trust or correct it.

**Acceptance Criteria:**

**Given** Agent 返回回答
**When** 页面渲染
**Then** 按“直接回答、关键依据、建议行动、引用列表”展示
**And** citation 可展开查看短摘录、来源类型和时间
**And** 用户可以标记 citation 有用或无用

**Given** Agent 没有可靠引用
**When** 页面渲染
**Then** 显示“当前没有足够个人记录”
**And** 不伪造来源

### Story 7.4: 把回答转换为行动

As a user,
I want to turn a useful AI answer into a task, goal, memory, or knowledge card,
So that conversation leads to real progress.

**Acceptance Criteria:**

**Given** AI response contains suggested actions
**When** 用户点击创建 Task、Goal、Memory 或 Knowledge Card
**Then** 系统打开可编辑确认界面
**And** 默认填充来源内容和 citation ids
**And** 只有用户确认后才创建对象

**Given** 创建失败
**When** 用户提交转换
**Then** 原始 AI 回复保留
**And** 页面提供重试，不重复创建对象

### Story 7.5: 保护 AI 副作用和敏感上下文

As a user,
I want AI actions to require confirmation and respect privacy,
So that automation never silently changes my life data.

**Acceptance Criteria:**

**Given** AI 建议会创建、修改或删除数据
**When** Agent 返回结果
**Then** 只展示建议，不自动执行副作用
**And** 用户必须明确确认

**Given** 用户已删除 Memory 或关闭数据来源
**When** 用户发起新的 AI 请求
**Then** deleted 或 out-of-scope 数据不出现在 context 或 citation
**And** LLM prompt 不包含被限制的内容

---

## Epic 8: 让知识自动进入个人大脑

**Priority:** Phase 3

### Story 8.0: 使用首个 Learning 入口和最小学习队列

As a user,
I want to save a learning item and update its progress,
So that learning can stay connected to my current goal without requiring a full knowledge system.

**Acceptance Criteria:**

**Given** 用户打开 Learning 页面
**When** 用户确认一个学习标题、类型和可选目标关联
**Then** 系统创建当前 Workspace 的 Learning Item
**And** 学习入口出现在首页和学习队列

**Given** 用户推进学习进度
**When** 用户保存新的进度
**Then** 系统更新当前用户的 Learning Item
**And** 写入对应 Workspace Event

#### Story 8.0 当前增量实现边界

- 新建独立 `workspace_learning_items` 表和用户隔离 API，承载当前 Workspace 的学习入口与进度；不得复用遗留交易 `knowledge_articles`、`learning_paths` 或 `user_learning_progress`。
- Learning Item 可选关联同 Workspace 的 Goal 或 Project，允许只有标题而缺少 URL、摘要或预计时长。
- Web 登录后读取当前 Workspace 的完整 Learning Item 列表；创建和推进进度优先同步服务端，失败时保留本地对象作为回退。
- 创建和有效进度更新在同一事务写入 Workspace Event；本切片不抓取外部内容、不生成摘要、不调用 AI、不做间隔复习或知识检索。

### Story 8.1: 保存内容为知识卡片

As a user,
I want to save a piece of content,
So that it can be processed and reused later.

**Acceptance Criteria:**

**Given** 用户提交文本或网页内容
**When** 保存成功
**Then** 创建 Knowledge Card 并保留原始来源
**And** 卡片进入待处理状态

#### Story 8.1 当前增量实现边界

- 新建独立 `workspace_knowledge_cards` 领域表和 `/api/v1/knowledge-cards` 用户隔离 API，不复用遗留交易 `knowledge_articles`、`learning_paths`、`user_learning_progress` 或 `records`。
- 用户可以提交一段文本或一个网页地址；系统保留原始内容、来源类型、来源地址、当前 Workspace 和可选 Project / Goal，卡片状态从 `captured` 开始，表示已保存但尚未处理。
- Web 知识学习页先读取当前 Workspace 的 Knowledge Card 与 Learning Item；保存卡片成功后显示原始内容和待处理状态。用户必须显式点击“加入学习队列”才创建 Learning Item，不由保存动作隐式制造学习计划。
- 本切片不抓取网页、不生成摘要、不抽取概念、不自动关联 Goal / Project、不写入 Memory；保存卡片与加入学习队列分别写入对应 Workspace Event，失败时保留本地输入和可重试状态。

### Story 8.2: 生成知识摘要和概念

As a user,
I want AI to summarize saved content,
So that I can understand it quickly.

**Acceptance Criteria:**

**Given** Knowledge Card 处于待处理状态
**When** 异步任务完成
**Then** 生成摘要、关键概念、标签和 Memory 关联
**And** 失败时保留原始内容并允许重试

#### Story 8.2 当前增量实现边界

- 用户对已保存的**文本** Knowledge Card 显式请求摘要预览；URL 卡片在未实现网页抓取前仅保留地址，不声明已读取或总结页面内容。
- 服务端只经 `llm_service.structured_output()` 和版本化 `knowledge_summary` Prompt 生成建议，返回可编辑的摘要、关键概念与标签，以及固定指向该卡片原始内容的来源引用。
- 预览结果不是领域事实：用户可以编辑、确认或拒绝。只有确认动作才写入 Knowledge Card 的 `ai_summary`、`ai_concepts`、`ai_tags` 并追加 Workspace Event；不修改原始标题、原始内容、来源地址、Workspace / Project / Goal 或学习队列状态。
- 卡片单独记录 AI 处理状态。AI 调用失败时原始内容和既有确认结果保持不变，状态标记为可重试；前端保留当前编辑草稿，并允许再次请求预览。
- 本切片不写入 Memory、不建立跨卡片检索或 citation 读模型、不抓取 URL、不自动关联 Goal / Task / Project，也不自动加入学习队列。这些能力分别留给 Story 8.3 或后续外部内容接入故事。

### Story 8.3: 在对话和目标中引用知识

As a user,
I want relevant knowledge to appear in personal context,
So that learning can influence action.

**Acceptance Criteria:**

**Given** 知识卡片已处理
**When** Agent 查询相关主题
**Then** Knowledge Card 可以作为 citation 返回
**And** 可以关联当前 Goal 或 Task

#### Story 8.3 当前增量实现边界

- 只有用户已确认摘要的文本 Knowledge Card 进入当前 Workspace 的 citation 查询集合；查询返回标题、短摘录、已确认摘要、概念、标签和固定原始内容引用，不把 AI 草稿或 URL 地址伪装成已验证知识。
- 新增用户隔离的 citation 读取契约，按当前 JWT 用户、未归档 Workspace 和关键词筛选，为后续 Agent / 对话提供可直接使用的来源对象；当前 Web 也可据此显示卡片的“可引用”状态。
- 用户可以显式把一张已处理卡片关联到同一 Workspace 的一个 Goal 和一个 Task。关联由用户选择、可替换或清除，并写入 Workspace Event；不会基于摘要或标签自动建立关系。
- 本切片不改写 Goal / Task 当前状态或进度，不创建 Memory 投影，不调用 LLM，不实现 AI 对话回答、语义向量检索、跨 Workspace 查询、跨卡片推荐或自动引用排序。

---

## Epic 9: 把外部工作接入个人大脑

**Priority:** Phase 3

### Story 9.1: 连接和断开工作工具

As a user,
I want to control external tool connections,
So that I can decide what work context enters the system.

**Acceptance Criteria:**

**Given** 用户打开集成设置
**When** 用户完成授权
**Then** 显示连接状态和权限范围
**And** token 只保存在后端加密配置中

**Given** 用户断开集成
**When** 用户确认
**Then** 停止新的同步任务
**And** 用户可以选择清理已同步数据

### Story 9.2: 将工作事件写入 Memory

As a user,
I want commits, documents, or messages summarized into Memory,
So that my work history is searchable.

**Acceptance Criteria:**

**Given** 集成已连接
**When** 定时同步任务发现新事件
**Then** 创建带 source 和 source_id 的 Memory
**And** 相同事件重复同步不会创建重复 Memory

### Story 9.3: 生成工作周报草稿

As a user,
I want a weekly work report draft,
So that I can review and edit it before sharing.

**Acceptance Criteria:**

**Given** 本周存在工作 Memory、Task 和 Reflection
**When** 用户请求周报
**Then** 生成包含完成事项、阻塞项、风险和下周建议的草稿
**And** 每个关键结论可以查看引用
**And** 用户必须编辑或确认后才能导出

---

## Epic 10: 保留并隔离历史交易能力

**Priority:** Migration / Legacy

### Story 10.1: 将旧交易入口迁移到历史工具

As a returning trading user,
I want to find my old trading features under a clear legacy entry,
So that navigation reflects the new product direction without losing data.

**Acceptance Criteria:**

**Given** 用户使用新版 Web 侧边栏
**When** 用户打开 Mine -> 历史工具
**Then** 可以进入旧交易记录、复盘、行情和分析
**And** 新主导航不显示交易专属入口

### Story 10.2: 隔离交易合规 AI

As a product owner,
I want legacy trading AI to keep its compliance guard,
So that the new generic Agent does not weaken investment safety rules.

**Acceptance Criteria:**

**Given** 请求来自 legacy trading context
**When** AI 生成输出
**Then** 继续通过 compliance_guard
**And** 交易输出和通用成长输出使用不同 prompt namespace

### Story 10.3: 将交易事件接入 Memory 适配器

As a user,
I want relevant trading reflections to be remembered without making trading the main product,
So that old data can contribute to personal context.

**Acceptance Criteria:**

**Given** 用户保存交易复盘
**When** legacy adapter 处理事件
**Then** 创建 source=legacy_trading 的 Memory
**And** 金融敏感字段遵守原加密规则
**And** 通用 Agent 默认不检索敏感交易细节

---

## Epic 11: 管理可组合的 App、Plugin、Skill 和 Agent

**Priority:** Phase 1 foundation / Phase 3 execution

### Story 11.1: 浏览工作台能力目录

As a user,
I want to see the apps, plugins, skills, and agents available to my workspace,
So that I know what the system can help me do.

**Acceptance Criteria:**

**Given** 用户打开应用中心或扩展能力
**When** 能力目录加载
**Then** 按 Apps、Connections、Plugins、Skills、Agent Experts 分组展示
**And** 每项显示用途、来源、依赖、权限、状态和 Workspace 范围
**And** 默认提供少量内置能力，不用空白列表代替产品能力

#### Story 11.1 当前增量实现边界

- 新建独立 `capability_registry` 领域表和用户隔离的 `/api/v1/capabilities` 只读 API；内置 catalog 在服务端初始化，至少提供 App、Connection、Plugin、Skill、Agent Expert 各一项，不复用旧交易工具、AI Coach 或前端 fixture 作为真实目录。
- 每个条目保存能力类型、用途、来源、版本、状态、依赖、权限和 Workspace 范围。当前 catalog 只包含低风险内置元数据；App 仅代表可发现入口，Connection 仅代表待设置的数据连接，不代表已授权或已同步。
- Web 应用中心展示 Apps 与 Connections，扩展能力页按所有五类分组，并在登录后用当前 Workspace 的 API 结果覆盖本地回退 catalog；网络失败时保留本地内置目录，不把它标记为已连接或已执行。
- 本切片不提供创建第三方能力、安装、启用/停用、权限授予、连接授权、打开外部软件、Agent 调用或 Capability Run；这些状态变更与审计分别留给 Story 11.2 和 11.3。

### Story 11.2: 启用和限制能力

As a user,
I want to enable, disable, and scope a capability,
So that the Agent only uses tools I have authorized.

**Acceptance Criteria:**

**Given** 用户选择一个 Plugin、Skill 或 Connection
**When** 用户启用或停用
**Then** 系统保存状态、Workspace 范围和权限配置
**And** 缺失依赖或高风险权限显示阻塞原因
**And** 停用后新的 Agent Run 不得调用该能力

#### Story 11.2 当前增量实现边界

- 新增用户与 Workspace 隔离的 `workspace_capability_settings` 设置记录；它只保存可配置能力的启停状态和用户已确认的权限子集，绝不改写全局内置 `capability_registry` catalog。
- `GET /api/v1/capabilities` 返回当前 Workspace 下的有效状态、已确认权限、可确认权限、是否可配置和阻塞原因。Plugin、Skill、Agent Expert 与 Connection 可以保存设置；App 仍只作为可发现入口，不能通过本接口启停。
- 启用前服务端检查当前 Workspace 的前置事实和连接待设置状态；缺少依赖、待授权连接或尚未选择权限时不能标记为已启用，并返回可展示的阻塞原因。停用会立即写入设置和 Workspace Event，为后续 Agent Run 的调用闸门提供唯一事实来源。
- Web 在能力目录中提供当前 Workspace 范围内的启停开关与权限复选框；网络失败时保留本地选择并明确标记为待确认，不把它显示为已授权。
- 本切片不执行连接授权、外部 App 打开、Plugin / Skill / Agent 调用、Capability Run 或 Agent Run；Story 11.3 才处理调用预览、确认与审计。

### Story 11.3: 预览并确认能力调用

As a user,
I want to review a capability invocation before it runs,
So that external side effects remain under my control.

**Acceptance Criteria:**

**Given** Command Bar 或 Agent 需要调用 App/Plugin/Skill
**When** 系统准备执行
**Then** 显示输入摘要、能力、访问范围、权限和预期产出
**And** 用户可以确认执行、只生成计划或拒绝
**And** 执行过程创建 capability_run 和 agent_run 审计记录
**And** 结果关联回 Workspace、Project、Task、Knowledge 或 Memory

#### Story 11.3 当前增量实现边界

- 新增用户与 Workspace 隔离的 `capability_runs` 和 `agent_runs` 审计记录。每次预览会冻结用户输入摘要、当前已确认的权限快照、当前 Workspace 范围和预期产出，并创建状态为 `awaiting_confirmation` 的两条关联记录。
- 预览仅允许当前 Workspace 内有效状态为 `enabled` 的 Plugin、Skill 或 Agent Expert；App 仅能生成“打开入口”的无副作用预览。Connection、未启用、已停用、受阻或本地待确认的能力不能创建预览。
- 用户只能对自己的待确认 Run 选择 `confirm`、`plan` 或 `reject`。每个决定都会更新 Capability Run / Agent Run、追加 Workspace Event，并把 `execution_state` 明确记录为 `not_started`；确认在本切片代表授权决定，绝不执行外部 App、连接器、Plugin、Skill 或 Agent。
- Web 从能力目录显示输入摘要、访问范围、权限快照和预期产出，再提供确认、仅保存计划和拒绝操作。当前仅把审计关联到 Workspace 和可选 Project，不创建 Task、Knowledge、Memory 或真实执行结果。
- 本切片不接入 Command Bar 的 Agent Router、旧 AI Coach、模型调用、Connection 授权、外部打开、Capability Executor、异步 Worker 或任何外部副作用；这些在审计合同稳定后单独实现。

#### Story 11.3 审计可回看补充切片

- 新增用户、当前未归档 Workspace 与当前能力三重隔离的 Run 历史读取。历史只返回已存在的 Capability Run、关联 Agent Run、冻结的输入摘要、权限快照、范围、预期产出、用户决定和 `execution_state`，默认限制最近少量记录。
- Web 在每个能力下按需展开最近审计记录；刷新后仍能回看预览、确认、计划或拒绝，所有记录继续明确标记为未执行。
- 本补充切片不创建新的 Run、不改变历史决定、不补写任何结果对象，也不提供导出、删除、重试、撤销或真实执行。

### Story 11.4: 执行已确认的低风险内置简报

As a user,
I want to turn a confirmed Weekly Brief invocation into a reviewable draft,
So that the Agent can enhance my recorded Workspace facts without changing my work automatically.

**Acceptance Criteria:**

**Given** 当前 Workspace 中的 Weekly Brief Plugin 已启用，且某次调用已确认
**When** 用户明确请求生成简报草稿
**Then** 系统只读取该用户当前未归档 Workspace 的有限近期事实
**And** 将带来源事实的结果写回关联 Capability Run / Agent Run 审计
**And** 不创建或修改 Task、Goal、Plan、Knowledge、Memory、Project 或任何外部系统对象

#### Story 11.4 当前增量实现边界

- 只实现内置 `weekly-brief-plugin` 的确定性内部执行器。它只接受状态为 `confirmed` 的 Run，并在执行前重新确认当前用户、未归档 Workspace、可见能力及其有效启用状态；`plan`、`reject`、App、Connection、Skill 和 Agent Expert 均不得执行。
- 执行器最多读取当前 Workspace 的少量近期非 Capability Workspace Event，生成简短的事实摘要和来源引用。它不调用模型、网络、外部应用或异步 Worker，也不读取旧交易领域数据。
- 成功后 Capability Run / Agent Run 状态更新为 `completed`，`execution_state=completed`，结构化简报仅存入 `output_ref`，并追加 `capability_invocation_completed` Workspace Event。执行前置条件不满足时返回校验错误并保持既有审计状态。
- Web 仅在已确认且未执行的 Weekly Brief 预览上显示“生成简报草稿”；结果保持在审计区内供阅读。当前不支持重试、撤销、导出、结果对象写回或自动创建下一步任务。

### Story 11.5: 将简报事实显式转为待办

As a user,
I want to turn one reviewed brief fact into a Task I name,
So that a useful AI-assisted summary can become an explicit next action without automatic work creation.

**Acceptance Criteria:**

**Given** 用户拥有一个已完成的 Weekly Brief 草稿及其中一条来源事实
**When** 用户填写并确认该事实对应的待办标题
**Then** 系统在相同 Workspace（及可选 Project）创建一个 Task
**And** Task 描述保留简报 Run 与来源事件的可读引用
**And** 同一简报事实不能重复创建 Task

#### Story 11.5 当前增量实现边界

- 只允许当前用户、未归档 Workspace 内状态为 `completed` 的 `weekly-brief-plugin` Run 转换其已存储的 `brief.facts`。接口不得重新读取任意 Workspace Event，也不能把路径中的 Event ID 当作可自由查询的对象。
- 用户必须显式提交 Task 标题；服务端只创建一个默认优先级的 Task，并复用 Run 的可选 Project。Task 描述仅保存简短的简报与事实来源，不自动关联 Goal、Plan、Knowledge 或 Memory。
- 成功时追加正常 `task_created` 事件和 `capability_brief_fact_promoted` 事件，并在同一 Run 的 `brief.fact_actions` 记录 Event 到 Task 的一对一映射。已转换事实、缺失事实或不满足范围的 Run 返回校验错误，不重复写入。
- Web 在简报的每条事实旁提供可编辑标题与“创建待办”确认按钮；创建后只展示已创建状态。当前不支持撤销、删除、批量转换、重新执行或自动创建任何其他领域对象。

### Story 11.6: 将简报事实显式转为目标

As a user,
I want to turn one reviewed brief fact into a Goal I name,
So that I can promote an observed pattern into an intentional direction without the system inferring a long-term commitment for me.

**Acceptance Criteria:**

**Given** 用户拥有一个已完成的 Weekly Brief 草稿及其中一条来源事实
**When** 用户填写并确认该事实对应的目标标题
**Then** 系统在相同 Workspace（及可选 Project）创建一个 Goal
**And** Goal 描述保留简报 Run 与来源事件的可读引用
**And** 同一简报事实不能重复创建 Goal，但不影响该事实已创建的 Task

#### Story 11.6 当前增量实现边界

- 只允许当前用户、未归档 Workspace 内状态为 `completed` 的 `weekly-brief-plugin` Run 转换其已存储的 `brief.facts`。接口不得重新读取任意 Workspace Event，也不能将路径中的 Event ID 用于任意对象查询。
- 用户必须显式提交 Goal 标题；服务端只创建一个默认状态的 Goal，并复用 Run 的可选 Project。维度、类型、截止日期、重要性和目标指标全部保持空值，不自动拆解为 Plan 或 Task。
- 成功时追加正常 `goal_created` 事件和 `capability_brief_fact_promoted_to_goal` 事件，并在同一 Run 的 `brief.fact_goal_actions` 记录 Event 到 Goal 的一对一映射。已转换、缺失事实或不满足范围的 Run 返回校验错误，不重复写入。
- Web 在简报事实旁提供可编辑目标标题与“创建目标”确认按钮；创建后只展示已创建状态。当前不支持撤销、删除、批量转换、Goal 拆解、指标推断或其他领域对象自动写入。

### Story 11.7: 将简报事实显式转为成长计划

As a user,
I want to turn one reviewed brief fact into a Growth Plan attached to a Goal I choose,
So that I can turn an observed pattern into a bounded cycle without the system inventing a direction or plan details for me.

**Acceptance Criteria:**

**Given** 用户拥有一个已完成的 Weekly Brief 草稿及其中一条来源事实
**When** 用户填写计划标题、选择周期，并选择当前 Workspace 内已有 Goal
**Then** 系统在相同 Workspace 创建一个关联该 Goal 的 Growth Plan
**And** Plan 描述保留简报 Run 与来源事件的可读引用
**And** 同一简报事实不能重复创建 Plan，但不影响该事实已创建的 Task 或 Goal

#### Story 11.7 当前增量实现边界

- 只允许当前用户、未归档 Workspace 内状态为 `completed` 的 `weekly-brief-plugin` Run 转换其已存储的 `brief.facts`。接口不得重新读取任意 Workspace Event，也不能把路径中的 Event ID 用于任意对象查询。
- 用户必须显式提交 Plan 标题、`period_type` 和当前 Workspace 内已有的 `goal_id`；服务端只创建一个默认状态的 Growth Plan，复用 Run 的可选 Project。周期数、当前周期和里程碑均保持空值或默认值，不自动创建 Goal、Task、Learning、Knowledge 或 Memory。
- 成功时追加正常 `growth_plan_created` 事件和 `capability_brief_fact_promoted_to_plan` 事件，并在同一 Run 的 `brief.fact_plan_actions` 记录 Event 到 Plan 的一对一映射。已转换、缺失事实、不属于当前 Workspace 的 Goal 或不满足范围的 Run 返回校验错误，不重复写入。
- Web 在简报事实旁提供可编辑 Plan 标题、Goal 选择和周期选择；创建后只展示已创建状态。当前不支持撤销、删除、批量转换、自动拆解、里程碑推断、任务生成或其他领域对象自动写入。

### Story 11.8: 将简报事实显式转为 Knowledge Card

As a user,
I want to turn one reviewed brief fact into a Knowledge Card whose title and text I confirm,
So that a useful observation becomes reusable knowledge without the system silently enriching or scheduling it.

**Acceptance Criteria:**

**Given** 用户拥有一个已完成的 Weekly Brief 草稿及其中一条来源事实
**When** 用户确认卡片标题和正文，可选选择当前 Workspace 内已有 Goal
**Then** 系统在相同 Workspace 创建一张文本 Knowledge Card，并复用 Run 的可选 Project
**And** 卡片正文保留简报 Run 与来源事件的可读引用
**And** 同一简报事实不能重复创建 Knowledge Card

#### Story 11.8 当前增量实现边界

- 只允许当前用户、未归档 Workspace 内状态为 `completed` 的 `weekly-brief-plugin` Run 转换其已存储的 `brief.facts`。接口不得重新读取任意 Workspace Event，也不能把路径中的 Event ID 用于任意对象查询。
- 用户必须显式提交 Knowledge Card 标题和正文；服务端固定使用 `source_type=text`，只复用 Run 的可选 Project。Goal 关联可选，但必须属于当前未归档 Workspace；不自动摘要、不自动确认 AI 字段、不自动加入学习队列。
- 卡片正文以用户确认文本为主体，并追加简短 Weekly Brief、Run ID 和来源事件引用；成功时追加正常 `knowledge_card_captured` 事件和 `capability_brief_fact_promoted_to_knowledge` 事件，并在同一 Run 的 `brief.fact_knowledge_actions` 记录 Event 到 Card 的一对一映射。
- 已转换、缺失事实、不属于当前 Workspace 的 Goal 或不满足范围的 Run 返回校验错误，不重复写入。当前不支持撤销、删除、批量转换、自动摘要、Memory 写入或学习对象自动创建。

### Story 11.9: 将简报事实显式转为 Memory

As a user,
I want to turn one reviewed brief fact into a Memory entry whose context I confirm,
So that a durable personal context can be retained without the system silently extracting or changing other work objects.

**Acceptance Criteria:**

**Given** 用户拥有一个已完成的 Weekly Brief 草稿及其中一条来源事实
**When** 用户确认 Memory 正文、类型、重要性和标签
**Then** 系统为当前用户创建一条 Memory，并将事实发生时间作为 Memory 的发生时间
**And** Memory 正文保留简报 Run 与来源事件的可读引用
**And** 同一简报事实不能重复创建 Memory

#### Story 11.9 当前增量实现边界

- 只允许当前用户、未归档 Workspace 内状态为 `completed` 的 `weekly-brief-plugin` Run 转换其已存储的 `brief.facts`。接口不得重新读取任意 Workspace Event，也不能把路径中的 Event ID 用于任意对象查询。
- 用户必须显式提交 Memory 正文、`memory_type`、`importance` 和标签；服务端固定使用 `source=capability_brief`、`source_id=Capability Run ID`，并使用来源事实的 `occurred_at`。不自动生成摘要、实体、向量、Goal、Task、Plan、Knowledge 或第二条 Memory。
- Memory 正文以用户确认文本为主体，并追加简短 Weekly Brief、Run ID 和来源事件引用；成功时在同一 Run 的 `brief.fact_memory_actions` 记录 Event 到 Memory 的一对一映射，并追加 `capability_brief_fact_promoted_to_memory` 审计事件。
- 已转换、缺失事实或不满足范围的 Run 返回校验错误，不重复写入。当前不支持撤销、删除、批量转换、自动摘要/实体/向量派生或其他领域对象自动写入。

## Phase 1 Story Sequence

推荐实现顺序：

1. Story 0.1, 0.2, 0.3
2. Story 1.1, 1.2, 1.3
3. Story 4.1, 4.2, 5.1
4. Story 6.1, 6.2, 6.3
5. Story 2.1, 2.2, 2.3
6. Story 3.1, 3.2, 3.3
7. Story 7.1, 7.2, 7.3, 7.4
8. Story 8.1, 8.2, 8.3
9. Story 11.1 and App/Skill fixture catalog
10. Story 2.5, 2.4, 2.6, 2.7 and cross-cutting export/delete hardening

Stories are ordered so the first user-visible milestone is a working Web Workspace with populated data. Memory enrichment and semantic retrieval remain important, but they do not block the first Command Center.

Stories are ordered around user value. Database entities must be created only as required by the active story.

---

## Story Coverage Map

### Functional Requirements to Stories

| Requirement | Stories |
|-------------|---------|
| FR-001 | 1.1, 1.2 |
| FR-002 | 2.1, 2.2, 2.5, 3.1, 3.2, 3.3 |
| FR-003 | 2.3, 2.4, 7.2, 7.3 |
| FR-004 | 2.6, 6.4 |
| FR-005 | 3.1, 4.4 |
| FR-006 | 3.2 |
| FR-007 | 3.3, 3.4 |
| FR-008 | 3.5 |
| FR-009 | 4.1, 4.2, 4.3 |
| FR-010 | 4.4, 4.5 |
| FR-011 | 5.1, 5.2 |
| FR-012 | 5.3, 5.4 |
| FR-013 | 8.1, 8.2, 8.3 |
| FR-014 | 9.1, 9.2, 9.3 |
| FR-015 | 7.1, 7.2, 7.3, 7.4 |
| FR-016 | 0.1, 0.2, 0.3, 6.1, 6.2, 6.3 |
| FR-017 | 6.4 |
| FR-018 | 1.3, 1.4, 2.2, 2.4, 7.5, 9.1, 11.2, 11.3 |
| FR-019 | 0.1, 0.2, 1.1, 9.1, 9.2 |
| FR-020 | 0.1, 0.3, 11.1, 11.2, 11.3 |
| FR-021 | 0.2, 0.3, 6.1, 6.2, 7.1, 11.3 |

### Non-Functional Requirements to Stories

| Requirement | Stories / Cross-cutting Rules |
|-------------|-------------------------------|
| NFR-001 每日负担 | 3.1, 3.2, 3.3, 4.4; UX acceptance checklist |
| NFR-002 性能 | 2.3, 2.4, 6.1; architecture dashboard/retrieval contracts |
| NFR-003 异步可靠性 | 2.5, 3.4, 8.2, 9.2 |
| NFR-004 用户隔离 | 1.3, 2.1, 2.2, 2.4, 7.2 |
| NFR-005 隐私安全 | 1.3, 1.4, 2.2, 7.5, 9.1 |
| NFR-006 AI 可追溯 | 2.4, 2.7, 3.4, 4.4, 6.2, 7.2, 7.3 |
| NFR-007 AI 成本 | 2.4, 2.5, 3.4, 3.5, 4.4 |
| NFR-008 UX 一致性 | 0.1, 0.2, 3.2, 3.6, 6.1, 6.3, 7.1; UX acceptance checklist |
| Capability safety | 11.1, 11.2, 11.3; capability registry and permission contract |

## Final Validation Status

**Overall status:** Draft - Ready for Product Review.

- [x] Epic 0 Workspace Shell and Epic 11 Capability stories have been checked against the revised product and architecture contracts.
- [x] Revised Phase 1 stories start with Web Workspace, Command Center and AI Onboarding.
- [x] Memory, Reflection, Task, Goal, Knowledge, Work and Legacy responsibilities are separated by product layer.
- [x] Stories use user value statements and Given/When/Then acceptance criteria.
- [x] Every FR-001 to FR-021 maps to at least one Story.
- [x] NFR coverage is mapped to stories or architecture/UX cross-cutting rules.
- [x] AI pending, citations, privacy, deletion, offline draft and error states are represented.
- [x] Stories avoid forward dependencies within their Epic.
- [x] Database/entity creation is scoped to the Story that needs it.
- [x] `git diff --check` passes for this document.
- [ ] Product owner confirms the canonical document set before code implementation.

## Implementation Entry Point

Do not continue with another Memory management story. After document approval, start with:

1. Story 0.1: 使用 Web Workspace Shell
2. Story 0.2: 查看 Command Center 首页
3. Story 0.3: 从 Command Bar 创建行动
4. Story 1.1: 用一句话创建初始个人工作空间
5. Story 4.1 / 5.1: 任务、目标和成长计划最小数据闭环
6. Story 6.1: 首页聚合真实 Workspace/Project/Task/Plan/Knowledge 数据
7. Story 6.6: 聚合今日任务、记录、学习和晨晚复盘闭环
8. Story 0.4: 持久化 Workspace、Project 与活动事实

Only create the domain entities required by the active story. Keep existing Memory CRUD as a data-management capability under Mine, and do not make it the default product experience again.
