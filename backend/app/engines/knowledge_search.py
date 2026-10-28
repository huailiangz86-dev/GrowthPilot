"""Local keyword retrieval with exact offsets into the saved original text.

No generated synonyms or external embedding requests. Coverage precedes frequency;
newest/key tie breakers are applied by the scoped library after retrieval.
"""
import re

MAX_TERMS = 12
MAX_HITS_PER_TERM = 3


def search_terms(query: str, mode: str = "literal") -> list[str]:
    query = query.strip()
    candidates = re.split(r"\s+", query) if mode == "keywords" else [query]
    seen = set()
    terms = []
    for term in candidates:
        folded = term.casefold()
        if term and folded not in seen:
            terms.append(term)
            seen.add(folded)
    if len(terms) > MAX_TERMS:
        raise ValueError(f"一次最多 {MAX_TERMS} 个关键词，请缩小检索范围。")
    return terms


def find_hits(text: str, terms: list[str]) -> list[dict]:
    # Casefold can expand a character (e.g. ß -> ss). Map folded positions back
    # to original Python/Unicode character positions before returning any quote.
    folded_parts = []
    positions = []
    for index, char in enumerate(text):
        part = char.casefold()
        folded_parts.append(part)
        positions.extend([index] * len(part))
    folded = "".join(folded_parts)
    hits = []
    for term in terms:
        needle = term.casefold()
        at = 0
        seen = set()
        while len(seen) < MAX_HITS_PER_TERM:
            found = folded.find(needle, at)
            if found < 0:
                break
            start, end = positions[found], positions[found + len(needle) - 1] + 1
            at = found + len(needle)
            if (start, end) not in seen:
                seen.add((start, end))
                hits.append({"start": start, "end": end, "quote": text[start:end], "term": term})
    return sorted(hits, key=lambda h: (h["start"], h["end"], h["term"]))


def excerpts(text: str, hits: list[dict]) -> list[dict]:
    windows = []
    for hit in hits:
        start, end = max(0, hit["start"] - 60), min(len(text), hit["end"] + 100)
        if windows and start <= windows[-1][1] and end - windows[-1][0] <= 300:
            windows[-1][1] = max(windows[-1][1], end)
        elif len(windows) < 3:
            windows.append([start, end])
    return [{"start": start, "end": end, "text": text[start:end],
             "hits": [h for h in hits if start <= h["start"] and h["end"] <= end]}
            for start, end in windows]


def retrieve(title: str, text: str, terms: list[str]) -> dict | None:
    title_hits = find_hits(title, terms) if terms else []
    body_hits = find_hits(text, terms) if terms else []
    matched = [term for term in terms if any(h["term"] == term for h in title_hits + body_hits)]
    if terms and not matched:
        return None
    quotes = excerpts(text, body_hits)
    # Distinct terms dominate repeated occurrences. Title breaks equal coverage.
    rank = (len(matched), len({h["term"] for h in title_hits}), len(body_hits))
    first = quotes[0] if quotes else {"start": 0, "end": min(len(text), 260), "text": text[:260]}
    preview = ("…" if first["start"] else "") + first["text"] + ("…" if first["end"] < len(text) else "")
    return {"preview": preview, "matched_terms": matched, "title_hits": title_hits,
            "excerpts": quotes, "rank": rank}
