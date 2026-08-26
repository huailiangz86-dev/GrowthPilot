# Sprint Change Proposal: GrowthPilot 成长工作台重规划

**日期：** 2026-08-09

**发起人：** zhang / BMAD Master
**变更级别：** Major
**状态：** Ready for Product Review
**影响范围：** PRD、UX、Architecture、Epics/Stories、Sprint Plan、Implementation Status

## 1. 变更触发与问题摘要

### 触发故事

本次问题在 Story 1.1（用一句话创建初始个人上下文）和 Story 2.1-2.3（Memory 创建、管理、检索）实现并进行 Web 体验检查时暴露。

### 核心问题

当前实现把 GrowthPilot 做成了“个人资料初始化 + Memory 管理页面 + 空 Dashboard”。用户需要的是一个可以承载真实工作的 AI 工作台：从首页进入待办、工作空间、项目、成长计划、知识学习、软件、插件和 Skill，并由 AI 连接这些数据，持续推动目标和成长。

这不是视觉层面的偏差，而是产品层级错误：

- Memory 是底层上下文，不应成为默认主导航和主要工作流。
- Onboarding 的 AI 结构化结果不应退化成四个手工字段。
- Dashboard 必须有当前工作、进行中内容、计划、待办、知识和分析，而不是“尚未启动”。
- 成长能力必须从真实工作、学习、任务和复盘事件中自动产生数据，而不是依靠用户维护一套独立表单。

### 证据

- `web/src/pages/app/Onboarding.tsx` 在自然语言输入之后展示身份、项目、目标、节奏四个可编辑字段，产品感受仍然是人工配置。
- `web/src/pages/app/Dashboard.tsx` 当前主要展示上下文占位、临时能量按钮和“第一条 Memory”，没有真实的 Workspace、Goal、Plan、Task、Knowledge 聚合。
- `web/src/pages/app/Layout.tsx` 当前主导航暴露“个人上下文”和“个人 Memory”，同时把旧交易工具直接放在侧边栏，缺少工作台、应用、插件和 Skill 层。
- 现有 PRD/UX 已定义 Memory、Reflection、Task、Goal，但没有把 Workspace、Project、Resource、App、Plugin、Skill 作为一等产品对象。

## 2. 参考产品结论

- 腾讯 WorkBuddy 的价值在于自然语言理解、自主规划、工具调用、本地文件操作和可复用的专家/Skill，而不是表单数量。[官方产品说明](https://cloud.tencent.com.cn/product/workbuddy)
- work-buddy 将笔记、任务、浏览器标签、项目、日历、工作流和 Dashboard 放在同一层，并用每日简报和决策队列帮助用户继续工作。[官方文档](https://docs.work-buddy.ai/)
- OpenClaw 将 Workspace、持久记忆、Agent、插件和 Skill 作为 Agent 的运行环境；Skill 还需要安装、启用、授权和安全检查。[Workspace 文档](https://docs.openclaw.ai/start/openclaw)、[Skills 文档](https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md)

GrowthPilot 应吸收其“工作台 + Agent + 能力扩展”结构，同时加入自己的差异化：把目标、成长计划、学习、反思和行为分析连接到工作执行过程里。

## 3. 影响分析

### Epic 影响

| 原 Epic | 变更 |
|---|---|
| Epic 1 个人上下文 | 保留，但从 Profile 初始化升级为 AI 生成首个 Workspace、当前项目、目标、计划和任务。 |
| Epic 2 Memory | 保留底座能力，降级为系统能力；默认入口移动到“我的”。 |
| Epic 3 Reflection | 提前并与 Dashboard、Task、Goal 串联，成为每日数据采集和陪伴闭环。 |
| Epic 4 Task | 提前到工作台核心；任务必须支持项目、目标、计划、工作空间和 AI 推荐来源。 |
| Epic 5 Goal | 与成长计划合并为长期方向层，驱动任务和学习。 |
| Epic 6 Dashboard | 重定义为 Workspace Command Center，而不是单纯的成长数据聚合页。 |
| Epic 7 Global AI | 升级为工作台统一入口，可调用工具、Skill、插件并转成行动。 |
| Epic 8 Knowledge | 提前为工作台重要入口，和学习计划、目标、任务建立关联。 |
| Epic 9 Work | 提前建设 Workspace、项目、目录和应用入口的最小版本，外部连接仍分期。 |
| Epic 10 Legacy Trading | 保留为历史工具/垂直插件，不进入默认首页。 |
| 新 Epic 11 能力与扩展中心 | 新增应用、插件、Skill、Agent 专家、连接器和权限管理。 |

### 需要更新的产品工件

1. PRD：重新定义产品定位、工作台边界、MVP 和 FR 清单。
2. UX：重做 Web Shell、首页、Onboarding、Workspace、应用和 Skill 入口。
3. Architecture：增加 Workspace Domain、Capability Registry、Agent Run/Workflow 和资源授权边界。
4. Epics/Stories：重新排序实施依赖，从 Web Shell 和首页开始，而不是继续 Memory CRUD。
5. Sprint Plan / Implementation Status：反映新顺序和已完成能力的重新定位。

### 技术影响

- 已有 `memory_entries`、Memory API、LLM Provider、认证和旧交易模块保留。
- 新增或规划 `workspaces`、`projects`、`workspace_resources`、`workspace_events`、`growth_plans`、`growth_insights`、`capability_registry`、`capability_runs` 和 `agent_runs` 等领域对象；App Link 和 Workflow 作为 Capability Registry 的能力类型，不另起一套平行入口。
- Dashboard 改为读取聚合上下文，不直接拼接多个页面的临时数据。
- 前端需要先建立 Web-first Desktop Shell，再补 Goal、Task、Knowledge、Growth、Apps、Extensions 页面。
- 小程序只共享 Capture、Reminder、Morning/Evening、今日任务和状态查看接口，不承担完整工作台。

## 4. 推荐路径

### 方案评估

| 方案 | 结论 | 原因 |
|---|---|---|
| 直接在现有 Epic 上加字段 | 不推荐 | 只能补功能，无法修正产品层级和入口结构。 |
| 回滚已完成 Memory 故事 | 不推荐 | Memory 是必要底座，问题在呈现和实施顺序，不在数据能力本身。 |
| 重新审视 MVP | 必须 | 当前 MVP 缺少 Workspace、项目、应用、插件和 Skill，无法表达真实产品。 |
| 混合方案 | 采用 | 保留 Memory 底座，重排产品架构和前端入口，新增 Workspace/Capability 领域并分阶段实现。 |

### 采用方案

先完成文档校正，再从 Web Shell 和首页开始实现。首个可验收版本必须满足：

- 用户完成一句话 Onboarding 后，直接看到一个有当前项目、成长目标、计划、待办、知识入口和常用能力入口的首页。
- 首页可以看到进行中内容、最近工作、下一步建议和基础数据。
- AI 建议有来源，能把自然语言转换成任务、计划、知识或工作流。
- 用户主要做确认、调整、执行和反馈，不维护复杂字段。

**估算：** 文档重构 1 个工作阶段；Web 工作台骨架和 Dashboard 最小闭环 1-2 个工作阶段；Workspace/Goal/Task/Knowledge 数据闭环 2-3 个工作阶段；Apps/Plugins/Skills 和外部集成分阶段进入。
**主要风险：** 范围会比原 Personal Agent MVP 更大，因此必须先做可运行的 Workspace 骨架和少量真实入口，暂缓复杂自动化、多工具同步和完整本地文件执行。

## 5. 新实施顺序

1. 文档方案校正：PRD -> UX -> Architecture -> Epics/Stories -> Sprint Plan -> Implementation Status。
2. Web Workspace Shell：侧边栏、全局 AI 输入、工作空间切换、应用/扩展入口、响应式基线。
3. Workspace Dashboard：今日简报、进行中项目、待办、成长计划、知识学习、活动和 AI 下一步。
4. AI Onboarding：一句话生成首个工作空间、项目、目标、计划、任务和学习入口，只允许确认/纠正。
5. Goal / Plan / Task 最小闭环：自然语言创建、AI 拆解、完成/推迟/阻塞、目标对齐。
6. Knowledge / Work 基础闭环：知识捕获、学习队列、项目目录和最近产出。
7. Data / Insight：成长趋势、执行分析、学习分析、目标风险和周/月回顾。
8. Plugins / Skills / Apps：能力目录、启停、权限、安装状态、工作空间范围和 Agent 调用记录。
9. Miniapp companion：快速记录、Morning、Evening、提醒、今日任务和状态查看。

## 6. 交付与验收

文档阶段交付：

- 更新后的 PRD、UX、Architecture、Epics/Stories。
- 当前 Sprint Plan 和实现状态。
- 当前文档索引，明确历史文档不作为实现依据。
- 本变更提案作为变更依据。

代码阶段第一验收：

- Web 默认主导航不再把 Memory 或交易当作主线。
- Onboarding 完成后首页不为空，至少有一个 Workspace、一个进行中项目、一个成长目标、一个计划和最多三个待办。
- 首页存在工作、成长计划、知识、应用、插件和 Skill 的明确入口。
- 所有生成内容可确认、修改或拒绝；AI 失败不丢失用户原话。
- 数据记录能进入统一事件/Memory 层，并能在首页和洞察中被引用。

## 7. Handoff

**范围分类：Major。** 需要产品、UX、架构和开发共同重新排定 backlog；不直接进入下一条 Memory Story。

**当前责任：** 完成方案文档更新并保持文档之间的一致性，等待产品负责人确认。
**下一责任：** 确认后，从 Web Workspace Shell 和 Dashboard 开始实现；旧 Memory CRUD 作为数据管理页保留。
