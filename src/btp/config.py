"""YAML config loading with dotted overrides (FR-M3)."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_config(path: str | Path = PROJECT_ROOT / "configs" / "default.yaml",
                overrides: list[str] | None = None) -> dict[str, Any]:
    """Load a YAML config and apply ``key.sub=value`` overrides (values parsed as YAML)."""
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    for item in overrides or []:
        key, _, raw = item.partition("=")
        if not _:
            raise ValueError(f"Override must look like key=value, got {item!r}")
        node = cfg
        parts = key.split(".")
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = _parse_value(raw)
    return cfg


def _parse_value(raw: str) -> Any:
    """YAML-parse an override, also accepting ``1e-4`` (PyYAML/YAML 1.1 reads it as a string)."""
    val = yaml.safe_load(raw)
    if isinstance(val, str):
        try:
            return float(val)
        except ValueError:
            pass
    return val


def save_config(cfg: dict[str, Any], path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(copy.deepcopy(cfg), f, sort_keys=False)
