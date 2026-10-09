"""In-memory, TTL-bounded result store (SR-15).

Results are kept only in process memory under an unguessable id, expire after the TTL,
and are never written to disk. Nothing survives a restart, by design.
"""

from __future__ import annotations

import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class StoredResult:
    files: dict[str, bytes]
    created: float = field(default_factory=time.monotonic)


class ResultStore:
    def __init__(self, ttl_seconds: int = 600, max_items: int = 50):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self._items: dict[str, StoredResult] = {}
        self._lock = threading.Lock()

    def _purge(self) -> None:
        now = time.monotonic()
        for k in [k for k, v in self._items.items() if now - v.created >= self.ttl]:
            del self._items[k]
        while len(self._items) > self.max_items:  # oldest first
            del self._items[min(self._items, key=lambda k: self._items[k].created)]

    def put(self, files: dict[str, bytes]) -> str:
        job_id = secrets.token_urlsafe(16)
        with self._lock:
            self._items[job_id] = StoredResult(files)
            self._purge()
        return job_id

    def get(self, job_id: str, name: str) -> bytes | None:
        with self._lock:
            self._purge()
            item = self._items.get(job_id)
            return item.files.get(name) if item else None

    def delete(self, job_id: str) -> bool:
        with self._lock:
            return self._items.pop(job_id, None) is not None

    def __len__(self) -> int:
        with self._lock:
            self._purge()
            return len(self._items)


class RateLimiter:
    """Sliding-window limit per client key. Keys live in memory only and are never logged."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            return True
