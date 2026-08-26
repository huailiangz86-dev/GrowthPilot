# GrowthPilot AI Personal Workspace Sprint Plan

**日期：** 2026-08-09

**状态：** Draft - Ready for Product Review
**前置：** `sprint-change-proposal-growth-workspace-2026-08-09.md`

## Sprint Goal

把 GrowthPilot 从“资料和 Memory 页面”校正为一个可打开、可进入、可推进工作的 Web AI Personal Workspace。第一阶段不追求把所有 Agent 做完，而是先让首页有真实工作上下文、计划、待办、知识和能力入口。

## Sprint 0: 文档和产品边界

**状态：** Ready for Product Review

| Story | 目标 | 交付 |
|---|---|---|
| DOC-01 | 校正 PRD | Workspace-first 定位、MVP、FR-019~021、路线 |
| DOC-02 | 校正 UX | Web Shell、Command Center、Onboarding、Apps/Extensions |
| DOC-03 | 校正 Architecture | Workspace/Project/Resource/Capability/Event 数据边界 |
| DOC-04 | 校正 Epics/Stories | 重排依赖、增加 Epic 0 和 Epic 11 |
| DOC-05 | 更新状态 | 记录底层能力和新的代码入口 |
| DOC-06 | 建立文档索引 | 明确当前实施依据与历史文档边界 |

**验收：** PRD、UX、Architecture、Epics、Sprint Plan、Implementation Status 和文档索引对默认导航、首页结构、核心对象关系、事件/成长数据链路、Web/小程序边界和开发顺序没有冲突。代码实现必须等产品负责人确认这组文档。

## Sprint 1: Web Workspace Shell

**目标：** 用户能从 Web 进入一个像工作台的产品。

| Story | 目标 | 验收重点 |
|---|---|---|
| 0.1 | Workspace Shell | 新侧边栏、Workspace 切换、全局 AI、Activity Center、Apps/Extensions 入口 |
| 0.2 | Command Center | 首页展示简报、进行中内容、待办、计划、知识和能力入口 |
| 0.3 | Command Bar | 一句话输入、意图理解、行动预览、确认/拒绝、失败保留输入 |
| 0.4 | Workspace Domain Spine | 真实 Workspace、Project、Workspace Event 迁移与用户隔离 API |

**允许的实现策略：** 第一版可使用聚合 fixture 或 `user.settings` 中的最小数据，但数据形状必须与最终 API/模型一致；不能用静态文案掩盖空状态。Story 0.4 完成前，前端原型继续保留 `localStorage` 回退，不提前依赖未验证的后端聚合接口。

## Sprint 2: AI Onboarding + Growth Execution

**目标：** 新用户完成一句话输入后，得到一个可以行动的工作台。

| Story | 目标 | 验收重点 |
|---|---|---|
| 1.1 | 生成首个 Workspace | 生成 Workspace、Project/主题、Goal、Plan、Task、Learning 入口和 Memory |
| 1.2 | 提醒与时区 | 已完成：保存用户时区与 Morning/Evening 偏好，不阻塞进入首页 |
| 1.3 | Agent 数据范围 | 用户显式选择 Agent 可使用的个人数据来源 |
| 4.1 | 任务最小闭环 | 创建、完成、推迟、阻塞、项目/目标关联 |
| 5.1 | 目标/计划最小闭环 | 自然语言目标、AI 拆解、周期计划和下一步 |
| 6.1 | 首页真实聚合 | 读取真实 Workspace/Project/Goal/Plan/Task/Knowledge 数据 |
| 6.6 | 今日闭环聚合 | 聚合任务完成、快速记录、学习进展、Morning、Evening 和规则化下一步 |
| 8.0 | 首个学习入口 | Onboarding 生成的学习入口可在首页看到并能进入最小学习队列 |

**验收：** 新用户进入首页后不再看到“尚未启动”，至少有一个进行中项目、一个计划、一个待办和一个学习入口；完成任务、学习、快速记录或晨晚复盘后，首页会显示对应事实和一个可解释的下一步。

### Story 1.3 当前增量切片

- 先落地用户级 `privacy_scope` 读写 API 和 Mine 设置，不新增数据库表。
- 默认开启七类来源；用户关闭来源后，未来 Personal Agent 检索必须排除对应来源。
- 先补齐 Memory provenance 的授权过滤辅助和测试；完整 ContextEngine、Agent Router、引用重算与历史回复展示留给后续 Agent story。

**Story 1.1 当前切片：** 确认时将 Workspace 与可选 Project 写入真实领域 API，并同事务追加领域 Event、Onboarding 确认 Event 和既有 Memory。Goal、Plan、Task、Learning 继续使用前端草稿形状，不提前创建不完整的后端表。前端本地工作台和原话草稿是同步失败回退；服务端成功前不得删除原话，并应提供重试。

**Story 1.2 当前增量切片（已完成）：** 使用用户级 `users.settings.daily_preferences` 保存 IANA 时区、Morning 时间和 Evening 时间；Mine 可读取和更新。Command Center 的当日时间窗口与非补记 Reflection 日期按该时区计算，空值或无效值回退 `Asia/Shanghai`、`08:30`、`21:30`。本切片只保存偏好，不请求通知权限、不创建提醒任务、不调用 Worker/Cron 或任何外部推送；UI 明确通知未开启，Dashboard 的手动入口保持可用。

**Story 4.1 当前切片：** 新建独立的 Workspace Task 模型、迁移和用户隔离 CRUD API；Task 归属未归档 Workspace，可选关联同一 Workspace 的 Project。遗留 `daily_tasks` 不迁移、不复用。Task 的完成、推迟、阻塞及原因记录留待 Story 4.2，Goal / Plan 的真实关联留待 Story 5.1。

**Story 4.2 当前切片：** 通过专用状态 API 实现完成、推迟和阻塞；事件记录状态变化和原因，完成动作维护 `completed_at`，普通编辑不触碰执行状态。

**Story 4.3 当前增量切片：** Task 页面登录后读取当前 Workspace 的完整真实任务列表，不受 Command Center 最多 3 条任务的展示限制；用户从 Task 页面新增任务时优先写入 `/api/v1/tasks`，成功后用服务端对象替换本地临时对象，失败时保留本地任务并明确视为离线回退。页面提供按时间块或能量要求分组的切换，缺失字段归入“未安排”，不由 Agent 猜测能量或时间。

**Story 5.1 / 5.2 当前增量切片：** Growth Plan 页面登录后使用 `/api/v1/goals` 与 `/api/v1/growth-plans` 水合当前 Workspace 的完整真实对象；用户可先确认标题、描述、可选截止日期后创建 Goal，再选择一个现有 Goal 创建周期计划和里程碑。创建成功后以服务端对象替换本地临时对象；网络不可用时保留本地对象作为回退。当前不调用 AI 自动提取或自动拆解，也不基于任务、学习和复盘自动改写 Goal / Plan 进度。

**Story 3.1-3.3 当前增量切片：** 新建独立的 Workspace Reflection 领域表与用户隔离 API，承载 morning、micro、evening 三类个人成长事实，不复用遗留 `records` 或 `reviews`。Web 登录后读取当前 Workspace 的 Reflection 列表；保存 Morning、Micro Capture 或 Evening 时优先写入真实 API，成功后以服务端对象替换本地临时对象，失败时保留本地事实与 Micro Capture 草稿。每次写入在同一事务追加 Workspace Event；AI 总结、Memory 投影、任务/目标自动进度和提醒留待后续 Story。

**Story 8.0 当前增量切片：** 新建独立的 Workspace Learning Item 领域表和用户隔离 API，承载学习入口与进度，不复用遗留交易知识库、学习路径或文章进度。Learning 页面登录后读取当前 Workspace 的完整列表；用户确认标题、类型与可选 Goal / Project 关联后创建，推进进度时优先同步服务端，失败保留本地对象。创建和有效进度更新均写入 Workspace Event；不抓取内容、不生成摘要、不调用 AI。

**Story 6.6 当前增量切片：** 扩展 `/api/v1/dashboard/command-center`，在既有 Workspace、Project、Goal、Plan、Task、Event 读模型上增加有限的当日完成任务、少量当前学习项与当日 Reflection 事实。查询始终按 JWT 用户、当前 Workspace 和未归档边界过滤；学习优先返回当日更新或进行中的条目，复盘保留 Morning、Evening 和有限数量的当日 Micro Capture。Web 先用该集合渲染首页闭环；`/tasks`、`/learning-items`、`/reflections` 完整列表成功后覆盖该集合，失败时保留 Dashboard 回退和本地未同步事实。本切片不引入 AI 建议或任何自动进度改写。

**Story 6.4 当前增量切片：** Mine 使用当前 Workspace 已水合的 Goal、Growth Plan、Task、Learning Item 与 Morning / Evening Reflection 构建透明的成长概览。目标、计划和学习展示领域 `progress` 平均值；任务完成率为 `done / 全部任务`；复盘天数按 Morning / Evening 的去重日期计算；里程碑只统计已定义数量，不自动推断完成。没有对应对象时显示数据不足与录入入口。当前不新增分析 API、AI 洞察、能力雷达、趋势预测、周/月报告或导出。

**Story 8.1 当前增量切片：** 新建 `workspace_knowledge_cards` 与 `/api/v1/knowledge-cards`，保存用户提交的原始文本或网页地址，按当前 JWT 用户和未归档 Workspace 隔离，状态从 `captured` 开始。Web `/app/knowledge` 展示 Knowledge Card 与 Learning Item 两个事实集合；用户显式确认后才把卡片标题和原始内容摘要写入 `/api/v1/learning-items`，网络失败保留本地卡片和输入。当前不抓取网页、不生成 AI 摘要、不自动关联、不写入 Memory。

**Story 8.2 当前增量切片：** 已保存的文本 Knowledge Card 可由用户显式请求 `/knowledge-cards/{id}/summary-preview`。服务端通过版本化 Prompt 和统一 LLM 服务只返回摘要、概念、标签建议与卡片原始内容引用；用户在 Web 中编辑后，再调用确认接口写入卡片的 AI 摘要字段及 Workspace Event。AI 失败只更新可重试处理状态，绝不删除或阻塞原始来源。URL 卡片在未抓取网页前不参与摘要；本切片不写入 Memory、不自动关联 Goal / Task / Project、不自动入学习队列。

**Story 8.3 当前增量切片：** 已确认摘要的文本 Knowledge Card 可在当前 Workspace 内按关键词读取为 citation，返回已确认摘要、短摘录、概念、标签和固定原始内容引用。用户在知识页显式选择同 Workspace 的 Goal 和 Task 后才创建或更新关联，并写入 Workspace Event；不自动推断、关联或改写任何目标、任务、学习、Memory 或 Agent 对话内容。

**Story 11.1 当前增量切片：** 新建 `capability_registry` 与 `/api/v1/capabilities` 只读目录，在服务端提供少量 App、Connection、Plugin、Skill、Agent Expert 内置条目。所有查询按 JWT 用户和当前 Workspace 可见范围过滤，Web 在应用中心与扩展能力页展示用途、来源、版本、依赖、权限、状态和范围；失败时保留本地只读 catalog。当前不开放安装、启停、授权、连接、外部打开、调用或运行审计。

## Sprint 3: Daily Loop and Data

**目标：** 让工作台开始真实记录和分析个人成长。

| Story | 目标 | 验收重点 |
|---|---|---|
| 3.1 | Morning | 能量/意图、昨日上下文、推荐任务、开始今天 |
| 3.2 | Micro Capture | 进展/决策/情绪/灵感/学习一句话记录 |
| 3.3 | Evening | 完成度、事实、明日调整、AI 总结 |
| 2.1 | 统一事件写入 | 工作、任务、学习和复盘写入 Event/Memory |
| 6.4 | 基础分析 | 目标推进、任务完成、学习投入、Memory 健康度 |

## Sprint 4: Knowledge and Capabilities

**目标：** 把学习资源和可用能力接入工作台。

| Story | 目标 | 验收重点 |
|---|---|---|
| 8.1 | Knowledge 捕获 | 保存内容、知识卡片、学习队列 |
| 8.2 | AI 摘要与概念 | 文本卡片摘要预览、用户编辑确认、可重试处理状态 |
| 8.3 | Knowledge 引用与关联 | 已确认卡片 citation、用户确认 Goal / Task 关联 |
| 11.1 | 能力目录 | 内置 Apps、Plugins、Skills、Agent Experts |
| 11.2 | 能力启停 | 状态、依赖、权限和 Workspace 范围 |
| 11.3 | 能力调用预览 | 用户确认、审计、结果回写 |
| 11.4 | 低风险简报执行 | 已确认 Weekly Brief 生成可审阅事实草稿 |
| 11.5 | 简报事实转待办 | 用户确认单条事实后创建可追溯 Task |
| 11.6 | 简报事实转目标 | 用户确认单条事实后创建可追溯 Goal |
| 11.7 | 简报事实转成长计划 | 用户确认单条事实、目标与周期后创建可追溯 Growth Plan |
| 11.8 | 简报事实转 Knowledge Card | 用户确认单条事实的标题、正文与可选目标后创建可追溯 Knowledge Card |
| 11.9 | 简报事实转 Memory | 已完成：用户确认单条事实的正文、类型、重要性与标签后创建可追溯 Memory |

### Story 11.2：能力启停与范围限制（已完成）

- 已用 `workspace_capability_settings` 将“用户是否允许能力在当前 Workspace 使用”从内置目录元数据中分离；设置同时受 JWT 用户、未归档 Workspace 和可见能力范围约束。
- Plugin、Skill、Agent Expert 和 Connection 可保存启停及权限子集。App 保持入口元数据；Connection 未完成授权、能力依赖的领域事实缺失或权限未确认时，API 返回阻塞原因且不得写成已启用。
- 每次保存设置追加 `capability_setting_updated` Workspace Event；本切片只建立后续调用的闸门事实，不启动授权、连接、能力运行或 Agent Run。
- Web 已用开关和权限复选框保存当前 Workspace 的选择。同步失败时保留本地选择为待确认状态，不把它作为已授权或可执行的能力。

### Story 11.3：能力调用预览与确认（审计切片已完成）

- 已新建 `capability_runs` 和 `agent_runs` 审计对象；预览创建 `awaiting_confirmation` 的关联记录，并冻结输入摘要、权限快照、Workspace 范围和预期产出。
- 只有服务端确认已启用的 Plugin、Skill 或 Agent Expert 才能预览；App 仅可预览打开入口且无副作用。Connection、未启用、受阻、已停用或本地待确认能力不建立 Run。
- 用户可对自己的待确认 Run 选择 `confirm`、`plan` 或 `reject`。三种决定都追加 Workspace Event，`execution_state` 固定为 `not_started`；“确认”表示授权，不表示已经运行。
- Web 已在能力目录中让用户先填写输入摘要，再查看范围、权限和预期产出。当前只关联 Workspace 与可选 Project，不创建任何外部结果或领域对象。

### Story 11.3：审计可回看补充切片（已完成）

- 已增加按 JWT 用户、当前未归档 Workspace 和能力过滤的 Run 历史读取，默认仅返回最近少量记录及关联 Agent Run 的审计字段。
- Web 已支持按需展开单个能力的最近审计，刷新后仍明确展示预览、确认、计划或拒绝以及 `execution_state=not_started`。
- 当前不改变或重放历史决定，不创建新的 Run，不接入结果对象、外部执行、撤销、重试、导出或删除。

### Story 11.4：执行已确认的低风险内置简报（已完成）

- 已只允许已确认且当前仍启用的 `weekly-brief-plugin` 在当前未归档 Workspace 内运行；执行器只读取有限近期非 Capability 事实，生成带来源的确定性简报草稿。
- 结果只回写关联的 Capability Run / Agent Run 审计和 Workspace Event，不创建或改写任务、目标、计划、知识、记忆、项目或外部对象。
- 当前不调用模型、网络、外部应用或 Worker；不为 App、Connection、Skill、Agent Expert、`plan` 或 `reject` 状态开放执行，也不提供重试、撤销、导出或自动写回。

### Story 11.5：将简报事实显式转为待办（已完成）

- 用户只能从同一 Workspace 内已完成 Weekly Brief 的已存储事实中填写标题并创建一个 Task；服务端不重新读取任意事件，也不自动产生待办。
- 创建的 Task 复用可选 Project，并在描述中保留简报与事实引用；同一事实只能转换一次。成功同时写入 `task_created` 与 `capability_brief_fact_promoted` 事件。
- 当前不支持 Goal、Plan、Knowledge、Memory 转换，或撤销、删除、批量创建、重新执行和外部写入。

### Story 11.6：将简报事实显式转为目标（已完成）

- 用户只能从同一 Workspace 内已完成 Weekly Brief 的已存储事实中填写标题并创建一个 Goal；服务端不重新读取任意事件，也不自动产生长期目标。
- Goal 复用可选 Project，并在描述中保留简报与事实引用；同一事实只能转换为一个 Goal，且不影响该事实已创建的 Task。
- 当前不推断维度、类型、截止日期、重要性、指标或 Plan，不支持撤销、删除、批量创建、重新执行和外部写入。

### Story 11.7：将简报事实显式转为成长计划（已完成）

- 用户只能从同一 Workspace 内已完成 Weekly Brief 的已存储事实中填写 Plan 标题、选择周期和当前 Workspace 内已有 Goal 后创建一个 Growth Plan；服务端不重新读取任意事件，也不自动创建 Goal、Task、里程碑或周期数。
- Plan 复用 Run 的可选 Project，并在描述中保留简报与事实引用；同一事实只能转换为一个 Plan，且不影响该事实已创建的 Task 或 Goal。
- 成功时应写入 `growth_plan_created` 与 `capability_brief_fact_promoted_to_plan`，并在 `brief.fact_plan_actions` 保留一对一映射。当前不支持撤销、删除、批量创建、自动拆解、任务生成或外部写入。

### Story 11.8：将简报事实显式转为 Knowledge Card（已完成）

- 用户只能从同一 Workspace 内已完成 Weekly Brief 的已存储事实中确认卡片标题、正文和可选 Goal 后创建一张文本 Knowledge Card；服务端不重新读取任意事件，也不自动摘要、入学习队列或写入 Memory。
- Card 复用 Run 的可选 Project，正文保留简报、Run 与来源事件引用；同一事实只能转换为一张 Card。
- 成功时应写入 `knowledge_card_captured` 与 `capability_brief_fact_promoted_to_knowledge`，并在 `brief.fact_knowledge_actions` 保留一对一映射。当前不支持撤销、删除、批量转换、自动摘要、Memory 写入或学习对象自动创建。

### Story 11.9：将简报事实显式转为 Memory（已完成）

- 用户只能从同一 Workspace 内已完成 Weekly Brief 的已存储事实中确认最多 4000 字的 Memory 正文、类型、重要性和标签后创建一条用户级 Memory；服务端不重新读取任意事件，也不自动生成摘要、实体、向量或其他领域对象。
- Memory 使用 `source=capability_brief`、`source_id=Capability Run ID`，完整保留用户确认正文并追加简报、Run 与来源事件引用，发生时间复用事实发生时间；同一事实只能转换一次。
- 成功时写入 `capability_brief_fact_promoted_to_memory`，并在 `brief.fact_memory_actions` 保留一对一映射。当前不支持撤销、删除、批量转换或其他领域对象自动写入。

## Deferred

- 第三方 Plugin/Skill 自动安装市场。
- 高风险本地文件读写、邮件发送、消息发送等副作用执行。
- 全量飞书、GitHub、日历、浏览器和文件系统同步。
- 多 Agent 长时间自治和复杂并行编排。
- 复杂知识图谱、多人协作和新的交易能力。

## Definition of Done

- 文档与 API/页面命名保持一致。
- Web 375px 和桌面基线通过布局检查。
- 首屏不依赖用户先填多个资料字段。
- 新用户首页有 Workspace、Project/主题、Goal/Plan、Task、Knowledge/学习和 Capability 入口；学习入口可以来自 Onboarding 生成的最小对象。
- AI 结果支持确认、修改、拒绝；失败不丢失原文。
- 所有重要洞察包含来源或明确标记样本不足。
- 领域事实写入统一事件，并可异步回投到 Memory/Insight；领域对象仍是当前状态的唯一来源。
- Legacy Trading 不出现在默认主线。
- 产品负责人确认 PRD、UX、Architecture、Epics、Sprint Plan、Implementation Status 和文档索引后，才进入 Sprint 1 代码实现。
