import io
import json
import zipfile

import numpy as np
import pytest
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, MRImageStorage, generate_uid

from btp.io import dicom_zip_to_nifti, nifti_from_bytes, read_upload
from btp.privacy.audit import AuditLog
from btp.privacy.deid import REMOVE_KEYWORDS, deidentify_dataset, find_phi
from btp.privacy.session_store import SessionStore

FAKE_PHI = {
    "PatientName": "Doe^Jane", "PatientID": "MRN-123456", "PatientBirthDate": "19700101",
    "PatientAddress": "221B Baker Street", "InstitutionName": "General Hospital",
    "ReferringPhysicianName": "House^Greg", "AccessionNumber": "ACC999", "StudyDate": "20250102",
    "DeviceSerialNumber": "SN-42", "PatientTelephoneNumbers": "555-0100", "OtherPatientIDs": "X1",
}


def fake_slice(z: int, study_uid: str, series_uid: str) -> Dataset:
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.MediaStorageSOPClassUID = MRImageStorage
    ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()
    for k, v in FAKE_PHI.items():
        setattr(ds, k, v)
    ds.PatientAge = "093Y"
    ds.SOPClassUID = MRImageStorage
    ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID, ds.SeriesInstanceUID = study_uid, series_uid
    ds.Modality = "MR"
    ds.add_new(0x00091001, "LO", "vendor-secret Jane Doe")  # private tag
    ds.Rows, ds.Columns = 16, 16
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 16, 15
    ds.PixelRepresentation, ds.SamplesPerPixel = 0, 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.ImagePositionPatient = [0, 0, float(z)]
    ds.PixelSpacing = [1, 1]
    ds.PixelData = (np.full((16, 16), 100 + z, np.uint16)).tobytes()
    return ds


def test_all_identifiers_removed():
    ds = fake_slice(0, generate_uid(), generate_uid())
    assert set(FAKE_PHI) <= set(find_phi(ds))
    old_uid = ds.StudyInstanceUID
    rep = deidentify_dataset(ds)
    assert find_phi(ds) == []
    for k in FAKE_PHI:
        assert k not in ds
    assert ds.StudyInstanceUID != old_uid and ds.PatientAge == "090Y"
    assert ds.PatientIdentityRemoved == "YES" and rep["age_generalised"]
    assert "Jane" not in str(ds) and "MRN" not in str(ds)


def test_uid_mapping_consistent_across_series():
    study, series = generate_uid(), generate_uid()
    a, b = fake_slice(0, study, series), fake_slice(1, study, series)
    uid_map = {}
    deidentify_dataset(a, uid_map)
    deidentify_dataset(b, uid_map)
    assert a.StudyInstanceUID == b.StudyInstanceUID != study


def test_safe_harbor_categories_cover_core_tags():
    for k in ["PatientName", "PatientID", "PatientBirthDate", "InstitutionName", "AccessionNumber"]:
        assert k in REMOVE_KEYWORDS


def test_dicom_zip_pipeline_scrubs_and_builds_volume():
    study, series = generate_uid(), generate_uid()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for z in [3, 0, 2, 1]:  # shuffled order must be re-sorted by position
            b = io.BytesIO()
            fake_slice(z, study, series).save_as(b, enforce_file_format=True)
            zf.writestr(f"IM{z}.dcm", b.getvalue())
    img, rep = dicom_zip_to_nifti(buf.getvalue())
    assert img.shape == (16, 16, 4)
    data = np.asanyarray(img.dataobj)
    assert [int(data[0, 0, k]) for k in range(4)] == [100, 101, 102, 103]
    assert "PatientName" in rep["removed"] and rep["n_files"] == 4


def test_audit_log_has_no_phi(tmp_path):
    log = AuditLog(tmp_path / "a.jsonl", salt="s")
    log.log("sess-1", "upload_accepted", file_sha256="ab" * 32, filename="Jane_Doe_MRN123.nii",
            patient="Jane Doe")
    rec = json.loads((tmp_path / "a.jsonl").read_text().strip())
    assert "filename" not in rec and "patient" not in rec
    assert "sess-1" not in json.dumps(rec)
    with pytest.raises(ValueError):
        log.log("sess-1", "read_patient_chart")


def test_session_store_encrypts_and_wipes():
    s = SessionStore(encrypt=True)
    p = s.put("../../evil.nii", b"secret-bytes")
    assert p.parent == s.dir                      # path traversal neutralised
    assert b"secret-bytes" not in p.read_bytes()  # encrypted at rest
    assert s.get("evil.nii") == b"secret-bytes"
    d = s.dir
    s.wipe()
    assert not d.exists()


def test_upload_readers(phantom_files):
    raw = open(phantom_files["flair"], "rb").read()
    img = nifti_from_bytes(raw)
    assert img.shape == (96, 96, 64)
    with pytest.raises(ValueError, match="Unsupported"):
        read_upload(raw, "scan.png")
    with pytest.raises(ValueError, match="couldn't read"):
        nifti_from_bytes(b"not a nifti at all" * 50)


def test_deid_keywords_are_valid_dicom():
    from pydicom.datadict import tag_for_keyword

    from btp.privacy.deid import UID_KEYWORDS
    assert [k for k in REMOVE_KEYWORDS + UID_KEYWORDS if tag_for_keyword(k) is None] == []
