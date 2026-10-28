"""Read-only Model Studio document/chunk retrieval using official SDK 2.6.2.

The optional env-file is an explicitly configured server-side connection source.
No KnowledgeHub application code is imported, no secrets are returned to callers,
and retrieved fragments are not promoted to personal facts or learning records.
"""
import math
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from dotenv import dotenv_values
from alibabacloud_bailian20231229 import models
from alibabacloud_bailian20231229.client import Client
from alibabacloud_tea_openapi.models import Config
from alibabacloud_tea_util.models import RuntimeOptions

from app.core.config import settings
from app.core.exceptions import AppException, ValidationException

ENDPOINTS = {"bailian.cn-beijing.aliyuncs.com", "bailian.ap-southeast-1.aliyuncs.com"}
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,160}$")


@dataclass(frozen=True)
class KnowledgeConfig:
    access_key_id: str = field(repr=False)
    access_key_secret: str = field(repr=False)
    workspace_id: str
    index_id: str
    endpoint: str = "bailian.cn-beijing.aliyuncs.com"
    source: str = "服务端配置"

    @classmethod
    def load(cls):
        values = {}
        source = "服务端配置"
        if settings.BAILIAN_CONFIG_ENV_FILE:
            path = Path(settings.BAILIAN_CONFIG_ENV_FILE)
            if not path.is_file():
                raise AppException("BAILIAN_CONFIG", "百炼配置文件暂时不可用，请检查服务端配置。", 503)
            try:
                values = dotenv_values(path, interpolate=False)
            except OSError:
                raise AppException("BAILIAN_CONFIG", "百炼配置文件暂时不可读，请检查服务端配置。", 503) from None
            source = "KnowledgeHub 配置" if path.parent.name == "KnowledgeHub" else "本机连接配置"
        config = cls(
            access_key_id=settings.BAILIAN_ACCESS_KEY_ID or values.get("ALIYUN_ACCESS_KEY_ID") or values.get("ALIBABA_CLOUD_ACCESS_KEY_ID") or "",
            access_key_secret=settings.BAILIAN_ACCESS_KEY_SECRET or values.get("ALIYUN_ACCESS_KEY_SECRET") or values.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET") or "",
            workspace_id=settings.BAILIAN_WORKSPACE_ID or values.get("BAILIAN_WORKSPACE_ID") or "",
            index_id=settings.BAILIAN_INDEX_ID or values.get("BAILIAN_INDEX_ID") or "",
            endpoint=settings.BAILIAN_ENDPOINT,
            source=source,
        )
        if not all([config.access_key_id, config.access_key_secret, config.workspace_id, config.index_id]):
            raise AppException("BAILIAN_CONFIG", "百炼连接缺少访问凭据、业务空间或知识库编号。", 503)
        if config.endpoint not in ENDPOINTS or not IDENTIFIER.fullmatch(config.workspace_id) or not IDENTIFIER.fullmatch(config.index_id):
            raise AppException("BAILIAN_CONFIG", "百炼连接地址或编号不符合配置要求。", 503)
        return config

    def public(self):
        return {"source": self.source, "workspace_id": self.workspace_id, "index_id": self.index_id,
                "endpoint": self.endpoint, "mode": "read_only", "provider": "bailian"}


def safe_code(value):
    code = str(value or "Unknown")
    return code if re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", code) else "Unknown"


def unpack(response, operation):
    try:
        raw = response.body.to_map()
    except (AttributeError, TypeError):
        raise AppException("BAILIAN_RESPONSE", "百炼返回格式无效，可以重试读取。", 502) from None
    if raw.get("Success") is not True or not isinstance(raw.get("Data"), dict):
        code = safe_code(raw.get("Code"))
        raise AppException("BAILIAN_REMOTE", f"百炼{operation}失败（{code}），请核对连接权限和知识库状态。", 502)
    return raw["Data"], raw.get("RequestId")


def chunk_rows(nodes, expected_file=None):
    if not isinstance(nodes, list) or any(not isinstance(node, dict) for node in nodes):
        raise AppException("BAILIAN_RESPONSE", "百炼返回的切片格式无效，未发布结果。", 502)
    rows = []
    for node in nodes:
        meta = node.get("Metadata") or {}
        if not isinstance(meta, dict):
            raise AppException("BAILIAN_RESPONSE", "百炼返回的切片来源格式无效，未发布结果。", 502)
        text = node.get("Text")
        document_id = meta.get("doc_id")
        # This connected index returns an empty nid but a populated provider
        # record _id. Preserve the actual cloud identifier and its field; never
        # synthesize an identifier from row order, text or a local hash.
        id_field = "nid" if isinstance(meta.get("nid"), str) and meta["nid"] else "_id"
        chunk_id = meta.get(id_field)
        if not isinstance(text, str) or not text.strip() or not isinstance(document_id, str) or not isinstance(chunk_id, str) or not document_id or not chunk_id:
            raise AppException("BAILIAN_RESPONSE", "百炼返回的切片缺少正文或来源编号，未发布结果。", 502)
        if expected_file and document_id != expected_file:
            raise AppException("BAILIAN_RESPONSE", "百炼返回的切片与所选文档不一致，未发布结果。", 502)
        score = node.get("Score")
        score = float(score) if isinstance(score, (float, int)) and not isinstance(score, bool) and math.isfinite(score) else None
        # file_path is meaningless for document-search KBs. Never turn remote
        # metadata/expiring media URLs into links, requests or HTML instructions.
        rows.append({"document_id": document_id, "chunk_id": chunk_id, "chunk_id_field": id_field, "text": text, "score": score,
                     "title": str(meta.get("title") or ""), "hierarchy": str(meta.get("hier_title") or ""),
                     "document_name": str(meta.get("doc_name") or ""),
                     "page": meta.get("page_number") if type(meta.get("page_number")) is int and meta["page_number"] > 0 else None})
    return rows


class BailianKnowledge:
    def __init__(self, config: KnowledgeConfig, client=None):
        self.config = config
        self.client = client or Client(Config(
            access_key_id=config.access_key_id, access_key_secret=config.access_key_secret,
            endpoint=config.endpoint, protocol="https", http_proxy="", https_proxy="",
        ))

    async def call(self, method, request, operation):
        try:
            response = await method(self.config.workspace_id, request, {}, RuntimeOptions(
                autoretry=False, connect_timeout=10000, read_timeout=60000,
            ))
        except Exception as error:
            # SDK errors can contain signed URLs or request headers. Report only
            # the provider's safe error code, never the raw exception string.
            code = safe_code(getattr(error, "code", type(error).__name__))
            raise AppException("BAILIAN_REMOTE", f"百炼{operation}暂时失败（{code}），输入已保留，可以重试。", 502) from None
        return unpack(response, operation)

    async def documents(self, page=1, page_size=20):
        data, request_id = await self.call(self.client.list_index_documents_with_options_async,
            models.ListIndexDocumentsRequest(index_id=self.config.index_id, page_number=page, page_size=page_size), "读取文档")
        documents = data.get("Documents") or []
        return {"items": [{"id": row["Id"], "name": row.get("Name") or "未命名资料", "status": row.get("Status"),
                           "kind": row.get("DocumentType"), "bytes": row.get("Size"), "updated_at": row.get("GmtModified")}
                          for row in documents if isinstance(row, dict) and isinstance(row.get("Id"), str)],
                "total": data.get("TotalCount", 0), "page": page, "page_size": page_size, "request_id": request_id}

    async def chunks(self, file_id, page=1, page_size=10):
        if not IDENTIFIER.fullmatch(file_id):
            raise ValidationException("请选择有效的百炼文档编号。")
        data, request_id = await self.call(self.client.list_chunks_with_options_async,
            models.ListChunksRequest(index_id=self.config.index_id, file_id=file_id, page_num=page, page_size=page_size), "读取切片")
        return {"items": chunk_rows(data.get("Nodes") or [], file_id), "total": data.get("Total", 0),
                "page": page, "page_size": page_size, "request_id": request_id, "file_id": file_id}

    async def retrieve(self, query, rerank=True):
        if not query.strip() or len(query) > 500:
            raise ValidationException("请输入 1–500 字的检索问题。")
        data, request_id = await self.call(self.client.retrieve_with_options_async,
            models.RetrieveRequest(index_id=self.config.index_id, query=query.strip(), dense_similarity_top_k=5,
                sparse_similarity_top_k=5, enable_reranking=rerank, rerank_top_n=5, enable_rewrite=False,
                save_retriever_history=False), "检索")
        return {"items": chunk_rows(data.get("Nodes") or []), "query": query.strip(), "rerank": rerank,
                "request_id": request_id, "retrieved_at": datetime.now(UTC).isoformat(),
                "connection": self.config.public()}
