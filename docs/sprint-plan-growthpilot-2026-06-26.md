# Sprint Plan: GrowthPilot v1

> **Historical reference:** This v1 sprint plan is superseded by `docs/README.md` and the active v3.1 Workspace-first sprint plan. Keep it for delivery history only.

**Date:** 2026-06-26
**Project Level:** Level 3
**Total Stories:** 28
**Total Points:** 118
**Planned Sprints:** 4 (4 weeks)
**Sprint Length:** 1 week
**Capacity:** 30 pts/sprint

---

## Executive Summary

GrowthPilot v1 拆分为 4 个 1-week Sprint。Sprint 1-2 交付核心闭环（能记录+能复盘+能看标签统计），Sprint 3 交付 AI 模式发现（震撼时刻），Sprint 4 交付增长功能（提醒+报告+打磨）。

---

## Story Inventory

### Infra Stories

#### STORY-000: 项目基础设施 (8 pts)

**Epic:** Infra | **Priority:** Must

**AC:**
- [ ] 后端：FastAPI + SQLAlchemy async + Pydantic v2 + Arq + pyproject.toml
- [ ] 前端：Taro 4 (React) + TS（用 CLI 创建标准项目）
- [ ] PG：growthpilot_dev/test + 初始 migration（users + records + reviews + tag_definitions + pattern_discoveries + llm_calls）
- [ ] Redis：db 6 dev / db 7 test
- [ ] .claude/ 基础设施（CLAUDE.md + hooks + skills）
- [ ] LLM 层：llm_service + prompt_loader + compliance_guard
- [ ] deploy.sh + .env.example

**Notes:** 从 EdgeBook 移植核心基础设施，调整为新的数据模型。records 通用表 + JSONB tags + GIN 索引是关键。

---

### EPIC-001: 用户系统

#### STORY-001: 微信登录 + 引导页 (5 pts)

**AC:**
- [ ] wx.login → JWT
- [ ] 引导页：选择交易市场（A股/港股/美股/加密，多选）
- [ ] 选择复盘节奏（交易后/每日/手动）
- [ ] 内测用户标记（前 200 名 is_beta_user=true）

#### STORY-002: 设置 + 个人中心 (3 pts)

**AC:**
- [ ] 修改市场偏好、复盘节奏、复盘提醒时间
- [ ] 自定义标签管理入口
- [ ] 内测状态展示 + 未来定价信息
- [ ] 数据导出（CSV）
- [ ] GET/PATCH /api/v1/auth/me

---

### EPIC-002: 交易记录核心

#### STORY-003: 通用记录引擎 + 标签引擎 (8 pts)

**AC:**
- [ ] records 通用表 CRUD（scene + record_type + content JSONB + tags JSONB）
- [ ] tag_definitions 表 CRUD（系统预设 + 用户自定义）
- [ ] 预设标签 seed：buy_reason(8个) + sell_reason(7个) + emotion(5个)
- [ ] POST/GET/PATCH/DELETE /api/v1/records
- [ ] GET/POST/DELETE /api/v1/tags
- [ ] tags GIN 索引验证查询性能

**Notes:** 这是整个架构的基石。通用引擎，场景无关。

#### STORY-004: 交易场景插件 — 记录 (8 pts)

**AC:**
- [ ] 交易 content 验证（symbol/price/quantity/direction/market）
- [ ] 价格/数量 AES-256 加密
- [ ] 盈亏自动计算（买入+卖出配对后）
- [ ] 买入原因标签多选（必填）
- [ ] 情绪标签单选
- [ ] 时间戳 hash 存证
- [ ] 标的模糊搜索（多市场：A股/港股/美股/加密）
- [ ] 前端：交易记录表单（标签选择器 + 价格输入 + 搜索）

#### STORY-005: 交易管理 — 列表/编辑/配对 (5 pts)

**AC:**
- [ ] 历史交易列表（按时间倒序 + 分页）
- [ ] 按标的/买入原因/卖出原因/情绪/日期筛选
- [ ] 编辑交易（补填卖出信息 + 修改标签）
- [ ] 软删除
- [ ] 买卖自动配对（同标的 + 时间顺序）

#### STORY-006: 截图 OCR 导入 (3 pts)

**AC:**
- [ ] 上传截图 → OCR → 预填表单
- [ ] 识别失败降级手动输入
- [ ] POST /api/v1/trading/ocr

**Priority:** Should Have

#### STORY-007: 多市场标的数据 (3 pts)

**AC:**
- [ ] A 股 + 港股（AKShare）
- [ ] 美股（Yahoo Finance / 开源 API）
- [ ] 加密货币（CoinGecko 免费 API）
- [ ] Redis 缓存 + 每日更新
- [ ] 拼音/代码/名称模糊搜索

---

### EPIC-003: 复盘系统

#### STORY-008: 通用复盘引擎 (5 pts)

**AC:**
- [ ] reviews 表 CRUD（scene + template + did_right/did_wrong/next_plan）
- [ ] 模板系统（v1 只有 trading_daily 和 trading_post 两个模板）
- [ ] 支持文字 + 截图附件 + 语音转文字
- [ ] 复盘历史列表 + 搜索
- [ ] POST/GET /api/v1/reviews

#### STORY-009: 灵活复盘触发 (3 pts)

**AC:**
- [ ] 交易后自动提醒（创建交易记录后推送）
- [ ] 每日定时提醒（用户设置时间，可关）
- [ ] 手动触发（随时可以开始复盘）
- [ ] 前端复盘页面（三问 + 输入 + 附件）

#### STORY-010: AI 复盘对话 (5 pts)

**AC:**
- [ ] AI 主动发起："今天你的 XX 交易挺有意思，想聊聊吗？"
- [ ] 多轮对话（引用用户历史交易模式）
- [ ] 免责声明自动追加
- [ ] Prompt YAML 管理
- [ ] compliance_guard 过滤
- [ ] Arq 异步 + 轮询获取结果

---

### EPIC-004: 统计与 AI 模式发现

#### STORY-011: 标签统计 — "震撼时刻" (8 pts)

**AC:**
- [ ] 买入原因标签统计：每个标签的交易次数/胜率/平均盈亏
- [ ] 卖出原因标签统计：同上
- [ ] 情绪标签统计：每种情绪的胜率/平均盈亏
- [ ] **标签交叉分析**：buy_reason × emotion 胜率矩阵（热力图）
- [ ] 最少 10 笔已完成交易解锁
- [ ] Redis 缓存（5min TTL）
- [ ] GET /api/v1/stats/tags, /api/v1/stats/tags/cross
- [ ] 前端：柱状图 + 热力图

**Notes:** 这是产品的"aha moment"。SQL 实现，不用 LLM。

#### STORY-012: 统计中心 (5 pts)

**AC:**
- [ ] 核心指标：胜率/盈亏比/平均盈利/平均亏损/最大回撤
- [ ] 收益曲线（日/周/月）
- [ ] 时间范围选择
- [ ] GET /api/v1/stats/overview, /api/v1/stats/pnl-curve
- [ ] 前端：折线图 + 数字卡片

#### STORY-013: AI 模式发现引擎 (8 pts)

**AC:**
- [ ] **时间模式**："下午2点后交易亏损率65%"（SQL EXTRACT）
- [ ] **持仓模式**："持仓>3天收益+110%"（SQL 日期差）
- [ ] **连续模式**："连亏3笔后加仓胜率18%"（SQL 窗口函数+Python）
- [ ] **情绪行为模式**："焦虑时亏损+42%"（SQL WHERE）
- [ ] LLM 将统计结果转为用户友好的自然语言描述
- [ ] 结果存 pattern_discoveries 表
- [ ] 30 笔交易后触发（Arq 异步）
- [ ] GET /api/v1/patterns
- [ ] 前端：发现卡片列表

#### STORY-014: 首页仪表盘 (5 pts)

**AC:**
- [ ] 今日数据：今日交易笔数/今日盈亏/本月收益/胜率/连续盈亏天数
- [ ] AI 建议卡片（最新模式发现的一条）
- [ ] 复盘任务状态（可选开启：□记录 □复盘 □查看AI）
- [ ] 快捷入口：新建交易、开始复盘
- [ ] GET /api/v1/dashboard
- [ ] 前端首页

---

### EPIC-005: 智能提醒与报告

#### STORY-015: 模式提醒（实时）(3 pts)

**AC:**
- [ ] 新建交易时检查买入原因标签是否匹配低胜率模式
- [ ] 弹出提醒："你的抄底胜率仅28%，确定继续？"
- [ ] 用户可忽略或取消
- [ ] 设置中可开关

#### STORY-016: 正面强化 (2 pts)

**AC:**
- [ ] 交易完成后如匹配高胜率模式，展示鼓励卡片
- [ ] "你最近10笔趋势突破胜率78%，继续保持！"

#### STORY-017: 周/月 AI 报告 (5 pts)

**AC:**
- [ ] Arq 定时任务（每周日生成）
- [ ] 报告内容：期间统计+模式发现+改进建议
- [ ] 可保存为图片分享
- [ ] 前端报告页面

---

### Cross-cutting

#### STORY-018: 小程序导航 + 全局 UI (5 pts)

**AC:**
- [ ] TabBar：首页/交易/复盘/统计/我的
- [ ] 深色模式
- [ ] 骨架屏 + 空状态 + 错误处理
- [ ] 全局 API 拦截器（401/429/5xx）

#### STORY-019: 错误处理 + AppException 体系 (2 pts)

**AC:**
- [ ] AppException 体系（从 EdgeBook 移植）
- [ ] validation_exception_handler
- [ ] compliance_guard 基础设施

---

## Sprint Allocation

### Sprint 1 (Week 1): 基础设施 + 能记录交易

**Goal:** 项目骨架 + 通用引擎 + 交易记录跑通

| Story | Points | Priority |
|-------|--------|----------|
| STORY-000 项目基础设施 | 8 | Must |
| STORY-003 通用记录引擎 + 标签引擎 | 8 | Must |
| STORY-001 微信登录 + 引导页 | 5 | Must |
| STORY-007 多市场标的数据 | 3 | Must |
| STORY-019 错误处理体系 | 2 | Must |
| **Total** | **26/30** | |

**Sprint 1 交付：** 登录 → 通用引擎就绪 → 标签系统 seed → 标的搜索可用

---

### Sprint 2 (Week 2): 交易表单 + 复盘 + 标签统计

**Goal:** 核心闭环 — 记录标签式交易 → 复盘 → 看到"震撼统计"

| Story | Points | Priority |
|-------|--------|----------|
| STORY-004 交易场景插件 — 记录 | 8 | Must |
| STORY-005 交易管理 — 列表/编辑/配对 | 5 | Must |
| STORY-008 通用复盘引擎 | 5 | Must |
| STORY-009 灵活复盘触发 | 3 | Must |
| STORY-018 小程序导航 + 全局 UI | 5 | Must |
| **Total** | **26/30** | |

**Sprint 2 交付：** 完整的 记录(标签) → 复盘(三问) → 管理 闭环，**可开始内测**

---

### Sprint 3 (Week 3): AI 分析 + 模式发现 = 震撼时刻

**Goal:** AI 能力全线上线 — 标签统计 + 模式发现 + AI 复盘对话 + 首页

| Story | Points | Priority |
|-------|--------|----------|
| STORY-011 标签统计（震撼时刻）| 8 | Must |
| STORY-013 AI 模式发现引擎 | 8 | Must |
| STORY-010 AI 复盘对话 | 5 | Must |
| STORY-014 首页仪表盘 | 5 | Must |
| **Total** | **26/30** | |

**Sprint 3 交付：** 用户第一次看到"抄底胜率28%"和"焦虑时亏损+42%"— **产品价值验证**

---

### Sprint 4 (Week 4): 统计中心 + 提醒 + 打磨

**Goal:** 完善统计 + 智能提醒 + 收尾打磨

| Story | Points | Priority |
|-------|--------|----------|
| STORY-012 统计中心 | 5 | Must |
| STORY-015 模式提醒 | 3 | Should |
| STORY-016 正面强化 | 2 | Should |
| STORY-017 周/月 AI 报告 | 5 | Should |
| STORY-002 设置 + 个人中心 | 3 | Must |
| STORY-006 截图 OCR 导入 | 3 | Should |
| **Total** | **21/30** | |

**Sprint 4 交付：** 功能完整的 v1，可公开推广

---

### Backlog (Post v1)

| Story | Points | Phase |
|-------|--------|-------|
| FR-004 文件批量导入 | 5 | v1.1 |
| 交易人格系统 | 8 | v2 |
| 个人知识库 | 8 | v2 |
| 职业场景插件 | 8 | v3 |
| 企业广告系统 | 13 | v4 |

---

## Epic Traceability

| Epic | Stories | Points | Sprint |
|------|---------|--------|--------|
| Infra | 000, 018, 019 | 15 | S1, S2 |
| EPIC-001 用户系统 | 001, 002 | 8 | S1, S4 |
| EPIC-002 交易记录 | 003, 004, 005, 006, 007 | 27 | S1-S4 |
| EPIC-003 复盘系统 | 008, 009, 010 | 13 | S2-S3 |
| EPIC-004 统计+AI | 011, 012, 013, 014 | 26 | S3-S4 |
| EPIC-005 提醒+报告 | 015, 016, 017 | 10 | S4 |

## FR Coverage

| FR | Story | Sprint |
|----|-------|--------|
| FR-001 登录 | 001 | S1 |
| FR-002 交易记录(标签) | 003, 004 | S1-S2 |
| FR-003 截图导入 | 006 | S4 |
| FR-004 文件导入 | Backlog | — |
| FR-005 交易管理 | 005 | S2 |
| FR-006 灵活复盘 | 008, 009 | S2 |
| FR-007 AI 复盘 | 010 | S3 |
| FR-008 标签统计 | 011 | S3 |
| FR-009 模式发现 | 013 | S3 |
| FR-010 统计中心 | 012 | S4 |
| FR-011 首页 | 014 | S3 |
| FR-012 多市场 | 007 | S1 |
| FR-013 存证 | 004 | S2 |
| FR-014 内测 | 001 | S1 |
| FR-015 设置 | 002 | S4 |
| FR-016 模式提醒 | 015 | S4 |
| FR-017 正面强化 | 016 | S4 |
| FR-018 周月报告 | 017 | S4 |

---

## Risks

**High:**
- 标签统计 SQL（JSONB GIN）性能未验证 → S1 即建索引并测试
- 加密货币/美股标的数据源稳定性 → 先做 A 股/港股，其他降级

**Medium:**
- AI 模式发现样本量不足（<30笔） → 预设发现模板+提示"继续记录"
- Taro 小程序 ECharts 图表兼容性 → S3 验证，备选 canvas 手绘

**Low:**
- OCR 识别率 → Should Have，手动输入为主

---

## Definition of Done

- [ ] ruff + mypy 通过
- [ ] AC 逐条验证
- [ ] AI 输出过 compliance_guard
- [ ] 查询含 user_id 过滤
- [ ] 前端有骨架屏/空态/错误态

---

## Key Milestones

```
Week 1 末: 基础设施 + 登录 + 通用引擎 → 内部可跑
Week 2 末: 交易记录 + 复盘 → 最小可内测版
Week 3 末: 标签统计 + AI 模式发现 → 产品价值验证 ← CRITICAL
Week 4 末: 统计 + 提醒 + 打磨 → 公开推广
```

---

**This plan was created using BMAD Method v6 - Phase 4**
