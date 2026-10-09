/**
 * Pure numeric core for Private mode: a line-by-line port of
 *   src/btp/preprocessing/volume.py   (brain z-score)
 *   src/btp/inference/predictor.py    (slice stack, pad32, flip-TTA, uncertainty)
 *   src/btp/inference/postprocess.py  (threshold, brain mask, small-component removal)
 * Keep these in sync: a parity test compares browser vs server masks.
 *
 * Volumes are RAS-ordered flat arrays with x fastest: idx = x + y*X + z*X*Y.
 */

export type Dims = [number, number, number];

/** Brain = voxels non-zero in either sequence (BraTS background is exactly 0). */
export function brainMask(a: ArrayLike<number>, b: ArrayLike<number>): Uint8Array {
  const m = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) m[i] = a[i] !== 0 || b[i] !== 0 ? 1 : 0;
  return m;
}

/** Z-score inside the mask (population std), zero outside. */
export function zscore(v: ArrayLike<number>, mask: Uint8Array): Float32Array {
  let n = 0, sum = 0;
  for (let i = 0; i < v.length; i++) if (mask[i]) { sum += v[i]; n++; }
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < v.length; i++) if (mask[i]) { const d = v[i] - mean; ss += d * d; }
  const std = Math.sqrt(ss / n);
  const s = std > 1e-8 ? std : 1;
  for (let i = 0; i < v.length; i++) if (mask[i]) out[i] = (v[i] - mean) / s;
  return out;
}

export interface Pads { top: number; bottom: number; left: number; right: number; H: number; W: number }

export function pad32(X: number, Y: number): Pads {
  const ph = (32 - (X % 32)) % 32, pw = (32 - (Y % 32)) % 32;
  const top = Math.floor(ph / 2), left = Math.floor(pw / 2);
  return { top, bottom: ph - top, left, right: pw - left, H: X + ph, W: Y + pw };
}

/** Slices with any brain voxel (python: np.abs(stack).max() > 0). */
export function brainSlices(mask: Uint8Array, dims: Dims): number[] {
  const [X, Y, Z] = dims, XY = X * Y, out: number[] = [];
  for (let z = 0; z < Z; z++) {
    for (let i = z * XY; i < (z + 1) * XY; i++) if (mask[i]) { out.push(z); break; }
  }
  return out;
}

/**
 * Build an (N, 2, H, W) padded batch for slices zs. Tensor element [n,c,x,y]
 * (H axis = RAS x, W axis = RAS y), matching numpy's (Z, C, X, Y) slice stack.
 * flipH/flipW implement the TTA flips of axes 2 and 3.
 */
export function buildBatch(ch: [Float32Array, Float32Array], dims: Dims, zs: number[], p: Pads,
                           flipH = false, flipW = false): Float32Array {
  const [X, Y] = dims, XY = X * Y, { H, W } = p;
  const out = new Float32Array(zs.length * 2 * H * W);
  zs.forEach((z, n) => {
    for (let c = 0; c < 2; c++) {
      const src = ch[c], base = (n * 2 + c) * H * W;
      for (let x = 0; x < X; x++) {
        const hx = flipH ? H - 1 - (x + p.top) : x + p.top;
        for (let y = 0; y < Y; y++) {
          const wy = flipW ? W - 1 - (y + p.left) : y + p.left;
          out[base + hx * W + wy] = src[x + y * X + z * XY];
        }
      }
    }
  });
  return out;
}

/** Undo pad + flip of model logits (N,1,H,W) and write sigmoid probs for slice n into view buffer. */
export function readLogits(logits: Float32Array, n: number, X: number, Y: number, p: Pads,
                           flipH: boolean, flipW: boolean, out: Float32Array): void {
  const { H, W } = p, base = n * H * W;
  for (let x = 0; x < X; x++) {
    const hx = flipH ? H - 1 - (x + p.top) : x + p.top;
    for (let y = 0; y < Y; y++) {
      const wy = flipW ? W - 1 - (y + p.left) : y + p.left;
      out[x + y * X] = 1 / (1 + Math.exp(-logits[base + hx * W + wy]));
    }
  }
}

export const TTA_VIEWS: [boolean, boolean][] = [[false, false], [true, false], [false, true], [true, true]];

/** Mean and std over views for one slice (std = sqrt(p(1-p)) without TTA). */
export function combineViews(views: Float32Array[], prob: Float32Array, unc: Float32Array, offset: number): void {
  const V = views.length, n = views[0].length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let v = 0; v < V; v++) s += views[v][i];
    const m = s / V;
    let ss = 0;
    if (V > 1) for (let v = 0; v < V; v++) { const d = views[v][i] - m; ss += d * d; }
    prob[offset + i] = m;
    unc[offset + i] = V > 1 ? Math.sqrt(ss / V) : Math.sqrt(m * (1 - m));
  }
}

/** Threshold, restrict to brain, drop 3D components (6-connectivity, like scipy.ndimage.label) < minVox. */
export function postprocess(prob: Float32Array, brain: Uint8Array, dims: Dims, threshold = 0.5,
                            minVox = 50): Uint8Array {
  const [X, Y, Z] = dims, XY = X * Y, n = prob.length;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = prob[i] >= threshold && brain[i] ? 1 : 0;
  if (minVox <= 0) return m;
  const seen = new Uint8Array(n), stack = new Int32Array(n), comp: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!m[s] || seen[s]) continue;
    let top = 0; stack[top++] = s; seen[s] = 1; comp.length = 0;
    while (top) {
      const i = stack[--top]; comp.push(i);
      const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / XY);
      const nb = [x > 0 ? i - 1 : -1, x < X - 1 ? i + 1 : -1, y > 0 ? i - X : -1,
                  y < Y - 1 ? i + X : -1, z > 0 ? i - XY : -1, z < Z - 1 ? i + XY : -1];
      for (const j of nb) if (j >= 0 && m[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
    }
    if (comp.length < minVox) for (const i of comp) m[i] = 0;
  }
  return m;
}
