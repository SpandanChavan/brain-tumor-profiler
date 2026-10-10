/// <reference lib="webworker" />
/**
 * Private-mode inference worker: the scan stays inside this browser tab.
 * WebGPU when available, WASM otherwise. Runs off the UI thread so the viewer never freezes.
 */
import * as ort from "onnxruntime-web/webgpu";
import {
  TTA_VIEWS, brainMask, brainSlices, buildBatch, combineViews, pad32, postprocess, readLogits, zscore,
  type Dims,
} from "./core";

export type WorkerIn =
  | { type: "init"; modelUrl: string; wasmPaths: string }
  | { type: "segment"; t1: Float32Array; fl: Float32Array; dims: Dims; tta: boolean; threshold: number; minVox: number };

export type WorkerOut =
  | { type: "ready"; backend: string; modelBytes: number }
  | { type: "progress"; frac: number; message: string }
  | { type: "result"; mask: Uint8Array; unc: Float32Array; brain: Uint8Array; seconds: number; backend: string }
  | { type: "error"; message: string };

let session: ort.InferenceSession | null = null;
let backend = "wasm";
const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

async function loadModel(url: string): Promise<ArrayBuffer> {
  // Cache Storage: download once, then works offline (the "Wi-Fi off" demo)
  const cache = "caches" in self ? await caches.open("btp-model-v1") : null;
  const hit = cache ? await cache.match(url) : undefined;
  if (hit) return hit.arrayBuffer();
  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`Could not download the model (${resp.status}).`);
  // stream with progress so a first-time user sees the 21 MB download moving
  const total = Number(resp.headers.get("content-length")) || 0;
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0, lastPct = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== lastPct && (pct % 5 === 0 || pct === -1)) {
      lastPct = pct;
      const mb = (n: number) => (n / 1e6).toFixed(1);
      post({
        type: "progress", frac: total ? got / total : 0,
        message: total ? `Downloading the AI model to this device: ${mb(got)} of ${mb(total)} MB (once)`
          : `Downloading the AI model to this device: ${mb(got)} MB (once)`,
      });
    }
  }
  const buf = new Uint8Array(got);
  let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  if (cache) await cache.put(url, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
  return buf.buffer;
}

async function init(modelUrl: string, wasmPaths: string) {
  if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
  const model = await loadModel(modelUrl);
  const hasGPU = "gpu" in navigator && !!(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  for (const ep of hasGPU ? ["webgpu", "wasm"] : ["wasm"]) {
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: [ep], graphOptimizationLevel: "all" });
      backend = ep;
      break;
    } catch (e) {
      if (ep === "wasm") throw e;
    }
  }
  post({ type: "ready", backend, modelBytes: model.byteLength });
}

async function segment(msg: Extract<WorkerIn, { type: "segment" }>) {
  if (!session) throw new Error("Model not loaded");
  const t0 = performance.now();
  const { dims, tta } = msg;
  const [X, Y, Z] = dims, XY = X * Y;
  const brain = brainMask(msg.t1, msg.fl);
  const ch: [Float32Array, Float32Array] = [zscore(msg.t1, brain), zscore(msg.fl, brain)];
  const p = pad32(X, Y);
  const zs = brainSlices(brain, dims);
  const prob = new Float32Array(X * Y * Z), unc = new Float32Array(X * Y * Z);
  const views = tta ? TTA_VIEWS : [TTA_VIEWS[0]];
  const B = backend === "webgpu" ? 8 : 4;
  const inputName = session.inputNames[0];
  for (let s = 0; s < zs.length; s += B) {
    const batch = zs.slice(s, s + B);
    const perView: Float32Array[][] = batch.map(() => []);
    for (const [fh, fw] of views) {
      const data = buildBatch(ch, dims, batch, p, fh, fw);
      const out = await session.run({ [inputName]: new ort.Tensor("float32", data, [batch.length, 2, p.H, p.W]) });
      const logits = out[session.outputNames[0]].data as Float32Array;
      batch.forEach((_, n) => {
        const v = new Float32Array(XY);
        readLogits(logits, n, X, Y, p, fh, fw, v);
        perView[n].push(v);
      });
    }
    batch.forEach((z, n) => combineViews(perView[n], prob, unc, z * XY));
    const done = Math.min(s + B, zs.length);
    post({ type: "progress", frac: done / zs.length, message: `Segmenting slice ${done}/${zs.length} on this device` });
  }
  const mask = postprocess(prob, brain, dims, msg.threshold, msg.minVox);
  post({ type: "result", mask, unc, brain, seconds: (performance.now() - t0) / 1000, backend },
       [mask.buffer, unc.buffer, brain.buffer]);
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  try {
    if (e.data.type === "init") await init(e.data.modelUrl, e.data.wasmPaths);
    else await segment(e.data);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
