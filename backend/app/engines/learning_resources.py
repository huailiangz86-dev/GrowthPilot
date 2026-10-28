"""Small verified public-source catalog. Never fabricate a URL for an unknown topic.

Sources verified 2026-10-08: publisher-owned Microsoft, Python and FastAPI pages.
User-provided sources always take priority. Matching is a starting resource, not
an assertion that it fits every learner or has been read.
"""
import re

RESOURCES = (
    {"pattern": r"fastapi", "title": "FastAPI 官方中文教程", "url": "https://fastapi.tiangolo.com/zh/tutorial/"},
    {"pattern": r"python|派森", "title": "Python 官方中文教程", "url": "https://docs.python.org/zh-cn/3/tutorial/"},
    {"pattern": r"生成式|大模型|人工智能|(?<![a-z])(?:ai|llm|gpt)(?![a-z])", "title": "Microsoft 生成式 AI 入门课程",
        "url": "https://github.com/microsoft/generative-ai-for-beginners"},
)


def match_learning_resource(title: str, summary: str = "") -> dict | None:
    value = f"{title}\n{summary}"
    for resource in RESOURCES:
        if re.search(resource["pattern"], value, re.IGNORECASE):
            return {"title": resource["title"], "url": resource["url"]}
    return None
