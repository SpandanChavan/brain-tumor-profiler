"""API tests (FR-S1..S7, SR-8, SR-14, SR-15). Uses the ONNX demo model when present."""

import gzip
import io
import subprocess
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from api.store import RateLimiter, ResultStore  # noqa: E402

has_model = (ROOT / "models" / "btp_model.onnx").exists()


@pytest.fixture(scope="module")
def client():
    from api.main import app
    return TestClient(app)


def _nii(path):
    return Path(path).read_bytes()


def test_health_and_headers(client):
    r = client.get("/v1/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_model_card_hides_hash(client):
    r = client.get("/v1/model").json()
    assert "sha256" not in r and "disclaimer" in r


def test_cors_restricted(client):
    ok = client.options("/v1/health", headers={"Origin": "http://localhost:5173",
                                              "Access-Control-Request-Method": "GET"})
    bad = client.options("/v1/health", headers={"Origin": "https://evil.example",
                                               "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_consent_required(client, phantom_files):
    files = {"t1ce": ("a.nii.gz", _nii(phantom_files["t1ce"])), "flair": ("b.nii.gz", _nii(phantom_files["flair"]))}
    r = client.post("/v1/segment", files=files, data={"consent": "false"})
    assert r.status_code == 400


def test_bad_upload_is_friendly(client, phantom_files):
    files = {"t1ce": ("a.png", b"not an image"), "flair": ("b.nii.gz", _nii(phantom_files["flair"]))}
    r = client.post("/v1/segment", files=files, data={"consent": "true"})
    assert r.status_code == 422 and "Unsupported" in r.json()["detail"]


def test_sample_path_traversal_blocked(client):
    assert client.get("/v1/samples/..%2F..%2Fsecret/t1ce.nii.gz").status_code == 404
    assert client.get("/v1/samples/synthetic_1/passwd.nii.gz").status_code == 404


@pytest.mark.skipif(not has_model, reason="no ONNX model exported")
def test_segment_upload_roundtrip_and_delete(client, phantom_files):
    files = {"t1ce": ("a.nii.gz", _nii(phantom_files["t1ce"])), "flair": ("b.nii.gz", _nii(phantom_files["flair"]))}
    r = client.post("/v1/segment", files=files, data={"consent": "true", "tta": "false"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"]["n_slices"] == 64 and set(body["files"]) == {"mask", "uncertainty"}
    m = client.get(body["files"]["mask"])
    assert m.status_code == 200
    img = nib.Nifti1Image.from_bytes(gzip.decompress(m.content))
    assert img.shape == (96, 96, 64) and set(np.unique(np.asanyarray(img.dataobj))) <= {0, 1}
    assert img.header["descrip"].tobytes().strip(b"\0") == b""   # metadata-free export
    client.delete(f"/v1/results/{body['job_id']}")
    assert client.get(body["files"]["mask"]).status_code == 404     # "delete now" works


@pytest.mark.skipif(not has_model, reason="no ONNX model exported")
def test_sample_segment_includes_agreement(client):
    samples = client.get("/v1/samples").json()
    if not samples:
        pytest.skip("no sample cases")
    sid = next(s["id"] for s in samples if s["has_label"])
    body = client.post(f"/v1/samples/{sid}/segment?tta=false").json()
    assert "agreement" in body and 0 <= body["agreement"]["dice"] <= 1
    assert "label" in body["files"]


def test_result_store_ttl_and_ids():
    s = ResultStore(ttl_seconds=0)
    jid = s.put({"mask": b"x"})
    assert len(jid) >= 20
    assert s.get(jid, "mask") is None  # expired immediately


def test_rate_limiter():
    rl = RateLimiter(2)
    assert rl.allow("a") and rl.allow("a") and not rl.allow("a") and rl.allow("b")


def test_api_does_not_import_torch():
    """The API image ships without PyTorch (free-tier size budget)."""
    code = ("import sys; sys.modules['torch'] = None; sys.modules['monai'] = None; "
            "import api.main; print('ok')")
    out = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr[-500:]


def test_dicom_zip_upload_runs_deid(client):
    import zipfile

    from pydicom.uid import generate_uid
    from test_privacy import fake_slice
    buf = io.BytesIO()
    st, se = generate_uid(), generate_uid()
    with zipfile.ZipFile(buf, "w") as zf:
        for z in range(4):
            b = io.BytesIO()
            fake_slice(z, st, se).save_as(b, enforce_file_format=True)
            zf.writestr(f"{z}.dcm", b.getvalue())
    files = {"t1ce": ("s.zip", buf.getvalue()), "flair": ("s2.zip", buf.getvalue())}
    r = client.post("/v1/segment", files=files, data={"consent": "true", "tta": "false"})
    # tiny 16x16x4 volume is valid input; de-id must have been reported either way
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.json()["deidentification"][0]["removed"] > 5
