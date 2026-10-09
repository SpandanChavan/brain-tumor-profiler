"""Phase 2: BraTS subset -> manifest, patient-level splits, preprocessed slice stacks.

Usage:
  python scripts/prepare_data.py                      # uses configs/default.yaml
  python scripts/prepare_data.py data.num_patients=150 data.raw_dir=/kaggle/input/brats2021
  python scripts/prepare_data.py --synthetic 30       # no BraTS yet: build a phantom dataset
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from btp.config import load_config  # noqa: E402
from btp.data.brats import index_brats  # noqa: E402
from btp.data.splits import patient_split, save_splits  # noqa: E402
from btp.preprocessing.volume import load_case, to_slice_stack  # noqa: E402
from btp.synthetic import make_phantom, save_phantom_nifti  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/default.yaml")
    ap.add_argument("--synthetic", type=int, default=0, help="generate N phantom cases instead of BraTS")
    ap.add_argument("overrides", nargs="*")
    args = ap.parse_args()
    cfg = load_config(args.config, args.overrides)
    d = cfg["data"]

    if args.synthetic:
        raw = Path(d["raw_dir"]).parent / "synthetic"
        for i in range(args.synthetic):
            ph = make_phantom(tumor=(i % 6 != 0), seed=1000 + i)  # some tumor-free cases
            save_phantom_nifti(ph, raw, f"SYNTH_{i:04d}")
        d["raw_dir"] = str(raw)
        d["num_patients"] = args.synthetic
        print(f"Wrote {args.synthetic} synthetic phantoms to {raw}")

    df = index_brats(d["raw_dir"], modalities=("t1ce", "flair", "seg"))
    rng = np.random.default_rng(cfg["seed"])
    if len(df) > d["num_patients"]:
        df = df.iloc[np.sort(rng.choice(len(df), d["num_patients"], replace=False))].reset_index(drop=True)
    print(f"Preparing {len(df)} patients")

    out = Path(d["processed_dir"])
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, r in df.iterrows():
        case = load_case(r["t1ce"], r["flair"], r["seg"])
        stack = to_slice_stack(case.image).astype(np.float16)           # (Z, 2, X, Y)
        lbl = np.ascontiguousarray(np.transpose(case.label, (2, 0, 1)))  # (Z, X, Y)
        np.save(out / f"{r.patient_id}_img.npy", stack)
        np.save(out / f"{r.patient_id}_lbl.npy", lbl)
        raw = case.raw_label
        rows.append({
            "patient_id": r.patient_id,
            "tumor_voxels": int(case.label.sum()),
            "ncr_voxels": int((raw == 1).sum()), "ed_voxels": int((raw == 2).sum()),
            "et_voxels": int(((raw == 4) | (raw == 3)).sum()),
            "n_slices": stack.shape[0], "n_tumor_slices": int(lbl.reshape(lbl.shape[0], -1).any(1).sum()),
            "shape": "x".join(map(str, case.image.shape[1:])),
            "spacing": "x".join(f"{s:g}" for s in case.spacing),
        })
        print(f"  [{i + 1}/{len(df)}] {r.patient_id}: tumor {rows[-1]['tumor_voxels']} voxels")

    manifest = pd.DataFrame(rows)
    manifest.to_csv(d["manifest"], index=False)
    splits = patient_split(manifest, tuple(d["split_ratios"]), seed=cfg["seed"])
    save_splits(splits, d["splits"])
    print({k: len(v) for k, v in splits.items()}, "->", d["splits"])


if __name__ == "__main__":
    main()
