/** Honest progress (UX-1): an animated scan, named stages with ticks, and a real fraction.
 *  Segmented, visible steps make waiting feel shorter than an unexplained spinner. */
import { Check } from "lucide-react";
import BrainScan from "./BrainScan";
import { useStore } from "../store";
import { cancelAnalysis } from "../lib/analyze";

const STAGES: [number, string][] = [[0.05, "Preparing scans"], [0.1, "Normalising intensity & orientation"], [0.3, "Segmenting every slice"], [0.95, "Building the tumor profile"]];

export default function Processing() {
  const { progress, mode } = useStore();
  if (!progress) return null;
  const pct = Math.round(progress.frac * 100);
  return (
    <div className="mx-auto grid max-w-[1000px] items-center gap-14 px-[5vw] py-16 md:grid-cols-2" role="status" aria-live="polite">
      <BrainScan className="mx-auto w-full max-w-[380px] shadow-[0_30px_80px_rgba(60,30,15,0.12)]" />
      <div>
        <p className="eyebrow">{mode === "private" ? "Running on this device" : "Analysing on the server"}</p>
        <p className="display mt-4 text-[clamp(30px,3.6vw,44px)]">{pct < 100 ? "Reading the scan…" : "Done."}</p>
        <p className="mt-3 min-h-[3em] text-[15px] text-ink-3">{progress.message}</p>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-terra transition-[width] duration-500 ease-[var(--ease-out-expo)]" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-8 space-y-3">
          {STAGES.map(([at, label], i) => {
            const next = STAGES[i + 1]?.[0] ?? 1.01;
            const state = progress.frac >= next ? "done" : progress.frac >= at ? "active" : "todo";
            return (
              <li key={label} className={`flex items-center gap-3 text-[15px] ${state === "todo" ? "text-ink-3" : "text-ink"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${state === "done" ? "bg-ink text-paper" : state === "active" ? "bg-terra-soft" : "bg-paper-2"}`}>
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "active" ? <span className="h-2 w-2 animate-pulse rounded-full bg-terra-ink" /> : null}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
        <p className="mt-8 text-[13px] text-ink-3">
          {mode === "private" ? "Nothing is being uploaded." : "Typically 5–15 s, plus ~30 s if the free server was asleep."}
        </p>
        <button className="pill-ghost mt-6 px-5 py-2.5 text-sm" onClick={cancelAnalysis}>Cancel</button>
      </div>
    </div>
  );
}
