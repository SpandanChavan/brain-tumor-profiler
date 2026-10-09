"""Tumor profile: the "Profiler" half of the project (FR-A8).

All numbers are *estimates from an AI segmentation* and are labelled as such in the UI.
No prognosis or grading is ever derived (UX-8).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
from scipy.ndimage import label as cc_label


@dataclass
class TumorProfile:
    detected: bool
    volume_ml: float
    n_tumor_slices: int
    n_slices: int
    slice_range: tuple[int, int] | None
    max_area_slice: int | None
    max_area_mm2: float
    n_components: int
    hemisphere: str                     # "Left", "Right", "Both / midline", "—"
    centroid_voxel: tuple[float, float, float] | None
    extent_mm: tuple[float, float, float] | None   # bounding-box size (x, y, z)
    mean_uncertainty: float | None
    area_per_slice_mm2: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("area_per_slice_mm2")
        return d


def compute_profile(mask: np.ndarray, affine: np.ndarray, spacing, brain: np.ndarray | None = None,
                    uncertainty: np.ndarray | None = None) -> TumorProfile:
    """mask/brain/uncertainty are (X, Y, Z) in RAS orientation."""
    m = mask.astype(bool)
    sx, sy, sz = (float(s) for s in spacing)
    area = m.sum(axis=(0, 1)).astype(float) * sx * sy
    Z = m.shape[2]
    if not m.any():
        return TumorProfile(False, 0.0, 0, Z, None, None, 0.0, 0, "—", None, None, None,
                            area.tolist())

    zs = np.flatnonzero(area > 0)
    coords = np.argwhere(m)
    centroid = coords.mean(axis=0)
    lo, hi = coords.min(axis=0), coords.max(axis=0)
    extent = tuple(float((h - lo_ + 1) * s) for lo_, h, s in zip(lo, hi, (sx, sy, sz), strict=True))

    # Hemisphere: compare tumor voxels' world x against the brain's mid-sagittal x (RAS: +x = Right)
    def world_x(ijk):
        return (affine @ np.c_[ijk, np.ones(len(ijk))].T)[0]

    ref = np.argwhere(brain) if brain is not None and brain.any() else np.argwhere(np.ones_like(m))
    mid_x = float(np.median(world_x(ref[:: max(1, len(ref) // 20000)])))
    tx = world_x(coords[:: max(1, len(coords) // 20000)])
    right_frac = float((tx > mid_x).mean())
    hemisphere = "Right" if right_frac > 0.8 else "Left" if right_frac < 0.2 else "Both / midline"

    _, n_comp = cc_label(m)
    mu = float(uncertainty[m].mean()) if uncertainty is not None else None
    return TumorProfile(
        detected=True,
        volume_ml=float(m.sum() * sx * sy * sz / 1000.0),
        n_tumor_slices=int(len(zs)),
        n_slices=Z,
        slice_range=(int(zs.min()), int(zs.max())),
        max_area_slice=int(area.argmax()),
        max_area_mm2=float(area.max()),
        n_components=int(n_comp),
        hemisphere=hemisphere,
        centroid_voxel=tuple(float(c) for c in centroid),
        extent_mm=extent,
        mean_uncertainty=mu,
        area_per_slice_mm2=area.tolist(),
    )
