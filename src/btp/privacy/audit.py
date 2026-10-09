"""Append-only, PHI-free audit log (SR-4).

Records *events*, never content: no file names, no patient fields, no IP addresses.
Sessions are identified by a salted hash so log lines can be correlated without
identifying the user.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path

ALLOWED_EVENTS = {
    "session_start", "consent_given", "upload_accepted", "upload_rejected", "sample_loaded",
    "deid_applied", "inference_run", "export_mask", "export_report", "export_png",
    "data_deleted", "session_end",
}
# keys allowed in the details dict; anything else is dropped (defence against accidental PHI)
ALLOWED_DETAIL_KEYS = {"file_sha256", "n_files", "seconds", "detected", "reason", "model_version",
                       "n_removed", "burned_in", "format"}


class AuditLog:
    def __init__(self, path: str | Path = "audit/audit.jsonl", salt: str | None = None):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.salt = salt or os.environ.get("BTP_AUDIT_SALT") or secrets.token_hex(16)
        self._lock = threading.Lock()

    def session_hash(self, session_id: str) -> str:
        return hashlib.sha256((self.salt + session_id).encode()).hexdigest()[:16]

    def log(self, session_id: str, event: str, **details) -> dict:
        if event not in ALLOWED_EVENTS:
            raise ValueError(f"Unknown audit event {event!r}")
        clean = {k: v for k, v in details.items() if k in ALLOWED_DETAIL_KEYS}
        rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "session": self.session_hash(session_id), "event": event, **clean}
        with self._lock, open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        return rec


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
