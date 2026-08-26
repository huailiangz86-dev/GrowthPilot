# GrowthPilot 产品文档索引

**更新日期：** 2026-08-16

**当前产品定义：** Web-first AI Personal Workspace + Growth OS
**实施状态：** Web Workspace 前端原型已进入增量实现；真实后端领域模型和聚合 API 待后续 Sprint 建设

## 当前实施依据

以下文件组成同一套必须一起评审的产品方案。开发实现只能以这组文件为依据：

| 顺序 | 文档 | 职责 |
|------|------|------|
| 1 | `prd-growthpilot-personal-agent-os-2026-08-06.md` | 产品定位、用户价值、范围、功能需求和验收标准 |
| 2 | `ux-design-growthpilot-personal-agent-os-2026-08-08.md` | Web 工作台导航、Command Center、Onboarding、日常流程和小程序边界 |
| 3 | `architecture-growthpilot-personal-agent-os-2026-08-08.md` | Workspace-first 数据模型、Event/Memory/Insight 链路、API、权限和迁移策略 |
| 4 | `epics-growthpilot-personal-agent-os-2026-08-08.md` | Epic、Story、验收条件和需求覆盖 |
| 5 | `sprint-plan-growthpilot-personal-agent-os-2026-08-09.md` | Sprint 顺序、阶段验收和代码进入条件 |
| 6 | `implementation-status-personal-agent-os-2026-08-08.md` | 当前代码事实、已完成底层能力、缺口和下一开发入口 |
| 7 | `sprint-change-proposal-growth-workspace-2026-08-09.md` | 本次产品校正的原因、影响和交接记录 |

## 一致性基线

- 产品是 AI Personal Workspace + Growth OS，不是个人资料页、Memory 笔记库或交易成长 Agent。
- Web 是完整的成长工作台：首页聚合工作、项目、待办、成长计划、知识学习、应用、插件、Skill、Agent 专家、自动化和洞察入口。
- 小程序只做快速记录、Morning、Evening、提醒和今日任务/状态查看；复杂组织、分析和能力管理回到 Web。
- Workspace 是可见承载层；Project、Goal、Growth Plan、Task、Knowledge 是工作和成长对象。
- Workspace Event 记录事实，Memory 提供长期上下文，Growth Insight 提供带证据的分析；三者不能取代领域对象的当前状态。
- Onboarding 使用一句自然语言生成首个 Workspace、Project、Goal、Plan、Task 和 Learning 入口，用户确认、纠正或拒绝，不填写长表单。
- 旧交易能力和 Memory CRUD 保留为历史工具/数据管理能力，不出现在默认主线。
- 已确认 Workspace-first 方向；Web 原型按本组文档中的 Story 0.1-0.3、3.1-3.3、4.1、5.1、6.1 和 6.6 增量实现。Backend 与 Miniapp 的真实领域改造仍需按 Story 继续。

## 历史输入

`prd-growthpilot-2026-06-26.md`、`prd-growthpilot-v2-2026-06-26.md`、`architecture-growthpilot-2026-06-26.md`、`architecture-growthpilot-v2-2026-06-26.md`、旧版 brainstorming 和 design 文档保留用于了解演进背景。它们不再定义当前导航、MVP、数据关系或实现顺序。

## 下一步

产品负责人确认后，按以下顺序进入代码：

1. 将当前前端 `WorkspaceContext + localStorage` 原型替换为真实 Workspace / Project / Goal / Plan / Task / Learning 领域 API。
2. 建立领域写入 -> Workspace Event -> Memory / Insight 的异步投影。
3. 将 Onboarding 草稿写入真实 Workspace 图，并补齐学习内容捕获与进度同步。
