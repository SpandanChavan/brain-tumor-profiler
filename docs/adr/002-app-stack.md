# ADR-002: Application stack (replacing Streamlit)

- **Status:** Proposed (needs team and guide sign-off)
- **Date:** 2026-10-09
- **Hard constraint:** every service must be **free tier**: no credit card, no paid plan.

## Why move off Streamlit
Streamlit was quick to build with, but it limits the project:
- It re-runs the whole script on every click, so the slice slider round-trips to the server.
- It can't do a real medical viewer: no 3D rendering, no smooth scroll/zoom/pan, no multi-planar views.
- The UI looks like a "Streamlit demo", not a product.
- It forces all processing onto the server, which makes the privacy story weaker.

## Options considered
| Option | Viewer quality | Privacy | Effort | Free hosting | Verdict |
|---|---|---|---|---|---|
| Streamlit (current) | Low | Server-side only | Low | HF Spaces | ❌ Replace |
| Gradio | Low–medium | Server-side only | Low | HF Spaces | ❌ Same limits |
| **React + NiiVue + FastAPI** | **High (WebGL 2D/3D, MPR, overlays)** | Server **or** in-browser | Medium | Vercel + HF Spaces | ✅ **Chosen** |
| OHIF / Cornerstone3D | Very high (DICOM-first) | Server/PACS | High (heavy) | Self-host | ❌ Overkill; NIfTI is second-class |
| 3D Slicer extension | High | Local desktop | High | n/a (desktop) | ❌ Not web, hard to demo |

## Decision
**Frontend:**
- React 19 + TypeScript + Vite, styled with Tailwind CSS + shadcn/ui.
- **NiiVue** for the viewer: WebGL2, built for NIfTI, segmentation overlays, 3D volume rendering. It is used by Brainchop and by other BraTS/stroke viewers.

**Backend:**
- **FastAPI** (Python), reusing the existing `src/btp` package unchanged: preprocessing, inference, profile, de-identification, metrics.
- Inference with **ONNX Runtime** (CPU) for speed on free hosts.

**Signature feature: "Private mode".**
- The same ONNX model runs **in the browser** with `onnxruntime-web` (WebGPU, falling back to WASM).
- The scan **never leaves the device**. This is the strongest privacy guarantee available, and the strongest HIPAA talking point: no transmission, so no BAA is needed for the demo.
- Server mode remains the default for speed and TTA. Private mode is a toggle.

## Free-tier hosting plan
| Piece | Service (free tier) | Notes |
|---|---|---|
| Frontend (static) | **Vercel Hobby** or Cloudflare Pages / GitHub Pages | HTTPS + CDN; no user data touches it |
| Backend API | **Hugging Face Spaces, Docker, CPU basic** (2 vCPU, 16 GB RAM) | Sleeps after inactivity; cold start ~30–60 s → warm-up ping + "waking server" UI state |
| Model weights | Hugging Face Hub model repo (free) | Versioned, SHA-256 pinned |
| Training | **Kaggle Notebooks** (~30 GPU-h/week) + Google Colab free | Already planned |
| CI/CD | **GitHub Actions** (free for public repos; 2,000 min/month private) | Lint, tests, build, deploy |
| Experiment tracking | Weights & Biases free (academic) or TensorBoard | |
| Error monitoring (optional) | Sentry Developer (free) with PII scrubbing **on**, or skip | Never send images or request bodies |
| Analytics | None | Privacy by default |

> No database is required. Audit events go to an append-only JSONL file on the Space. If persistence is ever needed, Supabase free tier is an option, but that would mean adding a vendor to the threat model.

## Consequences
- ✅ A professional, fast, impressive viewer: 3D tumor rendering, MPR, smooth scrolling.
- ✅ Private mode gives a unique, defensible privacy story.
- ✅ A clear separation between API and UI, so each part is testable (pytest + Vitest + Playwright).
- ⚠️ Two languages (Python + TypeScript) and more moving parts. Mitigated by splitting the team into roles (see the workplan).
- ⚠️ Free Spaces sleep and are slow on CPU. Mitigated by ONNX + a smaller TTA option + the in-browser mode.
- ⚠️ WebGPU support varies by browser. The app auto-detects it and falls back to WASM, with expected times shown.
- ♻️ All of `src/btp` and its tests carry over. Only `app/` (Streamlit) is retired.
