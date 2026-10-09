import io

import nibabel as nib
import numpy as np

from btp.privacy.deid import sanitize_nifti
from btp.profiling.profile import compute_profile
from btp.report import build_pdf
from btp.viz import comparison, heatmap, orient_for_display, overlay, to_display


def test_pdf_report_builds_without_metadata():
    mask = np.zeros((32, 32, 16), np.uint8)
    mask[10:20, 10:20, 4:8] = 1
    prof = compute_profile(mask, np.eye(4), (1, 1, 1), np.ones_like(mask, bool), np.zeros(mask.shape))
    img = np.zeros((32, 32, 3), np.uint8)
    pdf = build_pdf(prof, [("snap", img)], {"version": "test", "test_dice": "n/a"})
    assert pdf[:4] == b"%PDF" and len(pdf) > 1000
    assert b"/Author ()" in pdf or b"/Author" not in pdf  # no author identity embedded


def test_sanitized_mask_export_roundtrip():
    m = np.zeros((8, 8, 4), np.uint8)
    m[2:4, 2:4, 1] = 1
    img = nib.Nifti1Image(m, np.diag([1.0, 1.0, 2.0, 1.0]))
    img.header["descrip"] = b"Jane Doe MRN123"
    out = sanitize_nifti(img)
    buf = io.BytesIO()
    out.to_file_map(out.make_file_map({"image": buf, "header": buf}))
    back = nib.Nifti1Image.from_bytes(buf.getvalue())
    assert back.header["descrip"].tobytes().strip(b"\0") == b""
    np.testing.assert_array_equal(np.asanyarray(back.dataobj), m)
    np.testing.assert_allclose(back.affine, img.affine)


def test_display_helpers():
    s = np.zeros((10, 12), np.float32)
    s[2:8, 3:9] = np.linspace(-1, 2, 36).reshape(6, 6)
    g = to_display(s)
    assert g.dtype == np.uint8 and g[0, 0] == 0  # background stays black
    m = np.zeros_like(s, bool)
    m[4:6, 4:6] = True
    for rgb in (overlay(g, m, mode="both"), heatmap(g, np.full(s.shape, 0.3, np.float32)), comparison(g, m, m)):
        assert rgb.shape == (10, 12, 3) and rgb.dtype == np.uint8
    assert orient_for_display(g).shape == (12, 10)
    # zero uncertainty leaves the image uncoloured (just dimmed grey)
    h = heatmap(g, np.zeros(s.shape, np.float32))
    assert np.all(h[..., 0] == h[..., 1])
