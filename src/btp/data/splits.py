"""Patient-level, size-stratified splits (FR-D2).

Splitting by *patient*, never by slice, is what prevents leakage (risk R3).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


def patient_split(manifest: pd.DataFrame, ratios=(0.7, 0.15, 0.15), seed: int = 42,
                  stratify_col: str = "tumor_voxels", n_bins: int = 4) -> dict[str, list[str]]:
    """Return {'train': [...], 'val': [...], 'test': [...]} of patient IDs.

    Patients are binned into tumor-size quantiles and each bin is split with the same
    ratios, so every split sees small and large tumors.
    """
    if abs(sum(ratios) - 1.0) > 1e-6:
        raise ValueError("ratios must sum to 1")
    rng = np.random.default_rng(seed)
    df = manifest.drop_duplicates("patient_id").reset_index(drop=True)
    if stratify_col in df and df[stratify_col].nunique() >= n_bins:
        bins = pd.qcut(df[stratify_col].rank(method="first"), q=n_bins, labels=False)
    else:
        bins = pd.Series(np.zeros(len(df), dtype=int))

    out: dict[str, list[str]] = {"train": [], "val": [], "test": []}
    for b in sorted(bins.unique()):
        ids = df.loc[bins == b, "patient_id"].tolist()
        rng.shuffle(ids)
        n = len(ids)
        n_train = int(round(n * ratios[0]))
        n_val = int(round(n * ratios[1]))
        out["train"] += ids[:n_train]
        out["val"] += ids[n_train:n_train + n_val]
        out["test"] += ids[n_train + n_val:]
    for k in out:
        out[k] = sorted(out[k])
    assert_no_leakage(out)
    return out


def assert_no_leakage(splits: dict[str, list[str]]) -> None:
    names = list(splits)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            overlap = set(splits[a]) & set(splits[b])
            if overlap:
                raise AssertionError(f"Patient leakage between {a} and {b}: {sorted(overlap)[:5]}")


def save_splits(splits: dict[str, list[str]], path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(splits, indent=2), encoding="utf-8")


def load_splits(path: str | Path) -> dict[str, list[str]]:
    splits = json.loads(Path(path).read_text(encoding="utf-8"))
    assert_no_leakage(splits)
    return splits
