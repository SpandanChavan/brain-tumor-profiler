/**
 * Private-mode DICOM support (FR-A15): zipped DICOM series → NIfTI, entirely in the browser.
 *
 * De-identification by construction: dcm2niix (WASM) keeps only pixels + geometry, and we run it
 * with `-b n` so no BIDS/JSON sidecar (which could carry dates, device or site info) is produced.
 * The NIfTI `descrip` field it writes (e.g. TE/acquisition time) is never displayed or exported:
 * exports are rebuilt with an empty description (see report.ts).
 */
import { Dcm2niix } from "@niivue/dcm2niix";
import { unzipSync } from "fflate";

export const isZip = (f: File) => /\.zip$/i.test(f.name);

/** Unzip a DICOM series into File objects with the relative paths dcm2niix expects. */
export function unzipSeries(buf: ArrayBuffer, folder: string): File[] {
  const entries = unzipSync(new Uint8Array(buf), {
    filter: (f) => !f.name.endsWith("/") && !f.name.split("/").pop()!.startsWith(".") && f.originalSize < 50e6,
  });
  const total = Object.values(entries).reduce((n, b) => n + b.length, 0);
  if (total > 1e9) throw new Error("The zip expands to more than 1 GB; please upload a single series.");
  return Object.entries(entries).map(([name, data], i) => {
    const f = new File([data.slice().buffer], `${i}_${name.split("/").pop()}`);
    (f as File & { _webkitRelativePath: string })._webkitRelativePath = `${folder}/${f.name}`;
    return f;
  });
}

/** Convert one zipped DICOM series to a single NIfTI File (largest output if several). */
export async function dicomZipToNifti(zip: File, label: string): Promise<File> {
  const files = unzipSeries(await zip.arrayBuffer(), label);
  if (files.length < 2) throw new Error(`${label}: no DICOM slices found in the zip.`);
  // a fresh converter per series: the WASM worker cannot be reused across runs, and terminating it
  // afterwards frees its memory (the DICOM bytes never outlive the conversion)
  const dcm = new Dcm2niix();
  await dcm.init();
  let out: File[];
  try {
    out = await dcm.input(files).b("n").run();
  } catch (e) {
    throw new Error(`${label}: DICOM conversion failed${e instanceof Error && e.message && e.message !== "undefined" ? ` (${e.message})` : ""}.`);
  } finally {
    dcm.worker?.terminate();
  }
  const nii = out.filter((f) => /\.nii(\.gz)?$/i.test(f.name)).sort((a, b) => b.size - a.size)[0];
  if (!nii) throw new Error(`${label}: could not build a volume from this DICOM series.`);
  return new File([nii], `${label}.nii${nii.name.endsWith(".gz") ? ".gz" : ""}`);
}
