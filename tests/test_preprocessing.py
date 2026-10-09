import nibabel as nib
import numpy as np
import pytest

from btp.preprocessing.volume import from_slice_stack, load_case, normalize_zscore, to_slice_stack


def test_zscore_brain_only():
    v = np.zeros((10, 10, 10), np.float32)
    v[2:8, 2:8, 2:8] = np.random.default_rng(0).uniform(100, 500, (6, 6, 6))
    z = normalize_zscore(v)
    brain = v > 0
    assert abs(z[brain].mean()) < 1e-5 and abs(z[brain].std() - 1) < 1e-4
    assert np.all(z[~brain] == 0)


def test_load_case_shapes_and_binary_label(phantom_files, phantom):
    c = load_case(phantom_files["t1ce"], phantom_files["flair"], phantom_files["seg"])
    assert c.image.shape == (2, *phantom.seg.shape)
    assert set(np.unique(c.label)) <= {0, 1}
    assert c.label.sum() == (phantom.seg > 0).sum()
    assert c.spacing == (1.0, 1.0, 1.0)


def test_reorientation_to_ras(tmp_path, phantom):
    """An LPS-stored copy must load identically to the RAS original (no flipped overlays)."""
    flip = np.diag([-1, -1, 1, 1]).astype(float)
    flip[0, 3], flip[1, 3] = phantom.seg.shape[0] - 1, phantom.seg.shape[1] - 1
    paths = {}
    for name, arr in (("t1ce", phantom.t1ce), ("flair", phantom.flair), ("seg", phantom.seg)):
        p = tmp_path / f"lps_{name}.nii.gz"
        nib.save(nib.Nifti1Image(arr[::-1, ::-1, :].copy(), phantom.affine @ flip), str(p))
        paths[name] = p
    c = load_case(paths["t1ce"], paths["flair"], paths["seg"])
    np.testing.assert_array_equal(c.label, (phantom.seg > 0).astype(np.uint8))


def test_shape_mismatch_raises(tmp_path, phantom):
    a = tmp_path / "a.nii.gz"
    b = tmp_path / "b.nii.gz"
    nib.save(nib.Nifti1Image(phantom.t1ce, np.eye(4)), str(a))
    nib.save(nib.Nifti1Image(phantom.flair[:-2], np.eye(4)), str(b))
    with pytest.raises(ValueError, match="co-registered"):
        load_case(a, b)


def test_non_skull_stripped_warning(tmp_path):
    vol = np.random.default_rng(0).uniform(10, 100, (32, 32, 16)).astype(np.float32)
    p = tmp_path / "head.nii.gz"
    nib.save(nib.Nifti1Image(vol, np.eye(4)), str(p))
    c = load_case(p, p)
    assert any("skull-stripped" in w for w in c.warnings)


def test_slice_stack_roundtrip():
    x = np.random.default_rng(0).normal(size=(2, 8, 9, 5)).astype(np.float32)
    s = to_slice_stack(x)
    assert s.shape == (5, 2, 8, 9)
    np.testing.assert_array_equal(from_slice_stack(s[:, 0]), x[0])
