import numpy as np
import pandas as pd
import pytest

from btp.data.brats import index_brats
from btp.data.dataset import SliceDataset, train_transforms
from btp.data.splits import assert_no_leakage, load_splits, patient_split, save_splits
from btp.preprocessing.volume import load_case, to_slice_stack
from btp.synthetic import make_phantom, save_phantom_nifti


def _manifest(n=40):
    rng = np.random.default_rng(0)
    return pd.DataFrame({"patient_id": [f"P{i:03d}" for i in range(n)],
                         "tumor_voxels": rng.integers(100, 100000, n)})


def test_split_no_leakage_and_complete(tmp_path):
    m = _manifest()
    s = patient_split(m, seed=1)
    all_ids = s["train"] + s["val"] + s["test"]
    assert sorted(all_ids) == sorted(m.patient_id)
    assert len(set(all_ids)) == len(all_ids)
    assert 25 <= len(s["train"]) <= 31
    save_splits(s, tmp_path / "s.json")
    assert load_splits(tmp_path / "s.json") == s


def test_split_is_deterministic():
    assert patient_split(_manifest(), seed=3) == patient_split(_manifest(), seed=3)


def test_leakage_detected():
    with pytest.raises(AssertionError, match="leakage"):
        assert_no_leakage({"train": ["A", "B"], "test": ["B"]})


def test_index_brats_both_naming_schemes(tmp_path):
    ph = make_phantom(shape=(16, 16, 8), seed=0)
    save_phantom_nifti(ph, tmp_path, "BraTS2021_00001")
    d = tmp_path / "BraTS-GLI-00002-000"
    d.mkdir()
    import shutil
    for src, suf in (("t1ce", "t1c"), ("flair", "t2f"), ("seg", "seg")):
        shutil.copy(tmp_path / "BraTS2021_00001" / f"BraTS2021_00001_{src}.nii.gz",
                    d / f"BraTS-GLI-00002-000-{suf}.nii.gz")
    df = index_brats(tmp_path)
    assert list(df.patient_id) == ["BraTS-GLI-00002-000", "BraTS2021_00001"]


def test_slice_dataset_balancing(tmp_path):
    for i in range(2):
        ph = make_phantom(shape=(64, 64, 32), seed=i)
        p = save_phantom_nifti(ph, tmp_path / "raw", f"S{i}")
        c = load_case(p["t1ce"], p["flair"], p["seg"])
        np.save(tmp_path / f"S{i}_img.npy", to_slice_stack(c.image).astype(np.float16))
        np.save(tmp_path / f"S{i}_lbl.npy", np.transpose(c.label, (2, 0, 1)))
    ds = SliceDataset(tmp_path, ["S0", "S1"], transforms=train_transforms(), tumor_to_empty_ratio=1.0)
    n_t = len(ds.tumor_idx)
    assert n_t > 0 and len(ds) <= 2 * n_t
    s = ds[0]
    assert s["image"].shape == (2, 64, 64) and s["label"].shape == (1, 64, 64)
    assert set(np.unique(s["label"].numpy())) <= {0.0, 1.0}


@pytest.mark.parametrize("n", [3, 5, 8, 12, 24, 120])
def test_split_never_starves_val_or_test(n):
    """Regression: per-bin rounding gave 12 patients -> 0 validation (broke CI)."""
    s = patient_split(_manifest(n), seed=0)
    assert len(s["val"]) >= 1 and len(s["test"]) >= 1 and len(s["train"]) >= 1
    assert len(s["train"]) + len(s["val"]) + len(s["test"]) == n
    if n >= 40:  # sizes follow the requested 70/15/15 closely
        assert abs(len(s["train"]) / n - 0.7) < 0.05


def test_split_val_and_test_span_tumor_sizes():
    m = _manifest(40)
    s = patient_split(m, seed=1)
    q = m.set_index("patient_id").tumor_voxels
    med = q.median()
    for k in ("val", "test"):
        sizes = q[s[k]]
        assert (sizes < med).any() and (sizes >= med).any()
