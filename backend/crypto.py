"""
Credential encryption module for Trading Journal Pro.
Uses Fernet symmetric encryption with a machine-derived key to protect
sensitive data (IBKR tokens) stored in SQLite.

The encryption key is derived from a random secret stored in the app's
data directory. If the key file is missing, a new one is generated
automatically (existing encrypted data would be unreadable —
this triggers a re-encryption migration on next settings save).
"""
import os
import sys
import logging
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _get_key_path() -> Path:
    """Return the path where the encryption key is stored."""
    if getattr(sys, "frozen", False):
        if sys.platform == "darwin":
            base = Path.home() / "Library" / "Application Support" / "TradingJournalPro"
        elif sys.platform == "win32":
            base = Path(os.environ.get("APPDATA", Path.home())) / "TradingJournalPro"
        else:
            base = Path.home() / ".local" / "share" / "TradingJournalPro"
    else:
        base = Path.home() / ".tradingjournal"

    base.mkdir(parents=True, exist_ok=True)
    return base / ".encryption_key"


def _load_or_create_key() -> bytes:
    """Load the Fernet key from disk, or generate and persist a new one."""
    key_path = _get_key_path()
    if key_path.exists():
        return key_path.read_bytes().strip()

    # Generate a fresh key
    key = Fernet.generate_key()
    key_path.write_bytes(key)

    # Best-effort: restrict file permissions (Unix only)
    try:
        key_path.chmod(0o600)
    except OSError:
        pass

    logger.info("Generated new encryption key at %s", key_path)
    return key


# Module-level singleton so the key is loaded once per process.
_KEY = _load_or_create_key()
_fernet = Fernet(_KEY)


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return a base64-encoded ciphertext string."""
    if not plaintext:
        return plaintext
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext string back to plaintext.
    Returns the original string unchanged if decryption fails
    (e.g. value was stored before encryption was enabled).
    """
    if not ciphertext:
        return ciphertext
    try:
        return _fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        # Value is likely still in plaintext from before encryption was added.
        # Return as-is so existing credentials keep working.
        return ciphertext
