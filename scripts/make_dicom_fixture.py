"""Build zipped DICOM series (T1ce + FLAIR) from a synthetic phantom, with FAKE PHI in the headers.

Used by E2E tests to prove de-identification in both modes. All "PHI" here is invented.

  python scripts/make_dicom_fixture.py --out web/e2e/fixtures
"""

from __future__ import annotations

import argparse
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, MRImageStorage, generate_uid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from btp.synthetic import make_phantom  # noqa: E402

FAKE_PHI = {"PatientName": "Doe^Jane", "PatientID": "MRN-0042", "PatientBirthDate": "19700101",
            "InstitutionName": "Example General Hospital", "ReferringPhysicianName": "House^Greg",
            "AccessionNumber": "ACC-777", "StudyDate": "20250102", "DeviceSerialNumber": "SN-123"}


def series_zip(vol: np.ndarray, description: str) -> bytes:
    study, series, frame = generate_uid(), generate_uid(), generate_uid()
    v = np.clip(vol, 0, None)
    v = (v / max(v.max(), 1e-6) * 3000).astype(np.uint16)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for k in range(v.shape[2]):
            ds = Dataset()
            ds.file_meta = FileMetaDataset()
            ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
            ds.file_meta.MediaStorageSOPClassUID = MRImageStorage
            ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()
            for key, val in FAKE_PHI.items():
                setattr(ds, key, val)
            ds.SOPClassUID, ds.SOPInstanceUID = MRImageStorage, ds.file_meta.MediaStorageSOPInstanceUID
            ds.StudyInstanceUID, ds.SeriesInstanceUID, ds.FrameOfReferenceUID = study, series, frame
            ds.Modality, ds.SeriesDescription, ds.SeriesNumber, ds.InstanceNumber = "MR", description, 1, k + 1
            ds.Rows, ds.Columns = v.shape[1], v.shape[0]
            ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 16, 16, 15, 0
            ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, "MONOCHROME2"
            ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
            ds.ImagePositionPatient = [0.0, 0.0, float(k)]
            ds.PixelSpacing, ds.SliceThickness = [1, 1], 1
            ds.PixelData = np.ascontiguousarray(v[:, :, k].T).tobytes()
            b = io.BytesIO()
            ds.save_as(b, enforce_file_format=True)
            zf.writestr(f"{description}/IM{k:04d}.dcm", b.getvalue())
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="web/e2e/fixtures")
    a = ap.parse_args()
    out = ROOT / a.out
    out.mkdir(parents=True, exist_ok=True)
    ph = make_phantom(shape=(96, 96, 48), seed=4242)
    (out / "t1ce_dicom.zip").write_bytes(series_zip(ph.t1ce, "T1CE"))
    (out / "flair_dicom.zip").write_bytes(series_zip(ph.flair, "FLAIR"))
    # NIfTI fixtures for UX edge cases (same file twice, mismatched grids, unreadable file)
    import nibabel as nib
    nib.save(nib.Nifti1Image(ph.flair, np.eye(4)), str(out / "ok_flair.nii.gz"))
    nib.save(nib.Nifti1Image(ph.t1ce, np.eye(4)), str(out / "mm_t1ce.nii.gz"))
    nib.save(nib.Nifti1Image(make_phantom(shape=(80, 96, 48), seed=7).flair, np.eye(4)), str(out / "mm_flair.nii.gz"))
    (out / "garbage.nii.gz").write_bytes(b"this is not a nifti file" * 100)
    print("wrote", sorted(p.name for p in out.glob("*.zip")))


if __name__ == "__main__":
    main()
