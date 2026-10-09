"""Rendering helpers shared by the app, reports and evaluation figures.

Design choices from knowledge.md section 7.4:
  * one accent colour on greyscale (pre-attentive pop-out)
  * colour-blind-safe palette: cyan / magenta / amber, never red-vs-green
  * contour mode so the clinician can see the tissue under the outline (anchoring guard)
"""

from __future__ import annotations

import numpy as np
from skimage.segmentation import find_boundaries

PALETTES = {
    "Cyan (default)": (34, 211, 238),
    "Amber": (251, 191, 36),
    "Magenta": (232, 121, 249),
}
TP_FP_FN = {"tp": (34, 211, 238), "fp": (251, 191, 36), "fn": (232, 121, 249)}


def to_display(slice2d: np.ndarray, lo_hi: tuple[float, float] | None = None) -> np.ndarray:
    """Float slice -> uint8 greyscale using robust percentiles (or given window)."""
    s = slice2d.astype(np.float32)
    if lo_hi is None:
        nz = s[s != 0]
        lo, hi = (np.percentile(nz, [1, 99.5]) if nz.size else (0.0, 1.0))
    else:
        lo, hi = lo_hi
    out = np.clip((s - lo) / max(hi - lo, 1e-6), 0, 1)
    out[s == 0] = 0  # background (outside the brain) stays black after z-scoring
    return (out * 255).astype(np.uint8)


def window_for(volume: np.ndarray) -> tuple[float, float]:
    nz = volume[volume != 0]
    if not nz.size:
        return 0.0, 1.0
    lo, hi = np.percentile(nz[:: max(1, nz.size // 200000)], [1, 99.5])
    return float(lo), float(hi)


def orient_for_display(a: np.ndarray) -> np.ndarray:
    """RAS (x, y[, rgb]) slice -> screen image with anterior at the top and the patient's right
    on the viewer's left (radiological convention)."""
    a = np.swapaxes(a, 0, 1)  # rows = y (+anterior), cols = x (+patient right)
    # flip rows -> anterior on top; flip cols -> patient right on screen left
    return np.ascontiguousarray(np.flip(a, axis=(0, 1)))


def overlay(gray: np.ndarray, mask: np.ndarray | None, *, mode: str = "contour",
            color=(34, 211, 238), alpha: float = 0.45) -> np.ndarray:
    rgb = np.repeat(gray[..., None], 3, axis=-1).astype(np.float32)
    if mask is None or not mask.any():
        return rgb.astype(np.uint8)
    m = mask.astype(bool)
    c = np.array(color, dtype=np.float32)
    if mode in ("filled", "both"):
        rgb[m] = (1 - alpha) * rgb[m] + alpha * c
    if mode in ("contour", "both"):
        edge = find_boundaries(m, mode="outer")
        rgb[edge] = c
    return rgb.clip(0, 255).astype(np.uint8)


def heatmap(gray: np.ndarray, values: np.ndarray, vmax: float = 0.5, alpha: float = 0.85,
            floor: float = 0.1) -> np.ndarray:
    """Uncertainty heat-map on a dimmed image (perceptually uniform 'inferno', colour-blind safe).

    Values below ``floor`` (fraction of vmax) are fully transparent so noise doesn't wash
    the image; above it, opacity grows with uncertainty so only doubtful regions pop out.
    """
    from matplotlib import colormaps

    v = np.clip(values / vmax, 0, 1)
    cm = colormaps["inferno"](0.35 + 0.65 * v)[..., :3] * 255
    rgb = 0.6 * np.repeat(gray[..., None], 3, axis=-1).astype(np.float32)
    w = (alpha * np.sqrt(np.clip((v - floor) / (1 - floor), 0, 1)))[..., None]
    return ((1 - w) * rgb + w * cm).clip(0, 255).astype(np.uint8)


def comparison(gray: np.ndarray, pred: np.ndarray, gt: np.ndarray) -> np.ndarray:
    """TP cyan, FP amber, FN magenta (FR-A15)."""
    rgb = np.repeat(gray[..., None], 3, axis=-1).astype(np.float32)
    p, g = pred.astype(bool), gt.astype(bool)
    for key, m in (("tp", p & g), ("fp", p & ~g), ("fn", ~p & g)):
        rgb[m] = 0.45 * rgb[m] + 0.55 * np.array(TP_FP_FN[key], dtype=np.float32)
    return rgb.clip(0, 255).astype(np.uint8)
