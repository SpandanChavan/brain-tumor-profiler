/**
 * Orchestrates an analysis in either mode and normalises the output into a `Result`.
 *   Server mode:  FastAPI + ONNX Runtime (sample or upload)
 *   Private mode: onnxruntime-web in a Web Worker; nothing leaves the browser
 */
import { NVImage } from "@niivue/niivue";
import { api, CancelledError, type SegmentResponse } from "./api";
import { computeProfile } from "./profile";
import { toRas } from "./volume";
import type { Mode, Progress, Result, VolSource } from "../store";
import type { WorkerIn, WorkerOut } from "../inference/worker";

const MODEL_URL = (import.meta.env.VITE_MODEL_URL as string | undefined) || "/models/btp_model.onnx";
// ONNX Runtime resolves its WASM relative to its own module; Vite emits it as a hashed
// same-origin asset in both dev and prod (no CDN, works offline once cached).
const WASM_PATHS = "";

export interface Inputs { label: string; t1ce: VolSource; flair: VolSource; seg?: VolSource;
  sampleId?: string; files?: { t1ce: File; flair: File }; dicomConverted?: boolean }

export function sourceFromFile(f: File): VolSource {
  return { url: URL.createObjectURL(f), name: f.name };
}

function fromServer(r: SegmentResponse, inp: Inputs): Result {
  const f = r.files as Record<string, string>;
  return {
    mode: "server", label: inp.label, t1ce: inp.t1ce, flair: inp.flair,
    maskUrl: api.fileUrl(f.mask), uncUrl: api.fileUrl(f.uncertainty), labelUrl: f.label ? api.fileUrl(f.label) : undefined,
    profile: r.profile, area: r.area_per_slice_mm2, seconds: r.timings.total_s, warnings: r.warnings,
    agreement: r.agreement, synthetic: r.synthetic_model, modelVersion: r.model_version, jobId: r.job_id,
    deid: r.deidentification,
  };
}

// ---------------------------------------------------------------- private mode
let worker: Worker | null = null;
let workerReady: Promise<string> | null = null;

export function preparePrivateMode(onProgress?: (p: Progress) => void): Promise<string> {
  if (workerReady) return workerReady;
  worker = new Worker(new URL("../inference/worker.ts", import.meta.url), { type: "module" });
  onProgress?.({ frac: 0.02, message: "Downloading the AI model to this device (once)…" });
  workerReady = new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === "ready") { worker!.removeEventListener("message", onMsg); resolve(e.data.backend); }
      if (e.data.type === "error") { worker!.removeEventListener("message", onMsg); worker!.terminate(); worker = null; workerReady = null; reject(new Error(e.data.message)); }
    };
    worker!.addEventListener("message", onMsg);
    worker!.postMessage({ type: "init", modelUrl: MODEL_URL, wasmPaths: WASM_PATHS } satisfies WorkerIn);
  });
  return workerReady;
}

async function loadVol(src: VolSource): Promise<NVImage> {
  try {
    return await NVImage.loadFromUrl({ url: src.url, name: src.name });
  } catch {
    throw new Error(`We couldn't read "${src.name}" as a NIfTI volume. Use .nii / .nii.gz, or a .zip of one DICOM series.`);
  }
}

async function runPrivate(inp: Inputs, tta: boolean, onProgress: (p: Progress) => void): Promise<Result> {
  const isZip = (f: File) => /.zip$/i.test(f.name);
  if (inp.files && (isZip(inp.files.t1ce) || isZip(inp.files.flair))) {
    const { dicomZipToNifti } = await import("./dicom"); // ~1 MB WASM converter, loaded only when needed
    onProgress({ frac: 0.03, message: "Converting DICOM to NIfTI on this device (identifying headers are dropped)…" });
    const conv = async (f: File, l: string) => (isZip(f) ? dicomZipToNifti(f, l) : f);
    const [t1f, flf] = [await conv(inp.files.t1ce, "t1ce"), await conv(inp.files.flair, "flair")];
    inp = { ...inp, t1ce: sourceFromFile(t1f), flair: sourceFromFile(flf), dicomConverted: true };
  }
  const backend = await preparePrivateMode(onProgress);
  onProgress({ frac: 0.08, message: `Model ready (${backend.toUpperCase()}). Reading scans locally…` });
  const [t1v, flv] = await Promise.all([loadVol(inp.t1ce), loadVol(inp.flair)]);
  const t1 = toRas(t1v), fl = toRas(flv);
  if (t1.dims.join() !== fl.dims.join()) {
    throw new Error(`T1ce ${t1.dims.join("×")} and FLAIR ${fl.dims.join("×")} differ. Both sequences must be co-registered.`);
  }
  const warnings: string[] = [];
  if (t1.spacing.some((s) => Math.abs(s - 1) > 0.25)) warnings.push(`Voxel spacing ${t1.spacing.map((s) => s.toFixed(2)).join("×")} mm differs from the 1 mm training data. Results may be less accurate.`);
  const zeros = fl.data.reduce((n, v) => n + (v === 0 ? 1 : 0), 0) / fl.data.length;
  if (zeros < 0.2) warnings.push("The scan does not look skull-stripped. The model expects skull-stripped scans; un-stripped head MRI can also reveal the face.");

  const out = await new Promise<Extract<WorkerOut, { type: "result" }>>((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === "progress") onProgress({ frac: 0.1 + 0.85 * m.frac, message: m.message });
      if (m.type === "result") { worker!.removeEventListener("message", onMsg); resolve(m); }
      if (m.type === "error") { worker!.removeEventListener("message", onMsg); reject(new Error(m.message)); }
    };
    worker!.addEventListener("message", onMsg);
    worker!.postMessage({ type: "segment", t1: t1.data, fl: fl.data, dims: t1.dims, tta, threshold: 0.5, minVox: 50 } satisfies WorkerIn,
                        [t1.data.buffer, fl.data.buffer]);
  });
  const card = await fetch(MODEL_URL.replace(/[^/]+$/, "model_card.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { synthetic?: boolean; version?: string } | null;
  const { profile, area } = computeProfile(out.mask, t1.dims, t1.spacing, out.brain, out.unc);
  const unc8 = new Uint8Array(out.unc.length);
  for (let i = 0; i < unc8.length; i++) unc8[i] = Math.min(255, Math.round(out.unc[i] * 510));
  let labelRas: Uint8Array | undefined;
  if (inp.seg) {
    const s = toRas(await loadVol(inp.seg));
    labelRas = Uint8Array.from(s.data, (v) => (v > 0 ? 1 : 0));
  }
  let agreement;
  if (labelRas) {
    let tp = 0, p = 0, g = 0;
    for (let i = 0; i < labelRas.length; i++) { p += out.mask[i]; g += labelRas[i]; tp += out.mask[i] & labelRas[i]; }
    const v = t1.spacing[0] * t1.spacing[1] * t1.spacing[2] / 1000;
    agreement = { dice: p + g ? (2 * tp) / (p + g) : 1, iou: p + g - tp ? tp / (p + g - tp) : 1, hd95_mm: null,
      sensitivity: g ? tp / g : null, precision: p ? tp / p : null, vol_pred_ml: p * v, vol_gt_ml: g * v };
  }
  return {
    mode: "private", label: inp.label, t1ce: inp.t1ce, flair: inp.flair,
    maskRas: out.mask, uncRas: unc8, labelRas, profile, area, seconds: out.seconds, warnings,
    deid: inp.dicomConverted ? [{ removed: -1, burned_in_annotation: false }] : undefined,
    agreement, synthetic: card?.synthetic ?? true, modelVersion: card?.version ?? "local ONNX", backend: out.backend,
  };
}

// ---------------------------------------------------------------- cancellation
let active: AbortController | null = null;

/** Cancel the running analysis: aborts server requests, or stops the in-browser worker. */
export function cancelAnalysis() {
  active?.abort();
  if (worker) { worker.terminate(); worker = null; workerReady = null; }
}

export async function analyze(mode: Mode, inp: Inputs, tta: boolean, onProgress: (p: Progress) => void): Promise<Result> {
  active = new AbortController();
  const signal = active.signal;
  if (mode === "private") {
    // a terminated worker never answers: race the run against the cancel signal
    return Promise.race([
      runPrivate(inp, tta, onProgress),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new CancelledError()), { once: true })),
    ]);
  }
  onProgress({ frac: 0.05, message: "Contacting the analysis server (it may need ~30 s to wake up)…" });
  await api.health(signal);
  onProgress({ frac: 0.3, message: inp.files ? "Uploading and segmenting (processed in memory)…" : "Segmenting on the server…" });
  const r = inp.sampleId ? await api.segmentSample(inp.sampleId, tta, signal) : await api.segment(inp.files!.t1ce, inp.files!.flair, tta, signal);
  onProgress({ frac: 1, message: "Done" });
  return fromServer(r, inp);
}
