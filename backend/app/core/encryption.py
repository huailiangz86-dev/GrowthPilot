"""AES-256-GCM field-level encryption for sensitive trade data (Red Line R-02).

Encrypts: price, quantity, amount in trades table.
"""

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_key() -> bytes:
    """Derive a 256-bit key from ENCRYPTION_KEY setting."""
    raw = settings.ENCRYPTION_KEY.encode("utf-8")
    return hashlib.sha256(raw).digest()


def encrypt_value(value: str) -> str:
    """Encrypt a string value, return base64-encoded ciphertext."""
    key = _get_key()
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(nonce, value.encode("utf-8"), None)
    # Store as: base64(nonce + ciphertext)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_value(encrypted: str) -> str:
    """Decrypt a base64-encoded ciphertext."""
    key = _get_key()
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ct = raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def encrypt_float(value: float) -> str:
    return encrypt_value(f"{value:.8f}")


def decrypt_float(encrypted: str) -> float:
    return float(decrypt_value(encrypted))
