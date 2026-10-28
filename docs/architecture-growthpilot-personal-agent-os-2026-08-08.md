---

## 当前实施边界 P0 P1（2026-10-20）

新定位聚焦资料到练习与实际应用。P0 复用统一模型服务、原提示词和正式领域校验，只用虚构输入与独立本机审计库；候选提示词保存在 evals，不被正式提示词发现。P1 先使用隔离浏览器原型，资料版本、作答、帮助程度、本人核对、应用结果与回访记录分别保存；不新增正式 API、迁移或领域事实回填。

后续正式接入复用既有个人来源、学习回忆、工作正文与应用任务对象；不先建设完整能力图谱或跨领域统一评分。实际范围与质量证据见 [P0 P1 计划](learning-focus-p0-p1-2026-10-20.md)，旧架构中的未实施扩展按新顺序后置。

## D15 个人资料 → 有依据的总结 → 保存和复用（2026-10-13 本地已启用）

本人确认下一阶段优先让知识库产生实际使用价值。已实现独立总结原型 `/prototype/source-summaries` 和正式接口/页面 `/app/knowledge/summaries`；使用个人资料库已保存的正文片段，可跨资料选择 1–10 个片段，明确允许本次模型处理后生成逐条带原文引用的要点。资料首页、版本详情和学习知识库均有入口，无需 Workspace 或百炼测试库。

每条区分资料中的要点与待验证的解释；引用在服务端逐字核对，位置从冻结正文计算，保留原版本、原件校验值与实际 PDF 页码。本人确认标题及独立补充后保存；可按标题、要点、补充和原资料文字搜索，刷新回看，复制或导出含全部出处的总结。来源另存新版本仍可回查旧依据。

136 项前端检查、77 项相关后端检查、构建与 lint 通过；12 组原型和 17 组隔离正式页面流程已验收，375px 手机与 1440px 桌面无运行错误或横向溢出。模型回复均为本地模拟，0 次真实模型请求；引用存在检查不等于结论语义质量认证。

**本地已启用：** 本人确认执行并切换到手动审批后，本机数据库已备份，备份仅恢复到独立验证库；迁移升级前后 62 张原业务表内容一致。日常库已升级到 `f0a4b5c6d7e8`，现有 64 张表，服务已重启。8 组日常入口检查通过，涵盖原资料到总结的入口、正文选择、授权状态、刷新恢复、列表接口与手机/桌面布局；未调用模型或上传云端资料。正式入口：[有出处的总结与已保存成果](http://127.0.0.1:4010/app/knowledge/summaries)。真实模型总结质量仍待后续核验。

**正式页面整合（2026-10-13）：** 资料与总结已归入统一知识库，使用正式侧栏、顶部栏和手机导航。`/app/knowledge` 展示学习记录，`/app/knowledge/sources` 保存个人资料，`/app/knowledge/summaries` 生成和复用总结，三个内容入口在同一页面结构内切换；“我的 → 我的知识库”和学习页均可进入。原 `/app/sources` 与 `/app/sources/summaries` 自动跳转，完整保留来源、版本及页面参数；既有草稿、冻结请求和已保存成果沿用同一份存储与领域对象。新账户可直接使用个人资料和总结；首次引导根据实际工作空间读取结果决定，已有空间的账户不会再被旧浏览器引导标记拦住，读取失败且无已确认空间时不展示初始示例。账户切换重建页面上下文。

139 项前端检查、最终构建/lint、16 组隔离整合流程及 8 组日常入口检查通过；覆盖合并前草稿、原版本引用、保存/搜索/复制、学习记录搜索恢复、“我的”与手机导航、账户隔离、登录返回、无空间及空间读取失败。375px 手机与 1440px 桌面已核对布局。本次为正式页面整合，没有新增迁移、领域数据回填或外部模型调用。

## D14 个人资料导入流程（2026-10-10 本地已启用）

[准备百炼资料导入](http://127.0.0.1:4010/app/sources/cloud)：从个人资料选择冻结版本，保存原件或提取正文的导入清单，刷新后继续并回查旧版本。无需先创建测试库。本人已确认先完成本地流程，稍后自行创建个人测试库；当前云端写入关闭。

上传、登记、解析、索引和切片/检索回查适配器已实现，按本人选择目的地与发送范围逐步处理。保留逐步回执、独立校验值和来源映射；并发去重、明确失败重试、不确定回执人工核对及账户隔离已验证。原型和完整云端步骤使用独立模拟，不计作真实百炼上传或索引成功。

130 前端、78 相关后端检查、构建/lint、9 组原型、11 组隔离正式页面及6组日常入口流程通过。数据库备份恢复核对后新增清单表，61张原业务表内容保持一致，现63张表。真实云端验收待测试库创建后继续。详见 [D14 交付记录](source-pipeline-growthpilot-2026-10-10.md)，[可点击原型](http://127.0.0.1:4010/prototype/source-pipeline)。

## D13 个人原资料与版本（2026-10-10 已启用本地）

新增 `personal_sources` 与 `personal_source_versions`，均按 `user_id` 持有，不依赖 Workspace 或 LearningItem。前者保存最新版本号，后者独立保留原始字节、SHA256、来源字段、冻结提取结果及位置、稳定请求指纹、解析状态/尝试/租期。修订只追加原件版本，成功的提取快照不被重试改写；失败重试保持同一原件及版本。迁移 `d4e8f0a1b2c3` 仅新增两表，原有 59 张业务表内容核对一致。

`/api/v1/personal-sources` 提供导入、最新版本列表与文字查找、按版本读取、原件下载和提取重试。每人行锁串行核对提交指纹、基线版本及容量，原件与版本号同事务保存；PDF 提取与公开网页读取不持有数据库锁，返回后再次核对所有权/版本/提交。45 秒解析租期与尝试标识防止迟到任务覆盖恢复结果。公开网页沿用 D9 的公开 IP 固定连接、逐次跳转检查和资源上限；EML 本地解码 MIME，优先纯文字正文，不访问外部资源，附件只留在原件。

客户端 IndexedDB 保留文件/冻结请求，同步恢复记录保留最新文字；账户和标签页隔离，失败重放、冲突重新核对与可导出备份均有真实界面证据。新资料没有自动进入模型上下文或云端库；D14 的个人测试库映射、云端上传回执、索引状态和来源回查仍需独立实现。详见 [D13 交付记录](personal-sources-growthpilot-2026-10-10.md)。

## D10 学习诊断质量（2026-10-09 本地实现，真实模型验收待授权）

正式入口 `/app/learning → 学习页 → AI 学习回顾`，独立可点击原型 `/prototype/diagnosis-quality`。新回顾区分自报卡点、答案遗漏、答案与依据不符和证据不足；比较答案必须分别引用同次回忆的原文与本人答案。每条建议关联观察并写明“完成后这样核对”，本人采用后与行动、原话和出处一起保存。仅有时长或自评不能判断掌握。

新提示词/结果为 v2；旧回顾保持原样、旧引用仍有效，来源或读取范围变化继续隐藏正文。没有新增迁移。108 前端、103 相关后端检查、构建/lint通过；原型 6 条、隔离正式界面 9 条与正常入口 4 条流程完成，手机和桌面无页面错误/横向溢出。模型界面用独立本地模拟验收，正常入口未发送模型请求，不能计作真实 Qwen 质量通过。

10 份完全虚构的案例、语义核对条件及默认不联网的验收工具已准备。历史自动审批明确要求外部 Qwen 验收授权；本轮已请求仅发送这些案例、最多 10 次请求的确认，未授权前不发送。范围、兼容和证据见 [D10 交付记录](learning-diagnosis-quality-growthpilot-2026-10-09.md)。

## 2026-10-09 · D9 公开网页资料接入（已交付本地）

正式入口 `/app/learning → 学习页 → 把资料带进来 → 公开网页`，独立可点击原型 `/prototype/web-material`。本人填写标题与公开 HTTPS 地址，读取后核对正文、选择摘录，再追加到已有笔记。原始网页字节、SHA256、提取正文、精确片段坐标、原地址、最终地址、读取时间及提取器版本独立保存；网页变化或再次导入不会覆盖已有快照与复盘依据。已保存快照直接进入本人当前空间知识库，并可在学习复盘和 AI 学习回顾中选择为原资料。

使用不带登录信息的单次公开读取，不执行脚本、不跟随图片、不自动同步。DNS 每次跳转重新核对全部地址，实际连接固定已检查的公开 IP，TLS 仍验证原站域名；拒绝内网/回环/链路本地/地址转换目的地、账号密码、非 HTTPS 和非标准端口。最多 3 次跳转，18 秒总限时、2 MB 原始快照、20 万字及 500 片段，沿用每学习页 30 份/20 MB 总量。正文按可读结构提取，布局可能变化；只读取服务端返回的公开文字，不执行动态脚本或绕过登录/付费门槛。没有可读正文、压缩或不支持的编码会明确失败，可改用文件或粘贴正文。网络失败不创建空资料，不伪造摘要。

浏览器先保留冻结请求与最新草稿，失联或回执丢失后重放同一请求；已保存快照直接返回，不重新抓取。并发抓取只形成一份快照；抓取时不持有数据库锁，保存前再核对本人/空间/事项。本人继续输入保留为下一份草稿，确认摘录沿用既有版本冲突保护。没有新增迁移、历史回填、模型调用或后台同步；数据库版本继续为 `c2e6f7a8b9d0`。D7 新 AI 学习回顾的真实模型质量验收状态不变；本阶段只验证原资料能供现有来源选择、引用和复盘流程使用。

验证：108 项前端检查、73 项相关后端合同/隔离 PostgreSQL 检查通过；最终网页边界 8 项复查、构建与前端 lint 通过。原型 5 条、隔离正式流程 9 条、正常 4010/8002 入口 10 条浏览器检查通过，覆盖 375×500 手机和 1440 桌面，全部无页面运行错误或横向溢出。example.com 与 Python 官方公开文档真实读取成功；未调用模型。构建保留既有包体积提示，后端 Ruff 本机未安装，未声称其通过。临时 8022 服务和本轮隔离测试库已清理，正常服务继续运行。证据见本地试用指南。

## 2026-10-09 · D8 复习安排与到期队列（已交付本地）

本人保存实际答案并评级后，可采用建议日期、自行调整或暂不安排。首次没想起 / 费力 / 基本 / 轻松分别建议 1 / 2 / 4 / 7 天；到期后的连续复习沿用上次采用的建议间隔，以 1.2 / 2 / 2.5 倍向上取整，最长 366 天；没想起重置 1 天，提前回忆保持上次间隔，不因同日反复回忆扩大间隔。旧记录与手动日期不推算算法历史。按本人时区从实际复盘日安排，不根据时长判断掌握。

学习页默认优先未完成复盘、到期、首次回忆；可切换稍后、未安排或全部，并继续加载超过 30 个的问题，避免旧到期项被新问题遮住。按服务端日期分组，重新聚焦、可见页面每分钟及手动刷新更新队列；没有后台提醒或通知推送。原型 `/prototype/spaced-review` 先验证后接正式 `/app/learning → 学习页 → 学习复盘 → 安排下一次回忆`。

日期预览仅读取当前本人/空间/学习/问题；服务端核对建议版本、最新已完成尝试和当天日期。并发完成或跨日后旧建议返回 409，实际答案和复盘草稿保留，重新核对后由本人再确认。答案、原文引用及每次采用的安排保留独立历史；稳定请求重放旧回执不重复。D6 手动草稿及完成回执的指纹兼容；无新增迁移、历史回填或外部模型调用，数据库仍为 `c2e6f7a8b9d0`。

本阶段为透明规则式间隔建议，未接 FSRS 个性化参数/记忆概率、AI 自动评级或外部知识库账号同步；D7 新 AI 回顾的真实模型验收仍待明确授权。下一阶段按用户需求推进外部资料/知识库接入和带依据的学习诊断质量验收。

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

验证：106 项前端检查、66 项受影响后端检查通过（原组合 65 项，加提前回忆边界 1 项；复习规则/隔离部分共 21 项在最终规则下重验），构建与前端 lint 通过。原型 5 条、专用隔离库 9 条、正常 4010/8002 入口 9 条和旧学习复盘回归 11 条浏览器流程通过，全部无页面运行时错误。375×500/812 与 1440 桌面操作及来源、稳定回执、并发冲突、原日期/历史保留均有证据。构建保留既有包体积提示。本轮无模型调用，D7 真实 Qwen 质量验收状态不变。证据与路径见[本地试用指南](local-trial-growthpilot-2026-10-08.md)。

## 2026-10-09 · D7 学习记录、知识库与回顾

`PersonalDocument.content` 增加 content、insights 和 dated journal，版本/回执与 C1/D5 复用；旧端遗漏新字段时保留已有值。知识库为自有已保存记录、原资料和已有知识卡的来源投影，以 owner/workspace/archive 隔离，按文字匹配和分页返回摘要，按不可变文档版本展开正文。原始资料保持校验、页码和字符位置，不复制成虚假的模型知识。

`learning_diagnose` 复用持久 ItemHelp 的冻结请求、租期、重放与审计链路；生成前后检查学习读取授权、来源版本和所选摘要。只读取所选字段、journal、原资料片段或完成的回忆；引用必须逐字属于冻结原文。采用以稳定记录 ID 写入完整学习文档并保留 help request/index，支持回执丢失、并发和继续输入。无新增迁移、外部连接器或向量服务，本轮真实模型验收待授权。


## 2026-10-09 · D6 来源问题与学习复盘

新增 `learning_review_units` 与 `learning_review_attempts`，迁移 `c2e6f7a8b9d0` 接在 D5 后。单学习最多 100 个问题，单问题最多 1000 次真实尝试。问题最多 2000 字；答案与笔记依据最多 12000 字；理解、卡点、下一步各 4000 字。问题不可变，引用来自本学习已保存笔记/练习版本的精确位置，或归属核对后的就绪材料片段；保留 Unicode 字符位置、原文、版本/校验值与页码。创建不会改变学习正文、阶段或分钟。

`/learning-review/{workspace}` 汇集问题、完成次数、未完成次数和最后一次本人安排日期，不返回核对原文；先 POST `answers` 保存本人答案或明确空答案，再返回冻结依据。POST `finish` 保存本人评级、理解/卡点/下一步与选填日期（本人时区，今天起一年内），完成历史不可覆盖。所有变更复用空间串行锁与 `personal_command_receipts`：动作/目标/载荷指纹和稳定请求标识确保原提交重放，记录与事件/回执原子提交。

每条路由校验账户、空间、学习、问题与尝试归属，排除已归档对象。浏览器同步保存冻结提交与输入，按账户/空间/事项/标签页隔离；存储失败停止发送，迟到回执/历史读取不覆盖新状态。C1 `day_evidence` 汇集当天完成的独立学习尝试，并冻结到日复盘的成果引用；连接指向对应问题与尝试。未完成答案不算已完成复盘。新流程不调用模型，也不扩展已有 AI 学习读取范围。

目前下次日期是本人安排，尚未接入 FSRS 或由评级推导间隔。原型、合同/隔离数据库与正常入口证据见试用指南。

## 2026-10-09 · D5 原资料与摘录合同

新增 `learning_materials` 保存个人/空间/事项归属、稳定请求摘要、原始字节、SHA256、提取快照、处理状态/尝试标识/租期。上传流与解码后字节双重设上限，来源 URL 不被服务器访问。PDF 在独立进程提取，限制解压、页树、表单调用、CPU、墙钟及内存，最多两份并行；等待槽位超过五秒明确失败并保留原文件。租期到期允许恢复，旧尝试不能覆盖新尝试；处理不长持工作空间锁，处理前后复核归属和未归档状态。

`append_material` 复用 `PersonalCommandReceipt` 与工作空间锁，校验资料归属、就绪状态、校验值、片段集合和笔记版本；服务端从真实提取快照取片段，原文按页码与全局字符区间引用。`learning_material_excerpts` 冻结准确片段并外键关联不可变笔记修订。原始资料和笔记/练习恢复分开；摄入不改变实际投入或阶段。确认期间的新笔记与摘录在回执处合并，旧回执不能回退已读的新笔记；冲突选择保留本地草稿时，经同一版本命令原子保存草稿与原摘录。

本机正文/选择有同步恢复记录，文件/冻结请求由 IndexedDB 持有，均按账号、空间、事项及标签页隔离；先持久化再发送，存储不可读时保留原数据并停止覆盖。文件事务完成前显示正在保留；原文件下载需要身份与当前归属校验，附件响应禁止嗅探和公共缓存。

迁移 `b1d5e6f7a8c9` 仅新增两表，当前本机 58 表；空库、回退/重升、备份恢复及原表摘要检查通过。PDF 依赖声明并锁定为 pypdf 6.19.0，读取能力和资源风险依据 [官方提取说明](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)，不以纯文本提取声称保留排版。没有 OCR、远程网页抓取或向量知识库，教学仍使用本人确认的已保存摘录。


## 2026-10-09 · D4 个人背景合同

当前个人 `User.settings.fitness_profile` 保存背景内容/版本/更新时间，`fitness_expert_revisions.kind=profile` 保存不可变历史；稳定的个人派生 ID、用户行锁、`LifeCommandReceipt`、事件及版本在同一事务，复用现有表无需新迁移。`save_profile` 校验归属/版本/本人核对，不能改写生活授权或其他设置。历史按本人查阅。

`LifeRecord.content` 新增可空 effort/recovery 和动作 equipment，旧记录不批量回填，未执行不能带训练自评。`build_source` 只加入单独允许的背景内容，背景版本进入业务摘要；修改/退出背景使用使旧回顾失效。无新背景时保留旧 D3 摘要兼容。处理前后及采用时复查；近期原结构候选超过 7 天有效范围会失效。

`fitness_context` 是程序执行的条件检查，输出冻结到技能及结果，原结构和条件由服务端生成，模型只解释来源。已知不同器械不比较。产品检查规则不冒充指南或医疗阈值；当前没有个体加重、动作库或恢复预测。


**Date:** 2026-10-08（初版 2026-08-09）
**Version:** 3.3
**Status:** Draft - Ready for Product Review
**Primary platform:** React Web personal workspace
**Secondary platform:** Taro 4 miniapp for lightweight capture and reminders

---

## 1. Executive Summary

### D3 首个健身专家实际合同（2026-10-09）

迁移 `a0c4d5e6f7b8` 增加个人归属的 `fitness_reviews`、`fitness_arrangements`、`fitness_review_rules`、`fitness_expert_revisions`。`/fitness-expert` 返回当前有效的回顾/采用安排/规则；`POST /reviews` 只持久化本人明确的日期范围和来源，GET、重试和历史均检查本人。工作空间不是使用条件。所选范围最多366天、300条记录及80k字符，超限明确拒绝或阻塞，不截断。习惯取当时生效的版本，采用安排的反馈引用原 `LifeRecord`，不复制事实。

独立 `expert_loop` 与既有执行循环并行，在 `EXECUTION_ENABLED` 下运行；周期完整结束后用规则版本与日期生成稳定请求。每人行锁保护排队和回执，模型运行期间释放锁；五分钟租期、尝试 ID、三次自动重试和手动重试保障恢复。`fitness_review/v2` 将有引用解读与缺失限制区分，每条解读与建议只可引用冻结范围内的完整原记录 UUID。调用前后及读回/采用前验证记录、习惯、反馈、独立授权和规则版本，过期输出不覆盖新结果；权限撤销再授予不复活旧来源或周期规则。

`POST /commands` 采用/修改安排和周期规则，复用个人回执但使用独立命令指纹。单回顾唯一安排，预计时间不产生事实，安排/规则更新有版本历史。实际反馈仍经原生活命令保存，在 `WorkoutContent.expert_plan_id` 保留安排引用，原安排受单一反馈和本人权限保护，纠正不能改写来源。暂停/撤销保留本人确认的安排和事实，相关旧解读隐藏。客户端按本人及独立标签页同步保存范围、草稿和冻结提交，账户变化拒绝旧结果，读取失败隐藏缓存解读。

### D2 实际查看与帮助合同（2026-10-09）

`GET /personal-life/views?start&end` 在最多 366 天范围读取完整个人事实与历史习惯，服务端确定统计、安排与同动作逐日最大 kg 来源；Web 选择月份。`/records/{id}` 返回本人当前事实供图表展开/纠正。实际日期保持原始时区下的填写日期，安排、未执行和未知不互相推断。

`item_help` 保存固定请求、显式一次输入或单件学习版本/指纹、模型结果与租期，迁移 `f9b3c4d5e6a7`。`POST /item-help` 接健身原话整理或学习解释/练习/反馈；GET 读取本人的回执或学习页最近 20 项帮助。调用前提交处理中状态，调用后复查来源及尝试 ID；完成回执重放不重复调用，过期响应不能覆盖新尝试。模型统一走既有供应商路由/费用审计；提示及严格结构/逐字引用验证独立于事实保存。

健身整理只接本次显式原话，不读取既有生活领域，因此不会隐式开启 `life_privacy` 专家范围；候选未确认不创建事实，AI 来源原话与请求引用在 D1 记录中保留且不可改写。学习读取要求本人有效空间、已保存 C1 笔记与已开启 learning 范围；只发送选定正文和答案，不抓链接，产出引用仅可来自笔记，不能引用生成练习作原文。C1 内容或来源范围变更后旧帮助输入/产出/来源正文隐藏；采用练习作为标明 AI 来源的本人内容保存版本，实际阶段由本人控制。客户端按账户/事项/标签页恢复原请求与答案草稿、停止过期账户结果，后台长期执行与专家回顾仍待 D3/C2。

### 2026-10-08 个人生活事实与专家读取的规划

PRD 3.3 将个人数据与习惯作为基础。本节为 D 系列合同，D1 首个健身领域与 D2 事项内帮助已实现，D3 首个健身专家/连续反馈已实现，保留现有 Workspace、C1 正文/版本、事实分析和执行队列；不以文档更新代表新模型或迁移已经交付。

- 个人生活事实以 user_id 归属，稳定事实 ID 关联领域、发生时间/时区、来源、单位、原始材料、结构化值及确认/估计状态。与习惯、目标或任务建立可选引用，跨工作空间引用同一事实而不复制计数；引用不能扩大读取权限。
- 复用既有 Record 的扩展思路和可靠提交机制，但先定义领域字段、校验、版本及去重语义。WorkspaceFact 当前只支持学习分钟与任务反馈，不直接塞入未经定义的健康或训练字段。D1 已在 D0 字段需求后实现独立个人领域表和 API，见下方。
- 原始材料、AI 提取候选、本人确认事实与 AI 解读分开保存。修正产生版本并使相关旧解读失效；统计仅读取定义明确的事实，缺失与零值区分，计划不进入实际活动统计。
- 习惯定义与实际记录分离。习惯保存用户选择的频率/时区和有效期；记录区分已发生、本人声明未执行和未知。修改习惯规则保留版本，历史回顾使用当时有效规则，不改变过去的事实。
- 列表、日历、趋势和专家使用同一数据读取与统计服务。专家上下文绑定个人、领域、所选时间范围和可追溯版本，不用聊天历史充当完整样本。跨领域分析需同时满足各领域读取范围，并区分相关现象与因果判断。
- 新生活数据分类默认不因既有七类 Workspace 来源开关自动获准。用户选择专家可读范围；来源变更、撤销或删除沿用版本指纹与引用失效机制，缓存、历史解读及检索均检查当前权限。
- AI/工具产出继续复用 C2 的运行与成果合同。一次整理完成、一个训练安排生成和一次实际训练是不同事件；专家的建议被采用后建立计划或任务，实际反馈才更新相应生活事实。

**D1 实际实体与 API：** `life_records`、`personal_habits`、`life_revisions`、`life_workspace_references`、`life_command_receipts`；迁移 `e8a2b3c4d5f6`。API `/api/v1/personal-life` 提供个人快照/分页/按自有空间引用过滤，`/history/{record|habit}/{id}` 提供来源、不可变版本和引用动作时间，`/commands` 统一保存记录/习惯/独立授权及引用/撤销。按 User 行锁串行提交，版本拒绝陈旧输入，请求 UUID + 内容指纹避免重放变更；对象、版本、个人事件和回执同事务提交。引用动作推进记录版本、保留事实内容版本，关联前核对本人有效空间。

**D1 权限与浏览器恢复：** 生活专家范围在 `User.settings.life_privacy` 独立保存版本与默认 false 的 `fitness_expert_enabled`，既有七类范围不授予该权利；当前 Agent/分析检索未纳入生活事实。客户端按账户和独立标签页日志保存草稿与冻结请求，复制标签页先协商新 ID；提交/响应都核对当前账户，迟到回执、陈旧快照及已撤销授权受到版本保护。用户手动确认、习惯安排和实际训练分别保存；没有模型、媒体、设备或系统通知调用。D2–D3 后续上下文仍须核对当前独立授权及来源版本。

### 2026-10-08 个人工作闭环的架构补充（C1 已实现，C2–C4 规划）

以下为 PRD 3.2 的拟议数据与运行合同，优先于历史界面描述。复用现有个人用户隔离、Workspace/Project/Goal/Plan/Task、事实事件、Agent 与分析基础，增量补齐工作内容及执行能力；C1 的实际实体与合同如下；ExecutionStep、WorkArtifact、ReflectionDraft、PlanRevision、连接器及外部同步实体仍是 C2–C4 规划。

**C1 实际实现：** `personal_documents` 以 task_id / learning_item_id / reflection_id 唯一引用已有对象，约束每份文档只有一个归属；稳定 UUID、当前 JSON 内容与整数版本配合 `personal_document_revisions` 保存不可变历史。`schedule_blocks` 关联真实 Task，起止时间带时区、版本和取消状态；多段安排独立于 due_at。`personal_command_receipts` 按用户/空间/请求唯一保存输入指纹与原回执，命令、版本与事件在同一事务提交。Workspace 锁与文档版本/上游对象更新时间保护并发；读取只返回当前用户/空间数据。可用窗口和每日容量按空间存入用户 settings，采用版本及同一提交回执保护，不新增外部日历授权。

浏览器按账户/空间/标签页保留冻结提交和继续输入的草稿；回执只清除对应提交，迟到读取不能倒退已确认版本。409 冲突保留原文，可比较、另存版本或采用云端并留备份。日复盘使用真实晚间 Reflection 与同一内容模型，引用当天具体 DocumentRevision，去重且保留历史依据。原个人 Agent 检索新增本人正文/笔记/复盘内容及版本指纹，沿用原始来源授权。新增迁移为 `d7f1a2b3c4e5`，四张表；完整迁移/本地升级与测试见实现状态。

**内容与安排的后续规划：** Task 保存事项当前状态；TaskDocument/DocumentRevision 承载正文、作者来源、版本及成果；ExecutionStep 明确分工、依赖、完成标准与资源；ScheduleBlock 保存 task_id、起止时间、时区及取消状态。due_at 继续表示截止时间，不能再兼作开始工作时间；time_block 是估计，不作为实际投入。一个任务可有多段安排，多处 UI 引用同一个对象。

**学习与成长：** LearningItem 保留手动来源链接，笔记/练习与应用任务引用具体正文或成果；WorkArtifact 保存内部版本或外部资源 ID/链接及来源。ReflectionDraft 汇集已发生事实，用户补充原因/感受后形成复盘；PlanRevision 只调整后续步骤，保留已完成步骤和原版本。事件连接任务、学习与成果时使用稳定事实 ID，关联多处不能重复计数。

**执行：** 当前 ExecutionJob 可作为已有调度入口，需演进为持久化的步骤运行与真实产出回执；不能将创建 Task 当作工具执行成功。任务当前状态、AI/应用运行状态与同步状态分别保存。后台由服务器承担，浏览器轮询只读状态。现有 API 进程内循环是本地基础，下一阶段使用独立 worker 与调度机制；先保持单一队列模型，不引入复杂多 Agent 编排。

- 运行标识关联用户、Workspace、任务/计划版本、步骤及触发实例；唯一键防止相同触发重复写入。
- 输入版本、授权范围、工具名称、运行时间、结果/外部 ID 和错误形成可追溯回执；依赖满足后才调度下一步骤。
- 工具调用不放在长期数据库事务中。先保存待执行状态，调用后保存回执；“外部成功但回执丢失”通过幂等键或资源查回核对，无法核对时等待处理，不能盲目重建。
- 进程重启可恢复待处理运行，使用领取租约避免并行重复；有限重试、退避、运行限额和超时，永久授权错误进入等待重新连接。
- 每次外部动作前检查当前授权和取消状态；撤销后不开始新动作，已在途动作的真实结果仍需记录，不能虚报已经回滚。

**连接器：** CapabilityRegistry 保存描述，Connection 保存账号/授权和可用状态，ResourceBinding 保存选定日历/文档，ExternalResourceMap/SyncCursor 保存外部 ID、版本和增量游标。能力声明要说明可读/可写、是否需要安装、支持的身份与资源。账号令牌在服务端安全保存，前端只接收状态；回调校验来源并去重。内部模板生成步骤，连接器实施明确动作；不把用户任意填写的链接变成可执行插件。

**首个外部范围：** 飞书个人日历和指定云文档，先验证应用安装/发布及账号条件；只声明实际实现的动作。同步规则区分本产品管理的资源与外部其他资源，外部事件不能触发循环写回；双端并发修改保留版本并提示冲突。Notion 的属性/正文方式仅是内容体验参考，真实连接不是 C1 的依赖。

**授权：** 持久化允许动作、选定资源、时间/事件触发与额度。既有计划 execution_enabled 仅表示基础排程，不自动转换为外部写入授权；新能力确认范围后可连续运行。扩展范围、对外发送/发布或删除等未获准动作等待确认，已获准内部写入不重复请求同一许可。

**迁移与验证：** 为现有任务增量创建内容入口，保留真实 ID、完成时间及领域关联，不从旧描述伪造已完成作品。使用真实数据库检验正文并发保存、起止时间/截止时间分离、时区跨日、关闭网页后产出、重启恢复、依赖等待、重复回调、外部成功回执丢失、授权撤销和用户隔离。外部实测与受控模拟分别记录；C1 已在本地应用上述增量迁移；尚未实现的 C2–C4 实体不提前迁移。

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

> 用户顺手留下数据，和了解这些数据的 Agent 对话，再通过分析看清变化并决定下一步。

完整闭环：

```
采集并可靠保存原始数据
    -> 确认结构化事实，保留来源
    -> Agent 基于个人数据进行连续对话
    -> 用户确认记录或行动建议
    -> 执行并反馈真实结果
    -> 数据分析统计变化，Agent 解释原因
    -> 用户决定调整，新的结果回到采集
```

### 2.1.1 核心流程与 UI 补齐合同（2026-10-07）

以下为本轮待实现的界面定义，现有 Web 路由与小程序页面尚未按此完成改造。底层数据先保存到对应领域对象并写入 Workspace Event，Memory 用于可追溯的长期上下文，不替代原始事实。

**数据入口与记录详情**

- 显示按时间组织的个人记录，支持从今日页快速采集；首版使用文本、网页地址、任务完成、学习进度和晨晚复盘等已有数据类型。
- 详情展示原始内容、发生时间、来源和关联对象；保存后明确区分已同步、仅本地保存、同步失败待重试及 AI 整理状态。
- 提供“和 Agent 讨论这条记录”，进入对话时携带真实记录引用，不要求用户再次复制内容。
- 语音、拍照、文件和外部导入尚未接通前，不显示为可用采集入口。

**Agent 对话主入口**

- 提供独立、容易到达的对话入口；手机端可单手使用输入框，键盘弹起后仍可输入与发送。
- 显示当前话题、数据时间范围和已使用的来源；支持恢复会话和连续追问。现有交易教练不能直接充当全成长 Agent。
- 回答展示结论、来源及可选行动；引用可展开原始记录，行动卡可编辑、确认或拒绝。
- 把“保存为记录”和“创建任务/计划”作为不同动作，保存成功后可跳转到真实对象；普通聊天消息与 AI 推断不自动计入分析事实。

**分析入口与报告详情**

- 提供日、周、月时间范围，优先呈现记录覆盖、任务执行、学习进度和复盘等实际可计算指标。
- 图表和报告展示来源、样本量及统计口径；区分数值事实和 Agent 解读，样本不足时使用录入入口。
- 每个重点变化提供“和 Agent 讨论”，保留报告、时间范围及证据上下文；确认调整后进入行动详情。

**跨端导航建议，待首发形态确认后定稿**

- 手机浏览器以已交付原型的主导航推进：今日、数据、Agent、分析、我的。快速记录可从今日和数据入口到达；任务、目标、计划放在相关行动和详情中。
- Web 保留组织工作所需的 Workspace 与项目能力，同时补足独立 Agent 入口、统一数据入口和分析到对话的跳转。
- 应用、插件、Skill 和历史交易保留为次级能力入口。本轮尚不新增原生 App 工程，也不把手机系统数据读取视为已授权或已实现。

**UI 验收：** 在手机宽度 375px 和桌面上，用户均可完成“新增记录 -> 在对话中引用 -> 查看分析 -> 讨论变化 -> 确认行动 -> 反馈结果”。刷新后记录、会话及已确认行动可恢复；原始输入、处理状态和重试入口可见；每个分析结论可以返回其依据。

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

## 15. 竞品研究与手机端交互原型（2026-10-07）

### 15.1 研究依据与设计提取

本轮查阅官方产品介绍、帮助文档和公开展示界面；未登录竞品账户。以下功能描述为来源事实，界面取舍为 GrowthPilot 的设计判断，不能据此宣称已验证竞品实际效果或完整功能覆盖。

- **Rosebud，直接竞品：** 对话式 AI 日记与持续个人理解；其周报告包括写作、情绪与主题回看。参考记录、历史与洞察的分层，将一条记录作为继续对话的起点。[产品官网](https://www.rosebud.app/)、[周报告说明](https://help.rosebud.app/ai-analysis/weekly-report)。
- **Mindsera，直接竞品：** 文字、语音、扫描记录，晨晚流程与 Ask Your Journal。参考低负担采集、简洁编辑器，以及记录到个人问答的明确入口。[产品官网](https://mindsera.com/)、[Dashboard 文档](https://mindsera.com/help/getting-started/dashboard)。
- **Exist，相邻竞品：** 手动与自动同步数据、趋势和统计关系。参考指标口径与来源透明；GrowthPilot 的解读需要区分事实、相关性和待验证假设。[产品官网](https://exist.io/)。
- **Day One，采集 UI 参考：** 时间线、日历、媒体和地图提供不同回看视角。借鉴日期分组、阅读留白和容易展开的原始记录。[记录视图](https://dayoneapp.com/guides/day-one-for-mac/journal-views-in-day-one-for-macos/)。
- **Oura Advisor，分析到对话参考：** 围绕个人健康数据提供助手对话。借鉴带着指标和时间范围提问的模式，用于 GrowthPilot 的工作、学习与复盘场景。[官方功能介绍](https://go.ouraring.com/madeformembers/)、[Advisor 文档](https://ouraringhelp.zendesk.com/hc/en-us/articles/39512345699219-Oura-Advisor)。
- **Linear Mobile，行动 UI 参考：** 手机端查看更新、创建和处理事项。借鉴克制的行式列表、明确确认与就地反馈。[移动端发布说明](https://linear.app/changelog/2024-09-19-introducing-linear-mobile)、[Inbox 文档](https://linear.app/docs/inbox)。

视觉选择：暖白底色、深绿色主色、少量浅绿辅助、中文优先、紧凑而可阅读的事实列表。原型原创组织上述体验模式，不沿用竞品品牌、插画或整套页面。

### 15.2 已完成的原型范围

Web 新增 `/prototype` 独立预览入口，包含“今日、数据、Agent、分析、我的”五个主界面及记录、引用详情、行动确认、数据范围等面板。桌面提供手机预览、页面切换和设计说明；375px 下使用整屏移动布局。原型中的“竞品与设计参考”可直接打开本节官方来源。

可交互流程：新增记录（学习可显式填写分钟）-> 数据时间线 -> 原始详情 -> 带引用对话 -> 审阅并编辑建议 -> 确认加入今日行动 -> 完成并记录结果 -> 分析 -> 带着分析继续对话。日/周/月范围、记录搜索、类型筛选和数据范围设置可交互。

示例数据基线：2026-10-01 至 2026-10-07 的 14 条记录、18 项行动（12 项已完成）、210 分钟学习；统计从原型对象计算，并随用户操作更新。保存使用独立的浏览器存储键，支持刷新恢复，与现有产品账户数据分开。Agent 回复为预设示例，原型未连接模型、后端、推送或原生 App 发布流程。

验证：Web 构建、lint 和既有 22 项测试通过；375px 浏览器走通新增学习记录、引用原文、确认行动、完成反馈、分析更新、范围切换和刷新恢复。学习新增 30 分钟后，累计由 210 变为 240；完成行动后记录由 15 变为 16。五个页面无横向溢出，浏览器无运行时错误。

### 15.3 下一步实现边界

原型可评审后映射到真实领域 API。优先统一真实 ID、可靠保存和同步状态；建立个人 Agent 的会话、引用、数据范围合同；让分析使用真实统计并保留证据上下文。语音、拍照、自动读取手机数据及外部导入不在本版可用入口中。

### 15.4 原型优先的执行流程（2026-10-07 已授权）

无需 App 打包，手机与桌面浏览器作为当前交付。新增能力先在 `/prototype` 展示主流程和异常恢复，再实现真实服务；可评审原型交付后按已授权的 Sprint 队列继续，不重复请求确认。

首项为可靠记录：草稿保留、保存中、本地待同步、失败重试、列表与来源详情。模拟条件必须在原型外壳明确显示；真实页面展示本地、待同步、同步中、失败或已同步，不把本地写入说成服务端 Event 已完成。

### 15.5 A1 可靠记录交付

`/prototype?screen=data&save=failure` 为 A1 预览入口：外壳可切换成功、断网、失败；未提交正文保留，保存后在数据页和详情显示状态，重试更新同一条示例。刷新时未完成同步恢复为待同步。

真实 `/app/data` 已支持快速记录、原文回看、搜索和类型筛选；同步失败后无需再次新建，点同一条记录重试即可。记录先持久化再请求服务端；浏览器存储失败时保留输入并显示错误。未登录记录只在原保存浏览器，不跨账户自动上传。

### 15.6 A2 首次工作空间完整保存交付

`/prototype/onboarding?save=partial` 提供逐项选择、内容展开和成功/断网/全部失败/部分失败模拟；示例独立存储，刷新恢复状态，重试不改变已保存示例。当前手机原型的桌面设计说明提供入口。

真实 `/app/onboarding` 展示已确认的工作空间、项目、目标、周期计划、任务和学习入口。每项显示保存中、已保存、失败或等待关联对象；取消选择的对象不创建，计划依赖目标。目标失败时保留已保存的空间和项目，后续计划、任务、学习等待关联，不伪造完整成功。

确认方案及原话按账户保存在本机，固定提交标识与安排日期。刷新优先核对服务端回执，再加载对象列表，避免响应丢失引发重复展示；重试只继续未完成项。进入工作台后可从未完成提示回到方案；预计学习时长仍是预估，不能计入实际学习投入。

---

### 15.7 A3 个人 Agent 会话交付

`/prototype/agent` 为独立可点击原型：使用明确标注的示例数据与预设回复，可选择成功、处理中、模型失败、来源不可用。会话在浏览器恢复，处理中刷新后提示中断并可重试；行动名称、说明、优先级和预计分钟可编辑，确认只改变示例。

真实入口为 `/app/agent`。桌面侧边栏与手机会话选择器显示历史会话；“新对话”保持独立上下文。用户提问保存后显示处理中，失败保留原话与同次重试，刷新读取服务端已有结果。发送支持 Enter，Shift + Enter 换行，中文输入组合期间不发送。

回复与事实依据分开：来源可展开原始全文；来源变更、删除或移出范围时，相关历史回复与待确认建议隐藏，引用显示不可用。数据范围在“我的”设置，记忆限定为能够归属当前工作台且原始来源仍被允许的条目。

行动建议在卡片中编辑确认。成功后显示已保存，进入待办能查看真实行动并返回原对话；重复确认或确认响应丢失不会新增副本。已经确认的行动仍是用户的领域事实，来源失效不会自动删除行动。完整统计与反馈交互由 A4 继续补齐。

**Created using BMAD Method v6**


### 15.8 A4 事实分析与反馈交付

独立原型 `/prototype/analysis` 支持日/周/月与日期切换，明确显示范围、时区、覆盖、来源和计算口径；可模拟无数据、样本不足、加载中、加载失败及重试。示例投入/反馈在独立浏览器存储恢复，并更新相同口径的统计。

真实 `/app/insights` 使用完整服务端领域样本。四个主指标为完成任务、实际学习分钟、记录与复盘、行动结果；分日行显示完成、学习和记录分布。当前未完成任务单独标为状态快照。少量样本只显示已发生事实，零代表无对应记录，不能解读成没有学习。数字与 AI 解读分开，解读在带上下文的 Agent 对话中进行。

“和 Agent 讨论”保存进入对话时的统计范围、口径及全部来源指纹；对话横幅显示固定范围，并可返回该范围的最新分析。新增事实会出现在下一次分析；已有来源变化或撤回授权时旧回复与建议失效，提示重新进入分析。摘要和实际送入模型的原文均可展开引用，不显示内部 UUID。

数据页与分析页的投入/结果表单只采集用户显式填写的实际分钟及原文。待办的“记录完成结果”携带任务 ID 定位表单，用户保存时完成行动并保存结果；已经填写反馈的任务不重复录入。结果显示任务名称、原文、日期及返回原 Agent 会话的链接。保存前按账号/空间保留原文；回执丢失可核对同一提交，刷新读取已保存事实。

375px 与桌面真实数据库闭环已验证：学习投入→分析→对话→编辑确认→完成反馈→数据/分析；回执丢失、重试、范围切换及异常恢复无溢出/运行时错误。后续 A5 已完成整体导航、键盘和可访问性交互收口。

### 15.9 A5 导航、键盘与试用收口

`/prototype/trial` 是独立导航/错误恢复原型，使用共同导航配置和原生 dialog；示例原文、失败草稿可在浏览器恢复。真实 Web 在 760px 以下固定今日、数据、Agent、分析、我的五个主入口；桌面使用相同命名，更多工作与能力入口保留在侧栏/手机菜单。记录按钮位于底部导航上方，不遮住导航操作。

关闭的手机菜单不渲染，打开菜单或记录后背景不能参与键盘交互。记录首先聚焦原文；Escape 或关闭恢复触发按钮焦点，成功结果承接焦点。跨页进入主要内容，提供跳过导航入口；桌面 Cmd/Ctrl+K 聚焦快捷输入，预览 Escape 回到输入。快捷输入使用规则预览，标为用户输入；AI 判断在个人 Agent 中显示为解读。活动面板与实际投入/反馈结果、讨论失败也有对应焦点和重试入口。

对话 Enter 发送、Shift+Enter 换行；输入法组合及 Safari 229 不发送。小视口输入文字 16px，记录弹层采用动态视口、安全区与滚动。375×500 用于输入空间模拟，不等同于实体手机键盘验证。云端整体/部分读取失败时提示缓存内容可能不完整或包含初始示例，重新读取后回到正常状态。

375px 五页和 1280px 桌面已走通真实数据库的首次方案→记录→投入→分析→引用对话→编辑确认→反馈→数据/分析，包含回执丢失、刷新、模型失败和读取失败恢复。真实 Qwen 的无行动后续回复用 v3 JSON 合同恢复；事实以统计和原文为准。实体手机/读屏器未验收，不宣称完整可访问性认证。

## 2026-10-07 A5 试用收口

导航配置由 `web/src/workspace/navigation.ts` 统一；CoreNavigation 使用真实路由 active 状态，原型使用同名独立入口。手机侧栏只在原生模态 dialog 中挂载，记录同样由 Modal 管理背景 inert、滚动锁及焦点返回；跨页主要区域提供 focus/skip 入口。云端水合显式区分 loading/ready/partial/error/empty，重试只读回当前账号工作空间；A1–A4 原始提交与稳定 UUID 合同保持。

实际投入/反馈和分析讨论结果承接焦点并提供重试；对话 IME 与 Safari 229 保护抽为独立输入判断。v3 提示保留 A4 统计/来源合同，明确无行动时仍输出完整 JSON，历史 AI 解读不作为事实；记录模型版本便于审计。A5 无新增数据库迁移，121 项自动检查及完整真实数据库/模型浏览器闭环通过，生产环境尚未应用迁移或发布。
