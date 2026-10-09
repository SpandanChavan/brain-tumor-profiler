"""Phase 4: export a trained checkpoint to ONNX and verify parity (NFR-6b).

  python scripts/export_onnx.py --weights models/btp_model.pt --out models/btp_model.onnx

Exports with dynamic batch/height/width (opset 17), then checks on synthetic phantoms (or
--case-dir BraTS-style folders) that ONNX Runtime masks match PyTorch masks: Dice >= 0.999.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from btp.evaluation.metrics import dice  # noqa: E402
from btp.inference.predictor import Predictor, onnx_logits_fn  # noqa: E402
from btp.models.factory import load_checkpoint, sha256_file  # noqa: E402
from btp.preprocessing.volume import load_case  # noqa: E402
from btp.synthetic import make_phantom, save_phantom_nifti  # noqa: E402


def export(weights: Path, out: Path, opset: int = 17) -> None:
    model, _ = load_checkpoint(weights)
    dummy = torch.zeros(1, 2, 256, 256)
    torch.onnx.export(
        model, dummy, str(out), opset_version=opset, input_names=["image"], output_names=["logits"],
        dynamic_axes={"image": {0: "batch", 2: "height", 3: "width"},
                      "logits": {0: "batch", 2: "height", 3: "width"}},
        dynamo=False,
    )


def parity(weights: Path, onnx_path: Path, cases: list[dict]) -> list[float]:
    model, _ = load_checkpoint(weights)
    pt = Predictor(model, tta=True, device="cpu")
    ox = Predictor(logits_fn=onnx_logits_fn(onnx_path), tta=True)
    scores = []
    for c in cases:
        case = load_case(c["t1ce"], c["flair"])
        a, b = pt.predict_case(case), ox.predict_case(case)
        scores.append(dice(a.mask, b.mask) if (a.mask.any() or b.mask.any()) else 1.0)
        print(f"  parity Dice {scores[-1]:.6f}  max |dprob| {np.abs(a.prob - b.prob).max():.2e}")
    return scores


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default="models/btp_model.pt")
    ap.add_argument("--out", default="models/btp_model.onnx")
    ap.add_argument("--case-dir", default=None, help="folder of case folders with *_t1ce/*_flair NIfTI")
    ap.add_argument("--min-dice", type=float, default=0.999)
    a = ap.parse_args()
    weights, out = ROOT / a.weights, ROOT / a.out
    export(weights, out)
    print(f"Exported {out.name} ({out.stat().st_size / 1e6:.1f} MB)")

    if a.case_dir:
        dirs = sorted(p for p in Path(a.case_dir).iterdir() if p.is_dir())[:5]
        cases = [{m: str(next(d.glob(f"*_{m}.nii.gz"))) for m in ("t1ce", "flair")} for d in dirs]
    else:
        tmp = ROOT / "outputs" / "parity_cases"
        cases = [save_phantom_nifti(make_phantom(seed=500 + i), tmp, f"P{i}") for i in range(3)]
    scores = parity(weights, out, cases)
    ok = min(scores) >= a.min_dice
    card = ROOT / "models" / "model_card.json"
    if card.exists() and out.parent == card.parent:
        c = json.loads(card.read_text())
        c["onnx"] = {"file": out.name, "sha256": sha256_file(out), "opset": 17,
                     "parity_min_dice": min(scores)}
        card.write_text(json.dumps(c, indent=2))
    print("PARITY OK" if ok else "PARITY FAILED", f"(min Dice {min(scores):.6f})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
