"""Upload readers: NIfTI bytes and zipped DICOM series -> nibabel images (FR-A1, FR-A13).

DICOM series are de-identified *before* any pixel processing (PR-3).
"""

from __future__ import annotations

import gzip
import io
import zipfile
from pathlib import Path

import nibabel as nib
import numpy as np

from btp.privacy.deid import deidentify_dataset

MAX_BYTES = 200 * 1024 * 1024


def nifti_from_bytes(data: bytes, filename: str = "") -> nib.Nifti1Image:
    if len(data) > MAX_BYTES:
        raise ValueError("File is larger than 200 MB.")
    raw = gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data
    try:
        fh = nib.FileHolder(fileobj=io.BytesIO(raw))
        img = nib.Nifti1Image.from_file_map({"header": fh, "image": fh})
        _ = img.shape
    except Exception as e:
        hint = " It looks like a DICOM file; upload the whole series as a .zip instead." \
            if raw[128:132] == b"DICM" else ""
        raise ValueError(f"We couldn't read this as a NIfTI volume.{hint}") from e
    return nib.Nifti1Image(np.asanyarray(img.dataobj), img.affine, img.header)


def dicom_zip_to_nifti(data: bytes) -> tuple[nib.Nifti1Image, dict]:
    """Read a zipped single DICOM series, de-identify every slice, return (RAS-ready image, report)."""
    import pydicom

    if len(data) > MAX_BYTES:
        raise ValueError("Zip is larger than 200 MB.")
    slices, uid_map, report = [], {}, {"removed": set(), "burned_in_annotation": False, "n_files": 0}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        if sum(i.file_size for i in zf.infolist()) > 5 * MAX_BYTES:  # zip-bomb guard
            raise ValueError("The zip expands to more than 1 GB; please upload a single series.")
        for info in zf.infolist():
            if info.is_dir() or Path(info.filename).name.startswith("."):
                continue
            try:
                ds = pydicom.dcmread(io.BytesIO(zf.read(info)), force=True)
                _ = ds.pixel_array
            except Exception:
                continue
            r = deidentify_dataset(ds, uid_map)
            report["removed"].update(r["removed"])
            report["burned_in_annotation"] |= r["burned_in_annotation"]
            slices.append(ds)
    if len(slices) < 2:
        raise ValueError("No readable DICOM series found in the zip.")
    report["n_files"] = len(slices)
    report["removed"] = sorted(report["removed"])

    orient = np.array(slices[0].ImageOrientationPatient, dtype=float)
    row, col = orient[:3], orient[3:]
    normal = np.cross(row, col)
    slices.sort(key=lambda s: float(np.dot(normal, np.array(s.ImagePositionPatient, dtype=float))))
    vol = np.stack([s.pixel_array.astype(np.float32) * float(getattr(s, "RescaleSlope", 1))
                    + float(getattr(s, "RescaleIntercept", 0)) for s in slices], axis=-1)
    # DICOM pixel_array is (rows, cols) -> transpose to (cols=i, rows=j, k)
    vol = np.transpose(vol, (1, 0, 2))
    dr, dc = (float(x) for x in slices[0].PixelSpacing)
    p0 = np.array(slices[0].ImagePositionPatient, dtype=float)
    p1 = np.array(slices[-1].ImagePositionPatient, dtype=float)
    step = (p1 - p0) / (len(slices) - 1)
    affine_lps = np.eye(4)
    affine_lps[:3, 0] = row * dc
    affine_lps[:3, 1] = col * dr
    affine_lps[:3, 2] = step
    affine_lps[:3, 3] = p0
    lps_to_ras = np.diag([-1, -1, 1, 1])
    return nib.Nifti1Image(vol, lps_to_ras @ affine_lps), report


def read_upload(data: bytes, filename: str) -> tuple[nib.Nifti1Image, dict]:
    name = filename.lower()
    if name.endswith(".zip"):
        return dicom_zip_to_nifti(data)
    if name.endswith((".nii", ".nii.gz", ".gz")):
        return nifti_from_bytes(data, filename), {"format": "nifti"}
    raise ValueError("Unsupported file type. Please upload .nii / .nii.gz, or a .zip of a DICOM series.")
