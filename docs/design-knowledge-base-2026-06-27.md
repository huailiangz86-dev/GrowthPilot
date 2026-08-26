# Feature Design: 个人知识库 + 学习计划体系

> **Historical reference:** This feature design is superseded by `docs/README.md` and the active v3.1 Workspace-first PRD/UX documents. Keep it as feature history only.

**Date:** 2026-06-27

---

## 需求理解

用户需要一个**个人成长知识管理系统**，不只是记录交易和复盘，而是：

1. **自定义学习计划** — 设定目标（如"掌握趋势交易"），分解为步骤，追踪进度
2. **知识库** — 所有复盘、笔记、收藏的内容自动归档，可搜索
3. **知识体系搭建** — 用户自建分类树（文件夹/标签），像 Notion 一样组织
4. **学习进度追踪** — 可视化完成度

---

## 功能模块设计

### 模块 A: 学习计划

```
用户创建计划:
  "掌握趋势交易"
  ├── 阶段 1: 理论学习 (2 周)
  │   ├── □ 学习均线系统
  │   ├── □ 学习 MACD 用法
  │   └── □ 学习支撑/阻力
  ├── 阶段 2: 模拟实践 (2 周)
  │   ├── □ 模拟交易 10 笔趋势单
  │   └── □ 复盘每笔模拟交易
  ├── 阶段 3: 实盘验证 (4 周)
  │   ├── □ 实盘 20 笔趋势单
  │   ├── □ 胜率达到 55%+
  │   └── □ 写总结报告
  └── 进度: 35% ████░░░░░░

计划可以:
  - 手动创建
  - AI 推荐（根据风格分析建议学习方向）
  - 关联到交易记录和复盘
```

### 数据模型

```sql
CREATE TABLE learning_plans (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    status      VARCHAR(16) DEFAULT 'active',  -- active/completed/paused
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plan_stages (
    id          UUID PRIMARY KEY,
    plan_id     UUID NOT NULL REFERENCES learning_plans(id),
    title       VARCHAR(200) NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    duration    VARCHAR(32),  -- "2周"
    status      VARCHAR(16) DEFAULT 'pending'
);

CREATE TABLE plan_tasks (
    id          UUID PRIMARY KEY,
    stage_id    UUID NOT NULL REFERENCES plan_stages(id),
    title       VARCHAR(500) NOT NULL,
    is_done     BOOLEAN DEFAULT FALSE,
    notes       TEXT,
    linked_record_id UUID,  -- 关联交易记录
    linked_review_id UUID,  -- 关联复盘
    completed_at TIMESTAMPTZ
);
```

### 模块 B: 知识库

```
知识库首页:
  ┌─────────────────────────────┐
  │ 🔍 搜索知识库               │
  ├─────────────────────────────┤
  │ 我的文件夹                   │
  │ 📁 趋势交易 (12)            │
  │ 📁 风险管理 (5)             │
  │ 📁 心态修炼 (8)             │
  │ 📁 读书笔记 (3)             │
  ├─────────────────────────────┤
  │ 最近添加                    │
  │ 📝 "趋势突破的 3 个确认信号"  │
  │ 📝 "止损设置心得"            │
  │ 📝 复盘: 6月25日交易总结     │
  └─────────────────────────────┘

知识条目来源:
  1. 手动创建笔记
  2. 复盘自动归档
  3. 交易记录的复盘部分
  4. 外部文章收藏/摘要
  5. AI 生成的总结
```

### 数据模型

```sql
CREATE TABLE knowledge_folders (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    parent_id   UUID,  -- 支持子文件夹
    sort_order  INTEGER DEFAULT 0,
    icon        VARCHAR(8) DEFAULT '📁'
);

CREATE TABLE knowledge_notes (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL,
    folder_id   UUID REFERENCES knowledge_folders(id),
    title       VARCHAR(200) NOT NULL,
    content     TEXT NOT NULL,
    source_type VARCHAR(32),  -- manual/review/trade/article/ai
    source_id   UUID,         -- 关联的 review/record ID
    tags        JSONB DEFAULT '[]',
    is_pinned   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_user_folder ON knowledge_notes(user_id, folder_id);
CREATE INDEX idx_notes_search ON knowledge_notes USING GIN(to_tsvector('chinese', title || ' ' || content));
```

---

## API 设计

### 学习计划
```
POST   /api/v1/learn/plans              — 创建计划
GET    /api/v1/learn/plans              — 计划列表
GET    /api/v1/learn/plans/{id}         — 计划详情(含阶段+任务)
PATCH  /api/v1/learn/plans/{id}         — 更新计划
POST   /api/v1/learn/plans/{id}/stages  — 添加阶段
POST   /api/v1/learn/tasks/{id}/toggle  — 完成/取消任务
GET    /api/v1/learn/progress           — 整体学习进度
```

### 知识库
```
POST   /api/v1/kb/folders               — 创建文件夹
GET    /api/v1/kb/folders               — 文件夹列表
POST   /api/v1/kb/notes                 — 创建笔记
GET    /api/v1/kb/notes                 — 笔记列表(按文件夹/搜索)
GET    /api/v1/kb/notes/{id}            — 笔记详情
PATCH  /api/v1/kb/notes/{id}            — 编辑笔记
DELETE /api/v1/kb/notes/{id}            — 删除笔记
GET    /api/v1/kb/search?q=             — 全文搜索
```

---

## 前端页面

### 新增页面
```
pages/learn/index          — 学习计划列表
pages/learn-detail/index   — 计划详情(阶段+任务)
pages/learn-create/index   — 创建计划
pages/kb/index             — 知识库首页(文件夹+最近)
pages/kb-note/index        — 笔记编辑/查看
```

### TabBar 调整建议
```
当前: 首页 / 记录 / 日历 / 分析 / 我的
改为: 首页 / 记录 / 知识 / 分析 / 我的

"知识" Tab = 学习计划 + 知识库 合并入口
"日历" 降为首页快捷入口（不占 Tab）
```

---

## 实施优先级

```
Phase 1: 知识库基础 (文件夹+笔记+搜索)
Phase 2: 学习计划 (计划+阶段+任务)
Phase 3: 自动归档 (复盘→知识库)
Phase 4: AI 推荐学习方向
```
