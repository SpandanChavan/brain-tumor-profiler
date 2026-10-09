"""Training loop (FR-M2, FR-M3, NFR-9).

* AdamW + cosine LR, AMP on CUDA, early stopping on **per-patient 3D val Dice**
* checkpoint every epoch (``last.pt``) and resume support: free Kaggle/Colab sessions die
* everything needed to reproduce a number is written to the run folder:
  config.yaml, git commit, metrics.csv, best.pt (+ SHA-256)
"""

from __future__ import annotations

import csv
import json
import random
import subprocess
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader

from btp.config import save_config
from btp.data.dataset import SliceDataset, eval_transforms, stack_paths, train_transforms
from btp.data.splits import load_splits
from btp.evaluation.metrics import dice
from btp.inference.postprocess import postprocess_mask
from btp.inference.predictor import Predictor
from btp.models.factory import build_model, save_checkpoint

from .losses import DiceBCELoss


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "unknown"


def validate_patients(model, processed_dir, patient_ids, *, threshold=0.5,
                      min_component_voxels=50, batch_size=16, device=None) -> dict[str, float]:
    """Per-patient 3D Dice on full slice stacks (no TTA, for speed)."""
    pred = Predictor(model, threshold=threshold, tta=False, batch_size=batch_size,
                     min_component_voxels=min_component_voxels, device=device)
    scores = {}
    for pid in patient_ids:
        ip, lp = stack_paths(processed_dir, pid)
        img = np.load(ip, mmap_mode="r")
        lbl = np.load(lp, mmap_mode="r")
        prob, _ = pred.predict_stack(img)
        brain = np.any(np.asarray(img) != 0, axis=1)
        mask = postprocess_mask(prob >= threshold, brain, min_component_voxels)
        scores[pid] = dice(mask, lbl)
    model.train()
    return scores


def train(cfg: dict[str, Any], resume: bool = True) -> dict[str, Any]:
    seed_everything(cfg["seed"])
    tcfg, dcfg = cfg["train"], cfg["data"]
    out = Path(tcfg["output_dir"])
    out.mkdir(parents=True, exist_ok=True)
    save_config(cfg, out / "config.yaml")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = bool(tcfg.get("amp", True)) and device.type == "cuda"

    splits = load_splits(dcfg["splits"])
    train_ds = SliceDataset(dcfg["processed_dir"], splits["train"], transforms=train_transforms(),
                            tumor_to_empty_ratio=dcfg["tumor_to_empty_ratio"],
                            min_brain_fraction=dcfg["min_brain_fraction"], seed=cfg["seed"])
    loader_kw = dict(batch_size=tcfg["batch_size"], num_workers=tcfg["num_workers"],
                     pin_memory=device.type == "cuda", persistent_workers=tcfg["num_workers"] > 0)

    model = build_model(cfg["model"]).to(device)
    loss_fn = DiceBCELoss(tcfg["dice_weight"], tcfg["bce_weight"])
    opt = torch.optim.AdamW(model.parameters(), lr=tcfg["lr"], weight_decay=tcfg["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=tcfg["epochs"])
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    start_epoch, best, bad_epochs = 0, -1.0, 0
    last = out / "last.pt"
    if resume and last.exists():
        ck = torch.load(last, map_location=device, weights_only=False)
        model.load_state_dict(ck["state_dict"])
        opt.load_state_dict(ck["opt"])
        sched.load_state_dict(ck["sched"])
        start_epoch, best, bad_epochs = ck["epoch"] + 1, ck["best"], ck["bad_epochs"]
        print(f"Resumed from epoch {start_epoch} (best val Dice {best:.4f})")

    metrics_path = out / "metrics.csv"
    new_file = not metrics_path.exists() or start_epoch == 0
    mf = open(metrics_path, "w" if new_file else "a", newline="", encoding="utf-8")
    writer = csv.writer(mf)
    if new_file:
        writer.writerow(["epoch", "train_loss", "val_dice_mean", "val_dice_median", "lr", "seconds"])

    commit = git_commit()
    for epoch in range(start_epoch, tcfg["epochs"]):
        t0 = time.time()
        train_ds.resample()
        loader = DataLoader(train_ds, shuffle=True, drop_last=len(train_ds) > tcfg["batch_size"], **loader_kw)
        model.train()
        running, n = 0.0, 0
        for batch in loader:
            x, y = batch["image"].to(device), batch["label"].to(device)
            opt.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, enabled=use_amp):
                loss = loss_fn(model(x), y)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            running += loss.item() * x.shape[0]
            n += x.shape[0]
        sched.step()
        train_loss = running / max(n, 1)

        vmean = vmed = float("nan")
        if (epoch + 1) % tcfg.get("val_every", 1) == 0 and splits.get("val"):
            scores = validate_patients(model, dcfg["processed_dir"], splits["val"],
                                       threshold=cfg["inference"]["threshold"],
                                       min_component_voxels=cfg["inference"]["min_component_voxels"],
                                       batch_size=cfg["inference"]["batch_size"], device=device.type)
            vals = np.array(list(scores.values()))
            vmean, vmed = float(vals.mean()), float(np.median(vals))
            if vmean > best:
                best, bad_epochs = vmean, 0
                sha = save_checkpoint(model, out / "best.pt", model_cfg=cfg["model"], meta={
                    "epoch": epoch, "val_dice_mean": vmean, "val_dice_median": vmed,
                    "git_commit": commit, "seed": cfg["seed"],
                    "modalities": dcfg["modalities"], "threshold": cfg["inference"]["threshold"],
                    "n_train_patients": len(splits["train"]), "n_val_patients": len(splits["val"]),
                })
                (out / "best.sha256").write_text(sha, encoding="utf-8")
            else:
                bad_epochs += 1

        secs = time.time() - t0
        lr = opt.param_groups[0]["lr"]
        writer.writerow([epoch, f"{train_loss:.5f}", f"{vmean:.5f}", f"{vmed:.5f}", f"{lr:.2e}", f"{secs:.1f}"])
        mf.flush()
        print(f"epoch {epoch:3d} | loss {train_loss:.4f} | val Dice {vmean:.4f} (median {vmed:.4f}) "
              f"| best {best:.4f} | {secs:.0f}s")
        torch.save({"state_dict": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(),
                    "epoch": epoch, "best": best, "bad_epochs": bad_epochs}, last)
        if bad_epochs >= tcfg["early_stopping_patience"]:
            print(f"Early stopping: no val improvement for {bad_epochs} epochs.")
            break
    mf.close()
    if not (out / "best.pt").exists():
        # no validation ever ran (empty val split, or fewer epochs than val_every): never end a
        # run without a usable checkpoint; keep the final weights and say so loudly
        print("WARNING: no validation was run; saving the final epoch as best.pt (not model-selected).")
        sha = save_checkpoint(model, out / "best.pt", model_cfg=cfg["model"], meta={
            "epoch": epoch, "val_dice_mean": None, "selection": "final-epoch (no validation)",
            "git_commit": commit, "seed": cfg["seed"], "modalities": dcfg["modalities"],
            "threshold": cfg["inference"]["threshold"], "n_train_patients": len(splits["train"]),
            "n_val_patients": len(splits.get("val", [])),
        })
        (out / "best.sha256").write_text(sha, encoding="utf-8")
    summary = {"best_val_dice": best if best >= 0 else None, "output_dir": str(out), "git_commit": commit}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


__all__ = ["train", "validate_patients", "seed_everything", "eval_transforms"]
