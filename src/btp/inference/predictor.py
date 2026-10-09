"""Volume inference from a 2D slice model (FR-M1, FR-S4, FR-A8, NFR-1, NFR-4).

The model sees axial slices; predictions are re-stacked into a 3D volume so that
metrics, post-processing and the tumor profile all work in 3D.
Uncertainty = standard deviation of sigmoid probabilities across flip-TTA views.

Backends share every step except the forward pass, so PyTorch (training/eval) and
ONNX Runtime (API) produce the same masks. The browser port (web/src/inference)
mirrors this file: keep them in sync.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from btp.preprocessing.volume import LoadedCase, from_slice_stack, to_slice_stack

from .postprocess import postprocess_mask

# flip-TTA views over the two in-plane axes of a (N, C, X, Y) batch
_TTA_AXES: list[tuple[int, ...]] = [(), (2,), (3,), (2, 3)]

LogitsFn = Callable[[np.ndarray], np.ndarray]  # (N, C, H, W) float32 -> (N, 1, H, W) logits


@dataclass
class Prediction:
    prob: np.ndarray         # (X, Y, Z) float32 tumor probability
    mask: np.ndarray         # (X, Y, Z) uint8 post-processed binary mask
    uncertainty: np.ndarray  # (X, Y, Z) float32, 0 = certain, 0.5 = max
    seconds: float
    tumor_detected: bool


def pad32(x: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Centre-pad the last two axes to multiples of 32 (encoder downsamples 5x)."""
    h, w = x.shape[-2:]
    ph, pw = (-h) % 32, (-w) % 32
    pads = (ph // 2, ph - ph // 2, pw // 2, pw - pw // 2)
    widths = [(0, 0)] * (x.ndim - 2) + [(pads[0], pads[1]), (pads[2], pads[3])]
    return np.pad(x, widths), pads


def unpad(x: np.ndarray, pads) -> np.ndarray:
    top, bottom, left, right = pads
    h, w = x.shape[-2:]
    return x[..., top:h - bottom, left:w - right]


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def torch_logits_fn(model, device: str | None = None) -> LogitsFn:
    import torch

    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    model = model.to(dev).eval()

    def fn(x: np.ndarray) -> np.ndarray:
        with torch.inference_mode():
            return model(torch.from_numpy(x).to(dev)).float().cpu().numpy()

    return fn


def onnx_logits_fn(path, threads: int | None = None) -> LogitsFn:
    import onnxruntime as ort

    so = ort.SessionOptions()
    if threads:
        so.intra_op_num_threads = threads
    sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name

    def fn(x: np.ndarray) -> np.ndarray:
        return sess.run(None, {name: x.astype(np.float32, copy=False)})[0]

    return fn


class Predictor:
    def __init__(self, model=None, *, logits_fn: LogitsFn | None = None, threshold: float = 0.5,
                 tta: bool = True, batch_size: int = 16, min_component_voxels: int = 50,
                 device: str | None = None):
        if logits_fn is None:
            if model is None:
                raise ValueError("Pass a torch model or a logits_fn")
            logits_fn = torch_logits_fn(model, device)
        self.logits_fn = logits_fn
        self.threshold = threshold
        self.tta = tta
        self.batch_size = batch_size
        self.min_component_voxels = min_component_voxels

    def predict_stack(self, stack: np.ndarray,
                      progress: Callable[[float, str], None] | None = None
                      ) -> tuple[np.ndarray, np.ndarray]:
        """stack (Z, C, X, Y) -> (prob, uncertainty), each (Z, X, Y)."""
        Z = stack.shape[0]
        prob = np.zeros((Z, *stack.shape[2:]), dtype=np.float32)
        unc = np.zeros_like(prob)
        has_brain = np.abs(stack).reshape(Z, -1).max(axis=1) > 0
        idx = np.flatnonzero(has_brain)
        views = _TTA_AXES if self.tta else [()]
        for start in range(0, len(idx), self.batch_size):
            b = idx[start:start + self.batch_size]
            x, pads = pad32(np.asarray(stack[b], dtype=np.float32))
            outs = []
            for axes in views:
                xi = np.ascontiguousarray(np.flip(x, axes)) if axes else x
                p = _sigmoid(self.logits_fn(xi)[:, 0])               # (N, H, W)
                outs.append(np.flip(p, tuple(a - 1 for a in axes)) if axes else p)
            P = unpad(np.stack(outs, 0), pads)                         # (V, N, X, Y)
            prob[b] = P.mean(0)
            # without TTA fall back to Bernoulli std sqrt(p(1-p)); both lie in [0, 0.5]
            unc[b] = P.std(0) if len(views) > 1 else np.sqrt(P[0] * (1 - P[0]))
            if progress:
                done = min(start + self.batch_size, len(idx))
                progress(done / max(len(idx), 1), f"Segmenting slice {done}/{len(idx)}")
        return prob, unc

    def predict_case(self, case: LoadedCase,
                     progress: Callable[[float, str], None] | None = None) -> Prediction:
        t0 = time.perf_counter()
        prob_s, unc_s = self.predict_stack(to_slice_stack(case.image), progress)
        prob, unc = from_slice_stack(prob_s), from_slice_stack(unc_s)
        brain = np.any(case.image != 0, axis=0)
        mask = postprocess_mask(prob >= self.threshold, brain, self.min_component_voxels)
        return Prediction(prob=prob, mask=mask, uncertainty=unc,
                          seconds=time.perf_counter() - t0, tumor_detected=bool(mask.any()))
