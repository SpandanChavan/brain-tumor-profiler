import json

import numpy as np

from btp.config import PROJECT_ROOT, load_config
from btp.data.splits import patient_split, save_splits
from btp.preprocessing.volume import load_case, to_slice_stack
from btp.synthetic import make_phantom, save_phantom_nifti
from btp.training.train import train


def test_one_epoch_training_and_resume(tmp_path):
    proc = tmp_path / "proc"
    proc.mkdir()
    ids = []
    for i in range(4):
        pid = f"S{i}"
        p = save_phantom_nifti(make_phantom(shape=(64, 64, 24), seed=i), tmp_path / "raw", pid)
        c = load_case(p["t1ce"], p["flair"], p["seg"])
        np.save(proc / f"{pid}_img.npy", to_slice_stack(c.image).astype(np.float16))
        np.save(proc / f"{pid}_lbl.npy", np.transpose(c.label, (2, 0, 1)))
        ids.append(pid)
    import pandas as pd
    splits = patient_split(pd.DataFrame({"patient_id": ids}), (0.5, 0.25, 0.25), seed=0)
    save_splits(splits, proc / "splits.json")

    cfg = load_config(PROJECT_ROOT / "configs" / "default.yaml", [
        f"data.processed_dir={proc.as_posix()}", f"data.splits={(proc / 'splits.json').as_posix()}",
        "model.name=unet", "train.epochs=1", "train.batch_size=4", "train.num_workers=0",
        f"train.output_dir={(tmp_path / 'run').as_posix()}", "inference.min_component_voxels=0",
    ])
    summary = train(cfg, resume=False)
    run = tmp_path / "run"
    assert (run / "best.pt").exists() and (run / "last.pt").exists() and (run / "config.yaml").exists()
    assert 0.0 <= summary["best_val_dice"] <= 1.0
    assert json.loads((run / "summary.json").read_text())["best_val_dice"] == summary["best_val_dice"]

    cfg["train"]["epochs"] = 2  # resume continues from epoch 1, not from scratch
    train(cfg, resume=True)
    lines = (run / "metrics.csv").read_text().strip().splitlines()
    assert [ln.split(",")[0] for ln in lines[1:]] == ["0", "1"]


def test_config_overrides_are_typed():
    cfg = load_config(PROJECT_ROOT / "configs" / "default.yaml", ["train.lr=1e-3", "model.pretrained=false"])
    assert cfg["train"]["lr"] == 1e-3 and cfg["model"]["pretrained"] is False
