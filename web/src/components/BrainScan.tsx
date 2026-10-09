/** Stylised axial brain slice with a sweeping scan line and a pulsing "finding": used on the
 *  landing page and the processing screen. Decorative (aria-hidden). */
export default function BrainScan({ className = "", dark = false, scanning = true }: { className?: string; dark?: boolean; scanning?: boolean }) {
  const stroke = dark ? "rgba(233,226,216,0.55)" : "rgba(46,42,38,0.45)";
  const fill = dark ? "rgba(233,226,216,0.05)" : "rgba(46,42,38,0.04)";
  return (
    <div aria-hidden className={`relative aspect-square overflow-hidden rounded-[2rem] ${dark ? "bg-room" : "bg-paper-2"} ${className}`}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        {/* skull + cortex */}
        <ellipse cx="100" cy="102" rx="70" ry="82" fill={fill} stroke={stroke} strokeWidth="1.2" />
        <ellipse cx="100" cy="102" rx="60" ry="72" fill="none" stroke={stroke} strokeWidth="0.6" strokeDasharray="2 3" />
        {/* midline + ventricles + sulci */}
        <path d="M100 32 C 98 70, 102 130, 100 176" fill="none" stroke={stroke} strokeWidth="0.8" />
        <path d="M88 92 q -10 12 -2 26 M112 92 q 10 12 2 26" fill="none" stroke={stroke} strokeWidth="1" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${48 + i * 4} ${60 + i * 22} q 14 -8 26 2`} fill="none" stroke={stroke} strokeWidth="0.6" />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={`r${i}`} d={`M${152 - i * 4} ${60 + i * 22} q -14 -8 -26 2`} fill="none" stroke={stroke} strokeWidth="0.6" />
        ))}
        {/* finding: edema halo + contour */}
        <ellipse cx="128" cy="78" rx="22" ry="19" fill="rgba(196,104,75,0.18)" />
        <ellipse cx="128" cy="78" rx="13" ry="11" fill="none" stroke="#22d3ee" strokeWidth="1.6" />
      </svg>
      <span className="absolute left-[64%] top-[39%] block h-3 w-3 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-[#22d3ee]" />
        <span className="absolute inset-[3px] rounded-full bg-[#22d3ee]" />
      </span>
      {scanning && (
        <span className="absolute inset-x-0 h-[2px] animate-scan bg-[linear-gradient(90deg,transparent,#22d3ee,transparent)] shadow-[0_0_18px_#22d3ee]" />
      )}
    </div>
  );
}
