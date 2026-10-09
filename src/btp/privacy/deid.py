"""De-identification following the HIPAA Safe Harbor method (PR-2, PR-3, PR-4).

Covers the 18 Safe Harbor identifier categories as they appear in DICOM headers
(mapping in ``SAFE_HARBOR_TAGS``). Strategy, loosely following DICOM PS3.15 Annex E:
  * identifying attributes        -> removed
  * UIDs (category 18)            -> replaced with fresh random UIDs (keeps series linkage)
  * all private tags              -> removed (vendors hide PHI in them)
  * dates (category 3)            -> removed; only year-free geometry survives
  * PatientAge > 89               -> generalised to "090Y"
  * BurnedInAnnotation == YES     -> flagged so the UI can warn (pixel PHI is not auto-redacted)

This is a design-level safeguard for a research prototype, not a certified de-identifier.
"""

from __future__ import annotations

import nibabel as nib
from pydicom.dataset import Dataset
from pydicom.uid import generate_uid

# Safe Harbor category -> DICOM keywords that can carry it
SAFE_HARBOR_TAGS: dict[str, list[str]] = {
    "1 names": ["PatientName", "OtherPatientNames", "PatientBirthName", "PatientMotherBirthName",
                "ReferringPhysicianName", "PerformingPhysicianName", "OperatorsName",
                "NameOfPhysiciansReadingStudy", "RequestingPhysician", "ScheduledPerformingPhysicianName",
                "PhysiciansOfRecord", "ResponsiblePerson", "PersonName"],
    "2 geography": ["PatientAddress", "InstitutionAddress", "RegionOfResidence", "CountryOfResidence",
                    "InstitutionName", "InstitutionalDepartmentName", "StationName"],
    "3 dates": ["PatientBirthDate", "PatientBirthTime", "StudyDate", "SeriesDate", "AcquisitionDate",
                "ContentDate", "StudyTime", "SeriesTime", "AcquisitionTime", "ContentTime",
                "AcquisitionDateTime", "InstanceCreationDate", "InstanceCreationTime",
                "PerformedProcedureStepStartDate", "PerformedProcedureStepStartTime", "LastMenstrualDate"],
    "4-6 phone/fax/email": ["PatientTelephoneNumbers", "PatientTelecomInformation",
                            "PersonTelephoneNumbers", "PersonTelecomInformation"],
    "7-10 SSN/MRN/plan/account": ["PatientID", "OtherPatientIDs", "OtherPatientIDsSequence",
                                  "IssuerOfPatientID", "AccessionNumber", "MedicalRecordLocator",
                                  "PatientInsurancePlanCodeSequence", "StudyID", "AdmissionID",
                                  "MilitaryRank", "BranchOfService"],
    "11 certificate/licence": ["PersonIdentificationCodeSequence"],
    "12 vehicle": [],  # not represented in DICOM imaging headers
    "13 device serials": ["DeviceSerialNumber", "DeviceUID", "DetectorID", "GantryID"],
    "14-15 URL/IP": ["RetrieveURL", "RetrieveURI", "StorageMediaFileSetUID"],
    "16 biometrics": [],  # handled at image level: skull-stripping / defacing warning (PR-4)
    "17 full-face images": [],  # handled at image level (PR-4)
    "18 other unique codes": ["PatientComments", "AdditionalPatientHistory", "ImageComments",
                              "RequestAttributesSequence", "ReferencedPatientSequence",
                              "PatientSize", "PatientWeight", "Occupation", "EthnicGroup",
                              "PatientReligiousPreference", "PregnancyStatus"],
}

UID_KEYWORDS = ["StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID", "FrameOfReferenceUID",
                "MediaStorageSOPInstanceUID", "ReferencedSOPInstanceUID"]

REMOVE_KEYWORDS = sorted({k for ks in SAFE_HARBOR_TAGS.values() for k in ks})


def find_phi(ds: Dataset) -> list[str]:
    """Keywords of identifying attributes present with a non-empty value."""
    found = [k for k in REMOVE_KEYWORDS if k in ds and str(ds.data_element(k).value).strip()]
    found += [f"private:{el.tag}" for el in ds if el.tag.is_private]
    return found


def deidentify_dataset(ds: Dataset, uid_map: dict[str, str] | None = None) -> dict:
    """De-identify ``ds`` in place. ``uid_map`` keeps UIDs consistent across a series.

    Returns a report {removed: [...], uids_replaced: n, burned_in_annotation: bool, age_generalised: bool}.
    """
    uid_map = {} if uid_map is None else uid_map
    removed = []
    for kw in REMOVE_KEYWORDS:
        if kw in ds:
            delattr(ds, kw)
            removed.append(kw)
    # recurse into sequences that remain (identifiers can hide in nested items)
    for el in list(ds):
        if el.VR == "SQ":
            for item in el.value:
                removed += [f"{el.keyword}>{r}" for r in deidentify_dataset(item, uid_map)["removed"]]
    n_priv = len([el for el in ds if el.tag.is_private])
    ds.remove_private_tags()
    if n_priv:
        removed.append(f"{n_priv} private tags")

    n_uid = 0
    for kw in UID_KEYWORDS:
        if kw in ds:
            old = str(ds.data_element(kw).value)
            ds.data_element(kw).value = uid_map.setdefault(old, generate_uid())
            n_uid += 1
    if hasattr(ds, "file_meta") and "MediaStorageSOPInstanceUID" in ds.file_meta:
        old = str(ds.file_meta.MediaStorageSOPInstanceUID)
        ds.file_meta.MediaStorageSOPInstanceUID = uid_map.setdefault(old, generate_uid())

    age_gen = False
    if "PatientAge" in ds:
        try:
            if int(str(ds.PatientAge)[:3]) > 89:
                ds.PatientAge = "090Y"
                age_gen = True
        except ValueError:
            del ds.PatientAge

    ds.PatientIdentityRemoved = "YES"
    ds.DeidentificationMethod = "BTP Safe-Harbor-aligned profile v1"
    burned = str(ds.get("BurnedInAnnotation", "")).upper() == "YES"
    return {"removed": removed, "uids_replaced": n_uid, "burned_in_annotation": burned,
            "age_generalised": age_gen}


def sanitize_nifti(img: nib.Nifti1Image) -> nib.Nifti1Image:
    """Return a copy with free-text header fields cleared (they sometimes carry names/IDs)."""
    import numpy as np

    out = nib.Nifti1Image(np.asanyarray(img.dataobj), img.affine, img.header.copy())
    hdr = out.header
    for field in ("descrip", "aux_file", "intent_name", "db_name"):
        if field in hdr:
            hdr[field] = b""
    out.extra = {}
    return out
