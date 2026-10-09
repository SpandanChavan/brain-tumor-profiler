import { create } from "zustand";
import type { Agreement } from "./lib/api";
import type { TumorProfile } from "./lib/profile";

export type Mode = "server" | "private";
export type Page = "home" | "analyze" | "about" | "privacy";
export type Layout = "axial" | "coronal" | "sagittal" | "multi" | "render";

/** One source of a volume for NiiVue: URL (sample/server) or local File (upload). */
export interface VolSource { url: string; name: string }

export interface Result {
  mode: Mode;
  label: string;                 // e.g. "Sample synthetic_1" / "Your upload"
  t1ce: VolSource;
  flair: VolSource;
  // server-mode overlay URLs, or private-mode RAS arrays
  maskUrl?: string; uncUrl?: string; labelUrl?: string;
  maskRas?: Uint8Array; uncRas?: Uint8Array; labelRas?: Uint8Array;
  profile: TumorProfile;
  area: number[];
  seconds: number;
  warnings: string[];
  agreement?: Agreement;
  synthetic: boolean;
  modelVersion: string;
  jobId?: string;
  backend?: string;
  deid?: { removed: number; burned_in_annotation: boolean }[];
}

export interface Progress { frac: number; message: string }

interface State {
  page: Page; setPage: (p: Page) => void;
  mode: Mode; setMode: (m: Mode) => void;
  consent: boolean; setConsent: (c: boolean) => void;
  tta: boolean; setTta: (t: boolean) => void;
  progress: Progress | null; setProgress: (p: Progress | null) => void;
  error: string | null; setError: (e: string | null) => void;
  result: Result | null; setResult: (r: Result | null) => void;
  // viewer settings
  layout: Layout; setLayout: (l: Layout) => void;
  sequence: "flair" | "t1ce"; setSequence: (s: "flair" | "t1ce") => void;
  showMask: boolean; showUnc: boolean; showCompare: boolean;
  toggle: (k: "showMask" | "showUnc" | "showCompare") => void;
  outline: boolean; setOutline: (o: boolean) => void;
  opacity: number; setOpacity: (o: number) => void;
  palette: "cyan" | "amber" | "magenta"; setPalette: (p: "cyan" | "amber" | "magenta") => void;
  slice: number; setSlice: (z: number) => void;
  jumpTo: number | null; requestJump: (z: number | null) => void;
}

/** Page for a URL path (also used by lib/router for Back/Forward). */
export function pageFromPath(path: string): Page {
  const p = path.replace(/\/+$/, "") || "/";
  return ({ "/analyze": "analyze", "/model": "about", "/privacy": "privacy" } as Record<string, Page>)[p] ?? "home";
}

export const useStore = create<State>((set) => ({
  page: typeof location === "undefined" ? "home" : pageFromPath(location.pathname), setPage: (page) => { set({ page }); window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); },
  mode: "server", setMode: (mode) => set({ mode }),
  consent: false, setConsent: (consent) => set({ consent }),
  tta: true, setTta: (tta) => set({ tta }),
  progress: null, setProgress: (progress) => set((s) => { if (progress && !s.progress) window.scrollTo({ top: 0 }); return { progress }; }),
  error: null, setError: (error) => set({ error }),
  result: null, setResult: (result) => { set({ result, showCompare: false, showUnc: false, showMask: true }); window.scrollTo({ top: 0 }); },
  layout: "multi", setLayout: (layout) => set({ layout }),
  sequence: "flair", setSequence: (sequence) => set({ sequence }),
  showMask: true, showUnc: false, showCompare: false,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<State>),
  outline: true, setOutline: (outline) => set({ outline }),
  opacity: 0.55, setOpacity: (opacity) => set({ opacity }),
  palette: "cyan", setPalette: (palette) => set({ palette }),
  slice: 0, setSlice: (slice) => set({ slice }),
  jumpTo: null, requestJump: (jumpTo) => set({ jumpTo }),
}));
