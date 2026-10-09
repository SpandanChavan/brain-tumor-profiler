"""ONNX export parity (NFR-6b): ONNX Runtime must reproduce PyTorch masks."""

import numpy as np
import pytest

pytest.importorskip("onnxruntime")
torch = pytest.importorskip("torch")

from btp.evaluation.metrics import dice  # noqa: E402
from btp.inference.predictor import Predictor, onnx_logits_fn  # noqa: E402
from btp.models.factory import build_model  # noqa: E402
from btp.preprocessing.volume import load_case  # noqa: E402


@pytest.mark.parametrize("name", ["unet", "flexible_unet"])
def test_onnx_matches_pytorch(tmp_path, phantom_files, name):
    torch.manual_seed(0)
    model = build_model({"name": name, "pretrained": False}).eval()
    path = tmp_path / "m.onnx"
    torch.onnx.export(model, torch.zeros(1, 2, 96, 96), str(path), opset_version=17,
                      input_names=["image"], output_names=["logits"],
                      dynamic_axes={"image": {0: "b", 2: "h", 3: "w"}, "logits": {0: "b", 2: "h", 3: "w"}},
                      dynamo=False)
    case = load_case(phantom_files["t1ce"], phantom_files["flair"])
    a = Predictor(model, tta=True, device="cpu", min_component_voxels=0).predict_case(case)
    b = Predictor(logits_fn=onnx_logits_fn(path), tta=True, min_component_voxels=0).predict_case(case)
    assert np.abs(a.prob - b.prob).max() < 1e-3
    assert dice(a.mask, b.mask) >= 0.999 or (not a.mask.any() and not b.mask.any())
