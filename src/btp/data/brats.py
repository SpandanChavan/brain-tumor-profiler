"""BraTS folder indexing (FR-D1).

Supports both naming schemes:
  * BraTS 2021:      BraTS2021_00000/BraTS2021_00000_{t1ce,flair,seg}.nii.gz
  * BraTS 2023+ GLI: BraTS-GLI-00000-000/BraTS-GLI-00000-000-{t1c,t2f,seg}.nii.gz
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

# modality -> filename suffixes to try (first match wins)
SUFFIXES = {
    "t1ce": ["_t1ce", "-t1c"],
    "flair": ["_flair", "-t2f"],
    "t1": ["_t1", "-t1n"],
    "t2": ["_t2", "-t2w"],
    "seg": ["_seg", "-seg"],
}


def _find(case_dir: Path, modality: str) -> Path | None:
    for suf in SUFFIXES[modality]:
        for ext in (".nii.gz", ".nii"):
            p = case_dir / f"{case_dir.name}{suf}{ext}"
            if p.exists():
                return p
    return None


def index_brats(raw_dir: str | Path, modalities=("t1ce", "flair", "seg")) -> pd.DataFrame:
    """One row per patient that has all requested modalities."""
    raw_dir = Path(raw_dir)
    if not raw_dir.exists():
        raise FileNotFoundError(
            f"BraTS folder not found: {raw_dir}. Download BraTS 2021 (Synapse syn25829067 / TCIA) "
            "and point data.raw_dir at it."
        )
    rows = []
    for case_dir in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        found = {m: _find(case_dir, m) for m in modalities}
        if all(found.values()):
            rows.append({"patient_id": case_dir.name, **{m: str(p) for m, p in found.items()}})
    if not rows:
        raise RuntimeError(f"No complete BraTS cases found under {raw_dir}.")
    return pd.DataFrame(rows)
