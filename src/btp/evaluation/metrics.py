"""Per-patient 3D segmentation metrics (FR-E1, docs/eval_protocol.md).

Conventions for empty masks (made explicit so results are never silently inflated):
  * Dice/IoU: both empty -> 1.0 (correct "no tumor"); exactly one empty -> 0.0
  * HD95: both empty -> 0.0; exactly one empty -> NaN (undefined, reported separately)
"""

from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_erosion, distance_transform_edt


def _b(x) -> np.ndarray:
    return np.asarray(x).astype(bool)


def dice(pred, gt) -> float:
    p, g = _b(pred), _b(gt)
    denom = p.sum() + g.sum()
    if denom == 0:
        return 1.0
    return float(2.0 * np.logical_and(p, g).sum() / denom)


def iou(pred, gt) -> float:
    p, g = _b(pred), _b(gt)
    union = np.logical_or(p, g).sum()
    if union == 0:
        return 1.0
    return float(np.logical_and(p, g).sum() / union)


def sensitivity(pred, gt) -> float:
    p, g = _b(pred), _b(gt)
    if g.sum() == 0:
        return float("nan")
    return float(np.logical_and(p, g).sum() / g.sum())


def precision(pred, gt) -> float:
    p, g = _b(pred), _b(gt)
    if p.sum() == 0:
        return float("nan")
    return float(np.logical_and(p, g).sum() / p.sum())


def volume_error(pred, gt) -> float:
    """Relative absolute volume error |Vp - Vg| / Vg."""
    p, g = _b(pred), _b(gt)
    if g.sum() == 0:
        return float("nan")
    return float(abs(int(p.sum()) - int(g.sum())) / g.sum())


def _surface(mask: np.ndarray) -> np.ndarray:
    return mask & ~binary_erosion(mask, iterations=1, border_value=0)


def hd95(pred, gt, spacing=(1.0, 1.0, 1.0)) -> float:
    """95th-percentile symmetric Hausdorff distance in mm."""
    p, g = _b(pred), _b(gt)
    if not p.any() and not g.any():
        return 0.0
    if not p.any() or not g.any():
        return float("nan")
    sp, sg = _surface(p), _surface(g)
    dt_g = distance_transform_edt(~sg, sampling=spacing)
    dt_p = distance_transform_edt(~sp, sampling=spacing)
    d = np.concatenate([dt_g[sp], dt_p[sg]])
    return float(np.percentile(d, 95))


def case_metrics(pred, gt, spacing=(1.0, 1.0, 1.0)) -> dict[str, float]:
    voxel_ml = float(np.prod(spacing)) / 1000.0
    p, g = _b(pred), _b(gt)
    return {
        "dice": dice(p, g),
        "iou": iou(p, g),
        "hd95_mm": hd95(p, g, spacing),
        "sensitivity": sensitivity(p, g),
        "precision": precision(p, g),
        "volume_error": volume_error(p, g),
        "vol_pred_ml": float(p.sum() * voxel_ml),
        "vol_gt_ml": float(g.sum() * voxel_ml),
        "detected": bool(p.any()),
        "has_tumor": bool(g.any()),
    }
