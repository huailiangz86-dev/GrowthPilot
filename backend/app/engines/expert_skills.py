"""Versioned app-domain skills: executable tools and source-grounded contracts.

These packs are loaded by GrowthPilot at execution time, independently of the
coding assistant's installed skills. Public methods are paraphrased, not copied
competitor algorithms or an endorsement by the cited organisations.
"""
import hashlib
import json
import re
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field
from app.core.exceptions import ValidationException
from app.engines.fitness_context import fitness_context

ROOT = Path(__file__).resolve().parents[2] / "expert_skills"


def load_skill(name):
    if name not in ("fitness-review", "learning-tutor"):
        raise ValueError("Unknown expert skill")
    path = max((ROOT / name).glob("v[0-9]*.yaml"), key=lambda p: int(p.stem[1:]))
    pack = yaml.safe_load(path.read_text())
    pack["manifest_digest"] = hashlib.sha256(json.dumps(pack, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return deepcopy(pack)


def fitness_skill(source):
    """No model arithmetic or inferred muscle mapping. Every point has versions."""
    pack = load_skill("fitness-review")
    grouped, completed_days = {}, set()
    missing_details, zero_load = [], []
    for record in source["records"]:
        content = record["content"]
        if content["outcome"] != "completed":
            continue
        completed_days.add(content["occurred_on"])
        ref = {"id": record["id"], "version": record["version"]}
        if not content["exercises"]:
            missing_details.append(ref)
        for exercise in content["exercises"]:
            if exercise["weight"] == 0:
                zero_load.append(ref)
            name = exercise["name"].strip()
            point = {**ref, "date": content["occurred_on"], "weight_kg": exercise["weight"], 'equipment': exercise.get('equipment'),
                     "sets": exercise["sets"], "reps": exercise["reps"],
                     "total_reps": exercise["sets"] * exercise["reps"],
                     "external_volume_kg_reps": round(exercise["weight"] * exercise["sets"] * exercise["reps"], 3)}
            grouped.setdefault(name, []).append(point)
    movements = []
    for name, points in sorted(grouped.items()):
        points.sort(key=lambda p: (p["date"], p["id"], p["sets"], p["reps"], p["weight_kg"]))
        by_day = {}
        for point in points:
            by_day.setdefault(point["date"], []).append(point)
        # Mixed rows for an exercise/day have ambiguous comparability. Do not
        # choose a convenient max or compare two records on the same day.
        candidates = [rows[0] for _, rows in sorted(by_day.items()) if len(rows) == 1 and rows[0]["weight_kg"] > 0]
        comparisons = []
        for index, current in enumerate(candidates):
            previous = next((p for p in reversed(candidates[:index])
                             if (p["sets"], p["reps"]) == (current["sets"], current["reps"])
                             and (not p.get('equipment') or not current.get('equipment') or p['equipment'] == current['equipment'])), None)
            if previous:
                comparisons.append({"previous": previous, "current": current,
                    "weight_change_kg": round(current["weight_kg"] - previous["weight_kg"], 3),
                    "days_between": (date.fromisoformat(current["date"]) - date.fromisoformat(previous["date"])).days})
        movements.append({"name": name, "points": points, "recorded_sets": sum(p["sets"] for p in points),
            "recorded_reps": sum(p["total_reps"] for p in points),
            "external_volume_kg_reps": round(sum(p["external_volume_kg_reps"] for p in points), 3),
            "comparisons": comparisons})
    execution = {**pack, "tools": {"personal_context": fitness_context(source) if 'profile' in source else None,
        "training_volume": {"movements": movements, "missing_details": missing_details,
            "zero_external_load_records": list({p["id"]: p for p in zero_load}.values())},
        "record_comparison": {"recorded_days": sorted(completed_days),
            "comparison_count": sum(len(m["comparisons"]) for m in movements)}}}
    if len(json.dumps({**source, 'expert_skill': execution}, ensure_ascii=False)) > 80000:
        raise ValidationException('记录与专业分析结果超过本次处理范围，请缩小日期范围后回顾。')
    return execution


METHODS = {"learning_explain": "guided_explanation", "learning_practice": "retrieval_practice",
           "learning_feedback": "criterion_feedback"}


def learning_skill(source, kind):
    pack = load_skill("learning-tutor")
    exercise = source["fields"]["exercise"].strip()
    if kind == 'learning_feedback' and ('【当前练习】' in exercise or '【练习结束】' in exercise):
        blocks = re.findall(r'【当前练习】\s*\n(.*?)\n【练习结束】', exercise, re.DOTALL)
        if len(blocks) != exercise.count('【当前练习】') or len(blocks) != exercise.count('【练习结束】'):
            raise ValueError('练习区的当前练习段落不完整，请核对开始与结束标记')
        exercise = blocks[-1].strip()
    # A rubric is stored as ordinary editable exercise text. Never silently
    # reinterpret malformed/duplicate rubric markers as a fresh standard.
    rubric = []
    if kind == "learning_feedback":
        for line in exercise.splitlines():
            match = re.fullmatch(r"检查项 (C[1-4])：(.+)", line.strip())
            if match:
                rubric.append({"id": match[1], "criterion": match[2]})
            elif line.strip().startswith('检查项 C'):
                raise ValueError('练习检查项格式已改变，请使用“检查项 C1：具体标准”并依次编号')
        if rubric and [c['id'] for c in rubric] != [f'C{i + 1}' for i in range(len(rubric))]:
            raise ValueError("练习检查项重复，请先核对已保存的练习")
        if not rubric:
            rubric = [{"id": "C1", "criterion": exercise}]
    return {**pack, "method": METHODS[kind], "tools": {"saved_rubric": rubric,
        "active_exercise": exercise if kind == 'learning_feedback' else None,
        "source_version": source["version"], "notes_characters": len(source["fields"]["notes"])}}


class Criterion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Literal["C1", "C2", "C3", "C4"]
    criterion: str = Field(min_length=1, max_length=10000)
    source_quote: str = Field(min_length=1, max_length=2000)
    status: Literal["target", "supported", "needs_revision", "missing", "uncertain"]
    answer_quote: str = Field(max_length=2000)
    feedback: str = Field(min_length=1, max_length=3000)


class Teaching(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: Literal["guided_explanation", "retrieval_practice", "criterion_feedback"]
    questions: list[str] = Field(min_length=1, max_length=3)
    criteria: list[Criterion] = Field(max_length=4)
    hints: list[str] = Field(max_length=3)


def validate_teaching(raw, source, kind, answer):
    teaching = Teaching.model_validate(raw)
    pack = source["expert_skill"]
    if teaching.method != pack["method"] or any(not q.strip() or len(q) > 3000 for q in teaching.questions):
        raise ValueError("教学方法或引导问题无效")
    if [c.id for c in teaching.criteria] != [f'C{i + 1}' for i in range(len(teaching.criteria))]:
        raise ValueError("教学检查项重复")
    notes = source["fields"]["notes"]
    for check in teaching.criteria:
        if not check.source_quote.strip() or check.source_quote not in notes or not check.criterion.strip() or not check.feedback.strip():
            raise ValueError("教学检查项需要原文依据")
        if kind == 'learning_practice' and ('\n' in check.criterion or '\r' in check.criterion or len(check.criterion) > 2000):
            raise ValueError('练习检查项需要简短的单行标准')
        if check.answer_quote and (not check.answer_quote.strip() or check.answer_quote not in answer):
            raise ValueError("教学反馈引用了不存在的本人答案")
    if kind == "learning_explain":
        if teaching.criteria or teaching.hints:
            raise ValueError("引导解释不能伪造答案评价")
    elif kind == "learning_practice":
        if not teaching.criteria or len(teaching.hints) != 3 or any(not h.strip() or len(h) > 3000 for h in teaching.hints):
            raise ValueError("提取练习需要检查项与三级提示")
        if any(c.status != "target" or c.answer_quote for c in teaching.criteria):
            raise ValueError("尚未作答的练习不能有答案评价")
    else:
        rubric = pack["tools"]["saved_rubric"]
        if [(c.id, c.criterion) for c in teaching.criteria] != [(c["id"], c["criterion"]) for c in rubric] or teaching.hints:
            raise ValueError("答案反馈必须沿用全部已保存的检查项")
        if any(c.status == "target" or (c.status in ("supported", "needs_revision") and not c.answer_quote.strip())
               or (c.status == "missing" and c.answer_quote) for c in teaching.criteria):
            raise ValueError("答案评价需要实际证据或明确缺失")
    return teaching.model_dump(mode="json")
