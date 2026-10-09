"""Session-scoped temporary storage with guaranteed deletion (SR-2, SR-3).

Uploads live in a private temp directory for the lifetime of one browser session and
are wiped on "Delete now", on session end, or at interpreter exit. Optional
encryption-at-rest uses Fernet (AES-128-CBC + HMAC) with a per-session key held only
in memory, so files on disk are unreadable after the session dies.
"""

from __future__ import annotations

import shutil
import tempfile
import weakref
from pathlib import Path

from cryptography.fernet import Fernet


class SessionStore:
    def __init__(self, encrypt: bool = True, prefix: str = "btp_session_"):
        self.dir = Path(tempfile.mkdtemp(prefix=prefix))
        self._fernet = Fernet(Fernet.generate_key()) if encrypt else None
        # weakref.finalize also runs at interpreter exit, so the folder never outlives the process
        self._finalizer = weakref.finalize(self, shutil.rmtree, str(self.dir), True)

    @property
    def alive(self) -> bool:
        return self.dir.exists()

    def put(self, name: str, data: bytes) -> Path:
        safe = Path(name).name  # no path traversal
        p = self.dir / safe
        p.write_bytes(self._fernet.encrypt(data) if self._fernet else data)
        return p

    def get(self, name: str) -> bytes:
        raw = (self.dir / Path(name).name).read_bytes()
        return self._fernet.decrypt(raw) if self._fernet else raw

    def plaintext_copy(self, name: str, suffix: str = "") -> Path:
        """Decrypted temp file for libraries that need a path (deleted with the session)."""
        p = self.dir / f"plain_{Path(name).stem}{suffix}"
        p.write_bytes(self.get(name))
        return p

    def files(self) -> list[Path]:
        return sorted(self.dir.iterdir()) if self.alive else []

    def wipe(self) -> None:
        if self.dir.exists():
            for f in self.dir.rglob("*"):
                if f.is_file():
                    try:  # best-effort overwrite before unlink
                        f.write_bytes(b"\0" * min(f.stat().st_size, 1 << 20))
                    except OSError:
                        pass
            shutil.rmtree(self.dir, ignore_errors=True)
