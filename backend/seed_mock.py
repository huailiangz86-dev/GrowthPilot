"""Seed mock data for testing — run with: PYTHONPATH=. uv run python seed_mock.py"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base
from app.core.security import generate_proof_hash
from app.engines.tag_engine import seed_preset_tags
from app.models.growth import Banner
from app.models.news import NewsItem
from app.models.record import Record
from app.models.review import Review
from app.models.user import User


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        # 1. Seed tags
        count = await seed_preset_tags(session)
        print(f"Tags seeded: {count}")

        # 2. Create/find user
        result = await session.execute(select(User).where(User.wx_openid == "dev_mockuser"))
        user = result.scalar_one_or_none()
        if not user:
            user = User(id=uuid.uuid4(), wx_openid="dev_mockuser", nickname="测试交易者",
                        markets=["A", "US", "CRYPTO"], watchlist=["600519", "BTC", "AAPL"],
                        is_beta_user=True, beta_number=1)
            session.add(user)
            await session.commit()
            print(f"User created: {user.id}")
        else:
            print(f"User exists: {user.id}")

        uid = user.id
        now = datetime.now(UTC)

        # 3. Mock trades
        trades = [
            ("贵州茅台 买入", "trading", "buy", {"symbol_name": "贵州茅台", "direction": "BUY", "price_enc": "1685", "pnl": 1200, "pnl_pct": 5.2},
             [{"category": "buy_reason", "value": "趋势突破"}, {"category": "emotion", "value": "平静"}], "平静", 6),
            ("比亚迪 买入", "trading", "buy", {"symbol_name": "比亚迪", "direction": "BUY", "price_enc": "285", "pnl": -800, "pnl_pct": -4.2},
             [{"category": "buy_reason", "value": "抄底"}, {"category": "emotion", "value": "焦虑"}], "焦虑", 5),
            ("宁德时代 买入", "trading", "buy", {"symbol_name": "宁德时代", "direction": "BUY", "price_enc": "220", "pnl": 1500, "pnl_pct": 6.8},
             [{"category": "buy_reason", "value": "均线信号"}, {"category": "buy_reason", "value": "趋势突破"}, {"category": "emotion", "value": "平静"}], "平静", 5),
            ("中国平安 买入", "trading", "buy", {"symbol_name": "中国平安", "direction": "BUY", "price_enc": "48", "pnl": -350, "pnl_pct": -2.1},
             [{"category": "buy_reason", "value": "超跌反弹"}, {"category": "emotion", "value": "冲动"}], "冲动", 4),
            ("招商银行 买入", "trading", "buy", {"symbol_name": "招商银行", "direction": "BUY", "price_enc": "35", "pnl": 420, "pnl_pct": 3.5},
             [{"category": "buy_reason", "value": "基本面"}, {"category": "emotion", "value": "平静"}], "平静", 4),
            ("隆基绿能 买入", "trading", "buy", {"symbol_name": "隆基绿能", "direction": "BUY", "price_enc": "28", "pnl": -1200, "pnl_pct": -8.5},
             [{"category": "buy_reason", "value": "抄底"}, {"category": "emotion", "value": "害怕"}], "害怕", 3),
            ("紫金矿业 买入", "trading", "buy", {"symbol_name": "紫金矿业", "direction": "BUY", "price_enc": "15", "pnl": 800, "pnl_pct": 5.3},
             [{"category": "buy_reason", "value": "消息刺激"}, {"category": "emotion", "value": "兴奋"}], "兴奋", 3),
            ("腾讯控股 买入", "trading", "buy", {"symbol_name": "腾讯控股", "direction": "BUY", "price_enc": "380", "pnl": 2200, "pnl_pct": 4.5},
             [{"category": "buy_reason", "value": "趋势突破"}, {"category": "emotion", "value": "平静"}], "平静", 2),
            ("小米集团 买入", "trading", "buy", {"symbol_name": "小米集团", "direction": "BUY", "price_enc": "22", "pnl": -500, "pnl_pct": -3.2},
             [{"category": "buy_reason", "value": "抄底"}, {"category": "emotion", "value": "焦虑"}], "焦虑", 2),
            ("五粮液 买入", "trading", "buy", {"symbol_name": "五粮液", "direction": "BUY", "price_enc": "155", "pnl": 950, "pnl_pct": 4.1},
             [{"category": "buy_reason", "value": "技术面"}, {"category": "emotion", "value": "平静"}], "平静", 1),
            ("药明康德 买入", "trading", "buy", {"symbol_name": "药明康德", "direction": "BUY", "price_enc": "65", "pnl": -680, "pnl_pct": -5.1},
             [{"category": "buy_reason", "value": "超跌反弹"}, {"category": "emotion", "value": "冲动"}], "冲动", 1),
            ("BTC 买入", "crypto", "buy", {"symbol_name": "BTC", "direction": "BUY", "price_enc": "67500", "pnl": 3500, "pnl_pct": 5.2},
             [{"category": "buy_reason", "value": "趋势突破"}, {"category": "emotion", "value": "兴奋"}], "兴奋", 4),
            ("ETH 买入", "crypto", "buy", {"symbol_name": "ETH", "direction": "BUY", "price_enc": "3800", "pnl": -200, "pnl_pct": -2.1},
             [{"category": "buy_reason", "value": "FOMO"}, {"category": "emotion", "value": "冲动"}], "冲动", 3),
            ("SOL 买入", "crypto", "buy", {"symbol_name": "SOL", "direction": "BUY", "price_enc": "155", "pnl": 800, "pnl_pct": 8.5},
             [{"category": "buy_reason", "value": "技术信号"}, {"category": "emotion", "value": "平静"}], "平静", 1),
        ]

        for title, scene, rtype, content, tags, emotion, days_ago in trades:
            ts, h = generate_proof_hash({"title": title})
            session.add(Record(
                id=uuid.uuid4(), user_id=uid, scene=scene, record_type=rtype,
                title=title, content=content, tags=tags, emotion=emotion,
                occurred_at=now - timedelta(days=days_ago), proof_hash=h, proof_ts=ts,
            ))
        await session.commit()
        print(f"Trades created: {len(trades)}")

        # 4. Mock reviews
        reviews = [
            ("趋势判断准确，茅台和宁德都抓到了主升浪", "抄底隆基绿能太冲动，没有等确认信号", "减少抄底操作，专注趋势突破", 3),
            ("腾讯控股仓位控制合理", "小米FOMO买入，情绪化操作", "焦虑时不做交易决策", 2),
            ("五粮液技术面判断正确", "药明康德追涨被套", "严格执行止损纪律", 1),
        ]
        for right, wrong, plan, days_ago in reviews:
            session.add(Review(
                id=uuid.uuid4(), user_id=uid, scene="trading", template="trading_daily",
                did_right=right, did_wrong=wrong, next_plan=plan,
                review_date=(now - timedelta(days=days_ago)).date(),
            ))
        await session.commit()
        print(f"Reviews created: {len(reviews)}")

        # 5. Mock banners
        banners = [
            ("欢迎使用 GrowthPilot", "page", "/pages/record-form/index", 1),
            ("升级 Pro 解锁全部功能", "upgrade", "", 2),
            ("AI 模式发现已上线", "page", "/pages/analysis/index", 3),
        ]
        for title, ltype, target, order in banners:
            session.add(Banner(id=uuid.uuid4(), title=title, link_type=ltype, link_target=target, sort_order=order))
        await session.commit()
        print(f"Banners created: {len(banners)}")

        # 6. Mock news
        news = [
            ("sina", "贵州茅台：白酒板块午后集体拉升", "白酒板块午后走强，贵州茅台涨超3%", "positive", ["600519"]),
            ("coindesk", "BTC 突破 67000 美元创年内新高", "比特币价格突破67000美元，市场情绪乐观", "positive", ["BTC"]),
            ("sina", "纳指收跌：科技股集体回调", "美股科技股遭遇抛售，纳指跌1.2%", "negative", ["AAPL"]),
            ("eastmoney", "新能源板块分化：宁德时代逆势上涨", "新能源板块内部分化加剧", "neutral", ["300750"]),
            ("coindesk", "ETH 2.0 质押量突破新高", "以太坊质押总量超过3200万枚", "positive", ["ETH"]),
        ]
        for source, title, summary, sentiment, symbols in news:
            session.add(NewsItem(
                id=uuid.uuid4(), source=source, title=title, summary=summary,
                sentiment=sentiment, related_symbols=symbols,
                published_at=now - timedelta(hours=len(news)),
            ))
        await session.commit()
        print(f"News created: {len(news)}")

    await engine.dispose()
    print("\n=== MOCK DATA COMPLETE ===")


asyncio.run(main())
