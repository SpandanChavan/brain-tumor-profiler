"""Segmentation pipeline for the API: ONNX Runtime + the shared btp pre/post-processing.

Deliberately imports no PyTorch, so the API Docker image stays small (free HF Space).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import threading
import time
from functools import cached_property
from pathlib import Path

import nibabel as nib
import numpy as np

from btp.evaluation.metrics import case_metrics
from btp.inference.predictor import Predictor, onnx_logits_fn
from btp.preprocessing.volume import load_case
from btp.privacy.deid import sanitize_nifti
from btp.profiling.profile import compute_profile


def nifti_gz_bytes(arr: np.ndarray, affine: np.ndarray) -> bytes:
    img = sanitize_nifti(nib.Nifti1Image(arr, affine))
    buf = io.BytesIO()
    img.to_file_map(img.make_file_map({"image": buf, "header": buf}))
    return gzip.compress(buf.getvalue(), compresslevel=6)


class Segmenter:
    def __init__(self, model_path: Path, card_path: Path, threads: int):
        self.model_path, self.card_path, self.threads = model_path, card_path, threads
        self._predictor: Predictor | None = None
        self._lock = threading.Lock()  # concurrent first requests must not build two ONNX sessions

    @cached_property
    def card(self) -> dict:
        if self.card_path.exists():
            return json.loads(self.card_path.read_text(encoding="utf-8"))
        return {"version": "unknown", "synthetic": True, "test_metrics": None}

    @property
    def predictor(self) -> Predictor:
        if self._predictor is None:
            with self._lock:
                if self._predictor is None:
                    self._predictor = self._build_predictor()
        return self._predictor

    def _build_predictor(self) -> Predictor:
        if not self.model_path.exists():
            raise RuntimeError(f"Model file not found: {self.model_path.name}")
        expected = (self.card.get("onnx") or {}).get("sha256")
        if expected:  # SR-7 weights integrity
            if hashlib.sha256(self.model_path.read_bytes()).hexdigest() != expected:
                raise RuntimeError("Model integrity check failed (SHA-256 mismatch).")
        inf = self.card.get("inference", {})
        return Predictor(logits_fn=onnx_logits_fn(self.model_path, self.threads),
                         threshold=inf.get("threshold", 0.5), tta=True, batch_size=8,
                         min_component_voxels=inf.get("min_component_voxels", 50))

    @property
    def ready(self) -> bool:
        try:
            _ = self.predictor
            return True
        except Exception:
            return False

    def run(self, t1ce, flair, seg=None, *, tta: bool = True) -> tuple[dict, dict[str, bytes]]:
        timings = {}
        t0 = time.perf_counter()
        case = load_case(t1ce, flair, seg)
        timings["preprocess_s"] = time.perf_counter() - t0

        base = self.predictor
        # per-request copy: never mutate the shared predictor from concurrent jobs
        pred = Predictor(logits_fn=base.logits_fn, threshold=base.threshold, tta=tta,
                         batch_size=base.batch_size, min_component_voxels=base.min_component_voxels)
        t1 = time.perf_counter()
        p = pred.predict_case(case)
        timings["inference_s"] = time.perf_counter() - t1

        brain = np.any(case.image != 0, axis=0)
        prof = compute_profile(p.mask, case.affine, case.spacing, brain, p.uncertainty)
        # uncertainty in [0, 0.5] -> uint8 [0, 255]: 4x smaller download, plenty of precision for display
        unc_u8 = np.clip(p.uncertainty * 510.0, 0, 255).astype(np.uint8)
        files = {"mask": nifti_gz_bytes(p.mask.astype(np.uint8), case.affine),
                 "uncertainty": nifti_gz_bytes(unc_u8, case.affine)}
        body = {
            "profile": prof.to_dict(),
            "area_per_slice_mm2": [round(a, 2) for a in prof.area_per_slice_mm2],
            "warnings": case.warnings,
            "timings": {k: round(v, 3) for k, v in timings.items()},
            "model_version": self.card.get("version"),
            "synthetic_model": bool(self.card.get("synthetic")),
            "tta": tta,
        }
        if case.label is not None:
            m = case_metrics(p.mask, case.label, case.spacing)
            body["agreement"] = {k: (None if isinstance(v, float) and np.isnan(v) else v)
                                 for k, v in m.items()}
            files["label"] = nifti_gz_bytes(case.label.astype(np.uint8), case.affine)
        timings["total_s"] = time.perf_counter() - t0
        body["timings"]["total_s"] = round(timings["total_s"], 3)
        return body, files
