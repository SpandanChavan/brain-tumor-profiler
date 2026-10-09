/** Result workspace (FR-A5..A12): controls · dark "reading room" viewer · results.
 *  The viewer keeps a dark surround (radiology convention: better perceived contrast);
 *  everything around it uses the warm paper system. */
import { useCallback, useEffect, useRef } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Download, FileText, Image as ImageIcon, LocateFixed, Trash2 } from "lucide-react";
import Viewer from "./Viewer";
import { useStore, type Layout } from "../store";
import { api } from "../lib/api";
// export helpers (jsPDF etc.) are loaded on first use, not with the workspace
const report = () => import("../lib/report");

const LAYOUTS: [Layout, string][] = [["multi", "4-up"], ["axial", "Axial"], ["coronal", "Coronal"], ["sagittal", "Sagittal"], ["render", "3D"]];
const SWATCH = { cyan: "#22d3ee", amber: "#fbbf24", magenta: "#e879f9" } as const;

export default function Workspace() {
  const st = useStore();
  const res = st.result!;
  const p = res.profile;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const onCanvas = useCallback((c: HTMLCanvasElement | null) => { canvas.current = c; }, []);
  const chart = res.area.map((a, z) => ({ z, cm2: +(a / 100).toFixed(2) }));
  const hasExpert = !!(res.labelUrl || res.labelRas);

  // FR-A16 keyboard shortcuts: O outline · U uncertainty · E expert · C contour/filled · 1-5 layouts · L largest slice
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "o") st.toggle("showMask");
      else if (k === "u") st.toggle("showUnc");
      else if (k === "e" && hasExpert) st.toggle("showCompare");
      else if (k === "c") st.setOutline(!useStore.getState().outline);
      else if (k === "l" && p.max_area_slice !== null) st.requestJump(p.max_area_slice);
      else if ("12345".includes(k) && k) st.setLayout(LAYOUTS[Number(k) - 1][0]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st, hasExpert, p.max_area_slice]);

  const screenshot = () => canvas.current?.toDataURL("image/png") ?? null;
  const savePng = () => {
    const u = screenshot();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u; a.download = "viewer.png"; a.click();
  };
  const newAnalysis = () => {
    if (res.jobId) void api.deleteResult(res.jobId);
    // release in-memory copies of uploaded files (object URLs) so the scan is really gone
    for (const s of [res.t1ce, res.flair]) if (s.url.startsWith("blob:")) URL.revokeObjectURL(s.url);
    st.setResult(null);
  };
  const layers: ["showMask" | "showUnc" | "showCompare", string][] = [["showMask", "AI outline (O)"], ["showUnc", "Uncertainty map (U)"]];
  if (hasExpert) layers.push(["showCompare", "AI vs expert (E)"]);

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-[2vw] pb-6 lg:grid-cols-[230px_1fr_340px]">
      {/* ---------------- controls */}
      <aside className="card order-3 h-fit space-y-6 p-5 text-sm lg:order-none" aria-label="Viewer controls">
        <button className="pill-ghost w-full px-4 py-2.5" onClick={newAnalysis}><ArrowLeft className="h-4 w-4" /> New analysis</button>
        <div>
          <span className="label">Layout (1–5)</span>
          <div className="flex flex-wrap gap-1">{LAYOUTS.map(([id, l]) => (
            <button key={id} className="seg" aria-pressed={st.layout === id} onClick={() => st.setLayout(id)}>{l}</button>))}
          </div>
        </div>
        <div>
          <span className="label">Sequence</span>
          <div className="flex gap-1">{(["flair", "t1ce"] as const).map((q) => (
            <button key={q} className="seg" aria-pressed={st.sequence === q} onClick={() => st.setSequence(q)}>{q === "flair" ? "FLAIR" : "T1ce"}</button>))}
          </div>
        </div>
        <div className="space-y-2.5">
          <span className="label">Layers</span>
          {layers.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2.5 text-ink-2"><input type="checkbox" className="h-4 w-4 accent-[#9c4a2f]" checked={st[k]} onChange={() => st.toggle(k)} /> {l}</label>
          ))}
          <p className="rounded-xl bg-paper-2 p-3 text-[12px] leading-snug text-ink-3">Tip: look at the scan without the outline first, so the AI doesn’t anchor your judgment.</p>
        </div>
        <div className="space-y-3">
          <span className="label">Outline style</span>
          <div className="flex gap-1">
            <button className="seg" aria-pressed={st.outline} onClick={() => st.setOutline(true)}>Contour</button>
            <button className="seg" aria-pressed={!st.outline} onClick={() => st.setOutline(false)}>Filled</button>
          </div>
          <input type="range" min={0.15} max={0.9} step={0.05} value={st.opacity} onChange={(e) => st.setOpacity(+e.target.value)} className="w-full accent-[#9c4a2f]" aria-label="Overlay opacity" />
          <div className="flex gap-2" role="radiogroup" aria-label="Outline colour (colour-blind safe)">
            {(["cyan", "amber", "magenta"] as const).map((c) => (
              <button key={c} role="radio" aria-checked={st.palette === c} onClick={() => st.setPalette(c)} title={c} aria-label={c}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-white transition ${st.palette === c ? "ring-2 ring-ink" : ""}`}
                style={{ background: SWATCH[c] }} />
            ))}
          </div>
        </div>
        {st.showCompare && (
          <div className="space-y-1.5 text-xs text-ink-2">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#22d3ee]" /> both agree</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#fbbf24]" /> AI only (extra)</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#e879f9]" /> expert only (missed)</div>
          </div>
        )}
        {st.showUnc && <p className="text-xs leading-relaxed text-ink-3">Coloured = the AI’s predictions disagree when the scan is flipped; brighter = more unsure. Check these areas most carefully.</p>}
      </aside>

      {/* ---------------- viewer (reading room) */}
      <section className="order-1 min-h-[60vh] overflow-hidden lg:order-none lg:min-h-[72vh] rounded-3xl bg-room p-2 shadow-[0_30px_80px_rgba(30,15,8,0.25)]" aria-label="Scan viewer">
        <Viewer result={res} onCanvas={onCanvas} />
      </section>

      {/* ---------------- results */}
      <aside className="order-2 space-y-4 lg:order-none" aria-label="Results">
        {res.synthetic && (
          <div className="rounded-2xl border border-amber-900/10 bg-amber-50 p-3.5 text-[13px] leading-snug text-amber-950">
            <b>Demo weights</b> trained on synthetic phantoms. They test the pipeline only; outlines on real scans mean nothing yet.
          </div>
        )}
        <div className="card">
          <p className="eyebrow">{res.mode === "private" ? `on device · ${res.backend?.toUpperCase()}` : "server · in memory"}</p>
          <h2 className="mt-2 font-serif text-[22px] leading-snug text-ink">{p.detected ? "Region suggestive of tumor identified" : "No tumor region detected by the model"}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            {p.detected ? "AI suggestion. Clinical review required. Check the outline, especially where the uncertainty map is bright."
              : "This does not rule out disease. The model can miss small or unusual lesions."}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="chip">{res.seconds.toFixed(1)} s</span>
            <span className="chip">{res.label}</span>
          </div>
        </div>

        {res.warnings.map((w) => <div key={w} className="rounded-2xl bg-sky-50 p-3.5 text-[13px] text-sky-950">{w}</div>)}
        {res.deid?.map((d, i) => (
          <div key={i} className="rounded-2xl bg-emerald-50 p-3.5 text-[13px] text-emerald-950">
            {d.removed < 0 ? "DICOM converted on this device: all header fields were dropped; only pixels and geometry were kept." : `Removed ${d.removed} identifying DICOM attributes before processing.`}
            {d.burned_in_annotation && " ⚠ Flagged: text may be burned into the pixels."}
          </div>
        ))}

        {p.detected && (
          <div className="card space-y-4">
            <p className="eyebrow">Tumor profile · estimates</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["Volume", `${p.volume_ml.toFixed(1)} mL`],
                ["Approx. side", p.hemisphere],
                ["Slices", `${p.n_tumor_slices} / ${p.n_slices}`],
                ["Axial range", p.slice_range ? `${p.slice_range[0]}–${p.slice_range[1]}` : "—"],
                ["Largest section", `${(p.max_area_mm2 / 100).toFixed(1)} cm²`],
                ["Extent (mm)", p.extent_mm ? p.extent_mm.map((e) => e.toFixed(0)).join(" × ") : "—"],
                ["Regions", String(p.n_components)],
                ["Mean uncertainty", p.mean_uncertainty !== null ? p.mean_uncertainty.toFixed(3) : "—"],
              ].map(([k, v]) => (<div key={k}><dt className="text-[11px] text-ink-3">{k}</dt><dd className="font-serif text-lg text-ink">{v}</dd></div>))}
            </dl>
            <div className="h-28" role="img" aria-label="Chart: tumor area per axial slice (click to jump to a slice)">
              <ResponsiveContainer>
                <AreaChart data={chart} onClick={(e) => { const z = Number(e?.activeLabel); if (!Number.isNaN(z)) st.requestJump(z); }}>
                  <XAxis dataKey="z" tick={{ fontSize: 10, fill: "#6b625c" }} />
                  <YAxis width={28} tick={{ fontSize: 10, fill: "#6b625c" }} />
                  <Tooltip contentStyle={{ background: "#fef9ed", border: "1px solid #e7dfd1", borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} cm²`, "area"]} labelFormatter={(z) => `slice ${z}`} />
                  <Area dataKey="cm2" stroke="#9c4a2f" fill="#c4684b" fillOpacity={0.18} isAnimationActive={false} />
                  <ReferenceLine x={st.slice} stroke="#2e2a26" strokeDasharray="3 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <button className="pill-ghost w-full px-4 py-2.5 text-sm" onClick={() => p.max_area_slice !== null && st.requestJump(p.max_area_slice)}>
              <LocateFixed className="h-4 w-4" /> Jump to largest slice ({p.max_area_slice})
            </button>
          </div>
        )}

        {res.agreement && (
          <div className="card">
            <p className="eyebrow">Agreement with the expert outline</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div><dt className="text-[11px] text-ink-3">Dice</dt><dd className="font-serif text-lg text-ink">{res.agreement.dice.toFixed(3)}</dd></div>
              <div><dt className="text-[11px] text-ink-3">HD95</dt><dd className="font-serif text-lg text-ink">{res.agreement.hd95_mm != null ? `${res.agreement.hd95_mm.toFixed(1)} mm` : "—"}</dd></div>
              <div><dt className="text-[11px] text-ink-3">Sensitivity</dt><dd className="font-serif text-lg text-ink">{res.agreement.sensitivity?.toFixed(3) ?? "—"}</dd></div>
            </dl>
          </div>
        )}

        <div className="card space-y-3">
          <p className="eyebrow">Export · no patient metadata</p>
          <div className="grid grid-cols-3 gap-2">
            <button className="pill-ghost px-2 py-2.5 text-sm" onClick={async () => { const r = await report(); r.downloadBlob(await r.maskNiftiBlob(res), "tumor_mask.nii.gz"); }}><Download className="h-4 w-4" /> Mask</button>
            <button className="pill-ghost px-2 py-2.5 text-sm" onClick={savePng}><ImageIcon className="h-4 w-4" /> PNG</button>
            <button className="pill-ghost px-2 py-2.5 text-sm" onClick={async () => { const shot = screenshot(); const r = await report(); r.downloadBlob(r.buildReport(res, shot), "tumor_summary.pdf"); }}><FileText className="h-4 w-4" /> PDF</button>
          </div>
          <button className="pill w-full bg-rose-50 px-4 py-2.5 text-sm text-rose-900 hover:bg-rose-100" onClick={newAnalysis}><Trash2 className="h-4 w-4" /> Delete my data now</button>
          <p className="text-[12px] leading-relaxed text-ink-3">{res.mode === "private" ? "Nothing was uploaded. Closing the tab discards everything." : "Server copies expire automatically within 10 minutes; this button deletes them immediately."}</p>
        </div>
      </aside>
    </div>
  );
}
