"""Mask post-processing: drop tiny 3D components and anything outside the brain."""

from __future__ import annotations

import numpy as np
from scipy.ndimage import label as cc_label


def postprocess_mask(mask: np.ndarray, brain: np.ndarray | None = None,
                     min_component_voxels: int = 50) -> np.ndarray:
    m = mask.astype(bool)
    if brain is not None:
        m &= brain.astype(bool)
    if min_component_voxels > 0 and m.any():
        lab, n = cc_label(m)
        if n:
            sizes = np.bincount(lab.ravel())
            keep = sizes >= min_component_voxels
            keep[0] = False
            m = keep[lab]
    return m.astype(np.uint8)
