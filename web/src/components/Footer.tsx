import { useStore } from "../store";

export default function Footer() {
  const setPage = useStore((s) => s.setPage);
  return (
    <footer className="bg-paper-3 px-[7vw] pb-10 pt-[clamp(60px,10vh,120px)]">
      <div className="mx-auto grid max-w-[1200px] gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-serif text-2xl text-ink">Brain Tumor Profiler</p>
          <p className="mt-3 max-w-[38ch] text-[15px] font-light leading-relaxed text-ink-3">
            Brain tumor segmentation &amp; profiling: fine-tuned MONAI models, an honest viewer, and a private mode
            where your scan never leaves your device.
          </p>
          <p className="mt-6 text-sm text-ink-3">
            MIT-ADT University · MIT School of Computing · Dept. of CSE<br />
            LY AIA-9 · Group BCAIAA20 · Guide: Prof. Jyoti Gavhane
          </p>
        </div>
        <div>
          <p className="eyebrow mb-4">Product</p>
          <ul className="space-y-2.5 text-[15px] text-ink-2">
            <li><button className="hover:text-terra-ink" onClick={() => setPage("analyze")}>Analyze a scan</button></li>
            <li><button className="hover:text-terra-ink" onClick={() => setPage("about")}>The model &amp; metrics</button></li>
            <li><button className="hover:text-terra-ink" onClick={() => setPage("privacy")}>Privacy &amp; HIPAA</button></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Team</p>
          <ul className="space-y-2.5 text-[15px] text-ink-2">
            <li>Advait Samant</li><li>Piyush Bavane</li><li>Spandan Chavan</li><li>Vinit Pal</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-[1200px] flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-6 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-3">
        <span>© 2026 Brain Tumor Profiler · Research &amp; education use only</span>
        <span>Not a medical device · HIPAA-aligned, not certified</span>
      </div>
    </footer>
  );
}
