/** Tumor profile: port of src/btp/profiling/profile.py (RAS arrays, x fastest). */
import type { Dims } from "../inference/core";

export interface TumorProfile {
  detected: boolean;
  volume_ml: number;
  n_tumor_slices: number;
  n_slices: number;
  slice_range: [number, number] | null;
  max_area_slice: number | null;
  max_area_mm2: number;
  n_components: number;
  hemisphere: string;
  extent_mm: [number, number, number] | null;
  mean_uncertainty: number | null;
}

export function computeProfile(mask: Uint8Array, dims: Dims, spacing: Dims, brain: Uint8Array,
                               unc?: Float32Array): { profile: TumorProfile; area: number[] } {
  const [X, Y, Z] = dims, [sx, sy, sz] = spacing, XY = X * Y;
  const area = new Array<number>(Z).fill(0);
  let n = 0, uSum = 0;
  let lo = [X, Y, Z], hi = [-1, -1, -1];
  const tx: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / XY);
    area[z] += sx * sy; n++; if (unc) uSum += unc[i]; tx.push(x);
    lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)];
    hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)];
  }
  if (!n) {
    return { area, profile: { detected: false, volume_ml: 0, n_tumor_slices: 0, n_slices: Z, slice_range: null,
      max_area_slice: null, max_area_mm2: 0, n_components: 0, hemisphere: "—", extent_mm: null, mean_uncertainty: null } };
  }
  const zs = area.map((a, z) => (a > 0 ? z : -1)).filter((z) => z >= 0);
  const maxArea = Math.max(...area);
  // hemisphere: RAS +x = patient right; compare to the brain's median x
  const bx: number[] = [];
  const step = Math.max(1, Math.floor(brain.length / 200000));
  for (let i = 0; i < brain.length; i += step) if (brain[i]) bx.push(i % X);
  bx.sort((a, b) => a - b);
  const mid = bx.length ? bx[Math.floor(bx.length / 2)] : X / 2;
  const rightFrac = tx.filter((x) => x > mid).length / tx.length;
  return {
    area,
    profile: {
      detected: true,
      volume_ml: (n * sx * sy * sz) / 1000,
      n_tumor_slices: zs.length,
      n_slices: Z,
      slice_range: [zs[0], zs[zs.length - 1]],
      max_area_slice: area.indexOf(maxArea),
      max_area_mm2: maxArea,
      n_components: countComponents(mask, dims),
      hemisphere: rightFrac > 0.8 ? "Right" : rightFrac < 0.2 ? "Left" : "Both / midline",
      extent_mm: [(hi[0] - lo[0] + 1) * sx, (hi[1] - lo[1] + 1) * sy, (hi[2] - lo[2] + 1) * sz],
      mean_uncertainty: unc ? uSum / n : null,
    },
  };
}

function countComponents(m: Uint8Array, [X, Y, Z]: Dims): number {
  const XY = X * Y, seen = new Uint8Array(m.length), st = new Int32Array(m.length);
  let count = 0;
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    count++; let top = 0; st[top++] = s; seen[s] = 1;
    while (top) {
      const i = st[--top], x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / XY);
      for (const j of [x > 0 ? i - 1 : -1, x < X - 1 ? i + 1 : -1, y > 0 ? i - X : -1, y < Y - 1 ? i + X : -1,
                       z > 0 ? i - XY : -1, z < Z - 1 ? i + XY : -1]) {
        if (j >= 0 && m[j] && !seen[j]) { seen[j] = 1; st[top++] = j; }
      }
    }
  }
  return count;
}
