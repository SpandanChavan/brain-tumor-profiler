# 🧭 Project Phases — Brain Tumor Segmentation & Profiler (v2)

> **v2:** the app is now **React + NiiVue (web) + FastAPI + ONNX Runtime (API) + onnxruntime-web (Private mode)**, all on free tiers. Week numbers follow `workplan.md`.
> Owners: **AS** Advait · **PB** Piyush · **SC** Spandan · **VP** Vinit. ⇄ = can run in parallel.

## 📍 Build status (2026-10-09, new stack built)

| Phase | Done | Remaining |
|---|---|---|
| P0 Foundation | ✅ Python package, `api/`, `web/` (Vite + React 19 + TS + Tailwind 4), CI for both, pre-commit | Push to GitHub; free accounts |
| P1 Design | ✅ ADR-001, ADR-002, eval protocol, risk assessment, API contract (implemented, `/docs`) | Wireframe review, Review #1 |
| P2 Data | ✅ BraTS indexer, leakage-safe split, preprocessing, cached stacks | BraTS access + EDA |
| P3 Baseline | ✅ Pretrained FlexibleUNet, resumable AMP training, per-patient validation | Real training on Kaggle |
| P4 Optimise + ONNX | ✅ Evaluation script, `export_onnx.py` with parity check (Dice 1.000 on the demo model), ONNX parity tests in CI | Ablations, final test run on BraTS |
| P5a API | ✅ FastAPI: health, model card, samples, segment (upload + sample), TTL results, delete-now, rate limit, job cap, CORS allowlist, security headers, generic errors, no access logs, no PyTorch dependency. ✅ **Docker image tested**: 863 MB, non-root uid 1000, runs on a read-only filesystem (`docker compose`), 4.3 s per upload, 289 MB RAM; web app verified against the container | Deploy to the free HF Space (needs your HF token) |
| P5b Web | ✅ Consent gate, mode choice, sample gallery, upload, staged progress, **NiiVue viewer** (4-up / axial / coronal / sagittal / 3D), contour or filled outline, colour-blind palettes, uncertainty layer, AI-vs-expert layer, profile + linked area chart, jump-to-slice, PNG / NIfTI / PDF export, keyboard shortcuts (O/U/E/C/L/1–5), About + Privacy pages. ✅ **9 Playwright E2E tests + axe WCAG 2.1 AA (0 violations)** | Deploy to Vercel (needs your account) |
| P6 Private mode | ✅ onnxruntime-web in a Web Worker (WebGPU → WASM fallback, both tested), TS port of preprocessing and post-processing (unit-tested), model cached in Cache Storage. **Browser = server** (51.6 mL, Dice 0.973 both). ✅ **Browser DICOM support** via dcm2niix-WASM (headers dropped, no sidecar). E2E-tested: zero non-GET requests in Private mode | Rehearse the Wi-Fi-off demo |
| P7–P8 | ⬜ | User test, report, viva |

**UI redesign (warm editorial, inspired by virgus.vercel.app):** landing page with silk hero, task cards, how-it-works with scan animation, empathy-research quote, honest evidence cards (synthetic scores never shown as test results), privacy band; paper/ink/terracotta design system with self-hosted fonts (offline-safe); dark "reading room" viewer; reduced-motion support; responsive to 375 px.

**Verified:** 51 Python tests (95% coverage of `src/btp`) · 7 web unit tests · 11 Playwright E2E tests (both modes, DICOM, exports, delete-now, axe WCAG 2.1 AA on landing, analyze, workspace, model and privacy pages) · strict TS type-check · production build · Docker image (read-only, non-root) tested against the web app. CI runs all of it, including the Docker build.

**What's left needs you (accounts/data), not code:** BraTS access → Kaggle training → replace the demo weights · HF Space + Vercel deploy · user test (SUS) · report, poster, viva.

```
P0 ─▶ P1 ─▶ P2 ─▶ P3 ─▶ P4 (ONNX) ─┬─▶ P6 Private mode & privacy ─▶ P7 Validation ─▶ P8 Final
                 └──▶ P5a API ⇄ P5b Web (mock-first) ─┘
```

---

## Phase 0: Foundation (Week 1)
- [x] Python package `src/btp`, configs, tests, CI, pre-commit *(SC)*
- [ ] Monorepo folders `api/` and `web/`; Node 20 LTS; `npm create vite@latest web -- --template react-ts` *(VP)*
- [ ] ESLint + Prettier + Vitest in `web/`; extend CI to build and test both halves *(PB)*
- [ ] Free accounts: GitHub, Hugging Face, Vercel, Kaggle (no card) *(all)*
- [ ] Kanban board (GitHub Projects) *(SC)*

**Exit gate:** CI runs green for both Python and web.

## Phase 1: Research & design (Weeks 2–3)
- [ ] Literature notes, 5 core papers *(all)*
- [x] ADR-001 model strategy, ADR-002 app stack *(SC)*
- [ ] **API contract**: OpenAPI for `GET /v1/health`, `GET /v1/model`, `POST /v1/segment`, `GET /v1/samples` *(PB, VP)*
- [ ] Wireframes (Figma free): Landing → Upload/consent → Processing → Viewer (2D/MPR/3D) → Profile → Report; plus About and Privacy *(VP)*
- [ ] Design tokens: dark clinical theme, colour-blind-safe overlay palette, typography *(VP)*
- [ ] **Spike (1 day):** NiiVue loads a phantom with an overlay; onnxruntime-web runs a toy model in a Web Worker *(SC, VP)*
- [ ] Threat-model update for the browser + API architecture *(SC)*
- [ ] Review #1 *(all)*

**Exit gate:** guide approves the ADRs, API contract and wireframes.

## Phase 2: Data (Weeks 3–4)
- [ ] Obtain BraTS 2021; record licence and citation *(VP)*
- [ ] EDA notebook *(VP)*
- [x] Manifest, stratified patient split, leakage test, preprocessing, cached stacks *(AS, PB)*
- [ ] Run `prepare_data.py` on Kaggle for 120 patients *(AS)*

**Exit gate:** real data loader verified; EDA figures saved.

## Phase 3: Baseline model (Weeks 5–6)
- [x] Training loop (pretrained FlexibleUNet, Dice+BCE, AMP, resume, per-patient val) *(AS)*
- [ ] Baseline run on Kaggle; sanity checks (overfit one batch, 10-patient run) *(AS, PB)*
- [ ] ⇄ MONAI bundle zero-shot reference *(PB)*

**Exit gate:** val Dice ≥ 0.70.

## Phase 4: Optimisation & ONNX (Weeks 7–8)
- [ ] Ablations: modality, pretraining, TTA, post-processing, (2.5D) *(AS, PB)*
- [ ] `scripts/export_onnx.py`: opset 17, dynamic batch and H/W, FP32; optional FP16 / INT8 for the web *(AS)*
- [ ] **Parity test:** ONNX vs PyTorch on 5 val patients, mask Dice ≥ 0.999 *(AS)*
- [ ] Benchmark: PyTorch CPU vs ORT CPU vs ORT-web (WebGPU / WASM) *(PB, SC)*
- [ ] Freeze v1.0; upload `.pt` + `.onnx` + model card to HF Hub *(AS)*
- [ ] **Final test evaluation, run once** *(PB)*

**Exit gate:** test Dice ≥ 0.80 (or a documented analysis); ONNX parity passes.

## Phase 5a: Inference API (Weeks 6–10) ⇄
- [ ] `api/` FastAPI app: routers, Pydantic schemas, settings, CORS restricted to the frontend origin *(PB)*
- [ ] `POST /v1/segment`: multipart T1ce + FLAIR (NIfTI or zipped DICOM) → validate → de-id → `btp` preprocessing → **ORT** + flip-TTA → post-process → profile. Returns JSON (profile, warnings, timings, model version) plus mask / uncertainty as gzipped NIfTI (base64 or a follow-up download URL kept in memory with a TTL) *(PB)*
- [ ] `GET /v1/samples` + `/v1/samples/{id}/{file}`: bundled test-split cases *(PB)*
- [ ] Limits: 200 MB, zip-bomb guard, timeout, **rate limiting** (slowapi), concurrency limit of 1–2 jobs *(PB)*
- [ ] **No request-body logging**; event-only audit; generic error messages *(SC)*
- [ ] Dockerfile (python:3.11-slim, CPU-only ORT); deploy to **HF Spaces (Docker, free CPU)**; health check + warm-up *(PB)*
- [ ] pytest API tests with FastAPI TestClient *(PB)*

**Exit gate:** a sample case segments on the live Space in ≤ 15 s (warm).

## Phase 5b: Web app (Weeks 7–12) ⇄ (mock-first)
- [ ] App shell: React Router, layout, dark theme, shadcn components, persistent disclaimer banner *(VP)*
- [ ] **Consent gate** + upload dropzone (T1ce + FLAIR, format help, validation) + sample-case gallery *(VP)*
- [ ] Processing screen: named stages, expected time, "waking server" state *(VP)*
- [ ] **NiiVue viewer:** axial / coronal / sagittal / multiplanar / **3D render**; mask as contour or fill; opacity; colour-blind palettes; uncertainty layer; AI-vs-expert (TP/FP/FN); crosshair; jump to largest slice; keyboard shortcuts *(VP)*
- [ ] Profile panel: metric cards + Recharts area-per-slice chart linked to the viewer slice *(VP)*
- [ ] Exports: mask `.nii.gz`, PNG screenshot (NiiVue), PDF report *(SC)*
- [ ] About-the-model page (driven by `/v1/model`) + Privacy page *(VP, SC)*
- [ ] TanStack Query API client generated from OpenAPI (`openapi-typescript`) *(PB)*
- [ ] Vitest component tests; Playwright E2E against mock + real API *(VP, PB)*
- [ ] Deploy to **Vercel Hobby** (preview per PR) *(VP)*
- [ ] Retire `app/` (Streamlit) *(SC)*

**Exit gate:** full flow works on the deployed site; scrolling feels instant (60 fps).

## Phase 6: Private mode & privacy hardening (Weeks 11–13)
- [ ] `web/src/inference/`: onnxruntime-web in a **Web Worker**; WebGPU with WASM fallback; port preprocessing to TS (RAS reorient via NiiVue, brain z-score, pad to 32, flip-TTA optional) *(SC, VP)*
- [ ] **Parity test:** browser mask vs server mask on sample cases, Dice ≥ 0.99 *(SC)*
- [ ] Model caching (Cache Storage) so it downloads only once; size budget ≤ 30 MB (FP16) *(SC)*
- [ ] **Browser-side DICOM de-identification** (dcmjs) before display/upload, using the same tag list as `btp.privacy.deid` *(SC)*
- [ ] Privacy UX: mode toggle with a plain explanation ("Private: never leaves your device · Server: faster, processed in memory") *(VP)*
- [ ] Security headers on Vercel: CSP, HSTS, Referrer-Policy, Permissions-Policy *(PB)*
- [ ] Network-capture evidence (DevTools HAR) that Private mode sends no image bytes *(SC)*
- [ ] Update the threat model, risk register and incident note *(SC)*

### Privacy checklist
- [ ] No real PHI in the repo, logs, screenshots or Kaggle outputs
- [ ] All 18 Safe-Harbor categories scrubbed (browser + server tests)
- [ ] Server: no persistence, no body logging, TTL on in-memory results
- [ ] Private mode: zero scan bytes over the network (HAR evidence)
- [ ] HTTPS + security headers on both hosts
- [ ] Banner + consent visible; no analytics or cookies
- [ ] "HIPAA-aligned" wording everywhere

**Exit gate:** checklist complete; Private mode works offline.

## Phase 7: Validation & user testing (Weeks 13–14)
- [ ] Usability test, 5–8 participants, think-aloud on 3 tasks; **SUS** + trust rating before/after the uncertainty view *(VP, SC)*
- [ ] Accessibility: axe-core, keyboard, colour-blind simulation *(VP)*
- [ ] Robustness: wrong sequence, mismatched shapes, non-skull-stripped, huge file, cold server, no WebGPU *(PB)*
- [ ] Performance report: latency in both modes, across devices *(PB, SC)*
- [ ] Review #2 *(all)*

**Exit gate:** SUS ≥ 70 or issues fixed; no crashes.

## Phase 8: Final (Weeks 15–16)
- [ ] Report (methods, results, privacy, human factors, limitations, future work) *(all; SC edits)*
- [ ] Poster v2, slides, demo video including the **offline Private-mode moment** *(VP, AS, PB)*
- [ ] Viva rehearsal (`knowledge.md § 12`) *(all)*
- [ ] Tag v1.0, clean the README, make the repo public (optional) *(SC)*

## Phase 9: Future work
Multi-class ET/TC/WT · 3D / 2.5D models · editable masks with human-in-the-loop · DICOM-SEG export / OHIF / PACS · longitudinal comparison · external validation on Indian hospital data under ethics approval and DPDP agreements.
