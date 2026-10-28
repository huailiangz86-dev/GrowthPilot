"""Deterministic extraction. Never evaluates source markup or sends it to a model."""
import asyncio
from contextlib import suppress
import io
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024
MAX_CHARACTERS = 200000
MAX_PAGES = 100
PARSER_VERSION = "material-text-1"
_slots = asyncio.Semaphore(2)


class MaterialError(ValueError):
    pass


def chunks_for(text, page, offset, start_index):
    # Offsets address the exact extracted page text; do not paraphrase or strip it.
    parts = []
    for paragraph in re.finditer(r"\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|\Z)", text):
        start, end = paragraph.span()
        while start < end:
            stop = min(start + 1000, end)
            parts.append({"id": f"c{start_index + len(parts) + 1}", "page": page,
                          "start": offset + start, "end": offset + stop, "text": text[start:stop]})
            start = stop
    return parts


def extract(raw: bytes, kind: str):
    if not raw or len(raw) > MAX_BYTES:
        raise MaterialError("资料需为非空文件，最大 2 MB。")
    warnings, pages = [], []
    if kind == "pdf":
        if not raw.startswith(b"%PDF-"):
            raise MaterialError("文件不是可读取的 PDF，请核对文件格式。")
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(raw))
            if reader.is_encrypted:
                raise MaterialError("暂不提取加密 PDF，请先导出未加密正文。")
            if len(reader.pages) > MAX_PAGES:
                raise MaterialError("PDF 最多 100 页，请拆分后导入。")
            total = 0
            for i, page in enumerate(reader.pages, 1):
                contents = page.get_contents()
                if contents and len(contents.get_data()) > 8 * 1024 * 1024:
                    raise MaterialError("PDF 页面内容过大，请拆分或导出文字后导入。")
                text = page.extract_text() or ""
                total += len(text)
                if total > MAX_CHARACTERS:
                    raise MaterialError("提取正文超过 20 万字，请拆分后导入。")
                if not text.strip():
                    warnings.append(f"第 {i} 页未提取到文字，可能是图片页。")
                pages.append((i, text))
        except MaterialError:
            raise
        except Exception as exc:
            raise MaterialError("PDF 无法读取，请核对文件或改为粘贴正文。") from exc
    else:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise MaterialError("文本需使用 UTF-8 编码，请转换编码或粘贴正文。") from exc
        if any(ord(char) < 32 and char not in "\t\n\r" for char in text):
            raise MaterialError("文件包含非文本内容，请使用 TXT、Markdown 或 PDF。")
        if len(text) > MAX_CHARACTERS:
            raise MaterialError("正文最多 20 万字，请拆分后导入。")
        pages.append((None, text))
    content, chunks = "", []
    page_data = []
    for number, text in pages:
        offset = len(content)
        page_data.append({"page": number, "start": offset, "end": offset + len(text)})
        chunks.extend(chunks_for(text, number, offset, len(chunks)))
        if len(chunks) > 500:
            raise MaterialError("资料段落过多，请拆分后导入（最多 500 个预览片段）。")
        content += text + "\n\n"
    if not chunks:
        raise MaterialError("未提取到可读文字。扫描件暂不支持 OCR，可改为粘贴正文。")
    return {"text": content, "pages": page_data, "chunks": chunks, "warnings": warnings,
            "characters": sum(len(text) for _, text in pages), "page_count": len(pages) if kind == "pdf" else None}


async def parse_material(raw: bytes, kind: str):
    if kind != "pdf":
        return extract(raw, kind)
    # A malformed compressed PDF cannot monopolize the API process or its memory.
    try:
        await asyncio.wait_for(_slots.acquire(), timeout=5)
    except TimeoutError as exc:
        raise MaterialError("资料提取服务繁忙，原文已保留，请稍后重试。") from exc
    try:
        process = await asyncio.create_subprocess_exec(sys.executable, str(Path(__file__).resolve()), kind,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        async def monitor_memory():
            # macOS does not implement a usable RLIMIT_DATA/AS cap for this worker.
            while process.returncode is None:
                await asyncio.sleep(.15)
                probe = await asyncio.create_subprocess_exec("/bin/ps", "-o", "rss=", "-p", str(process.pid),
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
                output, _ = await probe.communicate()
                if output.strip() and int(output) > 512 * 1024 and process.returncode is None:
                    process.kill()
        monitor = asyncio.create_task(monitor_memory()) if sys.platform == "darwin" else None
        try:
            output, _ = await asyncio.wait_for(process.communicate(raw), timeout=15)
        except (TimeoutError, asyncio.CancelledError):
            if process.returncode is None:
                process.kill()
            await process.wait()
            raise
        finally:
            if monitor:
                monitor.cancel()
                with suppress(asyncio.CancelledError):
                    await monitor
        if process.returncode != 0:
            raise MaterialError("PDF 提取超过资源限制，请拆分或粘贴正文。")
        reply = json.loads(output)
        if "error" in reply:
            raise MaterialError(reply["error"])
        return reply["result"]
    finally:
        _slots.release()


if __name__ == "__main__":
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    if sys.platform.startswith("linux"):
        resource.setrlimit(resource.RLIMIT_DATA, (512 * 1024 * 1024, 512 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    from pypdf import overwrite_configuration
    overwrite_configuration(maximum_declared_stream_length=8*1024*1024,
        array_based_stream_maximum_output_length=8*1024*1024, zlib_maximum_output_length=8*1024*1024,
        lzw_maximum_output_length=8*1024*1024, run_length_maximum_output_length=8*1024*1024,
        jbig2_maximum_output_length=8*1024*1024, image_maximum_buffer_size=8*1024*1024,
        page_tree_maximum_entries=1000, xform_maximum_invocations_per_extraction=1000, jbig2dec_binary=None)
    try:
        print(json.dumps({"result": extract(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[1])}, ensure_ascii=False))
    except MaterialError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
