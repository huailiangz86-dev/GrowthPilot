"""Explicit cloud steps; no background calls, automatic writes or opaque retries."""
import hashlib
import json
import re
from urllib.parse import urlsplit

import httpx
from alibabacloud_bailian20231229 import models
from alibabacloud_tea_util.models import RuntimeOptions

from app.core.exceptions import AppException, ValidationException
from app.engines.bailian_knowledge import BailianKnowledge, IDENTIFIER, safe_code, unpack


def upload_content(source, mode, original=None):
    if source.status != 'ready':
        raise ValidationException('请先完成本地原件提取，再准备导入。')
    if mode == 'original':
        if source.kind not in ('text', 'txt', 'md', 'pdf'):
            raise ValidationException('邮件和网页请发送已提取正文；仅保存地址的链接需先另存正文快照。')
        return original if original is not None else source.original, 'pdf' if source.kind == 'pdf' else 'md' if source.kind == 'md' else 'txt'
    text = (source.extraction or {}).get('text') or ''
    if source.kind == 'link' or not text.strip():
        raise ValidationException('资料尚无可发送的正文，请先提取或另存网页快照。')
    return text.encode('utf-8'), 'txt'


def exact_matches(text, extraction):
    """Match only literal frozen text; offsets are Unicode codepoints, not bytes."""
    frozen = (extraction or {}).get('text', '')
    if not text or len(text) > len(frozen):
        return []
    result, start = [], 0
    while len(result) < 20:
        start = frozen.find(text, start)
        if start < 0:
            break
        end = start + len(text)
        pages = {(c.get('page')) for c in (extraction or {}).get('chunks', [])
                 if c.get('start', -1) <= start and c.get('end', -1) >= end}
        page = next(iter(pages)) if len(pages) == 1 else None
        result.append({'start': start, 'end': end, 'page': page if type(page) is int and page > 0 else None})
        start += 1
    return result


def lease_parameters(data):
    param = data.get('Param')
    if not isinstance(param, dict):
        raise AppException('BAILIAN_RESPONSE', '百炼上传租约缺少参数，可重新申请。', 502)
    url, method, headers = param.get('Url'), param.get('Method'), param.get('Headers')
    try:
        parsed = urlsplit(url) if isinstance(url, str) else None
        port = parsed.port if parsed else None
    except ValueError:
        raise AppException('BAILIAN_RESPONSE', '百炼上传租约地址无效，未发送原件。', 502) from None
    # Only official OSS virtual-host endpoints are valid. Never follow redirects.
    if (not parsed or parsed.scheme != 'https' or parsed.username or parsed.password or port not in (None, 443)
            or not re.fullmatch(r'[a-z0-9-]+\.oss(?:-[a-z0-9-]+)?\.aliyuncs\.com', parsed.hostname or '')
            or method not in ('PUT', 'POST')):
        raise AppException('BAILIAN_RESPONSE', '百炼上传租约地址或方法无效，未发送原件。', 502)
    if isinstance(headers, str):
        try:
            headers = json.loads(headers)
        except ValueError:
            raise AppException('BAILIAN_RESPONSE', '百炼上传头格式无效，未发送原件。', 502) from None
    if not isinstance(headers, dict) or any(not isinstance(k, str) or not isinstance(v, str) or '\r' in k+v or '\n' in k+v for k, v in headers.items()):
        raise AppException('BAILIAN_RESPONSE', '百炼上传头格式无效，未发送原件。', 502)
    if any(k.lower() not in ('content-type', 'x-bailian-extra', 'content-md5') for k in headers):
        raise AppException('BAILIAN_RESPONSE', '百炼上传头包含不支持的字段，未发送原件。', 502)
    lease = data.get('FileUploadLeaseId')
    if not isinstance(lease, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,240}', lease):
        raise AppException('BAILIAN_RESPONSE', '百炼上传租约编号无效。', 502)
    return url, method, headers, lease


class CloudPipeline(BailianKnowledge):
    async def invoke(self, method, args, operation):
        try:
            response = await method(*args, {}, RuntimeOptions(autoretry=False, connect_timeout=10000, read_timeout=60000))
        except Exception as exc:
            raise AppException('BAILIAN_TRANSPORT', f'百炼{operation}回执暂不可确认（{safe_code(getattr(exc, "code", type(exc).__name__))}）。', 502) from None
        return unpack(response, operation)

    async def upload(self, row, raw):
        data, request_id = await self.invoke(self.client.apply_file_upload_lease_with_options_async,
            [row.category_id, row.workspace_id, models.ApplyFileUploadLeaseRequest(category_type='UNSTRUCTURED',
                file_name=row.filename, md_5=hashlib.md5(raw).hexdigest(), size_in_bytes=str(len(raw)), use_internal_endpoint=False)], '申请上传租约')
        url, method, headers, lease = lease_parameters(data)
        try:
            async with httpx.AsyncClient(timeout=90, follow_redirects=False, trust_env=False) as client:
                response = await client.request(method, url, content=raw, headers=headers)
                if not 200 <= response.status_code < 300:
                    raise AppException('BAILIAN_UPLOAD', f'原件上传未成功（HTTP {response.status_code}），可重试上传。', 502)
        except httpx.HTTPError:
            raise AppException('BAILIAN_UPLOAD', '原件上传暂未完成，可重试；不会重复登记云端文件。', 502) from None
        return {'lease_id': lease, 'request_id': request_id}

    async def register(self, row):
        data, request_id = await self.invoke(self.client.add_file_with_options_async,
            [row.workspace_id, models.AddFileRequest(category_id=row.category_id, category_type='UNSTRUCTURED',
                lease_id=row.lease_id, parser='AUTO_SELECT', tags=[row.id.hex])], '登记文件')
        return {'file_id': remote_id(data.get('FileId')), 'request_id': request_id}

    async def describe(self, row, file_id=None):
        return await self.invoke(self.client.describe_file_with_options_async,
            [row.workspace_id, file_id or row.file_id], '读取解析状态')

    async def submit(self, row):
        data, request_id = await self.invoke(self.client.submit_index_add_documents_job_with_options_async,
            [row.workspace_id, models.SubmitIndexAddDocumentsJobRequest(index_id=row.index_id,
                document_ids=[row.file_id], source_type='DATA_CENTER_FILE')], '追加索引')
        return {'job_id': remote_id(data.get('Id')), 'request_id': request_id}

    async def job(self, row, job_id=None):
        return await self.invoke(self.client.get_index_job_status_with_options_async,
            [row.workspace_id, models.GetIndexJobStatusRequest(index_id=row.index_id, job_id=job_id or row.job_id,
                page_number=1, page_size=10)], '读取索引状态')


def remote_id(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise AppException('BAILIAN_RESPONSE', '百炼成功回执缺少有效编号，请核对控制台。', 502)
    return value


def verify_file(row, data, file_id):
    if (data.get('FileId') != file_id or data.get('FileName') != row.filename or data.get('CategoryId') != row.category_id
            or data.get('SizeInBytes') != row.byte_count or row.id.hex not in (data.get('Tags') or [])):
        raise ValidationException('云端文件与本地清单的编号、文件名、大小、类目或导入标记不符，未建立映射。')


def job_state(row, data, job_id):
    documents = data.get('Documents')
    matching = [d for d in documents if isinstance(d, dict) and d.get('DocId') == row.file_id] if isinstance(documents, list) else []
    if data.get('JobId') != job_id or len(matching) != 1:
        raise ValidationException('该索引回执未能对应本文件，请核对任务编号。')
    doc = matching[0]
    if data.get('Status') == 'FAILED' or doc.get('Status') in ('INSERT_ERROR', 'PARSE_FAILED', 'DELETED'):
        return 'failed'
    return 'ready' if data.get('Status') == 'COMPLETED' and doc.get('Status') == 'FINISH' else 'indexing'
