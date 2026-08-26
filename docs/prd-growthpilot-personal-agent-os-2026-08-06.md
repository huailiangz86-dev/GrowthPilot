# Product Requirements Document: GrowthPilot Personal Agent OS

**Date:** 2026-08-09
**Author:** Zhang / BMAD Master
**Version:** 3.1
**Project Type:** AI Personal Workspace + Growth System
**Project Level:** Level 4
**Status:** Draft - Ready for Product Review
**Source:** Converted from `brainstorming-personal-agent-os-20260803.md`
**Canonical:** This is the active product definition for the Web-first GrowthPilot product. Older PRD, brainstorming and feature documents remain historical inputs and are not implementation authority.

---

## Executive Summary

GrowthPilot 是一个 **AI Personal Workspace + Growth OS**：以工作台承载用户的工作空间、项目、目录、任务、知识、软件、插件和 Skill，以成长引擎持续理解目标、计划、执行、学习和复盘，并在用户需要时给出下一步和可执行结果。

产品不是“个人资料管理器”、 “Memory 笔记库”或“单一成长教练”。用户通过自然语言描述要做的事，AI 负责理解、拆解、连接上下文、调用合适的工具或 Skill，并把结果沉淀为任务、项目、知识、计划和个人成长数据。用户主要负责确认、调整、执行和反馈。

**产品定位语：** 你的 AI 成长工作台，把想法、工作和成长变成持续推进的行动。

**核心闭环：**

```text
一句话表达 / 捕获资料
    -> AI 理解意图和上下文
    -> 生成或调用 Workspace / Project / Goal / Plan / Task / Knowledge
    -> 用户确认后执行
    -> 工作、学习、复盘事实自动记录
    -> 数据分析目标推进、行为模式和成长变化
    -> AI 生成提醒、回顾和下一步
```

**本次产品校正：**

- 从“Personal Growth OS 作为一组成长模块”升级为“Workspace 作为产品载体，Growth OS 作为智能层”。
- 从“Memory 是用户主要入口”调整为“Memory 是底层长期上下文，默认入口是工作台和行动”。
- 从“Onboarding 生成四个字段”调整为“Onboarding 生成首个工作空间、项目、目标、计划、待办和学习入口”。
- 从“首页展示状态占位”调整为“首页展示当前工作、进行中内容、计划、任务、知识、能力入口和 AI 下一步”。
- 从“交易功能降级后主导航仍偏工具列表”调整为“应用、插件、Skill、历史交易全部纳入可组织的能力层”。

---

## Product Goals

### Business Objectives

1. **OBJ-1:** 验证一个真实可用的个人工作台能否把工作、待办、成长计划和知识学习放在同一条行动链上。
2. **OBJ-2:** 验证 AI 能否从一句话和真实工作/学习事件中生成下一步、计划和可追踪的成长数据，减少人工维护。
3. **OBJ-3:** 验证 Morning、提醒、执行反馈和 Evening 复盘能否形成低负担、高粘性的陪伴闭环。
4. **OBJ-4:** 在 6-12 个月内以创始人本人作为超级用户，沉淀真实长期个人数据，并为知识工作者、创业者和自由职业者建立可扩展基础。

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 每日额外维护负担 | < 10 分钟 | Morning + micro reflection + evening 总时长，不含实际工作和学习执行时间 |
| 连续使用 | 30 天内使用天数 >= 24 天 | 有 Workspace/Project、Task、Knowledge、Reflection 或 AI Action 行为 |
| 晚间复盘完成率 | >= 70% | 有提醒日中完成晚间复盘的比例 |
| AI 建议采纳率 | >= 40% | 用户接受/完成 AI 推荐任务比例 |
| Memory 引用命中感 | >= 60% | 用户对 AI 引用记忆标记为有用的比例 |
| 任务完成率提升 | 4 周后提升 >= 15% | 使用前后周任务完成率对比 |
| 手动输入复杂度 | 单次核心输入 <= 1 句话 | 表单字段数和完成时长 |
| 首次工作台可用率 | Onboarding 完成后 1 分钟内看到可执行首页 >= 90% | 首个 Workspace、项目、目标、计划和任务生成成功率 |
| AI 行动转化率 | AI 建议转为 Task/Plan/Workspace Action >= 50% | 建议确认、修改或拒绝的行为记录 |
| 进行中内容可见率 | 首页能看到当前工作或学习上下文 >= 95% | 有效 Workspace/Project/Plan 数据覆盖用户 |
| 目标行动对齐率 | 完成任务中具有关联目标或计划 >= 70% | Task -> Goal/Plan 关联统计 |

---

## User Personas

### Persona 1: Zhang - 独立开发者与 AI 创业者

- **身份：** 多项目并行的独立开发者、产品设计者、AI 创业者。
- **核心痛点：** 事情太多，缺少可信的 AI 项目经理；信息过载；执行容易分散；复盘难以长期坚持。
- **使用动机：** 用自己作为第一个用户，验证 Personal Agent OS 是否能真实提升每日执行和长期成长。
- **关键场景：** 每天早上获得今日任务建议，白天快速记录状态和决策，晚上完成轻量复盘，周末获得 AI 周回顾。

### Persona 2: 高自主知识工作者

- **身份：** 创业者、自由职业者、咨询顾问、产品经理、研究者。
- **核心痛点：** 目标长期但任务碎片化；知识散落；没有持续反馈系统。
- **使用动机：** 希望 AI 帮自己保持方向、沉淀知识、识别行为模式。
- **关键场景：** 用 AI 拆解目标，管理每日任务，把工作产出和知识输入自动沉淀进 Memory。

### Persona 3: 成长型专业人士

- **身份：** 正在提升职业能力、健康、财务、学习效率的人。
- **核心痛点：** 想成长但没有体系；工具太多但不能互相理解。
- **使用动机：** 希望有一个长期陪伴式教练，帮助自己建立可持续成长节奏。
- **关键场景：** 设定年度目标，每日复盘，查看能力趋势和 AI 建议。

---

## Product Principles

| ID | Principle | Requirement |
|----|-----------|-------------|
| P-01 | 每天 < 10 分钟 | 所有 P0/P1 流程必须可在 10 分钟内完成。 |
| P-02 | AI 推理优先 | 能由 AI 推断的信息，不要求用户结构化输入。 |
| P-03 | 工作台承载、上下文贯通 | Workspace 和领域对象承载当前工作；Event 记录事实；Memory 提供跨域长期上下文，不建立互相割裂的数据孤岛。 |
| P-04 | 被理解感 | 每天至少出现一次基于真实 Workspace Event、Memory 或 Task/Goal context 的个性化引用。 |
| P-05 | 简化输入 | 优先使用一句话、表情、滑杆、快捷按钮，而非复杂表单。 |
| P-06 | 数据即壁垒 | 产品价值随使用天数和数据深度持续增长。 |
| P-07 | 主动但克制 | AI 可以提醒和建议，但不能制造通知噪音。 |
| P-08 | 可解释 | 重要建议必须说明引用了哪些 Workspace、Project、Plan、Memory、目标或任务上下文。 |
| P-09 | 工作台优先 | 用户打开首页先看到当前工作和下一步，而不是先维护个人资料或数据表。 |
| P-10 | 能力可组合 | App、Plugin、Skill、Agent 和工作流是可发现、可授权、可启停的能力，不是散落链接。 |
| P-11 | 成长来自事实 | 成长分析必须从工作、任务、学习、知识和复盘事实推导，不要求用户额外维护一套成长表。 |
| P-12 | 结果导向 | AI 输出优先产出任务、文件、计划、摘要、分析或下一步，而不是只给建议。 |

---

## Product Scope

### MVP In Scope

- Web Workspace Shell：桌面侧边栏、工作空间切换、全局 AI 输入、最近活动和能力入口。
- Workspace 基础版：工作空间、项目、目录/资源指针、最近产出和进行中状态。
- App / Plugin / Skill Registry 基础版：软件入口、已连接应用、插件和 Skill 的发现、启用状态、权限提示和工作空间范围。
- AI Onboarding：一句话生成首个 Workspace、当前项目、一个主要目标、一周计划、最多三个今日任务和一个学习入口。
- Dashboard Command Center：今日简报、进行中项目、任务、成长计划、知识学习、AI 洞察、最近活动和快速入口。
- Goal / Plan / Task Agent 基础版：自然语言创建、AI 拆解、目标关联、完成/推迟/阻塞和基础统计。
- Knowledge / Learning 基础版：内容捕获、AI 摘要、学习队列、目标关联和 Memory 写入。
- Reflection Agent 基础版：晨间启动、日间微记录、晚间复盘和周回顾。
- Memory Agent 基础版：作为所有工作、学习、任务和复盘事件的统一上下文层，支持写入、检索、引用和健康度。
- Global AI：基于 Workspace、Project、Goal、Task、Knowledge 和 Memory 的问答、规划、行动转换和引用。
- Mine：成长数据、工作数据、能力趋势、提醒、集成、权限、导出和隐私设置。

### Out of Scope for MVP

- 自动控制本地电脑和未经授权的文件写入；第一阶段只支持明确授权的目录和应用入口。
- 多 Agent 长时间后台自治和复杂并行编排；先记录 Agent Run 和用户确认链路。
- 多工具全量同步矩阵；优先实现目录指针、常用软件入口和少量连接器。
- 社区、UGC、模板市场和多人协作。
- 成就徽章等强游戏化系统。
- 知识图谱可视化大屏和复杂目录权限。
- 完整交易/投资场景扩展；旧投资功能作为历史工具或垂直插件保留。

---

## Information Architecture

```
GrowthPilot AI Personal Workspace
|
|-- 首页 / Command Center
|   |-- 今日简报
|   |-- 进行中工作空间与项目
|   |-- 今日待办和 AI 推荐
|   |-- 当前成长计划
|   |-- 知识学习队列
|   |-- 最近活动与产出
|   |-- AI 洞察与下一步
|   |-- 常用入口
|
|-- 工作台
|   |-- 工作空间
|   |-- 项目
|   |-- 目录与资源
|   |-- 最近产出
|   |-- Agent 工作流
|
|-- 待办
|   |-- 今日 / 进行中 / 待处理 / 已完成
|   |-- AI 推荐
|   |-- Focus 执行
|
|-- 成长
|   |-- 目标
|   |-- 成长计划
|   |-- 里程碑
|   |-- 晨间启动 / 晚间复盘
|   |-- 成长分析
|
|-- 知识学习
|   |-- 学习计划
|   |-- 知识卡片
|   |-- 稍后学习 / 复习
|   |-- AI 摘要与关联
|
|-- 应用中心
|   |-- 常用软件
|   |-- 已连接应用
|   |-- 文件和浏览器入口
|
|-- 扩展能力
|   |-- Plugins
|   |-- Skills
|   |-- Agent 专家
|   |-- 自动化流程
|
|-- 我的
    |-- 个人上下文
    |-- Memory 与数据管理
    |-- 工作/成长洞察
    |-- 提醒、权限、隐私、导出
    |-- 历史交易工具
```

### Core Product Objects and Relationships

| Object | User meaning | Relationship and source of truth |
|--------|--------------|-----------------------------------|
| Workspace | 一个可以持续工作的个人空间 | User owns one or more; contains Projects, Resources, Plans, Tasks, Knowledge and activity context. |
| Project | 正在推进的一件具体工作或生活事项 | Belongs to a Workspace; has a current status, next action and optional Goal. |
| Goal | 较长期、可衡量的方向 | Belongs to a Workspace; may cover one or more Projects and is decomposed into Plans. |
| Growth Plan | 某个周期内把方向变成行动的路线 | Belongs to a Workspace; links a Goal or Project to Tasks and Learning items. |
| Task | 可以被执行和完成的下一步 | Belongs to a Workspace; may link to a Project, Goal and Plan. Current status lives in the Task, not in Memory. |
| Knowledge / Learning | 工作和成长过程中需要理解、复习或引用的内容 | Belongs to a Workspace; may link to a Project, Goal or Task and can enter a learning queue. |
| Workspace Event | 工作、学习、任务、复盘或能力调用发生过的事实 | Append-only activity record used for activity feeds, metrics, Memory enrichment and Insight generation. |
| Memory | 可被 AI 长期理解和引用的上下文 | Derived from confirmed user input and relevant events; it is not the primary home for current work state. |
| Growth Insight | 从事实中得到的阶段性分析和下一步 | Derived from events and domain objects; every insight must keep evidence references. |
| Capability | 软件入口、连接器、Plugin、Skill 或 Agent 专家 | Registered and permissioned by Workspace scope; invocation creates an auditable Capability Run. |

**数据原则：** 用户只维护工作和行动本身；系统自动把确认后的工作、学习、任务、计划和复盘行为写入 Workspace Event，并异步生成 Memory、Insight、提醒和下一步建议。只有当用户主动选择“记录”或确认 AI 结果时，系统才创建对应的持久对象。

---

## Functional Requirements

### FR-001: 用户启动与个人上下文初始化

**Priority:** Must Have

**Description:**
用户首次进入系统时，用一句自然语言描述当前状态，系统据此建立首个可工作的个人 Workspace，让后续 AI 建议、计划和行动拥有初始依据。

**Acceptance Criteria:**

- [ ] 首次启动支持一句自然语言输入，不要求用户先填写结构化表单。
- [ ] AI 生成当前工作空间、当前项目、一个主要目标、一周计划、最多三个今日任务和一个学习入口。
- [ ] AI 理解结果以“确认 / 修改一句话 / 拒绝”交互呈现，用户不需要逐字段维护。
- [ ] 初始 Workspace、Project、Goal、Plan、Task 和学习入口均可在后续页面调整；个人 Profile 只作为可选底层上下文，不阻塞进入工作台。
- [ ] 只有用户确认的对象才写入正式领域数据；“只记录”才创建单独的 Memory/Capture，拒绝不会自动生成对象。
- [ ] 初始化完成后创建首批事实和 Memory，并直接进入有内容的 Dashboard。

#### Story 1.2 当前增量实现合同（已完成）

- 用户级 `daily_preferences` 仅保存 IANA 时区、Morning 时间和 Evening 时间；它属于 `users.settings`，不属于任何单个 Workspace，也不写入 Memory、Event、Task 或 Reflection。
- Command Center 的“当日”完成任务、学习更新和 Morning / Micro / Evening 聚合，及非补记 Reflection 的日期，必须按该用户时区计算；缺少或无效配置时使用 `Asia/Shanghai`、`08:30` 和 `21:30`。
- Mine 可读取和更新这些偏好。当前只保存偏好，不请求浏览器/系统通知权限、不创建定时任务、不发送推送或邮件；页面必须把通知状态显示为未开启，Dashboard 的手动 Morning / Evening 入口始终可用。

### FR-002: Memory Agent - 记忆写入

**Priority:** Must Have

**Description:**
系统支持将用户输入、复盘、任务、目标、知识和外部工具事件沉淀为统一 Memory。

**Acceptance Criteria:**

- [ ] 支持手动写入一句话 Memory。
- [ ] 支持从晨间启动、微复盘、晚间复盘、任务完成、目标更新自动写入 Memory。
- [ ] 每条 Memory 标记来源、类型、时间、标签、情绪和能量状态。
- [ ] 支持用户编辑或删除自己的 Memory。
- [ ] Memory 写入后可被 Agent 检索和引用。

### FR-003: Memory Agent - 智能检索

**Priority:** Must Have

**Description:**
Agent 可以根据语义、时间、关键词和实体关系检索个人记忆。

**Acceptance Criteria:**

- [ ] 支持语义检索，用户可以问“我上周主要在做什么？”。
- [ ] 支持时间检索，能按今天、本周、本月、最近 N 天聚合 Memory。
- [ ] 支持实体检索，能围绕项目、人物、概念、工具查找关联记忆。
- [ ] AI 回复中明确展示使用的关键 Memory 引用。
- [ ] 用户可以对引用质量标记“有用/无用”。

### FR-004: Memory Agent - 健康度

**Priority:** Should Have

**Description:**
系统每周评估个人 Memory 是否覆盖目标、任务、情绪、知识和工作等核心维度。

**Acceptance Criteria:**

- [ ] 展示 Memory 数量、新鲜度、覆盖度和关联度。
- [ ] 提示缺失维度，例如“本周知识输入较少”。
- [ ] 每周生成一次 Memory 健康报告。
- [ ] 健康度报告必须给出 1-3 条可执行补充建议。

### FR-005: Reflection Agent - 晨间启动

**Priority:** Must Have

**Description:**
每天早上通过轻量流程帮助用户设定今日意图、记录能量、确认 AI 推荐任务。

**Acceptance Criteria:**

- [ ] 默认在用户设置时间推送晨间启动。
- [ ] 用户可设置今日能量 1-10。
- [ ] 用户可输入一句今日意图。
- [ ] AI 基于 Goal、Task、Memory 和近期状态推荐 3 个今日任务。
- [ ] 页面展示一条昨日或近期 Memory 引用。
- [ ] 用户可接受、调整或跳过 AI 推荐任务。
- [ ] 完成晨间启动后写入 Memory 和 Reflection 数据。

### FR-006: Reflection Agent - 日间微复盘

**Priority:** Must Have

**Description:**
用户可以在任意时刻用一个表情和一句话记录状态、决策、灵感或任务完成感受。

**Acceptance Criteria:**

- [ ] 全局提供微记录入口。
- [ ] 输入字段不超过：类型、表情/情绪、一句话。
- [ ] 支持关联当前任务或目标。
- [ ] 记录后自动写入 Memory。
- [ ] 重大决策类型记录需要保留决策理由。

### FR-007: Reflection Agent - 晚间复盘

**Priority:** Must Have

**Description:**
每天晚上用简化复盘形成闭环，帮助 AI 识别行为模式并调整次日建议。

**Acceptance Criteria:**

- [ ] 默认在用户设置时间提醒晚间复盘。
- [ ] 用户可填写今日完成度 0-100%。
- [ ] 复盘字段包含：做对了什么、做错了什么、明日调整、今日情绪。
- [ ] 除完成度和情绪外，文本字段均可选。
- [ ] AI 生成一句话总结，并说明依据。
- [ ] 完成后写入 Memory，并更新任务/目标相关统计。

### FR-008: Reflection Agent - 周期回顾

**Priority:** Should Have

**Description:**
系统定期生成周/月回顾，帮助用户看到长期模式和调整方向。

**Acceptance Criteria:**

- [ ] 每周生成本周主题、完成任务、情绪趋势、关键里程碑。
- [ ] 每月生成目标进展、能力趋势、主要偏差和下月建议。
- [ ] 用户可编辑并导出回顾报告。
- [ ] 周/月回顾写入 Memory。

### FR-009: Task Agent - 任务管理

**Priority:** Must Have

**Description:**
任务系统不只是待办列表，而是围绕目标、能量和个人历史生成可执行计划。

**Acceptance Criteria:**

- [ ] 支持任务 CRUD。
- [ ] 任务可关联工作空间、目标、项目、成长计划、时间块、能量等级和截止日期。
- [ ] 支持完成、推迟、取消、阻塞状态。
- [ ] 推迟任务时记录原因。
- [ ] 任务完成后可触发微复盘。
- [ ] 用户可将已审阅 AI/能力结果中的单条来源事实显式转换为一个 Task；创建的 Task 必须保留该结果和事实来源，且同一事实不能被重复转换。

### FR-010: Task Agent - AI 每日推荐

**Priority:** Must Have

**Description:**
AI 每天基于用户目标、当前上下文、历史效率和能量状态推荐任务排序。

**Acceptance Criteria:**

- [ ] 每天最多推荐 3 个核心任务。
- [ ] 推荐必须说明依据，例如目标优先级、截止日期、能量匹配。
- [ ] 用户可接受、替换、修改推荐任务。
- [ ] 推荐任务完成情况用于后续推荐优化。

### FR-011: Goal Agent - 目标录入与拆解

**Priority:** Must Have

**Description:**
用户可通过自然语言表达长期目标，AI 将其结构化并拆解为周期计划。

**Acceptance Criteria:**

- [ ] 支持自然语言创建目标。
- [ ] 目标包含工作空间、维度、周期、重要性、截止时间和衡量方式。
- [ ] 支持默认维度：事业、财富、健康、家庭、能力、兴趣。
- [ ] AI 可将年目标拆解到季度、月、周，并生成可关联任务和学习入口的 Growth Plan。
- [ ] 用户可手动调整拆解结果。
- [ ] 用户可将已审阅 AI/能力结果中的单条来源事实显式转换为一个 Goal；创建的 Goal 必须保留结果和事实来源，且同一事实不能重复转换为 Goal。
- [ ] 用户可将已审阅 AI/能力结果中的单条来源事实显式转换为一个 Growth Plan；用户必须选择当前 Workspace 内已有 Goal、填写计划标题并选择周期，创建的 Plan 必须保留结果和事实来源，且同一事实不能重复转换为 Plan。
- [ ] 用户可将已审阅 AI/能力结果中的单条来源事实显式转换为一张 Knowledge Card；用户必须确认卡片标题和正文，可选关联当前 Workspace 内已有 Goal，卡片必须保留结果和事实来源，且同一事实不能重复转换为 Knowledge Card。
- [ ] 用户可将已审阅 AI/能力结果中的单条来源事实显式转换为一条 Memory；用户必须确认正文、类型、重要性和标签，Memory 必须保留结果和事实来源，且同一事实不能重复转换为 Memory。

### FR-012: Goal Agent - 进度追踪与预警

**Priority:** Should Have

**Description:**
系统持续评估目标是否偏离计划，并提出调整建议。

**Acceptance Criteria:**

- [ ] 展示目标进度和趋势预测。
- [ ] 目标滞后时生成风险提示。
- [ ] 每周检查任务是否与目标对齐。
- [ ] 支持目标暂停、修改或放弃，并记录原因。

### FR-013: Knowledge Agent - 知识沉淀

**Priority:** Should Have

**Description:**
系统支持把用户阅读、收藏、文档和灵感转化为可检索、可引用的知识卡片。

**Acceptance Criteria:**

- [ ] 支持手动创建知识卡片。
- [ ] 支持网页收藏和 AI 摘要。
- [ ] 知识卡片可自动提取标签、概念、关联 Workspace/Project/Goal 和 Memory。
- [ ] Global AI 对话可引用知识卡片。
- [ ] 支持稍后读和复习提醒。

### FR-014: Work Agent - 外部工具连接

**Priority:** Must Have

**Description:**
系统提供个人 Workspace、Project、目录/资源和外部工具连接，将工作事实沉淀到统一事件和 Memory，并生成报告。

**Acceptance Criteria:**

- [ ] 支持创建和切换个人 Workspace，并管理其中的项目、目录和资源指针。
- [ ] 支持至少一个外部工具连接或软件入口，显示连接状态和权限范围。
- [ ] 外部事件经过用户授权后写入统一事件和 Memory。
- [ ] 可以按 Workspace / Project 聚合工作事件和最近产出。
- [ ] 支持生成工作进展或周报草稿，并提供引用来源。

### FR-015: Global AI - Agent Router

**Priority:** Must Have

**Description:**
用户可以在全局对话入口提出问题，系统根据意图路由到合适 Agent，并基于 Memory 给出回答。

**Acceptance Criteria:**

- [ ] 支持全局 AI 入口。
- [ ] 支持至少 5 类意图：任务、目标、复盘、知识、通用记忆问答。
- [ ] 回复必须基于用户个人数据，而不是泛泛建议。
- [ ] 重要回复展示 Memory/Task/Goal 引用来源。
- [ ] 用户可将 AI 回复转为任务、目标、Memory 或知识卡片。

### FR-016: Dashboard

**Priority:** Must Have

**Description:**
Dashboard 是个人工作台的每日第一屏，聚合当前工作、进行中项目、成长计划、任务、知识学习、最近活动、AI 洞察和能力入口。

**Acceptance Criteria:**

- [ ] 展示今日简报、当前状态和一个明确的下一步。
- [ ] 展示进行中的 Workspace / Project 及其最近状态。
- [ ] 展示当前成长计划、今日任务和完成数。
- [ ] 展示知识学习队列、最近工作/学习活动和至少一条带引用的 AI 洞察。
- [ ] 提供工作、待办、成长、知识、应用、插件和 Skill 的明确入口。
- [ ] 首屏可以看见已有数据；无数据时由 AI 引导创建工作对象，而不是只显示空白占位。

### FR-017: Mine 与个人成长数据

**Priority:** Should Have

**Description:**
Mine 页面展示个人成长数据、能力雷达、里程碑、提醒设置和隐私控制。

**Acceptance Criteria:**

- [ ] 展示目标完成率、计划推进率、任务完成率、工作/学习活跃度、复盘天数、Memory 数量。
- [ ] 展示能力雷达，默认维度为产品、技术、商业、健康、社交。
- [ ] 展示关键里程碑。
- [ ] 支持提醒时间、集成状态、数据导出、隐私设置。

### FR-018: 数据导出与隐私控制

**Priority:** Must Have

**Description:**
Personal Agent OS 处理高度个人化数据，必须让用户可控、可导出、可删除。

**Acceptance Criteria:**

- [ ] 用户可导出 Workspace、Project、Plan、Task、Goal、Knowledge、Reflection、Workspace Event、Memory、Insight 和 Capability Run 数据。
- [ ] 用户可删除单条 Memory 或清空某类数据。
- [ ] 外部工具集成必须可随时断开。
- [ ] AI 使用个人数据前必须遵守用户设置的数据范围。
- [ ] 敏感数据不用于公共样例、默认分享或未经确认的导出。

#### Story 1.3 当前增量产品合同

- 用户在 Mine 选择 Personal Agent 可使用的七类个人来源：任务、目标、计划、学习、知识卡、晨晚复盘与快速记录、长期 Memory。
- 默认全部开启；关闭某来源后，后续 Agent 请求不得把该来源加入上下文。设置不删除原始数据，也不改写历史回复、Run 审计或引用。
- 本轮只交付用户级 `privacy_scope` 设置读写和检索边界函数，不把旧交易教练或旧知识库伪装成新 Personal Agent 数据源。

### FR-019: Workspace 与 Project 工作空间

**Priority:** Must Have

**Description:**
系统提供个人工作空间，用于组织项目、目录、资源、产出和相关任务；Workspace 是工作、学习和成长数据的组织边界。

**Acceptance Criteria:**

- [ ] 用户可以创建、切换、归档 Workspace。
- [ ] Workspace 可以包含 Project、目录/资源指针、关联 Goal、Task、Knowledge 和最近产出。
- [ ] 用户可以用自然语言让 AI 创建项目、整理资源或生成下一步任务。
- [ ] 首页展示当前 Workspace 和进行中 Project，不要求用户逐项维护完整目录。
- [ ] Workspace 数据必须按用户隔离，并支持后续权限和导出边界。

### FR-020: App、Plugin、Skill 与 Agent 能力中心

**Priority:** Must Have

**Description:**
系统提供统一的能力目录，组织常用软件入口、已连接应用、Plugins、Skills、Agent 专家和自动化流程，让用户能够发现、启用、停用和控制能力。

**Acceptance Criteria:**

- [ ] 支持保存常用软件、网页、目录和工具入口，并按 Workspace 组织。
- [ ] 显示应用/连接器的连接状态、授权范围和最近使用情况。
- [ ] Plugins 和 Skills 显示名称、用途、来源、依赖、权限和启用状态。
- [ ] 用户可以启用、停用或限制某个 Plugin/Skill 的 Workspace 范围。
- [ ] AI 调用外部能力前必须遵循授权和用户确认规则，并记录 Agent Run。
- [ ] 已确认的低风险内置能力可以在当前 Workspace 内生成可审阅结果；结果必须带来源事实，且未经用户再次确认不得改写 Task、Goal、Knowledge、Memory 或外部系统。
- [ ] 第一阶段支持能力目录和内置能力，外部安装市场和高风险执行分期实现。

### FR-021: Workspace Command Center 首页

**Priority:** Must Have

**Description:**
首页是工作和成长的统一决策入口，系统根据 Workspace、Project、Goal、Plan、Task、Knowledge、Memory 和 Agent Run 聚合出当前状态和下一步。

**Acceptance Criteria:**

- [ ] 顶部提供自然语言 Command Bar，可将输入路由为任务、目标、计划、知识、记录、工作流或问答。
- [ ] 首页展示今日简报、进行中项目、今日任务、成长计划、学习队列、最近活动和能力入口。
- [ ] 首页至少有一个可执行的下一步；AI 建议必须说明来源和原因。
- [ ] 首页将任务完成、快速记录、学习进展、Morning 和 Evening 聚合为当日闭环状态；每一项都显示当前事实、完成状态或明确的下一步入口。
- [ ] 当日下一步建议优先依据当前 Workspace 的未完成高优任务、进行中学习、缺失的 Morning / Micro Capture / Evening 事实生成；规则建议必须说明来源，不将其呈现为 AI 已推断的结论。
- [ ] 用户完成任务、更新学习进度、保存快速记录或晨晚复盘后，首页无需刷新页面即可反映新的闭环状态和下一步。
- [ ] 用户可从首页直接进入工作、待办、成长、知识、应用、插件和 Skill 页面。
- [ ] Dashboard 聚合接口在 2 秒内返回基础数据；AI 洞察可异步出现，不阻塞首页。
- [ ] 首页支持新用户、无目标、无任务、AI 处理中、离线和错误状态。

---

## Non-Functional Requirements

### NFR-001: Performance

- Dashboard 首屏数据加载 <= 2 秒。
- Morning / Evening 核心流程提交 <= 1 秒，AI 总结可异步返回。
- Memory 检索 P95 <= 1.5 秒。

### NFR-002: Reliability

- 每日提醒失败时可在用户下次打开时补偿展示。
- AI 生成失败时不阻塞用户保存复盘或任务。
- Memory 写入必须具备幂等保护，避免重复记录。

### NFR-003: Privacy and Security

- 所有用户数据按 user_id 隔离。
- 外部工具集成使用最小权限。
- 敏感配置不得暴露到前端。
- 删除数据后不得继续被 Agent 检索。

### NFR-004: AI Quality

- AI 建议必须引用可追溯的个人上下文。
- 对不确定推断必须降低语气确定性。
- 用户标记为无用的引用应进入后续优化信号。
- 避免泛泛鸡汤式建议。

### NFR-005: Cost Control

- P0 流程优先使用低成本模型。
- 周/月回顾、知识摘要等可异步批处理。
- Memory 检索优先走本地数据库检索，再决定是否调用 LLM。

---

## Migration From Existing GrowthPilot

### Preserve

- FastAPI + SQLAlchemy async + PostgreSQL + Redis 基础栈。
- Taro 4 / React 前端基础。
- AI Provider、Prompt Loader、LLM Call 记录能力。
- Knowledge 相关已有能力可作为 Knowledge Agent 的雏形。
- Growth engine 中任务、签到、成就的部分能力可拆分复用。
- 已完成的 Memory 写入、搜索、编辑、软删除和撤销能力作为底层数据能力保留，不继续扩展为默认主界面。

### Reposition

- 交易/投资功能从核心主线降级为可选历史模块或未来垂直插件。
- 旧的“增长引导”从交易成长任务重构为全成长任务系统。
- 旧的 AI 教练从交易性格分析重构为个人成长教练。
- 旧的 Onboarding 从 Profile 初始化重构为 Workspace 初始化和首个行动计划生成。

### Replace

- 用 Workspace + Event + Memory 架构替代以 records/scenes 为中心的场景插件架构。
- 用 Reflection Agent 替代旧的交易复盘主线。
- 用 Goal/Plan/Task/Knowledge/Work/Capability Agent 组合替代单一投资分析链路。

---

## MVP Roadmap

### Phase 0: 产品方案校正

| 顺序 | Focus | Deliverable |
|------|-------|-------------|
| 1 | PRD | Workspace、Growth OS、Capability Registry、首页和 MVP 边界 |
| 2 | UX | Web Shell、Command Center、Onboarding、Workspace、App/Skill 入口 |
| 3 | Architecture | Workspace/Project/Resource/Capability/Agent Run 数据和 API 边界 |
| 4 | Epics / Sprint Plan | 从工作台骨架开始的可实现故事顺序 |

**Acceptance:** 所有规划文档对产品定位、默认导航、首页结构、Web/小程序边界和实施顺序达成一致。

### Phase 1: Workspace Foundation + First Useful Home

| 顺序 | Focus | Deliverable |
|------|-------|-------------|
| 1 | Web Shell | 侧边栏、工作空间切换、全局 AI Command Bar、应用/扩展入口 |
| 2 | Workspace | 工作空间、项目、目录/资源指针、最近产出和活动流最小模型 |
| 3 | AI Onboarding | 一句话生成 Workspace、项目、目标、计划、今日任务和学习入口 |
| 4 | Command Center | 首页简报、进行中、待办、成长计划、知识队列、AI 下一步 |

**Acceptance:** 新用户完成 Onboarding 后，在 1 分钟内看到至少一个可执行任务和完整的工作台入口，而不是空页面或资料表。

### Phase 2: Growth Execution Loop

| 顺序 | Focus | Deliverable |
|------|-------|-------------|
| 1 | Goal / Plan | 自然语言目标、AI 拆解、周期计划、里程碑和风险 |
| 2 | Task | 今日待办、进行中、完成/推迟/阻塞、目标和项目对齐 |
| 3 | Reflection | Morning、Micro Capture、Evening、提醒和补记 |
| 4 | Analysis | 执行率、目标推进率、学习投入和行为模式基础分析 |

**Acceptance:** 用户每天通过低负担输入完成工作推进和成长记录，系统能给出有依据的下一步和督促。

### Phase 3: Knowledge, Work and Capability

| 顺序 | Focus | Deliverable |
|------|-------|-------------|
| 1 | Knowledge | 内容捕获、AI 摘要、学习队列、复习和目标关联 |
| 2 | Work | 项目目录、常用软件入口、授权连接和工作事实导入 |
| 3 | Capability | Plugins、Skills、Agent 专家、启停、权限和调用记录 |
| 4 | Reports | 周报、月报、成长趋势和项目进展报告 |

**Acceptance:** 工作、学习、任务和复盘事实进入同一上下文，AI 能调用合适的能力产出结果并说明依据。

### Phase 4: Miniapp Companion and External Automation

- Miniapp 只提供一句话记录、Morning、Evening、提醒、今日任务和状态查看。
- Web 继续承载复杂 Workspace、Knowledge、Goal、Task、App、Plugin、Skill、分析和隐私管理。
- 长时间 Agent、全量外部同步和高风险本地执行在权限、审计和稳定性满足后再开放。

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 每日使用负担过高 | High | High | 所有核心流程过 10 分钟测试，超时即砍字段。 |
| AI 建议泛泛 | High | High | 先做 Memory 和引用机制，再做复杂 Agent。 |
| 范围膨胀 | High | Medium | MVP 先做 Workspace、Project、Command Center、Goal/Plan/Task、Knowledge 入口和每日数据闭环；复杂同步、自动化和能力执行分期。 |
| 工作台范围过大 | High | High | 先做 Workspace、Project、Task、Goal/Plan、Knowledge、App/Skill 入口的最小闭环，复杂执行和同步分期。 |
| 能力扩展带来安全风险 | Medium | High | Plugins/Skills 必须有来源、依赖、权限、启停、Workspace 范围和 Agent Run 审计。 |
| 旧交易功能牵制新架构 | Medium | Medium | 明确旧功能降级为历史模块，不作为新主线依赖。 |
| Memory 数据质量不足 | Medium | High | 用晨间、微复盘、晚间复盘建立稳定数据入口。 |
| LLM 成本失控 | Medium | Medium | 检索优先、异步批处理、模型分层。 |
| 隐私顾虑 | Medium | High | 数据导出、删除、权限边界作为 Must Have。 |

---

## Open Questions

1. 产品对外名称是否继续叫 GrowthPilot，产品类别是否明确使用“AI 成长工作台”？
2. 首个 Workspace 是否默认以“个人主工作台”创建，还是允许用户一开始选择模板？
3. 第一阶段的目录/资源是先保存链接和本地目录指针，还是接入真实文件读写授权？
4. App、Plugin、Skill 的首批内置能力清单和权限分级如何确定？
5. 第一版是否只做单用户自用，还是保留多用户账号体系？
6. Memory 是否需要从第一天就支持向量检索，还是先用 JSONB + 全文检索验证工作台闭环？
7. 外部工具集成第一阶段是否只做一个连接器，其余统一进入 Capability Registry？

---

## Next BMAD Steps

1. 完成并评审本次 Product Correction 文档集：PRD、UX、Architecture、Epics/Stories、Sprint Plan。
2. 从 Web Workspace Shell 和 Command Center 开始建立可运行骨架。
3. 创建 Workspace / Project / Resource / Capability Registry 的最小数据模型和 API。
4. 重做 AI Onboarding，使其生成首个工作台、计划、任务和学习入口。
5. 再按 Goal / Plan / Task -> Reflection -> Knowledge -> Insight -> Plugins/Skills 的顺序实现。

---

**Created using BMAD Method v6**
