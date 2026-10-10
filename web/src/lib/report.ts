/** Exports (FR-A12): metadata-free PDF summary and mask NIfTI. */
import { jsPDF } from "jspdf";
import { NVImage } from "@niivue/niivue";
import type { Result } from "../store";
import { fromRas } from "./volume";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function maskNiftiBlob(res: Result): Promise<Blob> {
  if (res.maskUrl) return (await fetch(res.maskUrl)).blob(); // server already sanitises the header
  const base = await NVImage.loadFromUrl({ url: res.flair.url, name: res.flair.name });
  const vol = fromRas(base, res.maskRas!, "mask", "gray", 0, 1);
  vol.hdr!.description = ""; // never carry free-text header fields (may contain names/IDs)
  const bytes = await vol.saveToUint8Array("tumor_mask.nii.gz");
  return new Blob([bytes.slice().buffer], { type: "application/gzip" });
}

export function buildReport(res: Result, screenshot: string | null): Blob {
  const p = res.profile;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: "Tumor segmentation summary", author: "", subject: "", creator: "Brain Tumor Profiler" });
  let y = 18;
  doc.setFontSize(16); doc.text("Brain Tumor Segmentation & Profiler: AI summary", 15, y); y += 7;
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · model ${res.modelVersion} · ${res.mode === "private" ? "computed on device" : "computed on server"}`, 15, y); y += 6;
  doc.setTextColor(146, 64, 14);
  doc.text("Research & education use only. Not a medical device. AI suggestion: clinical review required.", 15, y); y += 6;
  if (res.synthetic) {
    doc.text("DEMO WEIGHTS: this model was trained on synthetic phantoms. These numbers are not a real result.", 15, y); y += 6;
  }
  y += 3;
  doc.setTextColor(20); doc.setFontSize(12);
  doc.text(p.detected ? "Region suggestive of tumor identified by the model." : "No tumor region detected by the model. This does not rule out disease.", 15, y); y += 8;
  doc.setFontSize(10);
  const rows: [string, string][] = p.detected ? [
    ["Estimated volume", `${p.volume_ml.toFixed(1)} mL`],
    ["Slices containing region", `${p.n_tumor_slices} of ${p.n_slices} (axial ${p.slice_range?.join("–")})`],
    ["Largest cross-section", `slice ${p.max_area_slice}, ${(p.max_area_mm2 / 100).toFixed(1)} cm²`],
    ["Approximate side", p.hemisphere],
    ["Bounding box", `${p.extent_mm?.map((e) => e.toFixed(0)).join(" × ")} mm`],
    ["Separate regions", String(p.n_components)],
    ["Mean uncertainty", p.mean_uncertainty?.toFixed(3) ?? "n/a"],
  ] : [["Slices analysed", String(p.n_slices)]];
  if (res.agreement) rows.push(["Dice vs expert (sample)", res.agreement.dice.toFixed(3)]);
  for (const [k, v] of rows) { doc.text(k, 15, y); doc.text(v, 80, y); y += 6; }
  if (screenshot) {
    // keep the viewer's aspect ratio instead of stretching it into a fixed box
    const props = doc.getImageProperties(screenshot);
    const w = 180, h = Math.min(150, (w * props.height) / props.width);
    y += 3; doc.addImage(screenshot, screenshot.startsWith("data:image/jpeg") ? "JPEG" : "PNG", 15, y, (h * props.width) / props.height, h); y += h + 4;
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(doc.splitTextToSize("Limitations: trained on a subset of the BraTS glioma dataset (skull-stripped, co-registered, 1 mm). Accuracy is lower on small tumors, non-glioma lesions and scans from other pipelines. Measurements are estimates from an automated segmentation.", 180), 15, y + 4);
  return doc.output("blob");
}
