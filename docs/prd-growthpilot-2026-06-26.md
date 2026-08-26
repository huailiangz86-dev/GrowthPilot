# Product Requirements Document: GrowthPilot v1

> **Historical reference:** This v1 PRD is superseded by `docs/README.md` and the active v3.1 Workspace-first PRD. Keep it for product evolution history only; do not use it as implementation authority.

**Date:** 2026-06-26
**Author:** Zhang
**Version:** 1.0
**Project Type:** AI SaaS (微信小程序)
**Project Level:** Level 3
**Status:** Draft

---

## Executive Summary

GrowthPilot（成长领航）是一个 AI 个人成长教练平台。v1 聚焦 **AI 交易教练** — 通过结构化标签记录交易、灵活复盘、AI 模式发现，帮助交易者发现"哪些模式赚钱、哪些模式亏钱"。

**愿景路线：**
- Phase 1 (v1): AI 交易教练 — 交易记录 + 复盘 + 模式发现
- Phase 2 (v2): + 自我认知 + 个人知识库
- Phase 3 (v3): + 职业规划 + 行业推荐
- Phase 4 (v4): + 招聘对接 + 企业广告

v1 的架构设计为**模块化 + 统一复盘引擎**，确保 v2+ 扩展时不重写核心。

**Slogan:** 每一次交易，都在暴露你的模式。

---

## Product Goals

### Business Objectives

1. **OBJ-1:** 验证"标签式交易记录 + AI 模式发现"的产品价值
2. **OBJ-2:** 获取 100 个注册用户，30 个持续活跃用户
3. **OBJ-3:** 验证 C 端订阅付费意愿（内测后转化）

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| 注册用户 | 100+ | 小程序后台 |
| 周活跃用户 | 30+ | 7 天内有记录/复盘 |
| 首次"震撼时刻" | 10 笔交易内 | 用户首次看到标签统计 |
| 复盘完成率 | ≥ 40% | 有交易记录的用户中完成复盘的比例 |
| 内测→付费转化 | ≥ 10% | 内测结束后愿意付费的用户 |

---

## User Personas

### Persona 1: 小李 — A 股短线交易者

- **年龄：** 25-35
- **交易频率：** 每周 5-15 次
- **痛点：** 反复犯同样错误，不知道自己到底哪种操作赚钱哪种亏钱
- **动机：** "如果能看到我抄底的胜率只有 28%，我以后就不抄底了"
- **关键场景：** 交易后立即记录 → 看标签统计 → 被数据震撼 → 调整策略

### Persona 2: 老王 — 加密货币波段交易者

- **年龄：** 28-40
- **交易频率：** 每周 3-8 次
- **痛点：** 情绪化交易严重，焦虑时加仓总亏
- **动机：** "我想知道自己在什么情绪下做决策最好"
- **关键场景：** 记录交易+情绪 → AI 发现"焦虑时亏损 +42%" → 建立情绪管理意识

### Persona 3: 阿华 — 美股/港股中长线投资者

- **年龄：** 30-45
- **交易频率：** 每月 3-10 次
- **痛点：** 持仓时间长，忘了当初为什么买
- **动机：** "我想系统化记录每笔交易的逻辑，年底复盘"
- **关键场景：** 买入时记录原因 → 卖出时记录原因 → 月度/年度 AI 总结

---

## Functional Requirements

### FR-001: 用户注册与认证

**Priority:** Must Have

**Description:**
微信小程序一键登录，首次登录自动创建账户。

**Acceptance Criteria:**
- [ ] 微信授权登录 < 3 秒
- [ ] 首次登录自动创建用户，进入引导页
- [ ] 引导页：选择主要交易市场（A 股/港股/美股/加密货币/多选）

---

### FR-002: 交易记录（结构化标签）

**Priority:** Must Have

**Description:**
用户通过手动输入、截图导入或文件导入创建交易记录。买入原因和卖出原因使用**预设标签多选**（非自由文本），情绪使用标签单选。

**Acceptance Criteria:**
- [ ] 字段：标的名称/代码、买入价格、卖出价格（可后填）、数量、买入时间、卖出时间（可后填）
- [ ] 盈亏自动计算（卖出价 - 买入价）× 数量
- [ ] **买入原因标签**（多选，必填）：突破前高 / 超跌反弹 / 消息刺激 / 抄底 / 趋势突破 / 均线信号 / 基本面 / 自定义
- [ ] **卖出原因标签**（多选，卖出时填）：止盈 / 止损 / 破均线 / 情绪卖出 / 尾盘卖出 / 目标达到 / 自定义
- [ ] **情绪标签**（单选）：兴奋 / 焦虑 / 冲动 / 害怕 / 平静
- [ ] 支持自定义标签（用户可新增买入/卖出原因标签）
- [ ] 标的支持模糊搜索

---

### FR-003: 截图导入交易

**Priority:** Should Have

**Description:**
用户上传券商/交易所截图，OCR 自动识别交易信息，用户确认后保存。

**Acceptance Criteria:**
- [ ] 支持拍照和相册选择
- [ ] OCR 识别标的、价格、数量、时间
- [ ] 识别结果预填表单，用户确认/修改
- [ ] 识别失败降级为手动输入

---

### FR-004: 文件批量导入

**Priority:** Could Have

**Description:**
导入券商对账单（CSV/Excel），批量创建交易记录。

**Acceptance Criteria:**
- [ ] 支持 CSV、Excel 格式
- [ ] 自动映射字段（标的/价格/时间等）
- [ ] 预览导入结果，用户确认后批量创建
- [ ] 导入后用户补填买入/卖出原因标签

---

### FR-005: 交易管理

**Priority:** Must Have

**Description:**
查看、编辑、删除交易记录。支持筛选和搜索。

**Acceptance Criteria:**
- [ ] 历史交易列表（按时间倒序）
- [ ] 按标的/买入原因/卖出原因/情绪/日期范围筛选
- [ ] 搜索标的名称
- [ ] 编辑已有交易（补填卖出信息/修改标签）
- [ ] 删除交易（软删除）
- [ ] 买入卖出自动配对（同标的 + 时间顺序）

---

### FR-006: 灵活复盘系统

**Priority:** Must Have

**Description:**
通用复盘引擎，支持多种触发方式和模板。v1 只有交易复盘模板，架构支持扩展。

**Acceptance Criteria:**
- [ ] 复盘三问："今天做对了什么？""今天做错了什么？""明天准备怎么做？"
- [ ] 触发方式可选：交易后自动提醒 / 每日定时提醒 / 手动触发 / 关闭提醒
- [ ] 用户可在设置中选择复盘节奏
- [ ] 支持文字输入、截图附件、语音转文字
- [ ] 复盘记录可打标签
- [ ] 复盘历史可查看、搜索

**架构预留：** 复盘引擎与"交易"解耦，未来可加载"项目复盘""学习复盘"等模板。

---

### FR-007: AI 复盘分析

**Priority:** Must Have

**Description:**
AI 基于用户的交易记录和复盘日记，生成个性化分析和建议。以对话方式引导，而非报告。

**Acceptance Criteria:**
- [ ] AI 主动发起复盘对话："今天你的 XX 交易挺有意思，想聊聊吗？"
- [ ] 当有 20+ 笔交易时，AI 引用个人历史模式
- [ ] AI 生成周/月总结报告（最近 N 笔交易分析）
- [ ] 每条 AI 回复附带"本内容不构成投资建议"免责声明
- [ ] AI 对话支持多轮追问
- [ ] Prompt 从 YAML 加载，支持迭代

**Dependencies:** FR-002

---

### FR-008: 标签统计（"震撼时刻"）

**Priority:** Must Have

**Description:**
按买入原因标签、卖出原因标签、情绪标签分组统计胜率/盈亏。这是产品最核心的"aha moment"。

**Acceptance Criteria:**
- [ ] **买入原因统计**：每个标签的交易次数、胜率、平均盈亏。示例："趋势突破 25 次 胜率 72%""抄底 30 次 胜率 28%"
- [ ] **卖出原因统计**：同上
- [ ] **情绪统计**：每种情绪下的胜率和平均盈亏。示例："焦虑时平均亏损 +42%"
- [ ] **标签交叉分析**：买入原因 × 情绪 的胜率矩阵。示例："突破 + 平静 = 82%""抄底 + 冲动 = 12%"
- [ ] 最少 10 笔已完成交易后解锁
- [ ] 数据可视化（柱状图/热力图）

**Dependencies:** FR-002, FR-005

---

### FR-009: AI 模式发现

**Priority:** Must Have

**Description:**
AI 从交易数据中自动发现用户不知道的行为模式。这是产品最值钱的功能。

**Acceptance Criteria:**
- [ ] **时间模式**："下午 2 点后交易亏损率 65%""周五交易平均亏损 +80%"
- [ ] **持仓模式**："持仓 >3 天收益 +110%""当天卖出胜率 35%"
- [ ] **连续行为模式**："连亏 3 笔后加仓 → 胜率 18%"
- [ ] **情绪行为模式**："焦虑时平均亏损增加 42%"
- [ ] 模式发现结果以卡片形式展示
- [ ] 每个发现附带数据支撑（样本量/统计显著性提示）
- [ ] 最少 30 笔交易后开始发现模式

**Dependencies:** FR-002, FR-008

---

### FR-010: 统计中心

**Priority:** Must Have

**Description:**
全面的交易统计仪表盘。

**Acceptance Criteria:**
- [ ] **收益曲线**：日/周/月收益走势图
- [ ] **核心指标**：胜率、盈亏比、平均盈利、平均亏损、最大回撤
- [ ] **标签分析**：复用 FR-008 的标签统计
- [ ] **情绪分析**：复用 FR-008 的情绪统计
- [ ] 时间范围选择：最近 30 天 / 90 天 / 全部
- [ ] 10 笔已完成交易后解锁

---

### FR-011: 首页仪表盘

**Priority:** Must Have

**Description:**
首页展示今日关键数据和 AI 建议，以及复盘任务状态。

**Acceptance Criteria:**
- [ ] 今日数据：今日交易笔数、今日盈亏、本月收益、胜率、连续盈利/亏损天数
- [ ] AI 建议卡片：基于最新模式发现的一条建议（如"你最近抄底胜率很低，考虑减少"）
- [ ] 复盘任务状态（可选开启）：□ 添加交易记录 □ 完成复盘 □ 查看 AI 分析
- [ ] 快捷入口：新建交易、开始复盘

---

### FR-012: 多市场支持

**Priority:** Must Have

**Description:**
支持 A 股、港股、美股、加密货币。每个市场独立统计。

**Acceptance Criteria:**
- [ ] 注册时选择主要市场（可多选）
- [ ] 新建交易时选择市场
- [ ] 统计中心可按市场筛选
- [ ] 标的搜索支持多市场
- [ ] 不同市场使用不同币种显示

---

### FR-013: 时间戳存证

**Priority:** Must Have

**Description:**
每条交易记录创建时自动生成 hash 存证。

**Acceptance Criteria:**
- [ ] 创建时生成 SHA-256 hash（内容+时间戳+密钥）
- [ ] 存证不可修改
- [ ] 记录详情页可查看存证信息

---

### FR-014: 内测机制

**Priority:** Must Have

**Description:**
前 200 名用户享受免费使用，页面展示未来定价信息。

**Acceptance Criteria:**
- [ ] 注册时自动判断是否在前 200 名
- [ ] 内测用户享受全部功能
- [ ] 页面展示："内测结束后将采用订阅制，当前用户享受终身优惠"
- [ ] 记录内测用户列表，供后续转化使用

---

### FR-015: 设置与个人中心

**Priority:** Must Have

**Description:**
用户设置和账户管理。

**Acceptance Criteria:**
- [ ] 修改市场偏好
- [ ] 复盘提醒设置（频率/时间/开关）
- [ ] 自定义标签管理（增删买入/卖出原因标签）
- [ ] 数据导出（CSV）
- [ ] 会员状态展示
- [ ] 关于/反馈

---

### FR-016: 模式提醒（实时）

**Priority:** Should Have

**Description:**
当用户即将重复已知亏损模式时，推送提醒。

**Acceptance Criteria:**
- [ ] 用户新建交易时，如果买入原因标签匹配已知低胜率模式，弹出提醒
- [ ] 示例："你选择了'抄底'，历史数据显示你的抄底胜率仅 28%，确定继续？"
- [ ] 用户可选择忽略或取消
- [ ] 可在设置中开关

**Dependencies:** FR-009

---

### FR-017: 正面模式强化

**Priority:** Should Have

**Description:**
当用户使用高胜率模式时，给予正面反馈。

**Acceptance Criteria:**
- [ ] 交易完成后，如果匹配已知高胜率模式，展示鼓励卡片
- [ ] 示例："你最近 10 笔趋势突破交易胜率 78%，继续保持！"

**Dependencies:** FR-009

---

### FR-018: 周/月 AI 报告

**Priority:** Should Have

**Description:**
定期生成 AI 分析报告，可分享。

**Acceptance Criteria:**
- [ ] 每周/每月自动生成报告（Arq 定时任务）
- [ ] 内容：期间交易统计 + 模式发现 + 改进建议
- [ ] 可保存为图片分享

**Dependencies:** FR-009

---

## Non-Functional Requirements

### NFR-001: 性能

**Priority:** Must Have

**Description:** 核心操作流畅，AI 分析异步不阻塞。

**Acceptance Criteria:**
- [ ] 交易记录提交 ≤ 1 秒
- [ ] 统计页面加载 ≤ 2 秒
- [ ] AI 模式发现首次生成 ≤ 10 秒（异步）
- [ ] API p95 ≤ 500ms

---

### NFR-002: 安全

**Priority:** Must Have

**Description:** 交易数据加密，用户隔离。

**Acceptance Criteria:**
- [ ] 价格/数量字段 AES-256 加密存储
- [ ] JWT 认证，7 天过期
- [ ] 所有查询 user_id 强制过滤
- [ ] HTTPS 传输

---

### NFR-003: 合规

**Priority:** Must Have

**Description:** AI 输出不含投资建议。

**Acceptance Criteria:**
- [ ] AI 不推荐具体标的、不预测价格
- [ ] 所有 AI 输出附带免责声明
- [ ] Compliance Guard 后置过滤

---

### NFR-004: 可扩展性（模块化架构）

**Priority:** Must Have

**Description:** 架构设计必须支持 v2+ 扩展（职业/技能/知识模块），v1 不实现但不能阻挡。

**Acceptance Criteria:**
- [ ] 复盘引擎与"交易"场景解耦（模板化）
- [ ] 标签系统通用化（不硬编码为交易标签）
- [ ] 数据模型支持多种"记录类型"（交易/项目/学习）
- [ ] AI 分析框架支持多种数据源

---

### NFR-005: 可用性

**Priority:** Must Have

**Acceptance Criteria:**
- [ ] 可用性 ≥ 99.5%
- [ ] 数据库每日备份
- [ ] LLM 主备降级

---

### NFR-006: 用户体验

**Priority:** Must Have

**Acceptance Criteria:**
- [ ] 微信小程序原生体验
- [ ] 骨架屏加载
- [ ] 深色模式
- [ ] 空状态引导

---

### NFR-007: AI 成本

**Priority:** Must Have

**Acceptance Criteria:**
- [ ] 单次 AI 分析 ≤ ¥0.10
- [ ] 内测期月均 AI 成本 ≤ ¥500（100 用户）
- [ ] LLM 调用全部记录到 llm_calls 表

---

## Epics

### EPIC-001: 用户系统

**Description:** 注册/登录/设置/内测机制

**Functional Requirements:** FR-001, FR-014, FR-015

**Story Count Estimate:** 4-5

**Priority:** Must Have

---

### EPIC-002: 交易记录核心

**Description:** 结构化标签交易记录 — 产品的数据入口

**Functional Requirements:** FR-002, FR-003, FR-004, FR-005, FR-012, FR-013

**Story Count Estimate:** 7-10

**Priority:** Must Have

**Business Value:** 标签式记录是"震撼统计"的数据基础。没有结构化数据，AI 模式发现无从谈起。

---

### EPIC-003: 复盘系统

**Description:** 通用复盘引擎（v1 加载交易模板）

**Functional Requirements:** FR-006, FR-007

**Story Count Estimate:** 5-7

**Priority:** Must Have

**Business Value:** 复盘是用户留存的核心习惯。对话式复盘把"必须做"变成"想聊聊"。

---

### EPIC-004: 统计与 AI 模式发现

**Description:** 标签统计（震撼时刻）+ AI 模式发现（最值钱）+ 统计中心

**Functional Requirements:** FR-008, FR-009, FR-010, FR-011

**Story Count Estimate:** 6-9

**Priority:** Must Have

**Business Value:** "你的抄底胜率只有 28%"— 这个瞬间决定了用户是否留下。

---

### EPIC-005: 智能提醒与报告

**Description:** 模式提醒、正面强化、周月报告

**Functional Requirements:** FR-016, FR-017, FR-018

**Story Count Estimate:** 4-5

**Priority:** Should Have

---

## User Stories (High-Level)

### EPIC-001
- As a 交易者, I want to 微信一键登录 so that 我能立即开始使用
- As a 内测用户, I want to 知道我享受免费权益 so that 我有动力持续使用

### EPIC-002
- As a 交易者, I want to 用标签记录买入原因 so that 系统能统计每种策略的胜率
- As a 交易者, I want to 上传截图自动识别 so that 记录交易更快
- As a 交易者, I want to 自定义标签 so that 我能用自己的策略分类

### EPIC-003
- As a 交易者, I want to 交易后 AI 问我"想聊聊吗" so that 复盘像对话而非填表
- As a 交易者, I want to 选择自己的复盘节奏 so that 复盘不变成负担

### EPIC-004
- As a 交易者, I want to 看到每个标签的胜率统计 so that 我第一次知道哪种策略在亏钱
- As a 交易者, I want to AI 发现我不知道的模式 so that 我能改掉亏钱习惯
- As a 交易者, I want to 首页看到今日盈亏和 AI 建议 so that 我每天打开都有价值

### EPIC-005
- As a 交易者, I want to 新建交易时被提醒低胜率模式 so that 我不重复犯错

---

## User Flows

### Flow 1: 首次使用

```
微信登录 → 选择交易市场(A股/美股/加密...)
→ 引导记录第一笔交易(标签式)
→ 首页(今日数据 + "继续记录解锁 AI 分析")
```

### Flow 2: 日常交易记录

```
首页 → 点击"新建交易"
→ 输入标的(搜索) + 价格 + 数量
→ 选择买入原因标签(多选: 突破/抄底/趋势...)
→ 选择情绪标签(单选: 平静/焦虑/兴奋...)
→ 提交 → [如果开启复盘提醒] AI: "想聊聊这笔交易吗？"
→ 复盘对话 → 回到首页(今日盈亏更新)
```

### Flow 3: 震撼时刻

```
累计 10 笔交易 → 统计页解锁
→ 标签统计: "趋势突破 胜率72%" vs "抄底 胜率28%"
→ 用户震撼: "原来我不是不会交易，是某些模式一直在亏"
→ 持续记录 → 30 笔后解锁 AI 模式发现
→ "下午2点后交易亏损率65%" → 更深的震撼
```

---

## Dependencies

### External

| 依赖 | 用途 | 替代 |
|------|------|------|
| 微信小程序 SDK | 登录/分享 | 无 |
| LLM (Qwen/DeepSeek) | AI 分析 | 互为备份 |
| 股票数据源 | 标的搜索 | AKShare/开源 |
| OCR 服务 | 截图识别 | 腾讯/百度 OCR |
| 阿里云 OSS | 截图存储 | — |

---

## Assumptions

1. 交易者愿意用标签而非自由文本记录买入原因
2. "标签胜率统计"足够震撼，能驱动用户持续记录
3. 10 笔交易足够产生有意义的标签统计
4. 内测 200 人免费可以吸引足够的种子用户
5. Qwen API 足够支撑 100 用户的 AI 分析需求

---

## Out of Scope (v1)

1. **职业规划** — Phase 3
2. **招聘对接** — Phase 4
3. **技能图谱** — Phase 2
4. **个人知识库全功能** — Phase 2（v1 只有复盘记录的搜索）
5. **企业广告** — Phase 4
6. **Web/App 版** — v1 只做微信小程序
7. **付费订阅系统** — 内测阶段不收费
8. **交易回放** — 暂不做
9. **社交功能** — 暂不做

---

## Open Questions

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | 加密货币标的数据源用哪个？ | FR-012 | High |
| 2 | 内测期结束的标准是什么？（时间/用户数/功能完善度？） | FR-014 | Medium |
| 3 | 自定义标签是否需要审核机制？ | FR-002 | Low |
| 4 | 文件导入支持哪些券商格式？ | FR-004 | Low (Could Have) |

---

## Appendix A: Traceability Matrix

| Epic ID | Epic Name | FRs | Story Estimate |
|---------|-----------|-----|----------------|
| EPIC-001 | 用户系统 | FR-001, FR-014, FR-015 | 4-5 |
| EPIC-002 | 交易记录核心 | FR-002, FR-003, FR-004, FR-005, FR-012, FR-013 | 7-10 |
| EPIC-003 | 复盘系统 | FR-006, FR-007 | 5-7 |
| EPIC-004 | 统计与 AI 模式发现 | FR-008, FR-009, FR-010, FR-011 | 6-9 |
| EPIC-005 | 智能提醒与报告 | FR-016, FR-017, FR-018 | 4-5 |
| **Total** | | **18 FRs** | **26-36 stories** |

## Appendix B: Prioritization Summary

| Priority | FRs | NFRs |
|----------|-----|------|
| **Must Have** | 13 (FR-001~002, 005~013, 014~015) | 7 (NFR-001~007) |
| **Should Have** | 3 (FR-003, 016, 017, 018) | 0 |
| **Could Have** | 1 (FR-004) | 0 |

## Appendix C: v1 vs EdgeBook 对比

| 维度 | EdgeBook (旧) | GrowthPilot v1 (新) |
|------|-------------|-------------------|
| 记录方式 | 自由文本理由 | **标签多选**（核心差异）|
| AI 重心 | 苏格拉底对话 | **模式发现**（标签统计+时间/持仓/情绪模式）|
| 复盘方式 | 交易后自动 | **灵活触发**（交易后/每日/手动）|
| 首页 | 时间线 | **仪表盘**（今日数据+AI 建议+任务）|
| 付费 | MVP 即收费 ¥79 | **内测免费 200 人** → 39/99 |
| 市场 | A 股+港股 | **A 股+港股+美股+加密** |
| 人格系统 | 核心功能 | 降级为 Phase 2 |
| 经验市场 | Phase 1 做骨架 | 移除 |
| 架构 | 交易专用 | **模块化通用**（复盘引擎+场景模板）|

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**
