"""Phase 3/4: train a model.

  python scripts/train.py                                   # configs/default.yaml
  python scripts/train.py train.epochs=60 train.lr=1e-4 train.output_dir=outputs/lr1e-4
  python scripts/train.py model.pretrained=false train.output_dir=outputs/ablation_scratch
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from btp.config import load_config  # noqa: E402
from btp.training.train import train  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/default.yaml")
    ap.add_argument("--no-resume", action="store_true")
    ap.add_argument("overrides", nargs="*")
    a = ap.parse_args()
    print(train(load_config(a.config, a.overrides), resume=not a.no_resume))
