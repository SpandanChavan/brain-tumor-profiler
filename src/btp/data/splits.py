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

    Split sizes are computed over the whole cohort (largest-remainder rounding), with at
    least one validation and one test patient whenever there are >= 3 patients; rounding
    per size-bin used to starve small splits (e.g. 12 patients -> 0 validation).
    Stratification: patients are shuffled within tumor-size quantile bins, then dealt
    round-robin across bins, so every split sees small and large tumors.
    """
    if abs(sum(ratios) - 1.0) > 1e-6:
        raise ValueError("ratios must sum to 1")
    rng = np.random.default_rng(seed)
    df = manifest.drop_duplicates("patient_id").reset_index(drop=True)
    if stratify_col in df and df[stratify_col].nunique() >= n_bins:
        bins = pd.qcut(df[stratify_col].rank(method="first"), q=n_bins, labels=False)
    else:
        bins = pd.Series(np.zeros(len(df), dtype=int))

    # global sizes via largest remainder
    n = len(df)
    raw = np.array(ratios) * n
    sizes = np.floor(raw).astype(int)
    for i in np.argsort(-(raw - sizes))[: n - sizes.sum()]:
        sizes[i] += 1
    if n >= 3:  # every non-empty ratio gets at least one patient, taken from train
        for i in (1, 2):
            if ratios[i] > 0 and sizes[i] == 0:
                sizes[i], sizes[0] = 1, sizes[0] - 1

    # interleave bins so each slice of the ordering spans all tumor sizes
    per_bin = []
    for b in sorted(bins.unique()):
        ids = df.loc[bins == b, "patient_id"].tolist()
        rng.shuffle(ids)
        per_bin.append(ids)
    order = [ids[k] for k in range(max(map(len, per_bin))) for ids in per_bin if k < len(ids)]

    n_test, n_val = sizes[2], sizes[1]
    out: dict[str, list[str]] = {
        "test": order[:n_test],
        "val": order[n_test:n_test + n_val],
        "train": order[n_test + n_val:],
    }
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
