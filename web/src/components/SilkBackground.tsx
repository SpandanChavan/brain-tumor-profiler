/**
 * Terracotta "silk": blurred light + shadow streaks in hard-light blend over a breathing gradient.
 * The streak field eases toward the pointer (1.5 s silk easing) for a calm sense of depth.
 * Purely decorative: aria-hidden, pointer-events none, frozen under prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

const LIGHT = [
  { t: 18, l: 18, w: 800, h: 200, r: -12, a: 0.5 }, { t: 40, l: 40, w: 1000, h: 250, r: 6, a: 0.4 },
  { t: 62, l: 8, w: 640, h: 150, r: -6, a: 0.45 }, { t: 82, l: 50, w: 900, h: 200, r: 0, a: 0.4 },
];
const SHADE = [
  { t: 30, l: 8, w: 800, h: 180, r: 12, a: 0.55 }, { t: 52, l: 30, w: 700, h: 220, r: -6, a: 0.5 },
  { t: 72, l: 60, w: 1100, h: 250, r: 6, a: 0.55 }, { t: 8, l: 60, w: 600, h: 150, r: -12, a: 0.45 },
];

export default function SilkBackground() {
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / innerWidth - 0.5) * 6, y = (e.clientY / innerHeight - 0.5) * 6;
        if (field.current) field.current.style.translate = `${x}% ${y}%`;
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => { removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 animate-breathe bg-[linear-gradient(135deg,#c98a66_0%,#b9714f_25%,#cf9572_50%,#b8704f_75%,#c98a66_100%)] bg-[length:200%_200%]" />
      <div ref={field} className="absolute inset-0 transition-[translate] duration-[1500ms] ease-[var(--ease-silk)]">
        <div className="absolute -left-1/4 -top-1/4 h-[150%] w-[150%] animate-drift blur-[60px] mix-blend-hard-light">
          {LIGHT.map((s, i) => (
            <span key={`l${i}`} className="absolute rounded-full" style={{ top: `${s.t}%`, left: `${s.l}%`, width: s.w, height: s.h, rotate: `${s.r}deg`, background: `rgba(255,220,190,${s.a})` }} />
          ))}
          {SHADE.map((s, i) => (
            <span key={`d${i}`} className="absolute rounded-full" style={{ top: `${s.t}%`, left: `${s.l}%`, width: s.w, height: s.h, rotate: `${s.r}deg`, background: `rgba(120,55,38,${s.a})` }} />
          ))}
        </div>
      </div>
      {/* bottom vignette: grounds the composition and lifts text contrast */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(70,30,25,0.45)_0%,rgba(0,0,0,0)_45%)]" />
    </div>
  );
}
