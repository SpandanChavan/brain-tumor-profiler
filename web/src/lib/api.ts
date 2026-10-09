/** Typed client for the FastAPI service (api/main.py). */
import type { TumorProfile } from "./profile";

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8000";

export interface Agreement { dice: number; iou: number; hd95_mm: number | null; sensitivity: number | null;
  precision: number | null; vol_pred_ml: number; vol_gt_ml: number }

export interface SegmentResponse {
  job_id: string;
  profile: TumorProfile & { centroid_voxel?: number[] | null };
  area_per_slice_mm2: number[];
  warnings: string[];
  timings: { preprocess_s: number; inference_s: number; total_s: number };
  model_version: string;
  synthetic_model: boolean;
  tta: boolean;
  files: Record<"mask" | "uncertainty" | "label", string> | Record<string, string>;
  expires_in_s: number;
  agreement?: Agreement;
  deidentification?: { removed: number; burned_in_annotation: boolean }[];
}

export interface Sample { id: string; has_label: boolean; synthetic: boolean }

export interface ModelCard {
  version: string; synthetic: boolean; architecture?: string; training_data?: string; inputs?: string[];
  test_metrics?: { n_patients: number; dice: { mean: number; std: number; median: number };
                   hd95_mm: { median: number }; patient_detection_sensitivity?: number } | null;
  onnx?: { parity_min_dice: number }; intended_use?: string;
}

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }
/** Thrown when the user cancels an analysis (not an error to display). */
export class CancelledError extends Error { constructor() { super("Cancelled"); } }

async function call<T>(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const outer = init?.signal;
  outer?.addEventListener("abort", () => ctl.abort(), { once: true });
  try {
    const r = await fetch(`${API_URL}${path}`, { ...init, signal: ctl.signal, referrerPolicy: "no-referrer" });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(typeof body.detail === "string" ? body.detail : `Server error (${r.status})`, r.status);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (outer?.aborted) throw new CancelledError();
    if (e instanceof ApiError) throw e;
    throw new ApiError("Can't reach the analysis server. It may be waking up (free tier) — try again in ~30 s, or use Private mode.", 0);
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  health: (signal?: AbortSignal) => call<{ status: string; model_loaded: boolean }>("/v1/health", { signal }, 90_000),
  model: () => call<ModelCard>("/v1/model"),
  samples: () => call<Sample[]>("/v1/samples"),
  sampleUrl: (id: string, m: "t1ce" | "flair" | "seg") => `${API_URL}/v1/samples/${id}/${m}.nii.gz`,
  segmentSample: (id: string, tta: boolean, signal?: AbortSignal) => call<SegmentResponse>(`/v1/samples/${id}/segment?tta=${tta}`, { method: "POST", signal }),
  segment: (t1ce: File, flair: File, tta: boolean, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append("t1ce", t1ce);
    fd.append("flair", flair);
    fd.append("consent", "true");
    fd.append("tta", String(tta));
    return call<SegmentResponse>("/v1/segment", { method: "POST", body: fd, signal }, 300_000);
  },
  fileUrl: (path: string) => `${API_URL}${path}`,
  deleteResult: (job: string) => fetch(`${API_URL}/v1/results/${job}`, { method: "DELETE" }).catch(() => undefined),
};
