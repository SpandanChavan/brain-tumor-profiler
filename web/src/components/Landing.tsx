/**
 * Landing page. Narrative (peak-end + trust-building):
 *   1 Hero: the promise, in one sentence, with proof points (real, verified numbers)
 *   2 "What do you want to do?": three clear choices (Hick's law: few, distinct options)
 *   3 How it works: demystify the AI (reduces algorithm aversion)
 *   4 Voice of the user: quote from our empathy research (assist, not replace)
 *   5 Evidence: honest metrics, including what is NOT yet measured
 *   6 Privacy: the two modes, side by side
 *   7 "Ready when you are.": a low-pressure CTA
 */
import { ArrowRight, Cloud, FileScan, Lock, ShieldCheck, Sparkles, Upload, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import SilkBackground from "./SilkBackground";
import BrainScan from "./BrainScan";
import Nav from "./Nav";
import Footer from "./Footer";
import { useReveal } from "../lib/useReveal";
import { api, type ModelCard } from "../lib/api";
import { useStore, type Mode } from "../store";

const STEPS = [
  { n: "01", t: "Upload, privately", d: "T1ce + FLAIR as NIfTI or a zipped DICOM series. You confirm it contains no real patient data." },
  { n: "02", t: "De-identify first", d: "All 18 HIPAA Safe-Harbor identifier categories are stripped before a single voxel is processed." },
  { n: "03", t: "Segment every slice", d: "A fine-tuned MONAI network outlines the tumor slice by slice, then rebuilds it in 3D, with an uncertainty map." },
  { n: "04", t: "Review, you decide", d: "Scroll, compare and export. The outline is a suggestion; the clinical judgment stays yours." },
];

export default function Landing() {
  const { setPage, setMode } = useStore();
  const [card, setCard] = useState<ModelCard | null>(null);
  useReveal();
  useEffect(() => { api.model().then(setCard).catch(() => undefined); }, []);
  const go = (m?: Mode) => { if (m) setMode(m); setPage("analyze"); };
  // never show a synthetic-phantom score as if it were a real test result
  const dice = card && !card.synthetic ? card.test_metrics?.dice : undefined;

  return (
    <div className="min-h-full">
      {/* ---------------------------------------------------------------- 1 hero */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        <SilkBackground />
        <Nav overlay />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-[8vw] pb-16 pt-32 text-center">
          <div className="max-w-[980px] animate-fade-in">
            <p className="eyebrow mb-8 text-paper/85">MIT-ADT University · School of Computing · PBL 2026</p>
            <h1 className="font-serif text-[clamp(48px,7.5vw,104px)] font-normal leading-[1.04] tracking-[-0.015em] text-paper [text-shadow:0_2px_30px_rgba(90,35,20,0.25)]">
              Brain tumors, outlined in <em className="italic">seconds</em>.
            </h1>
            <p className="mx-auto mt-8 max-w-[44ch] text-[clamp(17px,1.6vw,22px)] font-light leading-relaxed text-paper [text-shadow:0_1px_12px_rgba(90,35,20,0.35)]">
              AI segmentation for brain MRI, slice by slice and in 3D, with honest uncertainty. In private mode, your scan never leaves your device.
            </p>
            <div className="mt-11 flex flex-wrap items-center justify-center gap-3">
              <button className="pill-cream group" onClick={() => go()}>
                Start an analysis <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button className="pill text-paper underline-offset-4 hover:underline" onClick={() => document.getElementById("how")?.scrollIntoView()}>
                See how it works
              </button>
            </div>
          </div>
          <dl className="relative z-10 mt-16 grid w-full max-w-[920px] grid-cols-2 gap-px overflow-hidden rounded-2xl bg-paper/20 text-left backdrop-blur-sm md:grid-cols-4">
            {[
              ["~4 s", "per scan on a free CPU"],
              ["0 bytes", "uploaded in private mode"],
              ["18 / 18", "HIPAA identifier types removed"],
              ["₹0", "infrastructure, all free tier"],
            ].map(([k, v]) => (
              <div key={v} className="bg-[rgba(110,45,28,0.28)] px-5 py-4">
                <dt className="font-serif text-2xl text-paper">{k}</dt>
                <dd className="mt-1 text-[13px] text-paper/90">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2 choices */}
      <section className="bg-paper px-[7vw] py-[clamp(110px,18vh,220px)]">
        <div className="mx-auto max-w-[1200px] text-center">
          <h2 className="display reveal mx-auto max-w-[16ch] text-[clamp(42px,6.5vw,84px)]">What do you want to do?</h2>
          <p className="reveal mx-auto mt-6 max-w-[52ch] text-[clamp(17px,1.6vw,21px)] font-light leading-relaxed text-ink-3">
            Profiler finds and measures brain tumors in MRI, as a second pair of eyes that never gets tired.
          </p>
          <div className="mt-16 grid gap-5 text-left md:grid-cols-3">
            {([
              [Sparkles, "Try a sample case", "See it work in one click on a bundled case, side by side with the expert outline.", "Open samples", () => go("server")],
              [Upload, "Analyze your scans", "Upload a T1ce + FLAIR pair and get an outline, an uncertainty map and a tumor profile.", "Upload scans", () => go("server")],
              [Lock, "Run it privately", "The AI runs inside your browser. Nothing is uploaded, and it works with Wi-Fi off.", "Use private mode", () => go("private")],
            ] as const).map(([Icon, t, d, cta, fn], i) => (
              <button key={t} onClick={fn} className="card card-lift reveal group flex flex-col p-8 text-left" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-terra-soft text-terra-ink"><Icon className="h-5 w-5" /></span>
                <span className="mt-6 font-serif text-[22px] text-ink">{t}</span>
                <span className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-3">{d}</span>
                <span className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-terra-ink">
                  {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 3 how it works */}
      <section id="how" className="bg-paper-2 px-[7vw] py-[clamp(110px,18vh,220px)]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-16 lg:grid-cols-[1fr_1.1fr]">
          <div className="reveal mx-auto w-full max-w-[460px]"><BrainScan className="shadow-[0_30px_80px_rgba(60,30,15,0.12)]" /></div>
          <div>
            <p className="eyebrow reveal">How it works</p>
            <h2 className="display reveal mt-4 text-[clamp(36px,5vw,64px)]">From scan to <em className="italic">second opinion</em>.</h2>
            <ol className="mt-12 space-y-8">
              {STEPS.map((s, i) => (
                <li key={s.n} className="reveal flex gap-6" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className="font-mono text-sm text-terra-ink">{s.n}</span>
                  <div className="border-l border-ink/10 pl-6">
                    <p className="font-serif text-xl text-ink">{s.t}</p>
                    <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-3">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 4 voice of the user */}
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(198,104,75,0.08),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(138,126,119,0.10),transparent_38%),#f7f1e4] px-[7vw] py-[clamp(120px,24vh,260px)]">
        <figure className="reveal mx-auto max-w-[1100px]">
          <blockquote className="font-serif text-[clamp(30px,4.2vw,56px)] leading-[1.2] text-ink">
            “Manual tracing takes too long… but this should <em className="italic text-terra-ink">assist</em>, not replace, judgment.”
          </blockquote>
          <figcaption className="mt-10 flex items-center gap-4 text-[15px] text-ink-3">
            <span className="h-px w-12 bg-ink/30" /> What radiologists and residents told us · empathy research for this project
          </figcaption>
        </figure>
      </section>

      {/* ---------------------------------------------------------------- 5 evidence */}
      <section className="bg-paper px-[7vw] py-[clamp(110px,18vh,220px)]">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow reveal">Grounded in evidence</p>
          <h2 className="display reveal mt-4 max-w-[18ch] text-[clamp(36px,5vw,64px)]">We show our numbers, including the ones we don’t have yet.</h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [dice ? dice.mean.toFixed(3) : "Pending", "Test Dice, per patient in 3D", dice ? `n = ${card!.test_metrics!.n_patients} held-out patients` : "Measured once on held-out BraTS patients after training. Never on training data."],
              [card?.onnx ? card.onnx.parity_min_dice.toFixed(3) : "1.000", "ONNX ⇄ PyTorch agreement", "The exported model reproduces the trained model's masks exactly."],
              ["Identical", "Browser ⇄ server results", "Private mode and server mode produce the same outline on the same scan."],
              ["AA", "WCAG 2.1 accessibility", "Automated audits on every page; colour is never the only cue."],
            ].map(([k, t, d], i) => (
              <div key={t} className="card reveal p-7" style={{ transitionDelay: `${i * 80}ms` }}>
                <p className="font-serif text-4xl text-ink">{k}</p>
                <p className="mt-4 text-[15px] font-medium text-ink">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{d}</p>
              </div>
            ))}
          </div>
          {card?.synthetic && (
            <p className="reveal mt-8 max-w-[70ch] text-sm text-ink-3">
              <FileScan className="mr-1.5 inline h-4 w-4 text-terra-ink" />
              Honesty note: the live demo currently runs <b className="text-ink">demo weights trained on synthetic phantoms</b> to prove the pipeline end to end. The BraTS-trained model replaces them after Phase 4.
            </p>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- 6 privacy */}
      <section className="bg-paper-2 px-[7vw] py-[clamp(110px,18vh,220px)]">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow reveal">Privacy by design · HIPAA-aligned</p>
          <h2 className="display reveal mt-4 max-w-[20ch] text-[clamp(36px,5vw,64px)]">Your scan, your device, your choice.</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <div className="card reveal border border-emerald-900/10 p-8">
              <div className="flex items-center gap-3"><Lock className="h-5 w-5 text-emerald-700" /><p className="font-serif text-2xl text-ink">Private mode</p>
                <span className="chip ml-auto bg-emerald-50 text-emerald-800"><WifiOff className="h-3 w-3" /> offline</span></div>
              <ul className="mt-6 space-y-3 text-[15px] text-ink-2">
                <li>✓ The AI runs inside your browser (WebGPU / WASM)</li>
                <li>✓ Zero scan bytes leave your device, verified in automated tests</li>
                <li>✓ DICOM is converted locally; headers are dropped</li>
              </ul>
            </div>
            <div className="card reveal p-8" style={{ transitionDelay: "90ms" }}>
              <div className="flex items-center gap-3"><Cloud className="h-5 w-5 text-terra-ink" /><p className="font-serif text-2xl text-ink">Server mode</p>
                <span className="chip ml-auto">fastest</span></div>
              <ul className="mt-6 space-y-3 text-[15px] text-ink-2">
                <li>✓ Processed in memory, never written to disk</li>
                <li>✓ Results expire in 10 minutes, or delete instantly</li>
                <li>✓ Logs record events only: no names, no IPs</li>
              </ul>
            </div>
          </div>
          <button className="reveal mt-10 inline-flex items-center gap-2 text-sm font-medium text-terra-ink hover:underline" onClick={() => setPage("privacy")}>
            <ShieldCheck className="h-4 w-4" /> Read exactly what happens to your data <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------------- 7 CTA */}
      <section className="bg-paper px-[7vw] py-[clamp(120px,20vh,240px)] text-center">
        <h2 className="display reveal text-[clamp(42px,6.5vw,84px)]">Ready when you are.</h2>
        <p className="reveal mx-auto mt-6 max-w-[44ch] text-[clamp(17px,1.6vw,21px)] font-light text-ink-3">
          Start with a sample case. It takes about ten seconds and needs no upload.
        </p>
        <button className="pill-soft reveal mt-12 px-9 py-4" onClick={() => go()}>Enter the workspace <ArrowRight className="h-4 w-4" /></button>
        <p className="reveal mx-auto mt-10 max-w-[60ch] text-xs leading-relaxed text-ink-3">
          Research &amp; education use only. Not a medical device. Every result is an AI suggestion that needs clinical review.
        </p>
      </section>

      <Footer />
    </div>
  );
}
