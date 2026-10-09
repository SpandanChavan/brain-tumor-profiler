"""Option C (knowledge.md section 5): zero-shot MONAI `brats_mri_segmentation` bundle on our TEST patients.

Gives a reference score from an expert 3D, 4-modality model. It is NOT our setting (it uses
T1, T1ce, T2 and FLAIR), so report it as context, not as a competitor. Needs a GPU.

  pip install "monai[fire]" huggingface_hub
  python scripts/bundle_reference.py --out outputs/bundle_reference
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from btp.config import load_config  # noqa: E402
from btp.data.brats import index_brats  # noqa: E402
from btp.data.splits import load_splits  # noqa: E402
from btp.evaluation.metrics import case_metrics  # noqa: E402
from btp.preprocessing.volume import load_nifti_ras, normalize_zscore  # noqa: E402


def main() -> None:
    from monai.bundle import download, load
    from monai.inferers import sliding_window_inference

    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/default.yaml")
    ap.add_argument("--out", default="outputs/bundle_reference")
    ap.add_argument("--bundle-dir", default="models/bundles")
    ap.add_argument("overrides", nargs="*")
    a = ap.parse_args()
    cfg = load_config(ROOT / a.config, a.overrides)
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)

    download(name="brats_mri_segmentation", bundle_dir=a.bundle_dir, source="monaihosting")
    net = load(name="brats_mri_segmentation", bundle_dir=a.bundle_dir, source="monaihosting")
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    net = net.to(dev).eval()

    test = load_splits(ROOT / cfg["data"]["splits"])["test"]
    df = index_brats(ROOT / cfg["data"]["raw_dir"], modalities=("t1", "t1ce", "t2", "flair", "seg"))
    df = df[df.patient_id.isin(test)]
    rows = []
    for _, r in df.iterrows():
        vols = [np.asanyarray(load_nifti_ras(r[m]).dataobj).astype(np.float32) for m in ("t1ce", "t1", "t2", "flair")]
        mask = np.any(np.stack(vols) > 0, axis=0)
        x = torch.from_numpy(np.stack([normalize_zscore(v, mask) for v in vols]))[None].to(dev)
        with torch.no_grad(), torch.autocast(dev.type, enabled=dev.type == "cuda"):
            y = sliding_window_inference(x, (240, 240, 160), 1, net, overlap=0.5)
        wt = (torch.sigmoid(y)[0, 1] > 0.5).cpu().numpy()  # bundle channels: TC, WT, ET
        gt = np.asanyarray(load_nifti_ras(r["seg"]).dataobj) > 0
        rows.append({"patient_id": r.patient_id, **case_metrics(wt, gt)})
        print(r.patient_id, f"Dice {rows[-1]['dice']:.4f}")
    res = pd.DataFrame(rows)
    res.to_csv(out / "per_patient.csv", index=False)
    s = {"n": len(res), "dice_mean": float(res.dice.mean()), "dice_median": float(res.dice.median()),
         "hd95_median": float(res.hd95_mm.median()), "note": "4-modality 3D bundle, zero-shot (reference only)"}
    (out / "summary.json").write_text(json.dumps(s, indent=2))
    print(s)


if __name__ == "__main__":
    main()
