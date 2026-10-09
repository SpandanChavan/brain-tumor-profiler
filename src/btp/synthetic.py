"""Synthetic brain-MRI phantoms.

Used for unit tests, CI, pipeline smoke-training and the app's demo case until real
BraTS data is available. These are NOT real anatomy and contain no patient data.

A phantom is an ellipsoidal "brain" with a spherical-ish tumor:
  * FLAIR: bright edema halo around the tumor (whole-tumor extent)
  * T1ce:  bright enhancing rim with a dark necrotic centre
Labels follow BraTS 2021 conventions: 0 bg, 1 necrosis, 2 edema, 4 enhancing.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import gaussian_filter


@dataclass
class Phantom:
    t1ce: np.ndarray   # (X, Y, Z) float32
    flair: np.ndarray  # (X, Y, Z) float32
    seg: np.ndarray    # (X, Y, Z) uint8, BraTS labels
    affine: np.ndarray  # 4x4, RAS, 1 mm isotropic


def _ellipsoid(shape, center, radii) -> np.ndarray:
    grids = np.ogrid[tuple(slice(0, s) for s in shape)]
    dist = sum(((g - c) / r) ** 2 for g, c, r in zip(grids, center, radii, strict=True))
    return dist <= 1.0


def make_phantom(shape: tuple[int, int, int] = (96, 96, 64), *, tumor: bool = True,
                 seed: int | None = None) -> Phantom:
    rng = np.random.default_rng(seed)
    X, Y, Z = shape
    center = np.array(shape) / 2 + rng.uniform(-2, 2, 3)
    brain = _ellipsoid(shape, center, (X * 0.40, Y * 0.45, Z * 0.42))

    # Base tissue texture: white/grey-matter-like smooth noise inside the brain
    texture = gaussian_filter(rng.normal(0, 1, shape), sigma=3)
    base = np.where(brain, 0.55 + 0.08 * texture, 0.0)

    seg = np.zeros(shape, dtype=np.uint8)
    flair = base.copy()
    t1ce = base.copy()

    if tumor:
        r = rng.uniform(0.07, 0.14) * min(X, Y)
        # place tumor inside the brain, away from the boundary
        offset = rng.uniform(-0.18, 0.18, 3) * np.array(shape)
        tc = center + offset
        core = _ellipsoid(shape, tc, (r, r * rng.uniform(0.8, 1.2), r * rng.uniform(0.7, 1.0)))
        edema = _ellipsoid(shape, tc, (r * 1.8, r * 1.9, r * 1.6)) & brain
        necrosis = _ellipsoid(shape, tc, (r * 0.5, r * 0.5, r * 0.45))
        enhancing = core & ~necrosis

        seg[edema] = 2
        seg[enhancing] = 4
        seg[necrosis] = 1

        flair = np.where(edema, flair + 0.45, flair)
        t1ce = np.where(enhancing, t1ce + 0.55, t1ce)
        t1ce = np.where(necrosis, t1ce - 0.25, t1ce)

    noise = 0.03
    flair = np.where(brain, flair + rng.normal(0, noise, shape), 0.0)
    t1ce = np.where(brain, t1ce + rng.normal(0, noise, shape), 0.0)
    # arbitrary scanner scale: MRI has no absolute units
    flair = (flair * rng.uniform(300, 900)).clip(min=0).astype(np.float32)
    t1ce = (t1ce * rng.uniform(300, 900)).clip(min=0).astype(np.float32)
    seg[~brain] = 0

    return Phantom(t1ce=t1ce, flair=flair, seg=seg, affine=np.eye(4))


def save_phantom_nifti(ph: Phantom, out_dir, case_id: str = "SYNTH_0001") -> dict[str, str]:
    """Write a phantom in BraTS 2021 file layout. Returns modality -> path."""
    from pathlib import Path

    import nibabel as nib

    d = Path(out_dir) / case_id
    d.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, arr in (("t1ce", ph.t1ce), ("flair", ph.flair), ("seg", ph.seg)):
        p = d / f"{case_id}_{name}.nii.gz"
        nib.save(nib.Nifti1Image(arr, ph.affine), str(p))
        paths[name] = str(p)
    return paths
