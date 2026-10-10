"""API configuration from environment variables (12-factor; no secrets in code)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    model_path: Path = Path(os.environ.get("BTP_MODEL_ONNX", ROOT / "models" / "btp_model.onnx"))
    card_path: Path = Path(os.environ.get("BTP_MODEL_CARD", ROOT / "models" / "model_card.json"))
    samples_dir: Path = Path(os.environ.get("BTP_SAMPLES_DIR", ROOT / "assets" / "demo"))
    audit_path: Path = Path(os.environ.get("BTP_AUDIT_PATH", ROOT / "audit" / "api_audit.jsonl"))
    # SR-14: CORS limited to the frontend origin(s)
    allowed_origins: list[str] = field(default_factory=lambda: _list(
        "BTP_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"))
    max_concurrent_jobs: int = int(os.environ.get("BTP_MAX_JOBS", "2"))        # FR-S6
    rate_limit_per_minute: int = int(os.environ.get("BTP_RATE_LIMIT", "10"))   # FR-S6
    result_ttl_seconds: int = int(os.environ.get("BTP_RESULT_TTL", "600"))     # SR-15
    max_upload_bytes: int = 200 * 1024 * 1024
    # None = let ONNX Runtime choose (physical cores). Forcing os.cpu_count() oversubscribed
    # hyperthreads / efficiency cores and made inference ~30x slower (0.7 s -> 21.5 s).
    threads: int | None = int(os.environ["BTP_THREADS"]) if os.environ.get("BTP_THREADS") else None


settings = Settings()
