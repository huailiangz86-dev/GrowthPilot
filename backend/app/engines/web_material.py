"""Bounded public HTTPS snapshots. No credentials, proxies, scripts or background sync."""
import asyncio
import codecs
import ipaddress
import re
import socket
from datetime import UTC, datetime
from email.message import Message
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from app.engines.material_parser import MAX_BYTES, MAX_CHARACTERS, MaterialError, extract

WEB_PARSER_VERSION = "public-web-text-1"
_slots = asyncio.Semaphore(2)


def public_url(value: str) -> str:
    try:
        if any(ord(c) <= 32 for c in value) or "\\" in value or len(value) > 2000:
            raise ValueError()
        url = urlsplit(value)
        host = (url.hostname or "").encode("idna").decode("ascii").lower().rstrip(".")
        if url.scheme != "https" or url.username is not None or url.password is not None or url.port not in (None, 443):
            raise ValueError()
        if not host or "%" in host or host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError()
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            if "." not in host or not re.fullmatch(r"[a-z0-9.-]+", host):
                raise ValueError()
        else:
            require_public_ip(str(ip))
        authority = f"[{host}]" if ":" in host else host
        return str(httpx.URL(urlunsplit(("https", authority, url.path or "/", url.query, ""))))
    except (ValueError, UnicodeError, httpx.InvalidURL) as exc:
        raise MaterialError("请使用公开 HTTPS 网页地址，不含账号密码或自定义端口。") from exc


def require_public_ip(address: str):
    ip = ipaddress.ip_address(address)
    # Do not allow transition addresses to tunnel to an unchecked IPv4 destination.
    if not ip.is_global or ip.is_multicast or isinstance(ip, ipaddress.IPv6Address) and (
        ip.ipv4_mapped is not None or ip.sixtofour is not None or ip.teredo is not None
        or ip in ipaddress.ip_network("64:ff9b::/96") or ip in ipaddress.ip_network("64:ff9b:1::/48")
    ):
        raise MaterialError("这个地址不属于可导入的公开网页，请改用文件或粘贴正文。")


async def public_address(host: str) -> str:
    try:
        addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM), 4)
    except (OSError, TimeoutError) as exc:
        raise MaterialError("网页地址暂时无法解析，请核对地址或稍后重试。") from exc
    if not addresses:
        raise MaterialError("网页地址没有可用的公开地址。")
    # Reject mixed public/private answers; connect to exactly one checked numeric IP.
    for address in addresses:
        require_public_ip(address[4][0])
    return addresses[0][4][0]


class VisibleHTML(HTMLParser):
    excluded = {"head", "script", "style", "template", "noscript", "nav", "header", "footer", "aside", "form", "svg", "canvas"}
    breaks = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "main", "pre", "blockquote", "tr", "hr"}
    void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.all_text, self.main_text = [], []
        self.login = False
        self.characters = 0

    def append(self, value):
        if self.stack and self.stack[-1][1]:
            return
        self.all_text.append(value)
        if any(tag in {"main", "article"} for tag, _ in self.stack):
            self.main_text.append(value)
        self.characters += len(value)
        if self.characters > MAX_CHARACTERS * 2:
            raise MaterialError("网页可读内容过长，请选择正文后粘贴或拆分文件。")

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "input" and (attrs.get("type") or "").lower() == "password":
            self.login = True
        hidden = tag in self.excluded or "hidden" in attrs or (attrs.get("aria-hidden") or "").lower() == "true"
        hidden |= bool(re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", attrs.get("style") or "", re.I))
        hidden |= bool(self.stack and self.stack[-1][1])
        if tag not in self.void:
            if len(self.stack) >= 256:
                raise MaterialError("网页结构过于复杂，请改用粘贴正文。")
            self.stack.append((tag, hidden))
        if tag in self.breaks:
            self.append("\n\n")

    def handle_endtag(self, tag):
        if tag in self.breaks:
            self.append("\n\n")
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, value):
        self.append(value)

    def text(self):
        if self.login:
            raise MaterialError("页面包含登录表单，请自行打开后导出文件或粘贴正文。")
        value = "".join(self.main_text).strip() or "".join(self.all_text).strip()
        value = re.sub(r"[ \t\r\f\v]+", " ", value)
        return re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", value).strip()


def extract_webpage(raw: bytes, content_type: str):
    if not raw or len(raw) > MAX_BYTES:
        raise MaterialError("网页快照需为非空内容，最大 2 MB。")
    if not content_type:
        raise MaterialError("网页未提供可确认的文字格式，请改用粘贴正文。")
    header = Message()
    header["content-type"] = content_type
    mime = header.get_content_type()
    if mime not in {"text/html", "application/xhtml+xml", "text/plain", "text/markdown"}:
        raise MaterialError("只提取 HTML 网页或纯文字；PDF 请下载后使用文件导入。")
    charset = header.get_content_charset()
    if not charset and mime in {"text/html", "application/xhtml+xml"}:
        match = re.search(br'<meta\b[^>]*charset\s*=\s*[\"\']?([a-zA-Z0-9_-]+)', raw[:8192], re.I)
        charset = match.group(1).decode("ascii") if match else None
    try:
        encoding = codecs.lookup(charset or "utf-8-sig").name
        if encoding not in {"utf-8", "utf-8-sig", "gb18030", "gbk", "big5", "iso8859-1", "cp1252", "ascii"}:
            raise LookupError()
        text = raw.decode(encoding)
    except (UnicodeError, LookupError) as exc:
        raise MaterialError("网页文字编码暂不支持，请复制可读正文导入。") from exc
    if mime in {"text/html", "application/xhtml+xml"}:
        parser = VisibleHTML()
        parser.feed(text)
        parser.close()
        text = parser.text()
    result = extract(text.encode("utf-8"), "text")
    result["warnings"] = ["这是读取时的正文快照；图片、脚本和部分页面布局不保留。请对照原网页核对，动态、登录或付费内容可能无法读取。"]
    return result


async def fetch_webpage(value: str):
    url = public_url(value)
    try:
        async with asyncio.timeout(18):
            await _slots.acquire()
            try:
                for hop in range(4):
                    host = urlsplit(url).hostname
                    address = await public_address(host)
                    pinned = httpx.URL(url).copy_with(host=address)
                    # TLS verifies the original hostname; networking only sees the checked IP.
                    async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=7) as client:
                        async with client.stream("GET", pinned, headers={"Host": httpx.URL(url).netloc.decode(),
                            "Accept": "text/html, text/plain;q=0.9", "Accept-Encoding": "identity",
                            "User-Agent": "GrowthPilot-Public-Material/1.0"}, extensions={"sni_hostname": host}) as response:
                            if response.status_code in {301, 302, 303, 307, 308}:
                                location = response.headers.get("location")
                                if not location or hop == 3:
                                    raise MaterialError("网页跳转过多或地址无效，请打开后复制最终公开地址。")
                                url = public_url(urljoin(url, location))
                                continue
                            if response.status_code != 200:
                                raise MaterialError(f"网页返回 {response.status_code}，请自行打开核对或改用文件导入。")
                            if response.headers.get("content-encoding", "identity").lower() not in {"", "identity"}:
                                raise MaterialError("网页只提供压缩内容，请改用文件或粘贴正文。")
                            length = response.headers.get("content-length")
                            if length and (not length.isdigit() or int(length) > MAX_BYTES):
                                raise MaterialError("网页快照超过 2 MB 或长度无效，请选择正文后粘贴。")
                            raw = bytearray()
                            async for block in response.aiter_raw():
                                if len(raw) + len(block) > MAX_BYTES:
                                    raise MaterialError("网页快照超过 2 MB，请选择正文后粘贴。")
                                raw.extend(block)
                            content_type = response.headers.get("content-type", "")
                            result = extract_webpage(bytes(raw), content_type)
                            result["web"] = {"requested_url": public_url(value), "final_url": url,
                                "fetched_at": datetime.now(UTC).isoformat(), "content_type": content_type[:240],
                                "parser_version": WEB_PARSER_VERSION}
                            return bytes(raw), result
            finally:
                _slots.release()
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise MaterialError("网页读取超时，地址已保留，可以重试或粘贴正文。") from exc
    except httpx.HTTPError as exc:
        raise MaterialError("网页暂时无法读取，请核对地址、稍后重试或粘贴正文。") from exc
