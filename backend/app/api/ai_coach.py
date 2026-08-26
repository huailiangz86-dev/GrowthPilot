"""AI Coach API — intent-based RAG trading knowledge Q&A."""

import re
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.knowledge import KnowledgeArticle
from app.models.record import Record
from app.models.user import User
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/ai-coach", tags=["ai-coach"])


# ── Intent Detection ──

INTENT_KEYWORDS = {
    "knowledge": ["什么是", "怎么看", "如何判断", "什么叫", "解释", "含义", "区别", "原理",
                   "MACD", "RSI", "KDJ", "均线", "K线", "形态", "指标", "术语",
                   "打板", "龙头", "止损", "止盈", "仓位", "缠论", "背驰", "中枢"],
    "analysis": ["我的", "最近", "分析", "表现", "交易记录", "胜率", "盈亏", "问题在哪",
                 "亏了", "赚了", "被套", "追涨", "割肉"],
    "master": ["利弗莫尔", "达利奥", "道格拉斯", "塞科塔", "米勒维尼", "埃尔德", "撒普",
               "养家", "冯柳", "徐翔", "林园", "段永平", "陈小群", "章建平", "赵老哥",
               "葛卫东", "方新侠", "瑞鹤仙", "大师", "视角", "怎么看待"],
    "recommend": ["该学", "推荐", "下一步", "学什么", "从哪开始", "入门", "进阶"],
    "market": ["大盘", "行情", "市场", "板块", "主题", "行业", "赛道", "热点", "主线",
               "轮动", "政策", "北向", "资金面", "指数", "上证", "深证", "创业板",
               "AI", "新能源", "半导体", "消费", "医药", "军工", "周期"],
}


def detect_intent(message: str) -> str:
    """Detect user intent from message."""
    scores = {k: 0 for k in INTENT_KEYWORDS}
    for intent, keywords in INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in message:
                scores[intent] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "knowledge"


# ── Compliance Filter ──

BANNED_PATTERNS = [
    r"建议(买入|卖出|购买)",
    r"推荐.{0,4}(股|票|标的)",
    r"目标价.{0,4}\d",
    r"(必涨|必跌|稳赚)",
]

AI_DISCLAIMER_FOOTER = "\n\n---\n*以上内容仅供学习参考，不构成投资建议。*"


def compliance_filter(reply: str) -> str:
    """Post-filter AI replies: flag banned investment-advice patterns and append disclaimer."""
    for pattern in BANNED_PATTERNS:
        if re.search(pattern, reply):
            reply += "\n\n⚠️ 以上分析仅供学习参考，不构成任何投资建议。投资有风险，交易需谨慎。"
            break
    reply += AI_DISCLAIMER_FOOTER
    return reply


# ── Intent-specific System Prompts ──

PROMPTS = {
    "knowledge": """你是交易知识专家。用户在问交易知识问题。

回答要求：
1. 先给出简洁定义（1-2句话）
2. 说明实战中怎么用（结合A股场景）
3. 指出常见误区（1-2个）
4. 推荐进一步学习方向

格式示例：
**定义**：MACD 是...
**实战用法**：在A股中，当...
**常见误区**：很多人以为...
**建议学习**：推荐阅读《xxx》了解更多""",

    "analysis": """你是交易分析教练。用户想分析自己的交易表现。

你已经拿到了用户最近的完整交易数据（包括每笔交易的标的、方向、盈亏、情绪、买卖原因标签）。

重要规则：
- 直接基于数据分析，绝不要反问用户"你的交易记录在哪"或"请提供数据"
- 用具体数据说话：引用具体的股票名称、具体的盈亏数字、具体的标签
- 找出数据中的规律和问题

回答结构：
1. 先总结关键指标（胜率、总盈亏、交易频率）
2. 从数据中发现的规律（比如"你6笔追涨交易只赢了2笔"、"焦虑时交易全部亏损"）
3. 给出 1-2 个具体可执行的改进建议
4. 推荐对应的大师方法论

格式：
**数据概览**：最近X笔交易，胜率X%，总盈亏X...
**发现规律**：从你的数据中发现...（引用具体交易）
**核心问题**：你最大的问题是...
**改进建议**：建议你下周尝试...
**推荐学习**：建议学习xxx大师的xxx方法""",

    "master": """你是交易大师方法论专家。用户想用某位大师的视角来分析问题。

回答要求：
1. 先引用该大师的核心观点（用引号标注）
2. 用大师的思维框架分析用户的情况
3. 给出大师可能会给的建议
4. 引导用户用对应的复盘模版

格式：
> "xxx" — xxx大师
**大师视角**：从xxx的角度看，你这种情况...
**建议**：xxx大师会建议你...
**实践**：建议使用「xxx法」复盘模版来检验""",

    "market": """你是市场分析师。用户在问关于大盘行情、板块轮动、行业主题的问题。

回答要求：
1. 先说明当前市场/板块的客观状态
2. 分析驱动因素（政策/资金/事件）
3. 指出需要关注的风险和机会
4. 结合用户关注的主题给建议

格式：
**市场概况**：当前大盘/板块处于...
**驱动因素**：主要受到...影响
**关注点**：需要关注的是...
**建议**：对于你关注的xxx主题，建议...

注意：只做分析不做预测，不推荐具体股票。""",

    "recommend": """你是学习路径规划师。用户想知道下一步该学什么。

你会收到用户的学习进度和交易数据。回答：
1. 评估用户当前水平
2. 指出最需要提升的能力
3. 推荐 2-3 个具体学习内容（从知识库中）
4. 给出学习顺序建议

格式：
**当前水平**：根据你的交易记录，你处于...阶段
**薄弱项**：最需要提升的是...
**推荐内容**：
1. 📖 xxx — 因为...
2. 📖 xxx — 因为...
**学习顺序**：建议先...再...""",
}

BASE_SYSTEM = """你是 GrowthPilot 的 AI 交易教练。

核心规则：
- 绝不推荐具体股票，绝不给买卖建议
- 回答简洁实用，不超过 300 字
- 引用大师观点时标注出处
- 说中文
- 每次回答结尾引导下一步（推荐学习/推荐复盘/追问）
- 重要：你已经拥有用户的交易数据，直接分析，绝不反问用户让他提供数据"""


# ── Data Fetching ──

async def search_knowledge(session: AsyncSession, query: str, limit: int = 3) -> list[dict]:
    """Search knowledge articles by keywords."""
    keywords = [w for w in query.replace("？", " ").replace("?", " ").replace("，", " ").replace(",", " ").replace("。", " ").split() if len(w) >= 2]
    if not keywords:
        keywords = [query[:10]]

    conditions = []
    params = {}
    for i, kw in enumerate(keywords[:5]):
        param_name = f"kw{i}"
        conditions.append(f"(title ILIKE :{param_name} OR content_md ILIKE :{param_name})")
        params[param_name] = f"%{kw}%"

    where_clause = " OR ".join(conditions)
    sql = text(f"SELECT id, title, content_md FROM knowledge_articles WHERE is_active = true AND ({where_clause}) LIMIT :lim")
    params["lim"] = limit
    result = await session.execute(sql, params)
    return [{"id": str(r[0]), "title": r[1], "content": r[2][:600]} for r in result.fetchall()]


async def get_user_trade_summary(session: AsyncSession, user_id: str) -> str:
    """Get recent trade data with full details for AI analysis."""
    uid = uuid.UUID(user_id)
    cutoff = datetime.now(UTC) - timedelta(days=30)

    result = await session.execute(
        select(Record).where(
            and_(Record.user_id == uid, Record.scene == "trading", Record.occurred_at >= cutoff)
        ).order_by(Record.occurred_at.desc()).limit(20)
    )
    records = result.scalars().all()

    if not records:
        return "该用户最近30天没有交易记录。"

    # Statistics
    total = len(records)
    pnls = [r.content.get("pnl", 0) for r in records if r.content.get("pnl") is not None]
    wins = sum(1 for p in pnls if p and p > 0)
    losses = sum(1 for p in pnls if p and p < 0)
    total_pnl = sum(p for p in pnls if p)
    win_rate = round(wins / len(pnls) * 100) if pnls else 0

    # Tag stats
    tag_counts: dict[str, int] = {}
    for r in records:
        for t in (r.tags or []):
            cat, val = t.get("category", ""), t.get("value", "")
            if val:
                key = f"{cat}:{val}"
                tag_counts[key] = tag_counts.get(key, 0) + 1

    buy_reasons = [(k.split(":")[1], v) for k, v in tag_counts.items() if k.startswith("buy_reason")]
    sell_reasons = [(k.split(":")[1], v) for k, v in tag_counts.items() if k.startswith("sell_reason")]
    emotions = [(k.split(":")[1], v) for k, v in tag_counts.items() if k.startswith("emotion")]

    # Per-trade details (recent 10)
    trade_lines = []
    for r in records[:10]:
        date_str = r.occurred_at.strftime("%m/%d")
        direction = r.content.get("direction", "")
        dir_cn = {"long": "买入", "short": "卖出", "BUY": "买入", "SELL": "卖出"}.get(direction, direction)
        pnl = r.content.get("pnl")
        pnl_str = f"盈亏{'+' if pnl and pnl > 0 else ''}{pnl}" if pnl is not None else "未了结"
        market = r.content.get("market", "A")
        tags_str = ", ".join(t.get("value", "") for t in (r.tags or []) if t.get("value"))
        emotion = r.emotion or ""
        trade_lines.append(f"  {date_str} {r.title} {dir_cn} {pnl_str} 情绪:{emotion} 标签:[{tags_str}]")

    summary = f"""=== 最近30天交易数据 ===
统计概览：
- 交易笔数：{total}笔，胜率：{win_rate}%（{wins}赢 {losses}亏）
- 总盈亏：{total_pnl}

买入原因分布：{', '.join(f'{r[0]}({r[1]}次)' for r in sorted(buy_reasons, key=lambda x: -x[1])[:5]) or '无'}
卖出原因分布：{', '.join(f'{r[0]}({r[1]}次)' for r in sorted(sell_reasons, key=lambda x: -x[1])[:5]) or '无'}
情绪分布：{', '.join(f'{e[0]}({e[1]}次)' for e in sorted(emotions, key=lambda x: -x[1])[:5]) or '无'}

最近交易明细：
{chr(10).join(trade_lines)}

请直接基于以上数据进行分析，不要再向用户询问交易详情。"""
    return summary


async def get_user_themes(session: AsyncSession, user_id: str) -> list[str]:
    """Get user's interested themes from settings."""
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        return []
    return user.settings.get("themes", []) if user.settings else []


# ── Theme Management ──

class ThemeUpdateRequest(BaseModel):
    themes: list[str] = Field(default_factory=list, max_length=20)


@router.get("/themes", response_model=ApiResponse[list])
async def get_themes(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    themes = await get_user_themes(session, user_id)
    return ApiResponse(success=True, data=themes)


@router.put("/themes", response_model=ApiResponse[list])
async def update_themes(
    payload: ThemeUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user:
        settings_data = dict(user.settings) if user.settings else {}
        settings_data["themes"] = payload.themes
        user.settings = settings_data
        await session.commit()
    return ApiResponse(success=True, data=payload.themes)


PRESET_THEMES = [
    "AI/人工智能", "新能源", "半导体", "消费", "医药", "军工",
    "周期/有色", "房地产", "金融/券商", "汽车/智能驾驶",
    "机器人", "低空经济", "数据要素", "国产替代",
]


@router.get("/preset-themes", response_model=ApiResponse[list])
async def preset_themes() -> ApiResponse[list]:
    return ApiResponse(success=True, data=PRESET_THEMES)


# ── Main Chat Endpoint ──

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    links: list[dict] = Field(default_factory=list)
    intent: str = ""


@router.post("/chat", response_model=ApiResponse[ChatResponse])
async def chat(
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ChatResponse]:
    # 1. Detect intent
    intent = detect_intent(payload.message)

    # 2. Gather context based on intent
    knowledge_results = await search_knowledge(session, payload.message)
    context_parts = []
    links = []

    for k in knowledge_results:
        context_parts.append(f"【{k['title']}】\n{k['content']}")
        links.append({"title": k["title"], "id": k["id"]})

    knowledge_context = "\n\n".join(context_parts) if context_parts else ""

    # Always fetch user trade data — AI should know user's context
    trade_summary = await get_user_trade_summary(session, user_id)

    # For market intent, also fetch user themes
    user_themes_ctx = ""
    if intent == "market":
        themes = await get_user_themes(session, user_id)
        if themes:
            user_themes_ctx = f"用户关注的主题/行业：{', '.join(themes)}"

    # 3. Build LLM messages
    intent_prompt = PROMPTS.get(intent, PROMPTS["knowledge"])
    system_content = f"{BASE_SYSTEM}\n\n{intent_prompt}"

    messages = [{"role": "system", "content": system_content}]

    if knowledge_context:
        messages.append({"role": "system", "content": f"知识库参考内容：\n{knowledge_context}"})

    if trade_summary:
        messages.append({"role": "system", "content": f"用户交易数据：\n{trade_summary}"})

    if user_themes_ctx:
        messages.append({"role": "system", "content": user_themes_ctx})

    for h in payload.history[-10:]:
        if h.get("role") in ("user", "assistant"):
            messages.append({"role": h["role"], "content": h["content"]})

    messages.append({"role": "user", "content": payload.message})

    # 4. Call Qwen
    reply = "抱歉，AI 服务暂时不可用，请稍后再试。"
    try:
        async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
            resp = await client.post(
                f"{settings.QWEN_BASE_URL}/chat/completions",
                json={"model": "qwen-plus", "messages": messages, "max_tokens": 800, "temperature": 0.7},
                headers={"Authorization": f"Bearer {settings.QWEN_API_KEY}", "Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                reply = data["choices"][0]["message"]["content"]
            else:
                logger.error("qwen_error", status=resp.status_code, body=resp.text[:200])
    except Exception as e:
        logger.error("ai_coach_error", error=str(e))

    # 5. Log LLM call
    try:
        from app.models.llm_call import LLMCall
        session.add(LLMCall(
            id=uuid.uuid4(), user_id=uuid.UUID(user_id),
            provider="qwen", model="qwen-plus",
            prompt_tokens=len(str(messages)) // 4,
            completion_tokens=len(reply) // 4,
            purpose=f"ai_coach_{intent}",
        ))
        await session.commit()
    except Exception:
        pass

    # 6. Apply compliance filter before returning
    reply = compliance_filter(reply)

    return ApiResponse(success=True, data=ChatResponse(reply=reply, links=links, intent=intent))
