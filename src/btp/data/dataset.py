"""Slice dataset over preprocessed per-patient stacks (FR-D4, FR-D6).

``scripts/prepare_data.py`` writes, for each patient:
  <processed>/<pid>_img.npy   (Z, 2, X, Y) float16, z-scored
  <processed>/<pid>_lbl.npy   (Z, X, Y)    uint8, binary whole tumor
Arrays are memory-mapped, so 150 patients don't need to fit in RAM.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from monai.transforms import (
    Compose,
    DivisiblePadd,
    RandAdjustContrastd,
    RandFlipd,
    RandGaussianNoised,
    RandRotated,
    RandScaleIntensityd,
    RandShiftIntensityd,
    RandZoomd,
)
from torch.utils.data import Dataset


def stack_paths(processed_dir: str | Path, pid: str) -> tuple[Path, Path]:
    d = Path(processed_dir)
    return d / f"{pid}_img.npy", d / f"{pid}_lbl.npy"


def train_transforms() -> Compose:
    keys = ["image", "label"]
    return Compose([
        RandFlipd(keys, prob=0.5, spatial_axis=0),
        RandFlipd(keys, prob=0.5, spatial_axis=1),
        RandRotated(keys, range_x=0.26, prob=0.3, mode=("bilinear", "nearest"), padding_mode="zeros"),
        RandZoomd(keys, min_zoom=0.9, max_zoom=1.1, prob=0.3, mode=("bilinear", "nearest")),
        RandScaleIntensityd("image", factors=0.1, prob=0.5),
        RandShiftIntensityd("image", offsets=0.1, prob=0.5),
        RandAdjustContrastd("image", gamma=(0.8, 1.2), prob=0.2),
        RandGaussianNoised("image", std=0.05, prob=0.2),
        DivisiblePadd(keys, k=32),
    ])


def eval_transforms() -> Compose:
    return Compose([DivisiblePadd(["image", "label"], k=32)])


class SliceDataset(Dataset):
    """2D (image, mask) samples drawn from a set of patients.

    Keeps every tumor slice and samples ``tumor_to_empty_ratio`` x as many brain-only
    slices (re-drawn each epoch via :meth:`resample`) to fight class imbalance.
    """

    def __init__(self, processed_dir, patient_ids, *, transforms=None,
                 tumor_to_empty_ratio: float = 1.0, min_brain_fraction: float = 0.01,
                 seed: int = 0):
        self.processed_dir = Path(processed_dir)
        self.transforms = transforms
        self.ratio = tumor_to_empty_ratio
        self.rng = np.random.default_rng(seed)
        self.images, self.labels = {}, {}
        self.tumor_idx: list[tuple[str, int]] = []
        self.empty_idx: list[tuple[str, int]] = []
        for pid in patient_ids:
            ip, lp = stack_paths(self.processed_dir, pid)
            img = np.load(ip, mmap_mode="r")
            lbl = np.load(lp, mmap_mode="r")
            self.images[pid], self.labels[pid] = img, lbl
            has_tumor = lbl.reshape(lbl.shape[0], -1).any(axis=1)
            brain_frac = (np.abs(img[:, 1]) > 0).reshape(img.shape[0], -1).mean(axis=1)
            for z in range(lbl.shape[0]):
                if has_tumor[z]:
                    self.tumor_idx.append((pid, z))
                elif brain_frac[z] >= min_brain_fraction:
                    self.empty_idx.append((pid, z))
        self.resample()

    def resample(self) -> None:
        n_empty = min(len(self.empty_idx), int(round(len(self.tumor_idx) * self.ratio)))
        if not self.tumor_idx:  # e.g. a no-tumor-only subset: use all brain slices
            n_empty = len(self.empty_idx)
        pick = self.rng.choice(len(self.empty_idx), size=n_empty, replace=False) if n_empty else []
        self.index = self.tumor_idx + [self.empty_idx[i] for i in pick]

    def __len__(self) -> int:
        return len(self.index)

    def __getitem__(self, i):
        pid, z = self.index[i]
        sample = {
            "image": torch.from_numpy(np.asarray(self.images[pid][z], dtype=np.float32)),
            "label": torch.from_numpy(np.asarray(self.labels[pid][z], dtype=np.float32))[None],
        }
        if self.transforms is not None:
            sample = self.transforms(sample)
        return {"image": torch.as_tensor(sample["image"]).float(),
                "label": torch.as_tensor(sample["label"]).float()}
