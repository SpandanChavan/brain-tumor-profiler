/**
 * NiiVue viewer (FR-A5..A9): 2D / multiplanar / 3D, contour or filled overlays,
 * uncertainty and AI-vs-expert layers. GPU-rendered, so scrolling is 60 fps (NFR-2).
 */
import { useEffect, useRef, useState } from "react";
import { Niivue, NVImage, SLICE_TYPE } from "@niivue/niivue";
import { useStore, type Layout, type Result } from "../store";
import { comparisonRas, fromRas, shellRas, toRas } from "../lib/volume";

const PALETTE = { cyan: [34, 211, 238], amber: [251, 191, 36], magenta: [232, 121, 249] } as const;
const SLICE: Record<Layout, SLICE_TYPE> = {
  axial: SLICE_TYPE.AXIAL, coronal: SLICE_TYPE.CORONAL, sagittal: SLICE_TYPE.SAGITTAL,
  multi: SLICE_TYPE.MULTIPLANAR, render: SLICE_TYPE.RENDER,
};

function solid(nv: Niivue, key: string, rgb: readonly number[]) {
  nv.addColormap(key, { R: [0, rgb[0]], G: [0, rgb[1]], B: [0, rgb[2]], A: [0, 255], I: [0, 255] });
}

function registerColormaps(nv: Niivue) {
  for (const [k, v] of Object.entries(PALETTE)) solid(nv, `btp_${k}`, v);
  // 0 none · 1 TP cyan · 2 FP amber · 3 FN magenta
  nv.addColormap("btp_compare", {
    R: [0, 34, 251, 232], G: [0, 211, 191, 121], B: [0, 238, 36, 249], A: [0, 255, 255, 255], I: [0, 85, 170, 255],
  });
}

interface Overlays { mask: NVImage; contour: NVImage; unc: NVImage; compare?: NVImage }

async function buildOverlays(res: Result, base: NVImage): Promise<Overlays> {
  if (res.mode === "private") {
    const mask = fromRas(base, res.maskRas!, "AI outline", "btp_cyan", 0, 1);
    const unc = fromRas(base, res.uncRas!, "Uncertainty", "inferno", 25, 140, 0.8);
    const compare = res.labelRas ? fromRas(base, comparisonRas(res.maskRas!, res.labelRas), "AI vs expert", "btp_compare", 0, 3, 0.75) : undefined;
    const contour = fromRas(base, shellRas(res.maskRas!, toRas(base).dims), "AI contour", "btp_cyan", 0, 1, 1);
    return { mask, contour, unc, compare };
  }
  const load = (url: string, name: string, cm: string, mn: number, mx: number, op: number) =>
    NVImage.loadFromUrl({ url, name: `${name}.nii.gz`, colormap: cm, cal_min: mn, cal_max: mx, opacity: op, trustCalMinMax: true });
  const [mask, unc] = await Promise.all([
    load(res.maskUrl!, "mask", "btp_cyan", 0, 1, 0.6),
    load(res.uncUrl!, "uncertainty", "inferno", 25, 140, 0.8),
  ]);
  let compare: NVImage | undefined;
  if (res.labelUrl) {
    const label = await NVImage.loadFromUrl({ url: res.labelUrl, name: "label.nii.gz" });
    compare = fromRas(mask, comparisonRas(toRas(mask).data, toRas(label).data), "AI vs expert", "btp_compare", 0, 3, 0.75);
  }
  for (const v of [mask, unc]) v.ignoreZeroVoxels = true;
  const m = toRas(mask);
  const contour = fromRas(mask, shellRas(m.data, m.dims), "AI contour", "btp_cyan", 0, 1, 1);
  return { mask, contour, unc, compare };
}

export default function Viewer({ result, onCanvas }: { result: Result; onCanvas?: (c: HTMLCanvasElement | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const overlays = useRef<Overlays | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const s = useStore();

  // create NiiVue once
  useEffect(() => {
    const nv = new Niivue({
      backColor: [0.082, 0.067, 0.059, 1], crosshairColor: [0.98, 0.75, 0.14, 0.9], show3Dcrosshair: true,
      isColorbar: false, isOrientCube: true, textHeight: 0.035, isRadiologicalConvention: true,
      loadingText: "Loading scan…", multiplanarForceRender: true,
    });
    nvRef.current = nv;
    if (import.meta.env.DEV) (window as unknown as { __nv: Niivue }).__nv = nv; // debugging only
    nv.attachToCanvas(canvasRef.current!).then(() => {
      registerColormaps(nv);
      nv.setMultiplanarLayout(2); // 2x2 grid: axial, coronal, sagittal, 3D
    });
    nv.onLocationChange = (loc: unknown) => {
      // frac is the crosshair position in RAS texture space (0..1): z -> axial slice index
      const frac = (loc as { frac?: ArrayLike<number> }).frac;
      const Z = useStore.getState().result?.profile.n_slices;
      if (frac && Z) useStore.getState().setSlice(Math.min(Z - 1, Math.max(0, Math.floor(frac[2] * Z))));
    };
    onCanvas?.(canvasRef.current);
    return () => { nv.cleanup?.(); nvRef.current = null; onCanvas?.(null); };
  }, [onCanvas]);

  // (re)load volumes when the result or background sequence changes
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        await nv.loadVolumes([{ url: result[s.sequence].url, name: result[s.sequence].name }]);
        if (cancelled) return;
        overlays.current = await buildOverlays(result, nv.volumes[0]);
        if (cancelled) return;
        const o = overlays.current;
        for (const v of [o.mask, o.contour, o.unc, o.compare]) if (v) nv.addVolume(v);
        applySettings();
        const z = result.profile.max_area_slice;
        if (z !== null) jump(z);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not display the scan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, s.sequence]);

  function jump(z: number) {
    const nv = nvRef.current;
    if (!nv || !nv.volumes[0]) return;
    const Z = result.profile.n_slices;
    nv.scene.crosshairPos = [nv.scene.crosshairPos[0] ?? 0.5, nv.scene.crosshairPos[1] ?? 0.5, (z + 0.5) / Z];
    nv.drawScene();
    useStore.getState().setSlice(z);
  }

  function applySettings() {
    const nv = nvRef.current, o = overlays.current;
    if (!nv || !o) return;
    const st = useStore.getState();
    nv.setSliceType(SLICE[st.layout]);
    const showAi = st.showMask && !st.showCompare;
    o.mask.colormap = o.contour.colormap = `btp_${st.palette}`;
    // contour mode: crisp 1-voxel ring + a faint tint (slider); filled mode: tint only
    o.contour.opacity = showAi && st.outline ? 1 : 0;
    o.mask.opacity = showAi ? (st.outline ? st.opacity * 0.25 : st.opacity) : 0;
    o.unc.opacity = st.showUnc ? 0.85 : 0;
    if (o.compare) o.compare.opacity = st.showCompare ? 0.75 : 0;
    nv.updateGLVolume();
  }

  useEffect(applySettings, [s.layout, s.outline, s.opacity, s.palette, s.showMask, s.showUnc, s.showCompare]);

  useEffect(() => {
    if (s.jumpTo !== null) { jump(s.jumpTo); useStore.getState().requestJump(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.jumpTo]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-[1.25rem] bg-room">
      <canvas ref={canvasRef} className="h-full w-full outline-none" aria-label="MRI viewer. Scroll to change slice, drag to move the crosshair." />
      {loading && !error && (
        <div className="absolute inset-0 grid place-items-center bg-room/70 font-mono text-xs uppercase tracking-[0.2em] text-[#cfc6ba]">Loading scan…</div>
      )}
      {error && <div className="absolute inset-x-4 top-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
      <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b5aa9c]">
        Radiological view (patient's right on screen left) · scroll = slice · right-drag = contrast
      </div>
    </div>
  );
}
