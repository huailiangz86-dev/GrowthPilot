"""Pre-defined learning paths for onboarding.

Each path has stages, each stage has days with tasks.
Tasks reference article titles (not IDs) for runtime lookup.
"""

LEARNING_PATHS: dict[str, dict] = {
    "beginner_30day": {
        "id": "beginner_30day",
        "name": "新手30天入门",
        "description": "从零开始，30天建立系统的交易认知和复盘习惯",
        "total_days": 30,
        "stages": [
            {
                "name": "基础认知",
                "days": [
                    {"day": 1, "type": "read", "title": "阅读「交易术语：止损」", "article_title": "交易术语：止损", "description": "了解止损的基本概念和重要性"},
                    {"day": 2, "type": "read", "title": "阅读「交易术语：仓位管理」", "article_title": "交易术语：仓位管理", "description": "学习仓位管理的基础知识"},
                    {"day": 3, "type": "read", "title": "阅读「K线形态：锤子线」", "article_title": "K线形态：锤子线", "description": "认识第一个K线反转信号"},
                    {"day": 4, "type": "read", "title": "阅读「技术指标：MA均线系统」", "article_title": "技术指标：MA均线系统", "description": "掌握均线系统的基本用法"},
                    {"day": 5, "type": "record", "title": "记录第一笔交易", "article_title": "", "description": "用GrowthPilot记录一笔真实或模拟交易"},
                    {"day": 6, "type": "read", "title": "阅读「利弗莫尔：关键点交易法」", "article_title": "利弗莫尔：关键点交易法", "description": "学习传奇交易员的核心方法"},
                ],
            },
            {
                "name": "建立复盘习惯",
                "days": [
                    {"day": 7, "type": "review", "title": "用利弗莫尔模版完成第一次复盘", "article_title": "", "description": "选择利弗莫尔复盘模版，完成一次复盘"},
                    {"day": 8, "type": "read", "title": "阅读「道格拉斯：概率思维」", "article_title": "道格拉斯：概率思维", "description": "建立概率化的交易思维"},
                    {"day": 9, "type": "read", "title": "阅读「交易术语：盈亏比」", "article_title": "交易术语：盈亏比", "description": "理解盈亏比对长期盈利的影响"},
                    {"day": 10, "type": "review", "title": "用道格拉斯模版复盘一笔交易", "article_title": "", "description": "用概率思维视角审视一笔交易"},
                    {"day": 11, "type": "read", "title": "阅读「K线形态：十字星」", "article_title": "K线形态：十字星", "description": "学习十字星的市场含义"},
                    {"day": 12, "type": "read", "title": "查看分析页面，了解交易统计", "article_title": "", "description": "进入分析页面，了解自己的交易数据"},
                ],
            },
            {
                "name": "心理建设",
                "days": [
                    {"day": 13, "type": "read", "title": "阅读《交易心理分析》第1章", "article_title": "《交易心理分析》第1章", "description": "了解交易心理的基本框架"},
                    {"day": 14, "type": "read", "title": "阅读《交易心理分析》第2章", "article_title": "《交易心理分析》第2章", "description": "深入理解市场不确定性"},
                    {"day": 15, "type": "review", "title": "用道格拉斯模版复盘，关注情绪标签", "article_title": "", "description": "复盘时特别关注情绪对交易的影响"},
                    {"day": 16, "type": "read", "title": "阅读「塞科塔：截断亏损」", "article_title": "塞科塔：截断亏损", "description": "学习止损纪律的核心理念"},
                    {"day": 17, "type": "read", "title": "阅读「达利奥：痛苦+反思=进步」", "article_title": "达利奥：痛苦+反思=进步", "description": "用反思驱动交易成长"},
                    {"day": 18, "type": "review", "title": "用达利奥模版做一次深度复盘", "article_title": "", "description": "从原则角度深度反思交易决策"},
                ],
            },
            {
                "name": "策略入门",
                "days": [
                    {"day": 19, "type": "read", "title": "阅读「宏观行情分析框架」", "article_title": "宏观行情分析框架", "description": "建立宏观视角的分析方法"},
                    {"day": 20, "type": "read", "title": "阅读「板块轮动与主题投资」", "article_title": "板块轮动与主题投资", "description": "了解板块轮动的规律"},
                    {"day": 21, "type": "read", "title": "阅读《龙头战法》第1-2章", "article_title": "《龙头战法》第1-2章", "description": "学习龙头股的识别方法"},
                    {"day": 22, "type": "review", "title": "用陈小群模版复盘一笔龙头交易", "article_title": "", "description": "从龙头战法视角复盘交易"},
                    {"day": 23, "type": "read", "title": "阅读「米勒维尼：SEPA检查清单」", "article_title": "米勒维尼：SEPA检查清单", "description": "学习系统化的选股检查方法"},
                    {"day": 24, "type": "record", "title": "建立自己的入场检查清单", "article_title": "", "description": "根据所学，制定属于自己的入场规则"},
                ],
            },
            {
                "name": "综合实战",
                "days": [
                    {"day": 25, "type": "read", "title": "阅读「范·撒普：期望值与仓位管理」", "article_title": "范·撒普：期望值与仓位管理", "description": "用数学思维管理仓位"},
                    {"day": 26, "type": "record", "title": "计算最近交易的R值", "article_title": "", "description": "用R值衡量交易风险回报"},
                    {"day": 27, "type": "read", "title": "阅读「行业分析方法论」", "article_title": "行业分析方法论", "description": "学习行业研究的框架"},
                    {"day": 28, "type": "ai", "title": "AI教练：分析我最近的交易", "article_title": "", "description": "让AI教练帮你分析近期交易模式"},
                    {"day": 29, "type": "review", "title": "回顾30天学习成果", "article_title": "", "description": "做一次全面的学习复盘"},
                    {"day": 30, "type": "ai", "title": "确定最适合的大师框架", "article_title": "", "description": "结合AI分析，选定适合自己的交易框架"},
                ],
            },
        ],
    },
    "psychology_15day": {
        "id": "psychology_15day",
        "name": "交易心理突破",
        "description": "15天克服情绪化交易，建立纪律性交易习惯",
        "total_days": 15,
        "stages": [
            {
                "name": "认识情绪",
                "days": [
                    {"day": 1, "type": "read", "title": "阅读《交易心理分析》第1章", "article_title": "《交易心理分析》第1章", "description": "了解交易心理的基本框架"},
                    {"day": 2, "type": "read", "title": "阅读《交易心理分析》第2章", "article_title": "《交易心理分析》第2章", "description": "理解市场的不确定性本质"},
                    {"day": 3, "type": "read", "title": "阅读《交易心理分析》第3章", "article_title": "《交易心理分析》第3章", "description": "认识恐惧和贪婪的心理机制"},
                    {"day": 4, "type": "read", "title": "阅读「道格拉斯：概率思维」", "article_title": "道格拉斯：概率思维", "description": "建立概率化的交易思维"},
                    {"day": 5, "type": "review", "title": "记录今天的交易情绪", "article_title": "", "description": "用道格拉斯模版复盘，重点关注情绪"},
                ],
            },
            {
                "name": "建立纪律",
                "days": [
                    {"day": 6, "type": "read", "title": "阅读「塞科塔：截断亏损」", "article_title": "塞科塔：截断亏损", "description": "学习止损纪律的核心理念"},
                    {"day": 7, "type": "read", "title": "阅读「利弗莫尔：关键点交易法」", "article_title": "利弗莫尔：关键点交易法", "description": "学习耐心等待关键点的方法"},
                    {"day": 8, "type": "review", "title": "用道格拉斯模版复盘一笔交易", "article_title": "", "description": "检查交易中是否遵守了纪律"},
                    {"day": 9, "type": "read", "title": "阅读「交易术语：止损」", "article_title": "交易术语：止损", "description": "回顾止损的执行方法"},
                    {"day": 10, "type": "review", "title": "复盘本周所有交易的情绪影响", "article_title": "", "description": "统计情绪化交易的频率和代价"},
                ],
            },
            {
                "name": "情绪管理实战",
                "days": [
                    {"day": 11, "type": "read", "title": "阅读「达利奥：痛苦+反思=进步」", "article_title": "达利奥：痛苦+反思=进步", "description": "用反思将亏损转化为成长"},
                    {"day": 12, "type": "review", "title": "分析自己情绪vs盈亏的关系", "article_title": "", "description": "用分析页面找出情绪与盈亏的关联"},
                    {"day": 13, "type": "ai", "title": "AI教练：分析我的情绪模式", "article_title": "", "description": "让AI教练帮你发现情绪化交易的模式"},
                    {"day": 14, "type": "review", "title": "制定个人情绪管理规则", "article_title": "", "description": "总结学习成果，制定3条情绪管理规则"},
                    {"day": 15, "type": "ai", "title": "AI教练：回顾15天心理突破之旅", "article_title": "", "description": "让AI帮你总结这15天的成长变化"},
                ],
            },
        ],
    },
    "risk_15day": {
        "id": "risk_15day",
        "name": "风控与仓位",
        "description": "15天掌握风险控制与仓位管理的核心方法",
        "total_days": 15,
        "stages": [
            {
                "name": "基础风控",
                "days": [
                    {"day": 1, "type": "read", "title": "阅读「交易术语：止损」", "article_title": "交易术语：止损", "description": "掌握止损的设置方法"},
                    {"day": 2, "type": "read", "title": "阅读「交易术语：盈亏比」", "article_title": "交易术语：盈亏比", "description": "理解盈亏比对长期盈利的意义"},
                    {"day": 3, "type": "read", "title": "阅读「范·撒普：期望值与仓位管理」", "article_title": "范·撒普：期望值与仓位管理", "description": "用R值量化交易风险"},
                    {"day": 4, "type": "read", "title": "阅读「米勒维尼：SEPA检查清单」", "article_title": "米勒维尼：SEPA检查清单", "description": "系统化的风险检查方法"},
                    {"day": 5, "type": "review", "title": "复盘最近交易的风控执行情况", "article_title": "", "description": "检查每笔交易是否设了止损和目标价"},
                ],
            },
            {
                "name": "仓位管理",
                "days": [
                    {"day": 6, "type": "read", "title": "阅读「交易术语：仓位管理」", "article_title": "交易术语：仓位管理", "description": "学习仓位管理的基础理论"},
                    {"day": 7, "type": "read", "title": "阅读「塞科塔：截断亏损」", "article_title": "塞科塔：截断亏损", "description": "学习严格止损的重要性"},
                    {"day": 8, "type": "record", "title": "计算最近5笔交易的R值", "article_title": "", "description": "用R值分析风险回报比"},
                    {"day": 9, "type": "read", "title": "阅读「利弗莫尔：关键点交易法」", "article_title": "利弗莫尔：关键点交易法", "description": "学习仓位加减的时机选择"},
                    {"day": 10, "type": "review", "title": "复盘本周仓位管理的得失", "article_title": "", "description": "分析仓位大小对盈亏的影响"},
                ],
            },
            {
                "name": "系统化风控",
                "days": [
                    {"day": 11, "type": "record", "title": "建立自己的风控检查清单", "article_title": "", "description": "制定入场前必须检查的风控条件"},
                    {"day": 12, "type": "read", "title": "阅读「达利奥：痛苦+反思=进步」", "article_title": "达利奥：痛苦+反思=进步", "description": "从亏损中提炼风控规则"},
                    {"day": 13, "type": "review", "title": "计算交易的期望值", "article_title": "", "description": "用历史数据计算你的交易系统期望值"},
                    {"day": 14, "type": "ai", "title": "AI教练：分析我的仓位问题", "article_title": "", "description": "让AI帮你发现仓位管理的改进空间"},
                    {"day": 15, "type": "ai", "title": "AI教练：回顾15天风控学习之旅", "article_title": "", "description": "总结风控学习成果和未来改进方向"},
                ],
            },
        ],
    },
}


def get_path(path_id: str) -> dict | None:
    """Get a learning path by ID."""
    return LEARNING_PATHS.get(path_id)


def assign_path(level: str, focus: str) -> dict:
    """Assign a learning path based on user level and focus area."""
    if level == "beginner":
        return LEARNING_PATHS["beginner_30day"]
    if focus == "psychology":
        return LEARNING_PATHS["psychology_15day"]
    if focus == "risk":
        return LEARNING_PATHS["risk_15day"]
    # Default: beginner path for intermediate/advanced with review/strategy focus
    return LEARNING_PATHS["beginner_30day"]


def get_day_task(path_id: str, day: int) -> dict | None:
    """Get the task for a specific day in a path."""
    path = LEARNING_PATHS.get(path_id)
    if not path:
        return None
    for stage in path["stages"]:
        for task in stage["days"]:
            if task["day"] == day:
                return task
    return None
