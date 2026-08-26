"""Aliyun OSS file service — private bucket with signed URLs."""

import io
import uuid
from datetime import UTC, datetime

import oss2
import structlog
from PIL import Image

from app.core.config import settings

logger = structlog.get_logger()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/jpg"}
SIGNED_URL_EXPIRE = 3600  # 1 hour
MAX_WIDTH = 1920
COMPRESS_QUALITY = 80


def _get_bucket() -> oss2.Bucket:
    auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
    return oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET)


def _compress_image(data: bytes, content_type: str) -> bytes:
    """Compress image: max 1920px wide, quality 80%."""
    img = Image.open(io.BytesIO(data))

    # Convert RGBA to RGB for JPEG
    if img.mode == "RGBA" and content_type in ("image/jpeg", "image/jpg"):
        img = img.convert("RGB")

    # Resize if wider than MAX_WIDTH
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        new_size = (MAX_WIDTH, int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    # Save compressed
    buf = io.BytesIO()
    fmt = "PNG" if content_type == "image/png" else "JPEG"
    save_kwargs = {"optimize": True}
    if fmt == "JPEG":
        save_kwargs["quality"] = COMPRESS_QUALITY
    img.save(buf, format=fmt, **save_kwargs)
    return buf.getvalue()


async def upload_image(
    data: bytes,
    content_type: str,
    user_id: str,
    purpose: str = "screenshot",
) -> dict:
    """Upload image to OSS, return object key and signed URL.

    Args:
        data: Raw file bytes
        content_type: MIME type (image/jpeg, image/png)
        user_id: Owner (for path namespacing)
        purpose: screenshot / persona-card / annual-report

    Returns:
        {"key": "uploads/...", "url": "https://...signed..."}
    """
    if content_type not in ALLOWED_TYPES:
        raise ValueError(f"Unsupported file type: {content_type}. Allowed: {ALLOWED_TYPES}")

    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {len(data)} bytes. Max: {MAX_FILE_SIZE}")

    # Compress
    compressed = _compress_image(data, content_type)
    ratio = f"{len(compressed) / len(data):.0%}"
    logger.info("image_compressed", original=len(data), compressed=len(compressed), ratio=ratio)

    # Generate unique key
    ext = "png" if content_type == "image/png" else "jpg"
    date_prefix = datetime.now(UTC).strftime("%Y/%m/%d")
    key = f"uploads/{user_id}/{purpose}/{date_prefix}/{uuid.uuid4().hex[:12]}.{ext}"

    # Upload to OSS (sync call, run in thread for async context)
    import asyncio

    def _do_upload() -> None:
        bucket = _get_bucket()
        bucket.put_object(key, compressed, headers={"Content-Type": content_type})

    await asyncio.to_thread(_do_upload)

    # Generate signed URL
    url = get_signed_url(key)

    logger.info("image_uploaded", key=key, size=len(compressed))
    return {"key": key, "url": url}


def get_signed_url(key: str, expire: int = SIGNED_URL_EXPIRE) -> str:
    """Generate a signed URL for a private OSS object."""
    bucket = _get_bucket()
    return bucket.sign_url("GET", key, expire)
