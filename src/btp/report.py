"""PDF summary report (FR-A10). Contains no patient metadata (PR-2, SR-8)."""

from __future__ import annotations

import io
from datetime import datetime, timezone

import numpy as np
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from btp import DISCLAIMER, __version__
from btp.profiling.profile import TumorProfile


def _png(arr: np.ndarray, width_mm: float) -> RLImage:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    buf.seek(0)
    h, w = arr.shape[:2]
    return RLImage(buf, width=width_mm * mm, height=width_mm * mm * h / w)


def build_pdf(profile: TumorProfile, snapshots: list[tuple[str, np.ndarray]],
              model_info: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title="Tumor segmentation summary", author="", subject="", creator="BTP")
    ss = getSampleStyleSheet()
    warn = ss["BodyText"].clone("warn", textColor=colors.HexColor("#92400e"), fontSize=9)
    story = [
        Paragraph("Brain Tumor Segmentation &amp; Profiler: AI summary", ss["Title"]),
        Paragraph(f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC · app v{__version__} · "
                  f"model {model_info.get('version', 'unknown')}", ss["Normal"]),
        Spacer(1, 4 * mm),
        Paragraph(f"<b>{DISCLAIMER}</b>", warn),
        Spacer(1, 4 * mm),
    ]
    if profile.detected:
        story.append(Paragraph("Region suggestive of tumor identified by the model. "
                               "Clinical review required.", ss["Heading3"]))
        rows = [
            ["Estimated volume", f"{profile.volume_ml:.1f} mL (cm³)"],
            ["Slices containing region", f"{profile.n_tumor_slices} of {profile.n_slices} "
                                         f"(axial {profile.slice_range[0]}–{profile.slice_range[1]})"],
            ["Largest cross-section", f"slice {profile.max_area_slice}, {profile.max_area_mm2 / 100:.1f} cm²"],
            ["Approximate side", profile.hemisphere],
            ["Bounding box (x × y × z)", " × ".join(f"{e:.0f}" for e in profile.extent_mm) + " mm"],
            ["Separate regions", str(profile.n_components)],
            ["Mean model uncertainty", f"{profile.mean_uncertainty:.3f} (0 = certain, 0.5 = max)"
             if profile.mean_uncertainty is not None else "n/a"],
        ]
    else:
        story.append(Paragraph("No tumor region detected by the model. This does not rule out disease.",
                               ss["Heading3"]))
        rows = [["Slices analysed", str(profile.n_slices)]]
    rows.append(["Model test-set Dice (whole tumor)", model_info.get("test_dice", "not yet measured")])
    t = Table(rows, colWidths=[62 * mm, 110 * mm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                           ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
                           ("FONTSIZE", (0, 0), (-1, -1), 9)]))
    story += [t, Spacer(1, 5 * mm)]
    for caption, arr in snapshots[:3]:
        story += [Paragraph(caption, ss["Italic"]), _png(arr, 95), Spacer(1, 3 * mm)]
    story.append(Paragraph(
        "Limitations: trained on a subset of the BraTS glioma dataset (skull-stripped, co-registered, "
        "1 mm). Accuracy is lower on small tumors, non-glioma lesions and scans from other pipelines. "
        "Measurements are estimates from an automated segmentation.", warn))
    doc.build(story)
    return buf.getvalue()
