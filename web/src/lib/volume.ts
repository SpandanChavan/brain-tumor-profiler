/**
 * Helpers between NiiVue's native-order volumes and RAS-ordered flat arrays
 * (same mapping as NiiVue's img2RAS, and as nibabel.as_closest_canonical in Python).
 */
import { NVImage } from "@niivue/niivue";
import type { Dims } from "../inference/core";

interface RasMap { dims: Dims; start: number; step: [number, number, number]; spacing: Dims }

export function rasMap(vol: NVImage): RasMap {
  const hdr = vol.hdr!;
  const perm = vol.permRAS!.slice() as number[];
  const ap = perm.map(Math.abs);
  const dims = [hdr.dims[ap[0]], hdr.dims[ap[1]], hdr.dims[ap[2]]] as Dims;
  const inStep = [1, hdr.dims[1], hdr.dims[1] * hdr.dims[2]];
  const step = [inStep[ap[0] - 1], inStep[ap[1] - 1], inStep[ap[2] - 1]] as [number, number, number];
  let start = 0;
  for (let i = 0; i < 3; i++) {
    if (perm[i] < 0) { start += step[i] * (dims[i] - 1); step[i] = -step[i]; }
  }
  const spacing = ap.map((a) => Math.abs(hdr.pixDims[a])) as Dims;
  return { dims, start, step, spacing };
}

/** Voxel values in RAS order (x fastest), with NIfTI slope/intercept applied like nibabel. */
export function toRas(vol: NVImage): { data: Float32Array; dims: Dims; spacing: Dims } {
  const { dims, start, step, spacing } = rasMap(vol);
  const img = vol.img as ArrayLike<number>;
  const hdr = vol.hdr!;
  const slope = hdr.scl_slope && isFinite(hdr.scl_slope) ? hdr.scl_slope : 1;
  const inter = hdr.scl_inter && isFinite(hdr.scl_inter) ? hdr.scl_inter : 0;
  const [X, Y, Z] = dims;
  const out = new Float32Array(X * Y * Z);
  let j = 0;
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) {
    let i = start + z * step[2] + y * step[1];
    for (let x = 0; x < X; x++, i += step[0]) out[j++] = img[i] * slope + inter;
  }
  return { data: out, dims, spacing };
}

/** New overlay volume on the template's grid, filled from a RAS array. */
export function fromRas(template: NVImage, ras: ArrayLike<number>, name: string, colormap: string,
                        calMin: number, calMax: number, opacity = 0.6): NVImage {
  const { dims, start, step } = rasMap(template);
  const vol = template.clone();
  vol.zeroImage();
  vol.hdr!.scl_slope = 1;
  vol.hdr!.scl_inter = 0;
  const img = vol.img as Float32Array;
  const [X, Y, Z] = dims;
  let j = 0;
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) {
    let i = start + z * step[2] + y * step[1];
    for (let x = 0; x < X; x++, i += step[0]) img[i] = ras[j++];
  }
  vol.name = name;
  vol.colormap = colormap;
  vol.cal_min = calMin;
  vol.cal_max = calMax;
  vol.opacity = opacity;
  vol.ignoreZeroVoxels = true;
  return vol;
}

/** AI vs expert: 1 = both (TP), 2 = AI only (FP), 3 = expert only (FN). */
export function comparisonRas(pred: ArrayLike<number>, gt: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(pred.length);
  for (let i = 0; i < pred.length; i++) {
    const p = pred[i] > 0.5, g = gt[i] > 0.5;
    out[i] = p && g ? 1 : p ? 2 : g ? 3 : 0;
  }
  return out;
}

/** Contour layer: mask voxels with an in-plane (axial 4-neighbour) neighbour outside the mask. */
export function shellRas(mask: ArrayLike<number>, [X, Y, Z]: [number, number, number]): Uint8Array {
  const XY = X * Y, out = new Uint8Array(mask.length);
  const at = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? 0 : mask[x + y * X + z * XY] > 0.5 ? 1 : 0;
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    if (!at(x, y, z)) continue;
    // in-plane (axial) neighbours only: crisp rings on every axial slice, the radiologist's main view
    if (!at(x - 1, y, z) || !at(x + 1, y, z) || !at(x, y - 1, z) || !at(x, y + 1, z)) out[x + y * X + z * XY] = 1;
  }
  return out;
}
