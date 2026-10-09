"""Phase 4: final evaluation on the held-out TEST patients (run once! see eval_protocol.md).

  python scripts/evaluate.py --weights outputs/run/best.pt --split test --out outputs/run/eval_test

Writes per_patient.csv, summary.json, boxplot.png, worst_cases.png.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from btp.config import load_config  # noqa: E402
from btp.data.dataset import stack_paths  # noqa: E402
from btp.data.splits import load_splits  # noqa: E402
from btp.evaluation.metrics import case_metrics  # noqa: E402
from btp.inference.postprocess import postprocess_mask  # noqa: E402
from btp.inference.predictor import Predictor  # noqa: E402
from btp.models.factory import load_checkpoint, sha256_file  # noqa: E402
from btp.viz import comparison, orient_for_display, to_display  # noqa: E402


def summarize(df: pd.DataFrame) -> dict:
    out = {"n_patients": int(len(df))}
    for col in ["dice", "iou", "hd95_mm", "sensitivity", "precision", "volume_error"]:
        v = df[col].dropna()
        out[col] = {"mean": float(v.mean()), "std": float(v.std(ddof=0)), "median": float(v.median()),
                    "min": float(v.min()), "max": float(v.max()), "n_valid": int(len(v))}
    tum = df[df.has_tumor]
    out["patient_detection_sensitivity"] = float(tum.detected.mean()) if len(tum) else None
    clean = df[~df.has_tumor]
    out["patient_false_positive_rate"] = float(clean.detected.mean()) if len(clean) else None
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/default.yaml")
    ap.add_argument("--weights", required=True)
    ap.add_argument("--split", default="test", choices=["train", "val", "test"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--no-tta", action="store_true")
    ap.add_argument("overrides", nargs="*")
    a = ap.parse_args()
    cfg = load_config(a.config, a.overrides)
    icfg, d = cfg["inference"], cfg["data"]
    out = Path(a.out or Path(a.weights).parent / f"eval_{a.split}")
    out.mkdir(parents=True, exist_ok=True)

    model, meta = load_checkpoint(a.weights)
    pred = Predictor(model, threshold=icfg["threshold"], tta=icfg["tta"] and not a.no_tta,
                     batch_size=icfg["batch_size"], min_component_voxels=icfg["min_component_voxels"])
    pids = load_splits(d["splits"])[a.split]
    rows, cache = [], {}
    for i, pid in enumerate(pids):
        ip, lp = stack_paths(d["processed_dir"], pid)
        img, lbl = np.load(ip), np.load(lp)
        prob, _ = pred.predict_stack(img)
        brain = np.any(img != 0, axis=1)
        mask = postprocess_mask(prob >= icfg["threshold"], brain, icfg["min_component_voxels"])
        m = case_metrics(mask, lbl)  # BraTS is 1 mm isotropic
        rows.append({"patient_id": pid, **m})
        cache[pid] = (img, lbl, mask)
        print(f"[{i + 1}/{len(pids)}] {pid}: Dice {m['dice']:.4f}  HD95 {m['hd95_mm']:.1f} mm")

    df = pd.DataFrame(rows).sort_values("dice")
    df.to_csv(out / "per_patient.csv", index=False)
    summary = summarize(df)
    summary.update({"split": a.split, "weights_sha256": sha256_file(a.weights), "train_meta": meta,
                    "tta": icfg["tta"] and not a.no_tta, "threshold": icfg["threshold"]})
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("n_patients", "dice", "hd95_mm")}, indent=2))

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 3, figsize=(11, 3.6))
    for ax, col, title in zip(axes, ["dice", "hd95_mm", "sensitivity"], ["Dice", "HD95 (mm)", "Sensitivity"], strict=True):
        ax.boxplot(df[col].dropna(), widths=0.5)
        ax.scatter(np.ones(df[col].notna().sum()) + np.random.uniform(-0.08, 0.08, df[col].notna().sum()),
                   df[col].dropna(), s=10, alpha=0.6)
        ax.set_title(title)
        ax.set_xticks([])
    fig.suptitle(f"Per-patient metrics ({a.split}, n={len(df)})")
    fig.tight_layout()
    fig.savefig(out / "boxplot.png", dpi=150)

    worst = df.head(5).patient_id.tolist()
    fig, axes = plt.subplots(1, len(worst), figsize=(3.2 * len(worst), 4.0), squeeze=False)
    for ax, pid in zip(axes[0], worst, strict=True):
        img, lbl, mask = cache[pid]
        z = int(np.argmax(lbl.reshape(lbl.shape[0], -1).sum(1))) if lbl.any() else img.shape[0] // 2
        g = to_display(img[z, 1].astype(np.float32))
        ax.imshow(orient_for_display(comparison(g, mask[z], lbl[z])))
        ax.set_title(f"{pid}\nDice {df.set_index('patient_id').dice[pid]:.3f}", fontsize=8)
        ax.axis("off")
    fig.suptitle("Worst cases: cyan TP · amber FP · magenta FN (FLAIR)")
    fig.tight_layout()
    fig.savefig(out / "worst_cases.png", dpi=150)
    print("Saved to", out)


if __name__ == "__main__":
    main()
