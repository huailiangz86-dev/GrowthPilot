# GrowthPilot AI Personal Workspace 实现状态

**更新日期：** 2026-08-19

**当前产品形态：** Web-first AI Personal Workspace，Miniapp companion
**状态：** Workspace-first Web 原型持续增量实现；Workspace/Project 后端领域骨架已实现，待本地运行环境完成自动化验证

## 产品边界

Web 是完整的个人成长工作台，承载需要持续浏览、组织、执行、连接和分析的能力：

- 首页 Command Center
- 工作空间 Workspace
- 项目 Project
- 目录、文件和资源入口
- 待办 Task 和 Focus 执行
- 成长目标与周期计划
- Knowledge / Learning
- 常用 App 和已连接应用
- Plugins / Skills / Agent Experts
- Global AI Command Bar
- 工作、学习和成长洞察
- Memory 与个人数据管理
- 历史交易工具

小程序只承担高频、低负担的伴随场景，不追求 Web 功能等价：

- 一句话快速记录
- Morning 启动
- Evening 复盘
- 提醒与今日待办查看
- 当前状态和关键任务查看

## 当前已完成的底层能力

### Story 0.1-0.3：Web Workspace Shell 与行动转换原型

- Web 已提供 Workspace 切换、Web-first 导航、Activity Center、应用/扩展入口和全局 Command Bar。
- Command Bar 可将一句话预览为待办或快速记录，确认后写入当前 Workspace 的本地状态和活动流。
- Web 当前使用 `WorkspaceContext + localStorage` 作为可交互原型数据层；它不是最终后端领域模型或 Dashboard API。

### Story 4.1 / 5.1 / 6.1：最小工作与首页聚合原型

- Workspace、Project、Goal、Growth Plan、Task、Learning、Activity 和 Capability 已具备一致的前端数据形状。
- 任务完成、推迟、阻塞和 Focus 会更新相关进度并写入活动流。
- Dashboard 已展示当前工作、待办、计划、学习、活动、能力入口和静态 Insight。

### Story 3.1-3.3：每日记录原型

- Morning、Micro Capture 和 Evening 可以保存到当前 Workspace 的本地状态，并写入活动流。
- Micro Capture 支持关联 Project、Goal 或 Task，并会保留未提交草稿。

### Story 3.1-3.3：Workspace Reflection 真实事实写入（当前切片）

- 新建独立的 Workspace Reflection 领域模型、迁移和用户隔离 API，承载 morning、micro、evening 三类事实，不复用交易 `records` 或 `reviews`。
- 登录后 Web 水合当前 Workspace 的 Reflection 列表；Morning、Micro Capture、Evening 的保存优先写入真实 API，失败时保留本地回退与 Micro Capture 草稿。
- 每次创建或更新都写入 Workspace Event；当前不触发 AI 总结、Memory 投影、提醒或任务/目标自动进度改写。

### Story 8.0：Workspace Learning 最小队列（当前切片）

- 新建独立 Workspace Learning Item 领域模型、迁移和用户隔离 API，不复用旧交易知识库、学习路径或文章进度表。
- 登录后 Web 水合当前 Workspace 的学习队列；用户可以创建学习入口，并以进度更新推进 queued、in_progress、completed 状态。
- 创建和有效进度更新写入 Workspace Event；网络失败保留本地对象，当前不接入外部内容抓取、AI 摘要、复习或知识检索。

### Story 6.6：今日执行闭环聚合原型

- Dashboard 已以当前 Workspace 的 Task、Learning Item 与 Reflection 领域对象聚合任务完成、快速记录、学习进展、Morning 和 Evening，并为每项提供直接入口。
- `/api/v1/dashboard/command-center` 在最多 3 个未完成任务外返回有限的当日完成任务、少量当前学习项及当日 Morning、Micro Capture、Evening 事实；完整列表仍由 `/api/v1/tasks`、`/api/v1/learning-items`、`/api/v1/reflections` 提供。Web 完整列表请求失败时，首页继续使用该读模型作为降级数据。
- 规则化下一步按 Morning、当日高优任务、进行中学习、缺失快速记录、Evening 的顺序选择，并显示对应事实依据，不伪装为 AI 洞察。
- 学习可在首页和学习页以 10% 为单位推进；任务完成和学习推进都会写入活动流，首页无需刷新即可更新。

### Story 6.4：Mine 成长概览（当前切片）

- Mine 使用当前 Workspace 的真实 Goal、Growth Plan、Task、Learning Item 与 Morning / Evening Reflection 显示规则化概览，不引用旧交易统计、Memory 数量或 AI 文案作为指标来源。
- 目标、计划、学习使用各自 `progress` 的平均值；任务完成率使用 `done / 全部任务`；复盘天数按有 Morning 或 Evening 的去重日期计算；里程碑仅显示已定义节点数量。
- 缺少领域对象时明确显示数据不足和下一步录入入口；当前不实现能力雷达、趋势预测、周/月报告、导出或 Agent 建议。

### Story 8.1：Workspace Knowledge Card（当前切片）

- 已新增独立 `workspace_knowledge_cards` 领域模型、迁移和用户隔离 `/api/v1/knowledge-cards` API，保存文本或网页地址等原始捕获事实，不复用旧交易知识库。
- Web 知识学习页同时展示 Knowledge Card 与 Learning Item 队列；保存卡片、重试同步和加入学习队列是明确分离的用户动作。加入队列成功后服务端返回真实 Knowledge Card 与 Learning Item 替换本地临时对象。
- 卡片初始为 `captured`，显式入队后为 `queued`，两个动作均写入 Workspace Event。当前不抓取 URL、不做 AI 摘要或概念抽取、不自动关联、不写入 Memory；网络失败保留本地卡片与待同步队列状态。

### Story 8.2：AI 摘要与概念处理（当前切片）

- 已确认实施边界：AI 只为已保存的文本 Knowledge Card 生成可编辑的摘要、关键概念和标签预览；原始内容及来源地址始终是可追溯的领域事实，URL 在未抓取前不参与总结。
- 用户确认后才把编辑结果写入 Card 并追加 Workspace Event；拒绝建议不改变已确认内容。卡片会保存 AI 处理状态，失败时保持原始内容和既有确认结果，并允许用户重新请求预览。
- 本切片不建立 Memory 投影、网页抓取、Goal / Task 自动关联或自动学习队列。当前实现已完成并通过 Web 静态验证。

### Story 8.3：Knowledge 引用与显式关联（当前切片）

- 已确认实施边界：只有用户确认摘要的文本卡片可按当前 Workspace 与关键词作为 citation 读取，返回受控短摘录、已确认摘要、概念、标签和原始内容引用。
- 用户可以显式关联同 Workspace 的一个 Goal 和一个 Task；关联可替换或清除，并追加 Workspace Event。当前不基于 AI、标签或查询结果自动关联，也不改写任何领域对象进度。
- 本切片不接入旧 AI Coach、Memory 投影、向量检索、跨 Workspace 查询或完整对话回答。当前实现已完成并通过 Web 静态验证。

### Story 11.1：能力目录（当前切片）

- 已确认实施边界：能力目录是 Workspace 范围内的低风险只读 catalog，按 App、Connection、Plugin、Skill、Agent Expert 展示用途、来源、版本、依赖、权限、状态和范围。
- 内置条目由服务端初始化；Web 登录后读取真实目录，网络失败才保留本地 catalog。当前不将“可发现”误写为“已连接”或“已执行”。
- 本切片不实现第三方安装、启停、授权、连接、外部打开、Agent 调用或 Capability Run；当前实现已完成并通过 Web 静态验证。

### Story 11.2：能力启停与范围限制

- 已完成用户与 Workspace 隔离的 `workspace_capability_settings` 设置记录和迁移；它不改写内置 catalog，也不扩大到其他 Workspace。
- 目录 API 已返回有效状态、当前已确认权限、可确认权限、当前授权范围与阻塞原因。Connection 仍需完成单独授权；缺少前置领域事实或权限选择时不能显示为已启用。
- 每次设置变更已写入 `capability_setting_updated` Workspace Event，供后续 Agent Run 检查与审计使用。Web 已提供开关、权限复选框及本地待确认提示；不执行连接、外部打开、能力调用或任何副作用。

### Story 11.3：能力调用预览与确认（审计切片）

- 已完成 `capability_runs` / `agent_runs` 审计模型、迁移、预览 API 与决定 API；预览和用户决定先建立可审计闸门，不接入真实 Capability Executor 或外部系统。
- 预览只接受服务端有效状态为已启用的 Plugin、Skill、Agent Expert，以及无副作用的 App 入口。输入摘要、权限快照、访问范围和预期产出会在预览时冻结；Connection 与任何未授权状态不得创建 Run。
- `confirm`、`plan`、`reject` 都只允许同一用户在同一 Workspace 下操作，已写入 Workspace Event 并明确保留 `execution_state=not_started`。Web 已展示输入、范围、权限、预期产出和未执行状态；当前只审计 Workspace 与可选 Project 关联，不创建 Task、Knowledge、Memory 或外部结果。

### Story 11.3：审计可回看补充切片（已完成）

- 已完成已落库 Run 的只读回看能力，按当前 JWT 用户、未归档 Workspace 和能力三重过滤；不扩大为执行历史重放或工作流编排。
- 页面已按需读取当前能力的最近审计记录，展示冻结的输入、权限、范围、预期产出、决定和未执行状态。当前不改写历史、创建结果对象、导出、删除、重试、撤销或执行能力。

### Story 11.4：执行已确认的低风险内置简报（已完成）

- 已只允许 `weekly-brief-plugin` 在确认后、且仍在当前 Workspace 有效启用时读取有限近期非 Capability 事实，生成带来源的确定性简报草稿。
- 结果只能写入同一 Capability Run / Agent Run 审计与 Workspace Event；不创建或改写任何领域对象，不调用模型、网络、外部应用或 Worker，也不支持重试、撤销、导出或自动落库下一步。

### Story 11.5：将简报事实显式转为待办（已完成）

- 已只允许用户从自己当前未归档 Workspace 内已完成 Weekly Brief 的已存储事实填写待办标题；创建只产生一个 Task，不重新读取任意事实或自动创建任务。
- Task 只复用 Run 的可选 Project，并保留简短简报/事实引用；同一事实有一对一映射和重复保护。当前不转换 Goal、Plan、Knowledge、Memory，也不支持撤销、批量或外部写入。

### Story 11.6：将简报事实显式转为目标（已完成）

- 已只允许用户从自己当前未归档 Workspace 内已完成 Weekly Brief 的已存储事实填写 Goal 标题；创建只产生一个 Goal，不重新读取任意事实或自动建立长期方向。
- Goal 只复用 Run 的可选 Project，并保留简短简报/事实引用；同一事实有独立的一对一 Goal 映射和重复保护，不影响已创建的 Task。
- 当前不推断目标维度、类型、截止日期、重要性、指标或 Plan，也不支持撤销、批量或外部写入。

### Story 11.7：将简报事实显式转为成长计划（已完成）

- 用户必须从当前 Workspace 的已有 Goal 中显式选择关联目标，并填写 Plan 标题与周期；Plan 仅复用 Run 的可选 Project，描述保留简报与事实引用。
- 同一事实使用独立的 `brief.fact_plan_actions` 一对一映射，不影响已存在的 Task 或 Goal 映射。周期数、里程碑、任务、学习、知识和 Memory 均不自动推断或创建。
- 成功写入 `growth_plan_created` 与 `capability_brief_fact_promoted_to_plan`；当前不支持撤销、删除、批量、自动拆解、任务生成或外部写入。

### Story 11.8：将简报事实显式转为 Knowledge Card（已完成）

- 用户必须确认卡片标题和正文，可选选择当前 Workspace 内已有 Goal；Card 使用文本来源并复用 Run 的可选 Project，正文保留简报与事实引用。
- 同一事实使用独立的 `brief.fact_knowledge_actions` 一对一映射，不自动摘要、不自动入学习队列、不写入 Memory。
- 成功写入 `knowledge_card_captured` 与 `capability_brief_fact_promoted_to_knowledge`；当前不支持撤销、删除、批量转换或其他领域对象自动写入。

### Story 11.9：将简报事实显式转为 Memory（已完成）

- 用户确认最多 4000 字的 Memory 正文、类型、重要性和标签后，可从已完成 Weekly Brief 的单条已存储事实创建一条用户级长期上下文；正文完整保留用户确认内容并追加简报与事实引用，发生时间复用事实发生时间。
- 同一事实使用独立的 `brief.fact_memory_actions` 一对一映射，服务端固定 `source=capability_brief` 与 Run ID 来源，不自动生成摘要、实体、向量或其他领域对象。
- 成功写入 `capability_brief_fact_promoted_to_memory`；当前不支持撤销、删除、批量转换或其他领域对象自动写入。

### Story 0.4：真实 Workspace Domain Spine

- 已实现真实 Workspace、Project 与 Workspace Event 数据模型、迁移和用户隔离 API。
- 创建、更新、归档在同一事务中追加用户隔离 Event；已归档对象默认不返回，显式 `include_archived=true` 才可读取。
- 已补充请求校验、用户隔离和事件追加的自动化测试；当前环境因 `uv` 缓存目录无写权限，尚待执行 pytest 与 Ruff 验证。
- 本阶段只建立工作上下文和事实写入边界；Goal、Plan、Task、Learning、Reflection、Memory/Insight 投影和 Web 数据迁移分后续 Story 实现。

### Story 1.1：一句话创建初始上下文

- Web onboarding 已接入 `/api/v1/onboarding/context/preview`。
- Web onboarding 已接入 `/api/v1/onboarding/context/complete`，确认后会在同一事务中写入 Workspace、可选 Project、创建 Event、`onboarding_confirmed` Event 和 Onboarding Memory。
- API 从 JWT 派生用户归属；仅提交已确认的 Workspace/Project，Project 不能脱离 Workspace 写入。
- AI 失败不阻塞原始输入保存。
- 浏览器先建立本地工作台；服务端成功前保留原话草稿，失败时可在完成页重试同步，重复提交不会重复创建初始 Workspace/Project。
- Goal、Plan、Task、Learning 仍保持前端草稿形状，等待各自 Story 建立完整领域模型后再持久化。

### Story 1.2：提醒时间和时区（已完成）

- 用户级 `daily_preferences` 已保存 IANA 时区、Morning 时间和 Evening 时间；Command Center 当日边界与非补记 Reflection 日期按该时区计算，Mine 提供显式设置入口。
- 本切片不请求通知权限、不创建定时任务、不使用 Worker/Cron 或推送；响应和界面都明确通知未开启，Dashboard 手动 Morning / Evening 入口继续可用。

### Story 4.1 / 4.2：Workspace Task 最小闭环

- 已实现独立 `tasks` 表和 `/api/v1/tasks` 创建、列表、编辑 API，不复用遗留交易 `daily_tasks`。
- Task 归属未归档 Workspace，可选关联同 Workspace Project；创建、编辑、完成、推迟、阻塞都会写入用户隔离 Workspace Event。
- 完成记录 `completed_at`；推迟和阻塞记录原因；重复完成保持幂等。

### Story 4.3：Task 页面真实列表与组织方式（当前切片）

- Task 页面登录后读取当前 Workspace 的完整真实任务列表；首页 Command Center 继续只展示最多 3 条核心未完成任务。
- Task 页面新增任务优先写入真实 Task API，服务端成功后替换本地临时任务；网络不可用时保留本地任务作为回退，不丢失用户输入。
- Task 页面支持按时间块或能量要求切换分组；缺失 `due_at`、`time_block` 或 `energy_required` 的任务进入“未安排”，不自动推断用户属性。
- 本切片暂不把本地学习、复盘和快速记录迁移到后端，也不引入 AI 任务排序。

### Story 5.1 / 5.2：Goal 与 Growth Plan 最小领域骨架

- 已实现 `goals`、`growth_plans` 表及对应创建、列表、编辑 API。
- Goal 允许缺失 AI 提取的周期和指标；Growth Plan 关联同 Workspace Goal，可选关联 Project。
- 当前不提前实现 AI 拆解、里程碑自动进度和 Goal/Plan 与 Task 的真实关联；相关能力留待后续聚合与 Agent Story。

### Story 5.1 / 5.2：Growth Plan 页面真实录入（当前切片）

- 登录后 Provider 使用 Goal / Growth Plan 列表 API 水合当前 Workspace 的完整真实对象，首页聚合仍承担首屏轻量读取。
- 用户可在 Growth Plan 页面确认字段后创建 Goal，并在已有 Goal 下创建周期计划和里程碑；服务端成功后替换本地临时对象。
- 网络不可用时输入保留为本地对象，不丢失创建动作；当前不引入 AI 自动提取、自动拆解或自动进度改写。

### Story 6.1：首页真实数据聚合

- 已实现 `/api/v1/dashboard/command-center`，返回当前 Workspace 的真实 Project、Goal、Growth Plan、最多 3 个未完成 Task、有限的当日完成 Task、少量当前 Learning Item、当日 Reflection 和最近 Workspace Event。
- Web `WorkspaceProvider` 登录后尝试水合 Command Center；成功时覆盖工作对象，失败时保留现有 `localStorage` 工作台。
- 已补充云端水合适配器测试；完整 Learning / Reflection 列表在成功时覆盖首页的轻量集合，失败时仍保留该集合与本地未同步数据。
- Task 完成动作已优先写本地并同步 `/api/v1/tasks/{id}/complete`；同步失败不回滚本地事实。

### Story 2.1-2.3：Memory 数据底座

- 支持 Memory 创建、列表、详情、编辑、软删除和撤销。
- 查询按用户隔离，并排除已删除数据。
- 支持关键词、时间范围搜索和浏览器时区边界。
- 编辑后的派生数据标记为 stale。

这些能力继续保留，但 Memory 默认位于“我的 -> 数据管理”，不再作为用户主工作流。

## 产品校正后的缺口

- 当前 Workspace Shell 和 Dashboard 聚合仍使用前端 fixture / `localStorage`；已确认 Onboarding 现在会写入真实 Workspace / Project，但页面尚未从后端水合完整工作台。
- Knowledge 仍没有真实领域 API 或数据库迁移；Goal、Plan、Task 已有真实最小领域 API，但 Web 尚未从后端水合。
- Resource、Growth Plan、Capability Registry、Agent Run 尚未成为真实领域对象。
- 工作数据、学习数据、执行数据和成长分析尚未统一到 Event -> Memory -> Insight 链路。

## 文档校正交付

- `docs/sprint-change-proposal-growth-workspace-2026-08-09.md`
- `docs/prd-growthpilot-personal-agent-os-2026-08-06.md`
- `docs/ux-design-growthpilot-personal-agent-os-2026-08-08.md`
- `docs/architecture-growthpilot-personal-agent-os-2026-08-08.md`
- `docs/epics-growthpilot-personal-agent-os-2026-08-08.md`
- `docs/sprint-plan-growthpilot-personal-agent-os-2026-08-09.md`
- `docs/README.md`

## 文档交叉审阅结果

- PRD、UX、Architecture、Epics 和 Sprint Plan 使用同一套 Web 导航：首页、工作台、待办、成长计划、知识学习、应用中心、扩展能力、洞察、我的。
- Workspace、Project、Goal、Growth Plan、Task、Knowledge 的关系已固定；当前状态属于领域对象，不由 Memory 反向覆盖。
- 工作、学习、任务、计划、能力调用和复盘先写 Workspace Event，再按需异步生成 Memory 与 Growth Insight。
- Onboarding 只需要一句话，生成结果以确认、纠正或拒绝为主，不再以身份、项目、目标、节奏四字段作为主流程。
- Web 是完整工作台；小程序仅承载快速记录、Morning、Evening、提醒和今日任务/状态查看。
- 旧交易和 Memory CRUD 均保留，但不再成为默认主线。

## 新实施顺序

1. Story 0.4：真实 Workspace、Project、Workspace Event 领域模型、迁移和用户隔离 API。
2. Story 1.1：将 Onboarding 确认结果写入真实 Workspace / Project，并保留本地草稿作为同步失败回退。
3. Story 6.1：首页读取真实 Workspace、Project、Goal、Plan、Task 数据。
4. Reflection：Morning、Micro Capture、Evening 和提醒。
5. Knowledge / Learning：内容捕获、AI 摘要、学习队列、复习和目标关联。
6. Insights：工作、任务、学习、目标风险、Memory 健康度和周/月回顾。
7. Capability Registry：App、Connection、Plugin、Skill、Agent Expert 的目录、权限、启停和调用审计。
8. Miniapp companion：快速记录、Morning、Evening、提醒和今日任务。

## 当前暂停项

- 暂不继续扩展 Memory 的用户可见管理体验。
- 暂不继续扩展新的交易主线能力。
- 暂不实现第三方 Plugin/Skill 自动安装和高风险本地执行。
- 暂不实现全量外部工具同步矩阵。

## 下一开发入口

当前已完成 Story 0.4、1.1、1.2、1.3、4.1-4.3、5.1、5.2、6.1、6.6、6.4、8.0、8.1、8.2、8.3、11.1、11.2、11.3、11.4、11.5、11.6、11.7、11.8 和 11.9 的真实领域增量切片。Story 1.3 当前切片已交付用户级 `privacy_scope` 设置、Mine 来源控制和 Memory provenance 授权过滤辅助；完整 ContextEngine / Agent Router 仍属于后续实现范围。

## Story 1.3 实现记录

- `users.settings.privacy_scope` 保存七类来源的 `enabled_sources`，缺少历史配置时默认全部开启。
- `GET/PUT /api/v1/onboarding/privacy-scope` 提供来源读取与更新；只修改设置子树，不创建领域对象。
- Mine 展示并保存任务、目标、计划、学习、知识卡、复盘和长期 Memory 的 Agent 读取开关。
- 新增 `privacy_scope.py` 作为后续 Context/Retrieval 的统一边界；未知 Memory provenance 默认拒绝。旧 `ai_coach.py` 仍明确属于 legacy trading coach，不计入本切片的 Personal Agent 验收。

下一开发入口是 **Story 1.4：导出和删除个人数据**；开始实现前仍需先补齐该 Story 的当前增量 PRD / API / UI 合同。
