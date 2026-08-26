---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
inputDocuments:
  - docs/prd-growthpilot-personal-agent-os-2026-08-06.md
  - docs/architecture-growthpilot-personal-agent-os-2026-08-08.md
  - docs/brainstorming-personal-agent-os-20260803.md
  - .claude/CLAUDE.md
workflowType: ux-design
project_name: GrowthPilot Personal Agent OS
user_name: zhang
date: 2026-08-09
status: draft - ready for product review
---

# UX Design Specification: GrowthPilot Personal Agent OS

**Date:** 2026-08-09
**Version:** 3.1
**Status:** Draft - Ready for Product Review
**Primary platform:** React Web personal workspace
**Secondary platform:** Taro 4 miniapp for lightweight capture and reminders

---

## 1. Executive Summary

### 1.1 Project Vision

GrowthPilot 是一个以工作为入口、以成长为结果的 AI Personal Workspace。它承载用户的工作空间、项目、目录、任务、知识、学习计划、软件、插件和 Skill；AI 将用户的一句话、工作事实和学习行为连接起来，生成计划、执行下一步、记录事实、分析变化并持续陪伴。

Memory 是系统底层上下文，不是用户每天需要维护的独立页面。用户应该感觉自己在使用一个能组织工作并帮助成长的工作台，而不是在填写成长数据。

UX 的核心任务不是展示更多数据，而是让用户在每个关键时刻都能完成一个足够小的动作：

- 早上，确认今天最重要的方向。
- 白天，快速留下一个有价值的事实。
- 晚上，回看今天并决定明天怎么调整。

### 1.2 Target Users

**第一用户：独立开发者 / AI 创业者**

- 多项目并行，时间和注意力都稀缺。
- 需要 AI 帮忙收敛重点，而不是再增加一个复杂工具。
- 对数据和效率敏感，但不愿意每天填写长表单。

**扩展用户：高自主知识工作者**

- 有长期目标、持续学习和复杂项目。
- 需要把零散信息变成可执行的下一步。
- 希望 AI 记得过去，而不是每次重新解释自己。

### 1.3 Key UX Challenges

1. 让 Memory 变成自然行为，而不是额外的数据录入任务。
2. 在 AI 主动建议和用户自主控制之间保持平衡，避免被监控感和通知疲劳。
3. 让目标、任务、复盘、知识之间有真实关联，但不把页面做成复杂管理后台。
4. 从旧交易产品迁移到全成长产品时，避免用户仍然把它理解为行情或交易工具。

### 1.4 Design Opportunities

1. 用“今天先推进什么”替代“系统里有多少东西”，让首页成为工作决策入口。
2. 用 Workspace、Project 和最近活动承载真实工作，让成长分析有事实来源。
3. 用一句话启动工作、学习或记录，AI 自动生成任务、计划、知识卡片或工作流。
4. 用统一能力中心组织软件、连接器、插件、Skill 和 Agent 专家，避免入口散落。
5. 用带来源的 AI 引用制造“它真的记得我”的关键时刻。
6. 用目标到计划到任务到产出到复盘的链路，让用户看见成长如何发生。

---

## 2. Core User Experience

### 2.1 Defining Experience

GrowthPilot 的定义性体验是：

> 用户只说一句话，系统就能把它理解成今天的行动，并在晚上带着上下文回来。

完整闭环：

```
一句话表达
    -> AI 理解意图
    -> 给出一个可执行的下一步
    -> 用户确认或修改
    -> 事实写入 Memory
    -> 晚上基于真实记录回顾
    -> 明天的建议变得更懂用户
```

### 2.2 User Mental Model

用户不应该把产品理解为：

- 另一个待办列表。
- 另一个笔记库。
- 另一个聊天机器人。
- 另一个需要每日打卡的自律工具。

用户应该把产品理解为：

- 一个组织工作、学习和个人目标的个人工作台。
- 一个能记住项目上下文、资料和过去决定的 AI 同事。
- 一个可以帮我收敛注意力、拆解计划并推进下一步的伙伴。
- 一个把想法、行动、产出、知识和复盘连接起来的外部大脑。

### 2.3 Success Criteria

核心体验成功时，用户会感受到：

- 我没有配置复杂系统，但它生成了一个能工作的空间。
- 我知道当前项目、今天最重要的下一步和为什么是它。
- 晚上回看时，系统说的是我真实发生过的事情。
- AI 的建议有依据，我可以接受、修改或拒绝。
- 我的软件、目录、插件和 Skill 有明确入口，并且知道它们能做什么。
- 重新打开产品时，不需要从头讲一遍自己。

量化体验指标：

- Morning 启动在 2 分钟内完成。
- Micro Reflection 在 20 秒内完成。
- Evening 复盘在 3 分钟内完成。
- 重要 AI 回复至少有 1 条可展开引用。
- 首屏不超过 5 个主要行动入口。

### 2.4 Established and Novel Patterns

采用熟悉模式：

- 小程序使用底部 TabBar；Web 使用桌面侧边栏。
- 列表、滑杆、底部 Sheet、确认按钮。
- 时间线和进度条。
- 聊天式 AI 对话。

创新点放在组合关系，而不是发明新控件：

- AI 洞察旁边直接显示来源 Memory。
- 任务推荐同时展示“为什么现在做它”。
- 微记录提交后先形成 Workspace Event，再异步形成可引用 Memory，并可关联任务或目标。
- 晨间与晚间流程共享同一条“今日上下文”。

### 2.5 Experience Mechanics

**Initiation**

- Dashboard 顶部显示今日状态。
- 推送进入 Morning 或 Evening。
- 全局右下角提供 Micro Capture。
- Global AI 入口可以从任意页面打开。

**Interaction**

- 用滑杆选择能量或完成度。
- 用一句话输入意图、事实或复盘。
- 用单选/多选确认 AI 建议。
- 用点击展开引用，不打断主流程。

**Feedback**

- 保存立即反馈，AI 内容以“正在整理”状态异步出现。
- 推荐任务显示来源：目标、截止时间、能量匹配或近期 Memory。
- 任务完成和复盘提交后，显示轻量确认，不使用强游戏化动画。

**Completion**

- Morning 完成后进入 Dashboard。
- Micro Capture 完成后回到原页面。
- Evening 完成后显示一句总结和明日调整。
- AI 对话结束后允许转为 Task、Goal、Memory 或 Knowledge Card。

---

## 3. Desired Emotional Response

### 3.1 Primary Emotional Goals

核心情绪：

1. **被理解**：系统能引用我的真实经历，而不是给泛泛建议。
2. **清醒**：我知道现在最重要的事情是什么。
3. **有掌控感**：AI 提供建议，但最终决定权在我。
4. **轻松**：记录成长不需要付出很高的心理成本。

### 3.2 Emotional Journey

| Stage | Desired Feeling | UX Support |
|-------|-----------------|------------|
| First open | 好奇、没有压力 | 先问一句现状，不先展示复杂配置 |
| Morning | 清醒、可开始 | 只突出能量、意图和 3 个推荐任务 |
| Micro capture | 顺手、被接住 | Bottom Sheet + 一句话输入 |
| Evening | 安心、诚实 | 不用评分羞辱用户，允许“今天很乱” |
| AI insight | 被理解、可信 | 显示引用和推理依据 |
| Missed day | 可回来、不内疚 | 不显示失败连击，不强制补打卡 |
| Return visit | 熟悉、连续 | 显示上次上下文和下一步 |

### 3.3 Micro-Emotions

需要建立：

- Trust over surprise
- Clarity over information density
- Agency over automation
- Encouragement over pressure
- Continuity over novelty

需要避免：

- 被监控感
- 被打分感
- 被 AI 说教
- 页面信息过载
- 错误后丢失输入

### 3.4 Emotional Design Principles

- 先承认事实，再给建议。
- 先显示用户输入，再显示 AI 推断。
- AI 语气使用“可能、看起来、基于这些记录”，避免绝对判断。
- 失败状态提供“继续记录”而不是“重新开始”。
- 成长感通过时间线和真实变化表达，不依赖徽章和连续签到。

---

## 4. Experience Architecture

### 4.1 Primary Navigation

Web 使用桌面工作台式侧边栏，信息架构优先服务“进入工作 -> 推进任务 -> 回看成长”。默认导航：

```
首页
工作台
待办
成长计划
知识学习
应用中心
扩展能力
洞察
我的
```

各入口职责：

- 首页：今日简报、进行中工作、下一步和常用入口。
- 工作台：Workspace、Project、目录/资源、最近产出和 Agent 工作流。
- 待办：今日、进行中、待处理、已完成、AI 推荐和 Focus。
- 成长计划：目标、周期计划、里程碑、Morning/Evening 和计划风险。
- 知识学习：知识卡片、学习队列、复习和目标关联。
- 应用中心：常用软件、网页、目录、连接器和最近使用。
- 扩展能力：Plugins、Skills、Agent 专家和自动化流程。
- 洞察：工作、任务、学习、目标和成长趋势分析。
- 我的：个人上下文、Memory 数据管理、提醒、权限、隐私和历史工具。

全局能力：

- Global AI Command Bar：顶部固定入口，Web 支持 Cmd/Ctrl+K。
- Micro Capture：浮动入口，用一句话记录进展、决策、情绪、灵感或学习事实。
- Quick Launch：首页和 Command Bar 可搜索 Workspace、App、Plugin、Skill、Goal、Task 和 Knowledge。
- Activity Center：展示 AI 运行、待确认副作用、提醒和需要用户处理的事项。

旧交易模块不再出现在默认导航，统一放入“我的 -> 历史工具”，并保留原数据和合规边界。

### 4.2 Page Tree

```
AI Personal Workspace
|
|-- 首页 Command Center
|   |-- 今日简报
|   |-- 进行中 Workspace / Project
|   |-- 今日待办和 AI 推荐
|   |-- 当前成长计划
|   |-- 知识学习队列
|   |-- 最近活动与产出
|   |-- Agent Insight / Next Action
|   |-- Quick Launch
|
|-- 工作台 Workspace
|   |-- Workspace 列表
|   |-- Project 列表 / 详情
|   |-- 目录与资源
|   |-- 最近产出
|   |-- Agent 工作流
|
|-- 待办 Task
|   |-- 今日任务
|   |-- 全部任务
|   |-- 任务详情
|   |-- Focus 执行态
|
|-- 成长计划 Growth
|   |-- 目标列表 / 详情
|   |-- 周期计划
|   |-- 里程碑
|   |-- Morning
|   |-- Evening
|   |-- 目标风险

|-- 知识学习 Knowledge
|   |-- 知识卡片
|   |-- 学习队列 / 复习
|   |-- 卡片详情
|   |-- AI 摘要和关联
|
|-- 应用中心 Apps
|   |-- 常用软件
|   |-- 网页 / 目录入口
|   |-- 连接器

|-- 扩展能力 Extensions
|   |-- Plugins
|   |-- Skills
|   |-- Agent 专家
|   |-- 自动化流程

|-- 洞察 Insights
|   |-- 工作分析
|   |-- 学习分析
|   |-- 成长趋势
|   |-- 周报 / 月报

|-- 我的 Mine
    |-- 个人上下文
    |-- Memory 与数据管理
    |-- 提醒、权限、隐私
    |-- 历史交易工具
|
|-- Global AI
    |-- 问答
    |-- 工作流规划
    |-- 工具 / Skill 调用
    |-- 引用展开
    |-- 行动转换
```

### 4.3 Dashboard Information Hierarchy

首页首屏按“当前状态 -> 继续工作 -> 下一步 -> 成长反馈 -> 能力入口”组织：

1. 顶部：工作空间切换、Command Bar、日期、Activity Center。
2. 今日简报：当前能量/状态、今日意图、AI 判断和明确的下一步。
3. 进行中：当前 Workspace / Project、最近产出、阻塞事项和继续工作入口。
4. 今日执行：最多 3 个 AI 推荐任务，加上全部待办入口和完成状态。
5. 成长计划：当前目标、周期计划进度、里程碑和偏离提醒。
6. 学习与知识：一个当前学习主题、待复习内容和与目标相关的知识。
7. 最近活动：工作、学习、任务完成和复盘事实的时间线。
8. 能力入口：常用软件、插件、Skill、Agent 专家和自动化快捷入口。

首页可以有多个入口，但首屏不能变成无序卡片墙。入口按“继续当前工作”和“开始新工作”分组；统计图默认收起到洞察，Memory 默认收起到我的。

---

## 5. Key User Journeys

### 5.1 First-Time Setup

```
欢迎
  -> 用一句话描述当前在做什么、想去哪里、卡在哪里
  -> AI 生成首个 Workspace、Project、Goal、Plan、Task 和学习入口
  -> 用户确认、修改一句话或拒绝某个建议
  -> 选择是否开启提醒
  -> 生成有内容的 Command Center
```

Design rules:

- 最多 3 个连续步骤。
- 允许跳过，不阻塞进入有基础入口的 Command Center。
- 不展示四个或更多传统资料字段作为主流程。
- AI 结构化结果以对象卡片和关系预览呈现，支持整体确认、单项拒绝和一句话纠正。
- 完成后必须至少生成一个 Workspace、一个 Project 或主题、一个 Goal/Plan、一个 Task 和一个 Knowledge/Learning 入口。

### 5.2 Morning Startup

```
Dashboard / Push
  -> 今日能量滑杆
  -> 今日意图一句话
  -> AI 推荐 3 个任务
  -> 用户接受/调整/跳过
  -> 完成
```

Success state:

- “今天先完成这 3 件事。”
- 显示一条“你还记得吗？”引用。
- 不显示超过 3 个推荐任务。

### 5.3 Micro Capture

```
点击浮动按钮
  -> 选择类型：进展 / 决策 / 情绪 / 灵感
  -> 选择状态或表情
  -> 输入一句话
  -> 可选关联任务/目标
  -> 保存并回到原页面
```

需要支持：

- 关闭后保留草稿。
- 网络异常时本地暂存，恢复后重试。
- 保存成功后不强制打开 Memory 详情。

### 5.4 Evening Reflection

```
Push / Dashboard
  -> 完成度滑杆
  -> 做对了什么
  -> 做错了什么
  -> 明日调整
  -> 今日情绪
  -> 提交
  -> AI 总结异步生成
```

缺席策略：

- 第二天仍可补记，但标记为“补充记录”。
- 不显示连续中断、失败或惩罚语言。

### 5.5 Create Goal

```
点击新增目标
  -> 输入自然语言目标
  -> AI 提取周期、维度、截止时间、衡量方式
  -> 用户确认
  -> AI 生成月/周拆解
  -> 用户选择接受部分或全部
```

目标详情优先展示：

- 目标为什么重要。
- 当前进度。
- 下一步里程碑。
- 最近关联任务。
- 最近相关 Memory。

### 5.6 Focus Task

```
任务列表
  -> 点击开始
  -> Focus 执行态
  -> 计时/暂停/完成
  -> 完成后一句话微复盘
```

Focus 执行态只保留：

- 当前任务。
- 剩余时间或已用时间。
- 暂停、完成、退出。
- 一个可选微记录入口。

### 5.7 Global AI

```
打开 AI
  -> 输入问题
  -> 显示处理中
  -> 输出回答
  -> 展开引用
  -> 转换为 Task / Goal / Memory / Knowledge
```

回答布局：

1. 直接回答。
2. 关键依据。
3. 建议行动。
4. 引用列表。

### 5.8 Open Workspace and Capability

```
打开首页
  -> 看到最近工作空间和进行中项目
  -> 选择继续工作 / 打开目录 / 启动软件 / 调用 Skill
  -> AI 显示将使用的能力、权限和预期结果
  -> 用户确认后执行
  -> 结果回到项目、任务、知识或 Memory
```

Workspace 页面优先展示：

- 当前项目和下一步任务。
- 最近产出、资料和目录入口。
- 关联成长目标和计划。
- 最近 Agent Run、待确认动作和阻塞事项。

Capability 页面优先展示：

- 软件入口和已连接应用。
- Plugin / Skill 的用途、来源、依赖和权限。
- 启用、停用、Workspace 范围和最近调用。
- AI 调用前的确认内容；高风险动作必须二次确认。

---

## 6. Defining Interaction: Context-to-Action

### 6.1 Interaction Definition

核心交互名称：**Context-to-Action**

用户说出一个模糊、自然的想法，系统把它变成一个可确认的行动，并保留来源。行动类型不只包括 Task/Goal，也可以是打开 Workspace、整理资源、保存 Knowledge、启动 App、调用 Skill 或生成工作流。

Example:

```
用户：最近 GEO 的事情有点散，我想先把首页改版做完。

AI：
理解为：
目标：完成 GEO 首页改版
建议下一步：整理首页改版范围并确定首屏信息层级
依据：你过去 3 天提到 GEO 4 次，且两次提到“首页信息太散”

[创建任务] [加入目标] [只记录] [修改]
```

当行动需要外部能力时，建议卡片必须额外展示：

- 将使用的 App / Plugin / Skill。
- 需要访问的 Workspace、目录或连接器范围。
- 预期产出和是否会产生外部副作用。
- [确认执行]、[只生成计划]、[拒绝] 三个动作。

### 6.2 Interaction States

| State | UI |
|-------|----|
| Empty | 输入框 placeholder 提示自然语言 |
| Typing | 保持输入，不自动弹全屏建议 |
| Thinking | 显示“正在整理你的上下文” |
| Suggested | 展示理解结果、依据、行动按钮 |
| Accepted | 显示创建结果和撤销 |
| Rejected | 保留原话为草稿，可重新编辑；不创建领域对象，除非用户选择“只记录” |
| Failed | 保存原始输入，提示稍后补全 |

### 6.3 Trust Rules

- 不把推断结果伪装成用户原话。
- 推断字段用“AI 理解”标签。
- 引用可展开，但默认只展示短摘录。
- 所有转换操作可撤销。

---

## 7. Design System Foundation

### 7.1 Design System Choice

采用 **Themeable Custom System**：

- 不引入大型视觉组件库作为主导。
- 使用自定义 design tokens + Taro primitives + 少量可复用业务组件。
- Web 和 miniapp 共享命名、语义和交互规则，但允许平台实现不同。

### 7.2 Rationale

- 需要在小程序限制下保持轻量。
- 产品需要独特的“个人指挥台”气质，不能直接套交易 App 或后台模板。
- 现有前端已经使用 Sass 和局部样式，渐进迁移成本最低。
- 高频流程需要稳定的 loading、empty、pending、error 状态。

### 7.3 Design Tokens

#### Color

| Token | Value | Usage |
|-------|-------|-------|
| canvas | #F7F8F6 | 页面背景 |
| surface | #FFFFFF | 内容表面 |
| ink | #1F2933 | 主文字 |
| muted | #6B7280 | 次要文字 |
| line | #E5E7EB | 分割线 |
| primary | #2D6A64 | 主行动、积极状态 |
| primary_soft | #E3F0ED | 主色浅底 |
| warm | #C8863A | 提醒、能量、进行中 |
| warm_soft | #FFF1DD | 暖色浅底 |
| blue | #4677C9 | 引用、知识、链接 |
| blue_soft | #EAF1FF | 蓝色浅底 |
| danger | #B95C5C | 阻塞、错误、需注意 |
| danger_soft | #FBEAEA | 错误浅底 |

禁止使用大面积渐变、紫色主色、深色交易行情主题作为新主界面默认背景。

#### Typography

- 页面标题：20-24px，600-700。
- 区块标题：15-17px，600。
- 正文：14-16px，400-500。
- 辅助信息：12-13px，400。
- 中文字体优先使用系统无衬线字体。
- 不使用负字距，不使用随 viewport 缩放字号。

#### Shape and Elevation

- 默认 radius: 6px。
- Repeated item card maximum radius: 8px。
- 主要页面区块不做浮动卡片，使用 unframed layout。
- 阴影只用于 bottom sheet、dialog 和需要层级的浮层。
- 不使用卡片套卡片。

#### Spacing

基础单位 4px：

```
xs 4
sm 8
md 12
lg 16
xl 24
2xl 32
```

### 7.4 Visual Direction

方向名称：**Calm Command Center**

视觉特征：

- 明亮、克制、低噪音。
- 大量留白，但信息密度足够扫描。
- 用 teal 表达“前进和稳定”，用 warm 表达“能量和注意”，用 blue 表达“知识和引用”。
- 关键数字和趋势清晰，但不使用金融行情式跳动。
- AI 内容以“对话 + 依据 + 行动”呈现，不使用神秘发光效果。

---

## 8. Component Strategy

### 8.1 Shared Primitives

- `PageShell`
- `SectionHeader`
- `IconButton`
- `TextButton`
- `PrimaryButton`
- `SecondaryButton`
- `BottomSheet`
- `ConfirmDialog`
- `SegmentedControl`
- `ProgressBar`
- `Slider`
- `StatusBadge`
- `SkeletonBlock`
- `EmptyState`
- `ErrorState`
- `WorkspaceSwitcher`
- `CommandBar`
- `ActivityCenter`
- `AppLauncher`
- `CapabilityStatus`
- `PermissionSummary`

### 8.2 Growth Components

- `TodayHeader`
- `EnergyMeter`
- `GoalProgress`
- `TaskRow`
- `TaskGroup`
- `MemoryQuote`
- `CitationList`
- `AgentInsight`
- `MicroCaptureSheet`
- `ReflectionComposer`
- `ReviewSummary`
- `MilestoneTimeline`
- `AbilityRadar`
- `MemoryHealth`
- `WorkspaceSummary`
- `ProjectRow`
- `PlanProgress`
- `LearningQueue`
- `RecentActivity`
- `CapabilityTile`
- `AgentRunStatus`

### 8.3 Component Rules

- 业务组件只负责展示和交互，不直接请求 API。
- 页面负责组合组件和处理页面级状态。
- 所有 AI 组件必须支持 `idle / loading / pending / success / error`。
- 所有可编辑 AI 结构化结果必须支持“修改后确认”。
- IconButton 必须提供可访问 label。
- 不用文字包裹圆角矩形来替代已有的熟悉图标。

---

## 9. Screen Specifications

### 9.1 Dashboard

Sections:

1. `WorkspaceHeader`：WorkspaceSwitcher、CommandBar、ActivityCenter。
2. `TodayBrief`：日期、当前状态、今日意图和 AI 下一步。
3. `ActiveWorkspace`：进行中 Project、最近产出、阻塞和继续工作。
4. `TodayTasks`：最多 3 个推荐任务、完成状态和全部待办入口。
5. `GrowthPlan`：当前目标、周期计划、里程碑和风险。
6. `LearningQueue`：当前学习主题、待复习内容和目标关联知识。
7. `RecentActivity`：工作、学习、任务和复盘事实。
8. `CapabilityLauncher`：常用 App、Plugin、Skill、Agent 专家和自动化。
9. `AgentInsight`：一条带引用的洞察和可确认行动。

States:

- New user: 显示 AI 生成 Workspace 的入口和最小能力目录。
- No workspace: 显示“建立我的工作台”，允许跳过后进入基础 Shell。
- No project: 显示“告诉 AI 你正在做什么”。
- No goal/plan: 从当前项目或自然语言输入生成目标和计划。
- No tasks: 显示“让 AI 根据当前工作安排今天”。
- AI pending: 保留占位，不阻塞页面。
- Offline: 展示本地数据和待同步标记。

首页第一屏必须让用户看见至少一项进行中内容和一项可执行动作；空状态必须提供创建动作和跳过入口，不能只给说明文字。

### 9.2 Morning

Layout:

```
Header: 早上好，今天是...
Energy: 1-10 slider
Intention: one-line input
Memory quote: recent cited memory
Recommended tasks: max 3
Footer: 开始今天
```

Interaction:

- 默认聚焦意图输入或能量滑杆，不同时弹两个输入控件。
- 推荐任务可单项取消。
- “调整任务”进入 Task 页面，不在当前流程展开复杂编辑。

### 9.3 Micro Capture Sheet

Layout:

```
标题：记下一点
Type: 进展 / 决策 / 情绪 / 灵感
State: icon + text options
Input: one sentence
Relation: optional task/goal
Action: 记录
```

Sheet 不超过屏幕高度 70%，键盘弹起时内容可滚动。

### 9.4 Evening

Layout:

```
Header: 今天怎么样
Completion slider
Three short prompts
Mood selector
AI summary pending/success
Action: 完成复盘
```

复盘页面不展示历史统计图，避免用户在收尾时被带入分析。

### 9.5 Goal

目标列表使用“当前 / 进行中 / 已归档”分组。

目标详情：

- 当前进度。
- 最近里程碑。
- 下一步任务。
- 相关 Memory。
- AI 风险提示。

目标树只在详情页展开，并默认只展开当前路径，避免无限层级。

### 9.6 Task

默认以“今天”视图打开：

- 上午 / 下午 / 晚上。
- 高能量 / 中能量 / 低能量。
- 每组最多显示 5 个任务。

任务行必须直接支持：

- 开始。
- 完成。
- 推迟。
- 查看关联目标。

### 9.7 Knowledge

默认入口是“捕获和回看”，不是分类管理：

- 最近保存。
- AI 已提炼。
- 与当前目标相关。
- 待复习。

知识卡片详情支持查看：

- 原始内容。
- AI 摘要。
- 关键概念。
- 关联 Memory。
- 关联目标和任务。

### 9.8 Global AI

Desktop:

- Web 使用 Cmd/Ctrl+K 打开。
- 右侧抽屉宽度 420-520px。

Mobile:

- 使用全屏页面或半屏 Sheet。
- 输入框固定在底部安全区域上方。

Response:

- AI answer。
- Citations。
- Suggested actions。
- Feedback。

### 9.9 Workspace and Capability

Workspace 页面：

- 左侧显示 Workspace / Project 列表，支持切换和最近访问。
- 中间显示项目状态、任务、目录/资源、最近产出和关联成长计划。
- 右侧显示 Agent Run、阻塞事项和下一步。

Capability 页面：

- 分为 Apps、Connections、Plugins、Skills、Agent Experts 四类。
- 每个能力显示用途、来源、状态、依赖、权限和 Workspace 范围。
- 启用/停用是明确的二元控件；高风险能力默认关闭。
- 安装或连接前展示权限摘要，完成后记录审计事件。

---

## 10. UX Patterns

### 10.1 Loading

- 首屏使用骨架块，不显示“正在加载全部系统”。
- AI 处理中显示具体动作，例如“正在整理今天的上下文”。
- 用户提交成功后立即显示已保存，AI 内容异步出现。

### 10.2 Empty

Empty state 结构：

1. 说明当前没有数据。
2. 解释为什么值得创建。
3. 一个明确的主行动。
4. 一个可跳过的次行动。

Example:

```
还没有今天的任务
从一个最重要的目标开始，AI 会帮你拆成下一步。
[建立今日计划]
```

### 10.3 Error

- 错误不覆盖用户输入。
- 给出“重试”和“先保存原文”两个选项。
- 网络问题不显示技术错误码。
- 后台 AI 失败展示“已保存，稍后补全”。

### 10.4 Destructive Actions

- 删除 Memory、目标、集成必须二次确认。
- 删除文案说明影响范围。
- 支持撤销或短暂恢复窗口。

### 10.5 Notifications

- 默认只开 Morning 和 Evening。
- 低能量提醒使用用户可关闭的轻提示。
- 不使用连续签到、逾期红点、未完成羞辱性文案驱动打开。

### 10.6 AI Trust

- 每条洞察都能查看依据。
- 依据太少时明确标记“样本不足”。
- AI 不自动执行创建任务、修改目标、发送报告等外部副作用。
- 用户对 AI 结论的反馈可在原位置完成。

---

## 11. Responsive and Accessibility

### 11.1 Miniapp

小程序只做 Web 工作台的伴随入口，不承担完整产品信息架构：

- 支持：一句话快速记录、Morning、Evening、提醒、今日待办和当前关键任务查看。
- 不支持：Workspace/Project 组织、目录和文件管理、完整 Goal/Plan 管理、知识库浏览、Insights、Apps/Extensions 管理和 Memory 数据管理。
- 当用户需要组织工作、查看完整计划、阅读知识或调用能力时，使用深链接打开 Web 对应页面，并保留当前 Workspace/Project 上下文。

Primary widths:

- 375px baseline.
- 390px common.
- 430px large.

Rules:

- Bottom safe area must be respected.
- Touch targets minimum 44px.
- Fixed bottom actions must not cover keyboard or content.
- Long Chinese text must wrap, never overflow a button or card.
- Lists use stable row heights or reserved space to avoid layout shift.

### 11.2 Web

Breakpoints:

- Mobile: < 768px.
- Tablet: 768-1023px.
- Desktop: >= 1024px.
- Content max width: 1200px.

Desktop layout:

- Left workspace navigation 240-264px, collapsible but not hidden on desktop.
- Main content uses a dense responsive grid, with the Command Center able to show work, growth, knowledge and capability sections without nested cards.
- Optional context rail 280-340px for Activity Center, citations and Agent Run status.
- Workspace and Project context remains visible when moving between Task, Knowledge and Growth pages.

### 11.3 Accessibility

- Text contrast meets WCAG AA target.
- Color is never the only status signal.
- Mood and energy options have text labels.
- Icon-only controls have accessible names and tooltips on Web.
- Keyboard users can reach Global AI, dialogs and all primary actions.
- Focus state must be visible.
- Reduced-motion preference disables nonessential transitions.
- Dynamic text respects platform font scaling.

---

## 12. UX-to-Architecture Mapping

| UX Requirement | Architecture Support |
|----------------|----------------------|
| Dashboard 2s | `dashboard_engine.py` precomputed today context |
| Workspace context | `workspace_engine.py` + `project_context` in Dashboard response |
| App / Plugin / Skill entry | `capability_registry` + permission summary + `agent_runs` |
| AI quote | `MemoryQuote` + citations contract |
| Micro Capture | `api/reflections.py` + Workspace Event + async Memory projection |
| AI pending | `outbox_events` + Arq async jobs |
| Offline draft | client draft store + idempotent retry |
| Goal/Task relation | `goal_id`, `memory_entry_id`, linked actions |
| Privacy | `privacy_guard` + scope filters |
| Legacy trading | hidden legacy entry + separate compliance path |

---

## 13. UX Acceptance Checklist

### Daily Core Loop

- [ ] Morning can be completed in 2 minutes.
- [ ] Micro Capture can be completed in 20 seconds.
- [ ] Evening can be completed in 3 minutes.
- [ ] User can skip optional text without blocking.
- [ ] Every saved action has visible saved state.

### AI Trust

- [ ] AI insights show citations.
- [ ] AI assumptions are editable.
- [ ] User can reject or modify recommendations.
- [ ] AI failure never discards user input.
- [ ] No hidden side-effect actions.

### Visual and Interaction

- [ ] New Dashboard no longer looks like a trading dashboard.
- [ ] Default Web navigation is Home / Workspace / Task / Growth / Knowledge / Apps / Extensions / Insights / Mine.
- [ ] Home shows an active Workspace or Project, a next action, and explicit work/growth/knowledge/capability entries.
- [ ] Onboarding creates an initial Workspace, Project/Theme, Goal/Plan, Task and Learning entry without a multi-field setup form.
- [ ] App, Plugin and Skill cards show source, permission, dependency and enabled state.
- [ ] Primary surfaces do not use card-in-card composition.
- [ ] Text and controls fit at 375px width.
- [ ] Empty, loading, pending, error and offline states exist.

### Privacy

- [ ] Deleted Memory disappears from retrieval immediately.
- [ ] External integration status is visible.
- [ ] Export and delete actions are discoverable under Mine.
- [ ] Legacy financial details do not appear in generic AI by default.

---

## 14. Next Design Deliverables

1. Create clickable Web prototype for Workspace Shell + Command Center + Onboarding result.
2. Define Workspace / Project / Task / Growth Plan / Knowledge / Capability fixtures for populated and empty states.
3. Define API-to-screen state fixtures for loading, pending, empty, error, offline and permission confirmation.
4. Implement Web shared components before duplicating any lightweight miniapp surfaces.
5. Create the revised epics and stories from the UX acceptance checklist.

---

**Created using BMAD Method v6**
