"""Calendar ranges and full-sample statistics; never infer actual minutes."""
import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from sqlalchemy import select
from app.engines.daily_preferences import user_daily_timezone
from app.engines.privacy_scope import privacy_source_enabled, user_privacy_scope
from app.models.agent_conversation import AgentConversation, AgentTurn
from app.models.task import Task
from app.models.workspace_fact import AnalysisSnapshot, WorkspaceFact
from app.models.workspace_reflection import WorkspaceReflection

RULES = [
    "按用户时区的自然日、周一开始的自然周、自然月统计。开始时刻计入，结束时刻不计入；未来日期不加入覆盖分母。",
    "完成任务统计当前仍为已完成，且最近一次完成发生在范围内的任务；重开后不算已完成。新增任务按创建时间统计，两者不能相除作为完成率。",
    "当前未完成数是当前状态快照，不是历史积压趋势。任务与其事件不重复计数。",
    "记录与复盘按所记录的日期统计，补录归入填写的日期；同一来源只占一个样本。",
    "学习累加实际分钟记录与学习页面自动保存的有效计时；预计时长、进度百分比和自由文本中的数字均不参与。",
    "行动结果按反馈日期计数；完成 Agent 行动按确认任务的最近完成时间计数，反馈不重复增加完成任务数。",
    "覆盖天数是范围内有事实来源的去重日期。少于 3 个样本，或未覆盖至少 3 天时标记样本不足；范围已过去不足 3 天时，按已过去天数要求覆盖。不推断趋势。",
]

def period_window(period: str, anchor: date, settings: dict, now: datetime | None = None):
    tz = user_daily_timezone(settings)
    today = (now or datetime.now(UTC)).astimezone(tz).date()
    start = anchor if period == "day" else anchor - timedelta(days=anchor.weekday()) if period == "week" else anchor.replace(day=1)
    stop = start + timedelta(days=1 if period == "day" else 7) if period != "month" else (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    first = datetime.combine(start, time.min, tz).astimezone(UTC)
    last = datetime.combine(stop, time.min, tz).astimezone(UTC)
    elapsed = max(0, (min(stop - timedelta(days=1), today) - start).days + 1)
    return start, stop, first, last, today, elapsed

def fact_evidence(row: WorkspaceFact, task: Task | None = None):
    source = "learning" if row.kind == "learning" else "tasks"
    title = f"{row.entry_date} · 实际学习投入" if row.kind == "learning" else f"{row.entry_date} · 行动反馈"
    content = f"实际学习：{row.minutes} 分钟\n原文：{row.note}" if row.kind == "learning" else f"任务：{task.title if task else '来源任务不可用'}\n完成结果原文：{row.note}"
    item = {"key": f"facts:{row.id}", "source": source, "title": title, "content": content}
    item["digest"] = hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return item

async def build_report(session, uid, wid, settings, period, anchor, *, ai_scope=False, now=None):
    from app.engines.agent_context import evidence
    start, stop, first, last, today, elapsed = period_window(period, anchor, settings, now)
    cut = min(stop - timedelta(days=1), today)
    included = lambda key: not ai_scope or privacy_source_enabled(settings, key)
    tasks = (await session.execute(select(Task).where(Task.user_id == uid, Task.workspace_id == wid, Task.deleted_at.is_(None)).order_by(Task.created_at, Task.id).execution_options(populate_existing=True))).scalars().all() if included("tasks") else []
    task_map = {t.id:t for t in tasks}
    reflections = (await session.execute(select(WorkspaceReflection).where(WorkspaceReflection.user_id == uid, WorkspaceReflection.workspace_id == wid, WorkspaceReflection.reflection_date >= start, WorkspaceReflection.reflection_date <= cut).order_by(WorkspaceReflection.reflection_date, WorkspaceReflection.id).execution_options(populate_existing=True))).scalars().all() if included("reflections") else []
    facts = (await session.execute(select(WorkspaceFact).where(WorkspaceFact.user_id == uid, WorkspaceFact.workspace_id == wid, WorkspaceFact.entry_date >= start, WorkspaceFact.entry_date <= cut).order_by(WorkspaceFact.entry_date, WorkspaceFact.id).execution_options(populate_existing=True))).scalars().all()
    facts = [f for f in facts if (f.kind == "learning" and included("learning")) or (f.kind == "feedback" and included("tasks") and f.task_id in task_map)]
    completed = [t for t in tasks if t.status == "done" and t.completed_at and first <= t.completed_at < last and t.completed_at.astimezone(user_daily_timezone(settings)).date() <= today]
    created = [t for t in tasks if first <= t.created_at < last and t.created_at.astimezone(user_daily_timezone(settings)).date() <= today]
    agent_ids = set((await session.execute(select(AgentTurn.confirmed_task_id).join(AgentConversation, AgentConversation.id == AgentTurn.conversation_id).where(AgentConversation.user_id == uid, AgentConversation.workspace_id == wid, AgentTurn.confirmed_task_id.is_not(None)))).scalars().all())
    learning = [f for f in facts if f.kind == "learning"]
    feedback = [f for f in facts if f.kind == "feedback"]
    metrics = {"completed_tasks":len(completed), "created_tasks":len(created), "open_tasks":sum(t.status != "done" for t in tasks), "captures":sum(r.reflection_type == "micro" for r in reflections), "reflections":sum(r.reflection_type != "micro" for r in reflections), "learning_minutes":sum(f.minutes for f in learning), "learning_sessions":len(learning), "feedback":len(feedback), "agent_completed":sum(t.id in agent_ids for t in completed)}
    daily = {str(start + timedelta(days=n)):{"date":str(start + timedelta(days=n)), "completed_tasks":0, "records":0, "learning_minutes":0, "feedback":0} for n in range(elapsed)}
    sources = []
    refs = []
    for task in tasks:
        ref = evidence("tasks", task)
        refs.append({"key":ref["key"], "digest":ref["digest"]})  # Includes current-state open-task denominator.
        when = task.completed_at if task in completed else task.created_at if task in created else None
        if when:
            key = str(when.astimezone(user_daily_timezone(settings)).date())
            sources.append({**ref,"date":key})
            if task in completed: daily[key]["completed_tasks"] += 1
    for row in reflections:
        ref = evidence("reflections", row)
        sources.append({**ref,"date":str(row.reflection_date)})
        refs.append({"key":ref["key"],"digest":ref["digest"]})
        daily[str(row.reflection_date)]["records"] += 1
    for row in facts:
        ref = fact_evidence(row, task_map.get(row.task_id))
        sources.append({**ref,"date":str(row.entry_date)})
        refs.append({"key":ref["key"],"digest":ref["digest"]})
        daily[str(row.entry_date)]["learning_minutes" if row.kind == "learning" else "feedback"] += row.minutes if row.kind == "learning" else 1
    covered = len({s["date"] for s in sources})
    count = len(sources)
    report = {"workspace_id":str(wid),"period":period,"start":str(start),"end":str(stop - timedelta(days=1)),"timezone":str(user_daily_timezone(settings)),"generated_at":(now or datetime.now(UTC)).isoformat(),"coverage":{"days":covered,"elapsed_days":elapsed,"samples":count,"state":"empty" if not count else "sparse" if count < 3 or covered < min(3,elapsed) else "ready"},"metrics":metrics,"daily":list(daily.values()),"evidence":sources,"rules":RULES,"excluded_sources":[k for k in ("tasks","reflections","learning") if not included(k)]}
    return report, refs

async def snapshot_evidence(session, uid, wid, sid, settings):
    from app.engines.agent_context import refs_current
    snapshot = (await session.execute(select(AnalysisSnapshot).where(AnalysisSnapshot.id == sid, AnalysisSnapshot.user_id == uid, AnalysisSnapshot.workspace_id == wid))).scalar_one_or_none()
    if not snapshot or any(not privacy_source_enabled(settings,key) for key in snapshot.enabled_sources): return None
    if not await refs_current(session, uid, wid, snapshot.source_refs, settings): return None
    # The model receives full-sample statistics and explicitly bounded source excerpts.
    report = snapshot.report
    content = json.dumps({**report,"evidence":[{k:v[:1200] if k=="content" else v for k,v in s.items() if k!="digest"} for s in report["evidence"][:12]],"excerpt_note":"统计覆盖全部样本；这里只附最多12条来源摘录。未出现的原文不能推断。"}, ensure_ascii=False)
    result = {"key":f"analysis:{sid}","source":"analysis","title":f"{report['start']} — {report['end']} · 事实分析", "content":content}
    result["digest"] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return result

def readable_snapshot(content):
    report = json.loads(content)
    m, c = report["metrics"], report["coverage"]
    lines = [f"时间范围：{report['start']} — {report['end']}（{report['timezone']}）",f"保存时间：{report['generated_at']}",
        f"完成任务：{m['completed_tasks']} 件；范围内新增任务：{m['created_tasks']} 件",f"实际学习：{m['learning_minutes']} 分钟，来自 {m['learning_sessions']} 条实际时间记录",
        f"快速记录：{m['captures']} 条；晨晚复盘：{m['reflections']} 条；行动结果：{m['feedback']} 条",f"完成的 Agent 行动：{m['agent_completed']} 件；保存时未完成任务：{m['open_tasks']} 件（当前状态快照）",
        f"样本覆盖：{c['samples']} 个来源，覆盖已过去 {c['elapsed_days']} 天中的 {c['days']} 天", "\n统计口径：",*report["rules"],"\n原始来源摘录（最多 12 条；统计使用完整样本）："]
    lines.extend(f"{s['title']} · {s['date']}\n{s['content']}" for s in report["evidence"])
    if report["excluded_sources"]: lines.append("已排除未授权的数据来源。")
    return "\n".join(lines)
