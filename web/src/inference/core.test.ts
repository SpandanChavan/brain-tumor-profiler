import { describe, expect, it } from "vitest";
import { brainMask, buildBatch, combineViews, pad32, postprocess, readLogits, zscore, type Dims } from "./core";
import { computeProfile } from "../lib/profile";

describe("preprocessing (mirrors btp.preprocessing.volume)", () => {
  it("z-scores brain voxels only", () => {
    const v = [0, 0, 100, 200, 300, 0];
    const m = brainMask(v, v);
    const z = zscore(v, m);
    const inside = [z[2], z[3], z[4]];
    const mean = inside.reduce((a, b) => a + b) / 3;
    const std = Math.sqrt(inside.reduce((a, b) => a + (b - mean) ** 2, 0) / 3);
    expect(mean).toBeCloseTo(0, 6);
    expect(std).toBeCloseTo(1, 5);
    expect([z[0], z[1], z[5]]).toEqual([0, 0, 0]);
  });

  it("pads to multiples of 32, centred like numpy", () => {
    expect(pad32(240, 240)).toMatchObject({ top: 8, bottom: 8, H: 256, W: 256 });
    expect(pad32(96, 96)).toMatchObject({ top: 0, bottom: 0, H: 96 });
    expect(pad32(33, 64)).toMatchObject({ top: 15, bottom: 16, H: 64, W: 64 });
  });
});

describe("batch layout + flips", () => {
  const dims: Dims = [3, 2, 2];
  const a = Float32Array.from({ length: 12 }, (_, i) => i + 1);
  const b = Float32Array.from({ length: 12 }, (_, i) => -(i + 1));
  const p = pad32(3, 2);

  it("places RAS voxel (x,y,z) at tensor [n,c,x+top,y+left]", () => {
    const t = buildBatch([a, b], dims, [1], p);
    const { H, W } = p;
    // voxel x=2,y=1,z=1 -> flat 2 + 1*3 + 1*6 = 11 -> value 12
    expect(t[(0 * 2 + 0) * H * W + (2 + p.top) * W + (1 + p.left)]).toBe(12);
    expect(t[(0 * 2 + 1) * H * W + (2 + p.top) * W + (1 + p.left)]).toBe(-12);
  });

  it("flip then un-flip is identity", () => {
    for (const [fh, fw] of [[true, false], [false, true], [true, true]] as [boolean, boolean][]) {
      const t = buildBatch([a, a], dims, [0], p, fh, fw);
      // treat channel 0 values as logits; readLogits returns sigmoid(original values) per voxel
      const out = new Float32Array(6);
      const logits = t.subarray(0, p.H * p.W);
      readLogits(logits, 0, 3, 2, p, fh, fw, out);
      for (let i = 0; i < 6; i++) expect(out[i]).toBeCloseTo(1 / (1 + Math.exp(-a[i])), 6);
    }
  });

  it("combines TTA views into mean and population std", () => {
    const prob = new Float32Array(1), unc = new Float32Array(1);
    combineViews([Float32Array.of(0.2), Float32Array.of(0.4)], prob, unc, 0);
    expect(prob[0]).toBeCloseTo(0.3, 6);
    expect(unc[0]).toBeCloseTo(0.1, 6);
  });
});

describe("postprocess (mirrors btp.inference.postprocess)", () => {
  it("keeps big components, drops small ones, respects brain", () => {
    const dims: Dims = [10, 10, 10];
    const prob = new Float32Array(1000), brain = new Uint8Array(1000).fill(1);
    for (let z = 2; z < 6; z++) for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) prob[x + y * 10 + z * 100] = 0.9;
    prob[9 + 9 * 10 + 9 * 100] = 0.99; // isolated voxel
    const m = postprocess(prob, brain, dims, 0.5, 10);
    expect(m.reduce((s, v) => s + v, 0)).toBe(64);
    brain.fill(0);
    expect(postprocess(prob, brain, dims, 0.5, 0).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

describe("profile (mirrors btp.profiling.profile)", () => {
  it("computes volume, range, side and extent", () => {
    const dims: Dims = [40, 40, 20];
    const mask = new Uint8Array(40 * 40 * 20), brain = new Uint8Array(mask.length).fill(1);
    for (let z = 5; z < 10; z++) for (let y = 10; y < 20; y++) for (let x = 25; x < 35; x++) mask[x + y * 40 + z * 1600] = 1;
    const { profile } = computeProfile(mask, dims, [1, 1, 2], brain);
    expect(profile.volume_ml).toBeCloseTo(1.0, 9);
    expect(profile.slice_range).toEqual([5, 9]);
    expect(profile.hemisphere).toBe("Right");
    expect(profile.extent_mm).toEqual([10, 10, 10]);
    expect(profile.n_components).toBe(1);
  });
});
