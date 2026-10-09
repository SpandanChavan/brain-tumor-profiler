"""Volume-level preprocessing shared by training and inference (FR-D3).

Pipeline (same for BraTS and user uploads, so train/inference never drift apart):
  1. load NIfTI and reorient to closest canonical RAS
  2. per-volume z-score using brain (non-zero) voxels only
  3. stack modalities as channels and move the axial axis first -> (Z, C, X, Y)
"""

from __future__ import annotations

from dataclasses import dataclass, field

import nibabel as nib
import numpy as np


@dataclass
class LoadedCase:
    image: np.ndarray            # (C, X, Y, Z) float32, normalized, RAS
    affine: np.ndarray           # 4x4 RAS affine
    spacing: tuple[float, float, float]
    label: np.ndarray | None = None   # (X, Y, Z) uint8 binary whole-tumor, if available
    raw_label: np.ndarray | None = None  # original BraTS labels
    warnings: list[str] = field(default_factory=list)


def load_nifti_ras(path_or_img) -> nib.Nifti1Image:
    img = nib.load(str(path_or_img)) if not isinstance(path_or_img, nib.spatialimages.SpatialImage) else path_or_img
    return nib.as_closest_canonical(img)


def brain_mask(volume: np.ndarray) -> np.ndarray:
    """Brain = non-zero voxels (BraTS is skull-stripped, background is exactly 0)."""
    return volume > 0


def normalize_zscore(volume: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    """Z-score using voxels inside ``mask``; background stays 0."""
    volume = volume.astype(np.float32)
    if mask is None:
        mask = brain_mask(volume)
    out = np.zeros_like(volume, dtype=np.float32)
    if mask.sum() == 0:
        return out
    vals = volume[mask]
    mean, std = float(vals.mean()), float(vals.std())
    out[mask] = (vals - mean) / (std if std > 1e-8 else 1.0)
    return out


def _check_input(img: nib.Nifti1Image, name: str) -> list[str]:
    """Distribution-shift sanity checks (knowledge.md section 9). Returns human-readable warnings."""
    warns = []
    data = np.asanyarray(img.dataobj)
    if data.ndim != 3:
        raise ValueError(f"{name}: expected a 3D volume, got shape {data.shape}.")
    zooms = img.header.get_zooms()[:3]
    if any(abs(z - 1.0) > 0.25 for z in zooms):
        warns.append(
            f"{name}: voxel spacing {tuple(round(float(z), 2) for z in zooms)} mm differs from the 1 mm "
            "training data. Results may be less accurate."
        )
    bg_fraction = float((data == 0).mean())
    if bg_fraction < 0.2:
        warns.append(
            f"{name}: the scan does not look skull-stripped (little zero background). The model was "
            "trained on skull-stripped scans; also note that un-stripped head MRI can reveal the face."
        )
    return warns


def load_case(t1ce, flair, seg=None) -> LoadedCase:
    """Load a T1ce + FLAIR pair (paths or nibabel images) into a normalized RAS array."""
    imgs = {"T1ce": load_nifti_ras(t1ce), "FLAIR": load_nifti_ras(flair)}
    warnings: list[str] = []
    for name, im in imgs.items():
        warnings += _check_input(im, name)
    a, b = imgs["T1ce"], imgs["FLAIR"]
    if a.shape != b.shape:
        raise ValueError(
            f"T1ce shape {a.shape} and FLAIR shape {b.shape} differ. Both sequences must be "
            "co-registered to the same grid."
        )
    if not np.allclose(a.affine, b.affine, atol=1e-2):
        warnings.append("T1ce and FLAIR have different orientations/affines; assuming they are co-registered.")

    t1 = np.asanyarray(a.dataobj).astype(np.float32)
    fl = np.asanyarray(b.dataobj).astype(np.float32)
    mask = brain_mask(t1) | brain_mask(fl)
    image = np.stack([normalize_zscore(t1, mask), normalize_zscore(fl, mask)], axis=0)

    label = raw = None
    if seg is not None:
        s = load_nifti_ras(seg)
        raw = np.asanyarray(s.dataobj).astype(np.uint8)
        if raw.shape != a.shape:
            raise ValueError("Segmentation shape does not match image shape.")
        label = (raw > 0).astype(np.uint8)  # FR-D5 binary whole tumor

    spacing = tuple(float(z) for z in a.header.get_zooms()[:3])
    return LoadedCase(image=image, affine=a.affine, spacing=spacing, label=label,
                      raw_label=raw, warnings=warnings)


def to_slice_stack(image: np.ndarray) -> np.ndarray:
    """(C, X, Y, Z) -> (Z, C, X, Y): one 2D multi-channel sample per axial slice."""
    return np.ascontiguousarray(np.transpose(image, (3, 0, 1, 2)))


def from_slice_stack(stack: np.ndarray) -> np.ndarray:
    """(Z, X, Y) -> (X, Y, Z)."""
    return np.ascontiguousarray(np.transpose(stack, (1, 2, 0)))
