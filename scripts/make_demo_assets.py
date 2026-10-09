"""Package a trained model + sample cases for the app.

  # after real training + test evaluation (Phase 4):
  python scripts/make_demo_assets.py --weights outputs/run/best.pt --eval outputs/run/eval_test/summary.json \
      --version v1.0 --brats-cases BraTS2021_00495 BraTS2021_01234

  # pipeline demo with synthetic phantoms (before BraTS is available):
  python scripts/make_demo_assets.py --weights outputs/synthetic_smoke/best.pt \
      --eval outputs/synthetic_smoke/eval_test/summary.json --synthetic --version v0.1-synthetic

Writes models/btp_model.pt, models/model_card.json (with SHA-256, SR-7) and assets/demo/<case>/.
Sample cases must come from the TEST split, so the app never shows training data as "unseen".
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from btp.config import load_config  # noqa: E402
from btp.data.splits import load_splits  # noqa: E402
from btp.models.factory import sha256_file  # noqa: E402
from btp.synthetic import make_phantom, save_phantom_nifti  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--eval", default=None, help="summary.json from scripts/evaluate.py (test split)")
    ap.add_argument("--version", required=True)
    ap.add_argument("--synthetic", action="store_true", help="weights trained on phantoms")
    ap.add_argument("--brats-cases", nargs="*", default=[], help="test-split patient IDs to bundle")
    ap.add_argument("--config", default="configs/default.yaml")
    a = ap.parse_args()

    models = ROOT / "models"
    models.mkdir(exist_ok=True)
    dst = models / "btp_model.pt"
    shutil.copy(a.weights, dst)
    cfg = load_config(ROOT / a.config)
    summary = json.loads(Path(a.eval).read_text()) if a.eval else None
    card = {
        "version": a.version,
        "synthetic": a.synthetic,
        "created": date.today().isoformat(),
        "sha256": sha256_file(dst),
        "architecture": "MONAI FlexibleUNet, EfficientNet-B0 encoder (ImageNet-pretrained, 3->2 channel stem)",
        "inputs": ["T1ce", "FLAIR"],
        "output": "binary whole tumor (BraTS labels 1+2+4)",
        "training_data": ("Synthetic phantoms (pipeline test only)" if a.synthetic else
                          f"BraTS 2021 subset: {cfg['data']['num_patients']} patients, patient-level "
                          f"{'/'.join(str(int(r * 100)) for r in cfg['data']['split_ratios'])} split"),
        "inference": {"threshold": cfg["inference"]["threshold"], "tta": cfg["inference"]["tta"],
                      "min_component_voxels": cfg["inference"]["min_component_voxels"]},
        "test_metrics": summary and {k: summary[k] for k in
                                     ("n_patients", "dice", "iou", "hd95_mm", "sensitivity", "precision",
                                      "volume_error", "patient_detection_sensitivity")},
        "intended_use": "Research and education only. Not a medical device.",
    }
    (models / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    print("Model card written:", models / "model_card.json")

    demo = ROOT / "assets" / "demo"
    demo.mkdir(parents=True, exist_ok=True)
    if a.synthetic:
        for i, seed in enumerate([9001, 9002, 9003]):
            ph = make_phantom(shape=(128, 128, 80), tumor=i != 2, seed=seed)
            save_phantom_nifti(ph, demo, f"synthetic_{i + 1}{'_no_tumor' if i == 2 else ''}")
    if a.brats_cases:
        test_ids = set(load_splits(ROOT / cfg["data"]["splits"])["test"])
        from btp.data.brats import index_brats
        df = index_brats(ROOT / cfg["data"]["raw_dir"]).set_index("patient_id")
        for pid in a.brats_cases:
            if pid not in test_ids:
                raise SystemExit(f"{pid} is not in the TEST split; refusing to bundle it as a sample.")
            d = demo / pid
            d.mkdir(exist_ok=True)
            for m in ("t1ce", "flair", "seg"):
                shutil.copy(df.loc[pid, m], d / f"{pid}_{m}.nii.gz")
    print("Sample cases:", sorted(p.name for p in demo.iterdir() if p.is_dir()))


if __name__ == "__main__":
    main()
