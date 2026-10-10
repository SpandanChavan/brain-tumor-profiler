/**
 * Upload with drag-and-drop (FR-A2). Drop both files at once and they are assigned to T1ce /
 * FLAIR from their names (BraTS 2021: *_t1ce / *_flair, BraTS 2023: *-t1c / *-t2f); unknown names
 * fill the empty slot. Each slot can also be picked or replaced individually.
 */
import { useRef, useState } from "react";
import { FileCheck2, UploadCloud, X } from "lucide-react";

export type Slot = "t1ce" | "flair";
const ACCEPT = ".nii,.gz,.zip";
const OK = /\.(nii|nii\.gz|zip)$/i;

export function guessSlot(name: string): Slot | null {
  const n = name.toLowerCase();
  if (/(^|[^a-z0-9])(t1ce|t1c|t1gd|t1-gd|t1post|t1_post|t1\+c)([^a-z0-9]|$)/.test(n)) return "t1ce";
  if (/(^|[^a-z0-9])(flair|t2f|t2-flair|t2_flair)([^a-z0-9]|$)/.test(n)) return "flair";
  return null;
}

/** Assign dropped files to slots: by name first, then fill whichever slot is still empty. */
export function assign(files: File[], current: Record<Slot, File | null>): { next: Record<Slot, File | null>; rejected: string[] } {
  const next = { ...current };
  const rejected: string[] = [];
  const rest: File[] = [];
  for (const f of files) {
    if (!OK.test(f.name)) { rejected.push(f.name); continue; }
    const s = guessSlot(f.name);
    if (s) next[s] = f; else rest.push(f);
  }
  for (const f of rest) {
    const free = (["t1ce", "flair"] as Slot[]).find((s) => !next[s]);
    if (free) next[free] = f; else rejected.push(f.name);
  }
  return { next, rejected };
}

const fmt = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function UploadPicker({ files, onChange }: { files: Record<Slot, File | null>; onChange: (f: Record<Slot, File | null>) => void }) {
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputs = { t1ce: useRef<HTMLInputElement>(null), flair: useRef<HTMLInputElement>(null) };

  const take = (list: FileList | File[]) => {
    const { next, rejected } = assign([...list], files);
    onChange(next);
    setNote(rejected.length ? `Ignored: ${rejected.join(", ")} (use .nii, .nii.gz or a .zip of one DICOM series).` : null);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        className={`mt-4 rounded-2xl border-2 border-dashed p-5 text-center transition ${over ? "border-terra bg-terra-soft/40" : "border-ink/15 bg-paper-2"}`}
      >
        <UploadCloud className="mx-auto h-6 w-6 text-terra-ink" aria-hidden />
        <p className="mt-2 text-sm text-ink-2">Drop both files here</p>
        <p className="text-xs text-ink-3">We match T1ce and FLAIR from the file names</p>
      </div>
      <div className="mt-3 space-y-2">
        {(["t1ce", "flair"] as Slot[]).map((s) => {
          const f = files[s];
          const label = s === "t1ce" ? "T1ce" : "FLAIR";
          return (
            <div key={s} className="flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2.5">
              <span className="eyebrow w-12 shrink-0">{label}</span>
              {f ? (
                <>
                  <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={f.name}>{f.name}</span>
                  <span className="shrink-0 text-xs text-ink-3">{fmt(f.size)}</span>
                  <button className="rounded-full p-1 text-ink-3 hover:bg-sand hover:text-ink" aria-label={`Remove ${label} file`} onClick={() => onChange({ ...files, [s]: null })}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button className="flex-1 text-left text-sm text-terra-ink hover:underline" onClick={() => inputs[s].current?.click()}>
                  Choose {label} file…
                </button>
              )}
              <input ref={inputs[s]} type="file" accept={ACCEPT} className="sr-only" aria-label={`${label} scan`} tabIndex={-1}
                onChange={(e) => { const x = e.target.files?.[0]; if (x) onChange({ ...files, [s]: x }); e.target.value = ""; }} />
            </div>
          );
        })}
      </div>
      {note && <p className="mt-2 text-xs text-amber-800" role="status">{note}</p>}
    </div>
  );
}
