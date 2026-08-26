import hashlib
import json
import time
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.core.config import settings


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.JWT_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_proof_hash(record_data: dict) -> tuple[int, str]:
    """Generate immutable timestamp proof for a trade record (Red Line R-05)."""
    timestamp = int(time.time())
    payload = json.dumps(record_data, sort_keys=True, ensure_ascii=False)
    proof = hashlib.sha256(f"{payload}:{timestamp}:{settings.JWT_SECRET}".encode()).hexdigest()
    return timestamp, proof
