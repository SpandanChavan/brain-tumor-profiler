import numpy as np
import torch

from btp.inference.postprocess import postprocess_mask
from btp.inference.predictor import Predictor
from btp.models.factory import _adapt_first_conv, build_model, load_checkpoint, save_checkpoint
from btp.preprocessing.volume import load_case
from btp.profiling.profile import compute_profile
from btp.training.losses import DiceBCELoss


def test_model_forward_any_size():
    m = build_model({"name": "flexible_unet", "backbone": "efficientnet-b0", "pretrained": False})
    with torch.no_grad():
        y = m(torch.zeros(2, 2, 64, 96))
    assert y.shape == (2, 1, 64, 96)


def test_first_conv_adaptation_preserves_response():
    m = build_model({"in_channels": 3, "pretrained": False})
    stem = m.encoder._conv_stem
    w3 = stem.weight.data.clone()
    _adapt_first_conv(m, 2)
    w2 = m.encoder._conv_stem.weight.data
    assert w2.shape[1] == 2
    # a constant image gives the same stem response before and after adaptation
    assert torch.allclose(w3.sum(1), w2.sum(1), atol=1e-5)


def test_loss_decreases_on_perfect_logits():
    y = torch.zeros(1, 1, 8, 8)
    y[..., 2:6, 2:6] = 1
    loss = DiceBCELoss()
    assert loss((y * 20 - 10), y) < loss(torch.zeros_like(y), y)


def test_checkpoint_roundtrip_and_integrity(tmp_path):
    cfg = {"name": "unet", "in_channels": 2, "out_channels": 1}
    m = build_model(cfg)
    sha = save_checkpoint(m, tmp_path / "w.pt", model_cfg=cfg, meta={"val_dice_mean": 0.5})
    m2, meta = load_checkpoint(tmp_path / "w.pt", expected_sha256=sha)
    assert meta["val_dice_mean"] == 0.5
    import pytest
    with pytest.raises(RuntimeError, match="integrity"):
        load_checkpoint(tmp_path / "w.pt", expected_sha256="0" * 64)


def test_predictor_end_to_end(phantom_files):
    case = load_case(phantom_files["t1ce"], phantom_files["flair"], phantom_files["seg"])
    model = build_model({"name": "unet"})
    p = Predictor(model, tta=True, batch_size=8, device="cpu")
    calls = []
    out = p.predict_case(case, progress=lambda f, msg: calls.append(f))
    assert out.prob.shape == case.label.shape == out.mask.shape == out.uncertainty.shape
    assert 0 <= out.prob.min() and out.prob.max() <= 1
    assert 0 <= out.uncertainty.min() and out.uncertainty.max() <= 0.5 + 1e-6
    assert calls and calls[-1] == 1.0
    # deterministic (NFR-4)
    out2 = p.predict_case(case)
    np.testing.assert_array_equal(out.mask, out2.mask)


def test_postprocess_removes_small_components():
    m = np.zeros((20, 20, 20), np.uint8)
    m[2:8, 2:8, 2:8] = 1      # 216 voxels: kept
    m[15, 15, 15] = 1         # 1 voxel: removed
    out = postprocess_mask(m, min_component_voxels=10)
    assert out.sum() == 216


def test_profile_numbers():
    mask = np.zeros((40, 40, 20), np.uint8)
    mask[25:35, 10:20, 5:10] = 1  # x > midline -> patient Right in RAS
    brain = np.ones_like(mask, bool)
    prof = compute_profile(mask, np.eye(4), (1.0, 1.0, 2.0), brain)
    assert prof.detected and abs(prof.volume_ml - 1.0) < 1e-9
    assert prof.slice_range == (5, 9) and prof.n_tumor_slices == 5
    assert prof.hemisphere == "Right"
    assert prof.extent_mm == (10.0, 10.0, 10.0)
    empty = compute_profile(np.zeros_like(mask), np.eye(4), (1, 1, 1))
    assert not empty.detected and empty.volume_ml == 0
