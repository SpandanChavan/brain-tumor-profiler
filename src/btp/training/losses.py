"""Dice + BCE loss for binary segmentation (FR-M2)."""

from __future__ import annotations

import torch
from monai.losses import DiceLoss
from torch import nn


class DiceBCELoss(nn.Module):
    def __init__(self, dice_weight: float = 1.0, bce_weight: float = 1.0):
        super().__init__()
        self.dice = DiceLoss(sigmoid=True, smooth_nr=1e-5, smooth_dr=1e-5, batch=True)
        self.bce = nn.BCEWithLogitsLoss()
        self.wd, self.wb = dice_weight, bce_weight

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        return self.wd * self.dice(logits, target) + self.wb * self.bce(logits, target)
