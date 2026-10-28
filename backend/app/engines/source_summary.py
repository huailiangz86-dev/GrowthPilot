"""Check every quote against a selected, frozen original. Never fetch URLs."""
from typing import Literal

from pydantic import Field, field_validator

from app.api.personal_work import Strict


class Quote(Strict):
    key: str = Field(min_length=1, max_length=8)
    quote: str = Field(min_length=1, max_length=1000)


class Point(Strict):
    text: str = Field(min_length=1, max_length=2000)
    kind: Literal['observation', 'inference']
    evidence: list[Quote] = Field(min_length=1, max_length=4)

    @field_validator('text')
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError('总结要点不能为空')
        return value


class Result(Strict):
    title: str = Field(min_length=1, max_length=240)
    points: list[Point] = Field(min_length=1, max_length=6)
    limitations: str = Field(min_length=1, max_length=2000)
    _labels = field_validator('title', 'limitations')(Point.nonempty.__func__)


def validate_summary(raw, source, require_bounded=False):
    if require_bounded and raw.get('schema_version') not in (2,3):
        raise ValueError('本次总结只接受逐字原文摘录回执')
    if raw.get('schema_version') in (2,3):
        from app.engines.bounded_learning import render_extracts
        raw = render_extracts(raw, source)
    result = Result.model_validate(raw).model_dump(mode='json')
    by_key = {s['key']: s for s in source}
    for point in result['points']:
        seen = set()
        for citation in point['evidence']:
            key, quote = citation['key'], citation['quote']
            row = by_key.get(key)
            if not row or not quote.strip() or quote not in row['text'] or (key, quote) in seen:
                raise ValueError('总结引用不属于选定原文片段，或同一要点重复引用')
            seen.add((key, quote))
            # Repeated quotations use the first exact occurrence in this selected chunk.
            start = row['start'] + row['text'].index(quote)
            citation.update(start=start, end=start + len(quote))
    return result

