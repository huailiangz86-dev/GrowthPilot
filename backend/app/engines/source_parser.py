"""Local email decoding with original bytes retained separately; no remote assets or scripts."""
from email import policy
from email.parser import BytesParser

from app.engines.material_parser import MAX_BYTES, MAX_CHARACTERS, MaterialError, extract, parse_material
from app.engines.web_material import extract_webpage

SOURCE_PARSER_VERSION = 'personal-source-1'
EMAIL_HEADERS = ('From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To', 'References')


def extract_email(raw):
    if not raw or len(raw) > MAX_BYTES:
        raise MaterialError('邮件原件需为非空文件，最大 2 MB。')
    message = BytesParser(policy=policy.default).parsebytes(raw)
    headers = {name: str(message[name]) for name in EMAIL_HEADERS if message[name] is not None}
    parts, attachments, visited = [], 0, 0

    def collect(part):
        nonlocal attachments, visited
        visited += 1
        if visited > 100:
            raise MaterialError('邮件结构过多，请单独导出需要的邮件正文。')
        if part.get_content_disposition() == 'attachment' or part.get_filename():
            attachments += 1
            return
        if part.is_multipart():
            children = list(part.iter_parts())
            if part.get_content_subtype() == 'alternative':
                chosen = part.get_body(preferencelist=('plain', 'html'))
                if chosen is not None:
                    collect(chosen)
            else:
                for child in children:
                    collect(child)
            return
        if part.get_content_type() not in ('text/plain', 'text/html'):
            return
        data = part.get_payload(decode=True)
        if data is None:
            raise MaterialError('邮件编码无法读取，请重新导出 EML 或粘贴正文。')
        try:
            text = data.decode(part.get_content_charset() or 'utf-8')
        except (LookupError, UnicodeError) as exc:
            raise MaterialError('邮件正文编码无法读取，请转换编码或粘贴正文。') from exc
        if part.get_content_type() == 'text/html':
            text = extract_webpage(text.encode('utf-8'), 'text/html; charset=utf-8')['text']
        parts.append(text)

    collect(message)
    body = '\n\n'.join(parts)
    if not body.strip():
        raise MaterialError('邮件未提取到可读正文，完整原件已保留。')
    text = ('\n'.join(f'{name}: {value}' for name, value in headers.items()) + '\n\n' if headers else '') + body
    if len(text) > MAX_CHARACTERS:
        raise MaterialError('邮件正文超过 20 万字，请拆分导入。')
    result = extract(text.encode('utf-8'), 'text')
    result['email'] = headers
    result['warnings'].append('邮件头与正文从原件解码提取，引用位置指向本次提取快照。')
    if attachments:
        result['warnings'].append(f'{attachments} 个附件保留在 EML 原件中，未单独解析。')
    return result


async def parse_source(raw, kind):
    return extract_email(raw) if kind == 'eml' else await parse_material(raw, kind)
