"""Deterministic views of all confirmed facts in a bounded date range."""
from datetime import date, timedelta


def fitness_report(records, revisions, start, end):
    summaries = [{"id": str(r.id), "version": r.version, "title": r.content["title"],
        "occurred_on": r.content["occurred_on"], "timezone": r.content["timezone"],
        "outcome": r.content["outcome"], "actual_minutes": r.content["actual_minutes"],
        "exercises": r.content["exercises"]} for r in records]
    completed = [r for r in summaries if r["outcome"] == "completed"]
    by_day, weights = {}, {}
    for r in summaries:
        by_day.setdefault(r["occurred_on"], []).append(r)
        if r["outcome"] != "completed":
            continue
        for e in r["exercises"]:
            name = e["name"].strip()
            day = weights.setdefault(name, {}).setdefault(r["occurred_on"], {"weight": -1, "sources": []})
            if e["weight"] > day["weight"]:
                day.update(weight=e["weight"], sources=[])
            if e["weight"] == day["weight"] and r["id"] not in [v["id"] for v in day["sources"]]:
                day["sources"].append({"id": r["id"], "version": r["version"], "title": r["title"]})
    rules = sorted(revisions, key=lambda r: (r.content["effective_from"], r.version), reverse=True)
    days = []
    day = start
    while day <= end:
        key = day.isoformat()
        rule = next((r for r in rules if r.content["effective_from"] <= key), None)
        planned = rule is not None and rule.content["enabled"] and (day.weekday() + 1) % 7 in rule.content["days"]
        days.append({"date": key, "records": by_day.get(key, []), "planned": planned,
            "habit_version": rule.version if rule else None,
            "time": rule.content["time"] if planned else None, "timezone": rule.content["timezone"] if planned else None})
        day += timedelta(days=1)
    return {"start": start.isoformat(), "end": end.isoformat(), "total": len(summaries), "records": summaries,
        "completed_records": len(completed), "completed_days": len({r["occurred_on"] for r in completed}),
        "skipped_records": len(summaries) - len(completed),
        "known_minutes": sum(r["actual_minutes"] or 0 for r in completed),
        "unknown_minutes_records": sum(r["actual_minutes"] is None for r in completed), "days": days,
        "trends": [{"exercise": name, "unit": "kg", "points": [{"date": day, **value} for day, value in sorted(series.items())]}
                   for name, series in sorted(weights.items())]}
