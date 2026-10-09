import { useEffect, useRef, useState } from "react";
import { Lock, Menu, X } from "lucide-react";
import { useStore, type Page } from "../store";

const LINKS: [Page, string][] = [["analyze", "Analyze"], ["about", "The model"], ["privacy", "Privacy"]];

/** Floating pill navigation (overlays the hero on the landing page).
 *  Below md: a hamburger opens an animated sheet (Esc / outside click closes, focus managed). */
export default function Nav({ overlay = false }: { overlay?: boolean }) {
  const { page, setPage, mode } = useStore();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const go = (p: Page) => { setOpen(false); setPage(p); };

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } };
    const onClick = (e: MouseEvent) => {
      if (!sheetRef.current?.contains(e.target as Node) && !toggleRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onResize = () => { if (innerWidth >= 768) setOpen(false); };
    addEventListener("keydown", onKey);
    addEventListener("mousedown", onClick);
    addEventListener("resize", onResize);
    return () => { removeEventListener("keydown", onKey); removeEventListener("mousedown", onClick); removeEventListener("resize", onResize); };
  }, [open]);

  return (
    <header className={`${overlay ? "absolute" : "sticky"} inset-x-0 top-0 z-30 px-[4vw] py-4`}>
      <nav aria-label="Main" className="relative mx-auto max-w-[1400px] rounded-2xl bg-paper/90 px-4 py-2.5 shadow-[0_8px_30px_rgba(60,30,15,0.10)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button onClick={() => go("home")} className="mr-auto flex items-center gap-2.5 rounded-lg px-1.5 py-1 font-serif text-[19px] tracking-wide text-ink">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-terra-ink font-serif text-[14px] text-paper">P</span>
            Profiler<span className="hidden font-sans text-[13px] font-light text-ink-3 sm:inline">· Brain Tumor Segmentation</span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map(([id, label]) => (
              <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}
                className="rounded-full px-4 py-2 text-sm text-ink-2 transition hover:bg-paper-2 aria-[current=page]:bg-paper-2 aria-[current=page]:text-ink">
                {label}
              </button>
            ))}
          </div>
          {mode === "private" && page === "analyze" && (
            <span className="chip hidden bg-emerald-50 text-emerald-800 lg:inline-flex"><Lock className="h-3 w-3" /> On-device</span>
          )}
          <button onClick={() => go("analyze")} className="pill-ink ml-2 hidden px-5 py-2 text-sm sm:inline-flex">Start analysis →</button>
          <button ref={toggleRef} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-paper-2 md:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div id="mobile-menu" ref={sheetRef} hidden={!open}
          className="overflow-hidden md:hidden">
          <div className="mt-3 animate-fade-in border-t border-ink/10 pt-3 pb-1">
            {([["home", "Home"], ...LINKS] as [Page, string][]).map(([id, label]) => (
              <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => go(id)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left font-serif text-lg text-ink transition hover:bg-paper-2 aria-[current=page]:bg-paper-2">
                {label}<span aria-hidden className="text-sm text-ink-3">→</span>
              </button>
            ))}
            <button onClick={() => go("analyze")} className="pill-ink mt-3 w-full">Start analysis →</button>
          </div>
        </div>
      </nav>
    </header>
  );
}
