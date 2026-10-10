/** Analyze: consent (PR-5) → where the AI runs → sample or upload (FR-A1..A3, UX-3).
 *  One decision per row, top to bottom, to keep cognitive load low. */
import { useEffect, useState } from "react";
import { ArrowRight, Check, Cloud, FileUp, Lock, Sparkles, WifiOff } from "lucide-react";
import { api, CancelledError, type Sample } from "../lib/api";
import { analyze, isModelCached, preparePrivateMode, sourceFromFile, type Inputs } from "../lib/analyze";
import { useStore } from "../store";
import UploadPicker from "./UploadPicker";

function Step({ n, title, children, done }: { n: string; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="grid gap-6 border-t border-ink/10 py-10 md:grid-cols-[220px_1fr]">
      <div className="flex items-start gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] ${done ? "bg-ink text-paper" : "bg-paper-2 text-ink-2"}`}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <h2 className="pt-0.5 font-serif text-xl text-ink">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function StartScreen() {
  const st = useStore();
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [sampleErr, setSampleErr] = useState<string | null>(null);
  const [t1, setT1] = useState<File | null>(null);
  const [fl, setFl] = useState<File | null>(null);
  // private mode: is the model already on this device (offline-ready)?
  const [cached, setCached] = useState<boolean | null>(null);
  const [prep, setPrep] = useState<string | null>(null);
  useEffect(() => { if (st.mode === "private") void isModelCached().then(setCached); }, [st.mode]);
  const prepareOffline = async () => {
    setPrep("Starting download…");
    try {
      await preparePrivateMode((p) => setPrep(p.message));
      setCached(await isModelCached());
      setPrep(null);
    } catch (e) {
      setPrep(e instanceof Error ? e.message : "Download failed. Please try again.");
    }
  };

  useEffect(() => {
    api.samples().then(setSamples).catch(() => setSampleErr("Sample cases come from the analysis server, which is waking up or offline. Try again in ~30 s."));
  }, []);

  async function run(inp: Inputs) {
    st.setError(null);
    st.setProgress({ frac: 0.01, message: "Starting…" });
    try {
      st.setResult(await analyze(st.mode, inp, st.tta, st.setProgress));
    } catch (e) {
      if (e instanceof CancelledError) return; // user chose to stop: no error banner
      console.error("analysis failed", e);
      const msg = e instanceof Error ? e.message : String(e ?? "");
      st.setError(msg || "The analysis failed unexpectedly. Please try again, or use the other mode.");
    } finally {
      st.setProgress(null);
    }
  }

  const runSample = (s: Sample) => run({
    label: `Sample ${s.id}`, sampleId: s.id,
    t1ce: { url: api.sampleUrl(s.id, "t1ce"), name: `${s.id}_t1ce.nii.gz` },
    flair: { url: api.sampleUrl(s.id, "flair"), name: `${s.id}_flair.nii.gz` },
    seg: s.has_label ? { url: api.sampleUrl(s.id, "seg"), name: `${s.id}_seg.nii.gz` } : undefined,
  });
  const runUpload = () => {
    if (!t1 || !fl) return;
    // common slip: the same file picked for both sequences gives a confident but meaningless result
    if (t1.name === fl.name && t1.size === fl.size && t1.lastModified === fl.lastModified) {
      st.setError("You selected the same file for T1ce and FLAIR. Please choose the two different sequences of the same scan.");
      return;
    }
    void run({ label: "Your upload", t1ce: sourceFromFile(t1), flair: sourceFromFile(fl), files: { t1ce: t1, flair: fl } });
  };

  return (
    <div className="mx-auto max-w-[1100px] px-[5vw] pb-24 pt-10">
      <p className="eyebrow animate-fade-in">Workspace · new analysis</p>
      <h1 className="display mt-4 animate-fade-in text-[clamp(38px,5.5vw,68px)]">Find and profile brain tumors in MRI, <em className="italic">in seconds</em>.</h1>
      <p className="mt-5 max-w-[60ch] animate-fade-in text-[17px] font-light leading-relaxed text-ink-3">
        Three quick steps. You get an AI outline on every slice and in 3D, a map of where the AI is unsure, and an estimated tumor profile.
      </p>

      {st.error && (
        <div role="alert" className="mt-8 rounded-2xl border border-rose-900/15 bg-rose-50 p-4 text-sm text-rose-900">{st.error}</div>
      )}

      <div className="mt-12">
        <Step n="1" title="Confirm" done={st.consent}>
          <label className="card flex cursor-pointer items-start gap-4 p-5">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#9c4a2f]" checked={st.consent} onChange={(e) => st.setConsent(e.target.checked)} />
            <span className="text-[15px] leading-relaxed text-ink-2">
              I confirm these files contain <b className="text-ink">no real, identifiable patient data</b>, and I understand the results are AI suggestions for research and education only.
            </span>
          </label>
        </Step>

        <Step n="2" title="Where should the AI run?" done={st.consent}>
          <div className="grid gap-4 md:grid-cols-2" role="group" aria-label="Where should the AI run?">
            {([
              ["server", Cloud, "Server mode", "Fastest. Processed in memory on our free server and deleted within 10 minutes."],
              ["private", Lock, "Private mode", "Runs inside your browser. Your scan never leaves this device, and it works offline (~21 MB model, downloaded once)."],
            ] as const).map(([id, Icon, title, text]) => (
              <button key={id} onClick={() => st.setMode(id)} aria-pressed={st.mode === id}
                className="card card-lift border-2 border-transparent p-6 text-left aria-pressed:border-ink">
                <span className="flex items-center gap-2.5 font-serif text-lg text-ink">
                  <Icon className="h-5 w-5 text-terra-ink" /> {title}
                  {id === "private" && <span className="chip ml-auto bg-emerald-50 text-emerald-800"><WifiOff className="h-3 w-3" /> offline</span>}
                </span>
                <span className="mt-2 block text-[14px] leading-relaxed text-ink-3">{text}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2.5 text-sm text-ink-3">
            <input type="checkbox" className="h-4 w-4 accent-[#9c4a2f]" checked={st.tta} onChange={(e) => st.setTta(e.target.checked)} />
            Uncertainty map via test-time augmentation (4× compute; recommended)
          </label>
          {st.mode === "private" && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950" role="status">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              {cached ? (
                <span><b>Ready offline.</b> The model is stored on this device; you can turn Wi-Fi off and still analyse scans.</span>
              ) : prep ? (
                <span>{prep}</span>
              ) : (
                <>
                  <span className="flex-1">The first private analysis downloads the AI model (~21 MB) once. Do it now to work offline later.</span>
                  <button className="pill-ink px-4 py-2 text-sm" onClick={prepareOffline}>Download for offline use</button>
                </>
              )}
            </div>
          )}
        </Step>

        <Step n="3" title="Choose a scan">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="card p-6" aria-labelledby="samples-h">
              <h3 id="samples-h" className="flex items-center gap-2 font-serif text-lg text-ink"><Sparkles className="h-4 w-4 text-terra-ink" /> Try a sample case</h3>
              <p className="mt-1.5 text-sm text-ink-3">De-identified research scans or synthetic phantoms, with the expert outline to compare against.</p>
              {!st.consent && <p className="mt-2 text-xs font-medium text-terra-ink">Tick the confirmation in step 1 to enable these.</p>}
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {samples === null && !sampleErr && <p className="text-sm text-ink-3">Loading samples…</p>}
                {sampleErr && <p className="text-sm text-ink-3">{sampleErr}</p>}
                {samples?.map((s) => (
                  <button key={s.id} disabled={!st.consent} onClick={() => runSample(s)}
                    className="group flex flex-col items-start gap-1 rounded-2xl bg-paper-2 px-4 py-3 text-left text-sm text-ink transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40">
                    <span className="font-medium capitalize">{s.id.replaceAll("_", " ")}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">{s.synthetic ? "phantom" : "BraTS"}{s.has_label ? " · expert" : ""}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card p-6" aria-labelledby="upload-h">
              <h3 id="upload-h" className="flex items-center gap-2 font-serif text-lg text-ink"><FileUp className="h-4 w-4 text-terra-ink" /> Upload your scans</h3>
              <ul className="mt-1.5 space-y-0.5 text-[13px] text-ink-3">
                <li>T1ce <b className="font-medium text-ink-2">and</b> FLAIR of the same study</li>
                <li><code className="font-mono text-[12px]">.nii</code> / <code className="font-mono text-[12px]">.nii.gz</code>, or a <code className="font-mono text-[12px]">.zip</code> of one DICOM series</li>
                <li>Best: skull-stripped, co-registered, ~1 mm</li>
              </ul>
              <UploadPicker files={{ t1ce: t1, flair: fl }} onChange={(f) => { setT1(f.t1ce); setFl(f.flair); }} />
              {samples?.[0] && (
                <p className="mt-3 text-xs text-ink-3">
                  No scans to hand? Download a sample pair to try the upload:{" "}
                  <a className="font-medium text-terra-ink underline underline-offset-2" href={api.sampleUrl(samples[0].id, "t1ce")} download={`${samples[0].id}_t1ce.nii.gz`}>T1ce</a>
                  {" · "}
                  <a className="font-medium text-terra-ink underline underline-offset-2" href={api.sampleUrl(samples[0].id, "flair")} download={`${samples[0].id}_flair.nii.gz`}>FLAIR</a>
                </p>
              )}
              <button className="pill-ink mt-6 w-full" disabled={!st.consent || !t1 || !fl} onClick={runUpload}>
                Analyze {st.mode === "private" ? "on this device" : "my scans"} <ArrowRight className="h-4 w-4" />
              </button>
              {!st.consent && <p className="mt-2 text-center text-xs text-ink-3">Tick the confirmation in step 1 to enable analysis.</p>}
            </div>
          </div>
        </Step>
      </div>
    </div>
  );
}
