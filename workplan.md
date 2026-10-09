# 🗂️ Work Plan — Brain Tumor Segmentation & Profiler (v2)

> **v2 (2026-10-09):** Streamlit is replaced by **React + NiiVue + FastAPI + ONNX**, with an in-browser **Private mode**. **Hard rule: everything runs on free tiers.**
> Detailed tasks are in `phases.md`, research in `knowledge.md`, the spec in `requirements.md`, and the stack reasoning in `docs/adr/002-app-stack.md`.

---

## 1. Vision & objectives

**Vision:** *"A fast, honest, privacy-first second pair of eyes for brain-tumor MRI that runs on free infrastructure, or entirely inside your browser."*

| # | Objective | Measure | By |
|---|---|---|---|
| O1 | Fine-tune a pretrained MONAI model (T1ce + FLAIR, binary whole tumor) | Per-patient test Dice ≥ 0.80 | Week 8 |
| O2 | Export to ONNX with verified parity | ONNX vs PyTorch mask Dice ≥ 0.999 | Week 9 |
| O3 | Deliver the FastAPI inference API on free hosting | ≤ 15 s per volume on HF Spaces CPU | Week 10 |
| O4 | Deliver the React + NiiVue web app with 2D/MPR/3D viewing and the profiler | All "Must" app requirements demoed | Week 12 |
| O5 | Ship Private mode (in-browser inference) | ≤ 30 s on a WebGPU laptop; zero scan bytes sent (verified in DevTools) | Week 13 |
| O6 | Validate usability and trust | SUS ≥ 70, n ≥ 5 | Week 14 |
| O7 | Defensible report, poster, demo | Submitted + 2 rehearsals | Week 16 |

**What makes it stand out**
1. **Private mode**: the AI runs on the user's own device, so the scan is never uploaded. Few student projects can demonstrate privacy this concretely.
2. **A real medical viewer**: multi-planar views, a 3D tumor render, uncertainty overlay, AI-vs-expert comparison.
3. **Honest evaluation**: per-patient 3D Dice, a failure gallery, ablations, and an ONNX parity test.
4. **Human-centred and HIPAA-aligned design**, plus **frugal AI**: fine-tuning on free GPUs and serving on free CPUs.

---

## 2. Key decisions

| Decision | Choice | Record |
|---|---|---|
| Model | 2D MONAI FlexibleUNet, pretrained EfficientNet-B0, 3→2 channel stem | ADR-001 |
| App stack | React 19 + TS + Vite + **NiiVue** + Tailwind/shadcn · **FastAPI** · **ONNX Runtime** (server + web) | ADR-002 |
| Hosting | Vercel Hobby (web) · HF Spaces Docker CPU (API) · HF Hub (weights) · Kaggle (training) · GitHub Actions (CI) | ADR-002 |
| Data | BraTS 2021, 100–150 patients, patient-level split | eval protocol |
| Primary metric | Per-patient 3D Dice + HD95 | eval protocol |
| Privacy stance | "HIPAA-aligned" (never "compliant"); demo data only on the server; Private mode for anything sensitive | risk assessment |
| Database | None (stateless API; JSONL audit) | ADR-002 |

---

## 3. Free-tier budget (₹0)

| Need | Service | Free-tier limit to watch | Plan B |
|---|---|---|---|
| GPU training | Kaggle | ~30 GPU-h/week, 12 h sessions | Colab free; rotate team accounts |
| API hosting | HF Spaces (CPU basic) | 2 vCPU / 16 GB; sleeps when idle | Render free web service; local demo |
| Frontend | Vercel Hobby | Non-commercial; bandwidth caps | Cloudflare Pages / GitHub Pages |
| Weights | HF Hub | Large files via Git LFS (free) | GitHub Releases |
| CI | GitHub Actions | 2,000 min/month on private repos (unlimited public) | Make the repo public at the end |
| Tracking | W&B free / TensorBoard | | TensorBoard only |
| Design | Figma free / Excalidraw | | Paper wireframes |

> Rule: **no service that needs a credit card.** If a tool asks for one, pick plan B.

---

## 4. Team & roles (proposal)

| Member | Primary role | Owns |
|---|---|---|
| **Advait Samant** | ML lead | Training, ablations, ONNX export + parity, model card |
| **Piyush Bavane** | Backend & MLOps lead | FastAPI service, Docker, HF Spaces deploy, CI, performance, evaluation |
| **Spandan Chavan** | Project, privacy & architecture lead | Architecture, HIPAA work (browser + server de-id, audit, threat model), Private mode, report editing |
| **Vinit Pal** | Frontend & UX lead | React app, NiiVue viewer, design system, user testing, poster |

**Pairing:** Spandan + Vinit pair on Private mode (browser inference). Advait + Piyush pair on ONNX serving.
**Bus-factor rule:** every module has an owner and a reviewer; everyone can explain everything at the viva.

| Deliverable | AS | PB | SC | VP | Guide |
|---|---|---|---|---|---|
| Data + model | **R/A** | C | I | C | C |
| Evaluation | C | **R/A** | I | I | C |
| API | C | **R/A** | C | I | I |
| Web app | I | C | C | **R/A** | I |
| Private mode | C | I | **R/A** | R | I |
| Privacy/HIPAA | I | C | **R/A** | C | C |
| Report / presentation | R | R | **A** | R | C |

---

## 5. Timeline (16 weeks, from Mon 12 Oct 2026; adjust to the academic calendar)

| Week | Phase | Milestone |
|---|---|---|
| 1 | P0 Foundation (✅ mostly done) | Repo, CI, env |
| 2–3 | P1 Research & design | **M1: ADR-001 + ADR-002 sign-off, wireframes (Review #1)** |
| 3–4 | P2 Data | Clean split, cached BraTS stacks |
| 5–6 | P3 Baseline | **M2: val Dice ≥ 0.70** |
| 7–8 | P4 Optimise + ONNX | **M3: model v1.0 frozen, test Dice, ONNX parity** |
| 6–10 | P5a API ⇄ | **M4: `/v1/segment` live on HF Spaces** |
| 7–12 | P5b Web app ⇄ | **M5: viewer + profiler end-to-end** |
| 11–13 | P6 Private mode + privacy hardening | **M6: in-browser inference, privacy checklist done** |
| 13–14 | P7 Validation | **M7: user test, Review #2** |
| 15–16 | P8 Final | **M8: submission + viva** |

```
Week:        1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
P0 Setup    ██
P1 Design      ████
P2 Data           ████
P3 Baseline             ████
P4 Opt+ONNX                   ████
P5a API                    ██████████
P5b Web                       ████████████
P6 Private                                ██████
P7 Validate                                    ████
P8 Final                                           ████
```

> The frontend can start in Week 6 against **mock API responses and synthetic phantoms**, so it is never blocked waiting for the real model.

---

## 6. Working rhythm
- Weekly 30-min sync. The board is updated beforehand.
- A guide meeting every two weeks, with a one-page note sent the day before.
- **API contract first:** the OpenAPI schema (`/v1/segment`) is agreed in P1, so the frontend and backend can work in parallel.
- **Definition of Done:** PR reviewed, tests green (pytest / Vitest / Playwright), docs updated, requirement ID linked.
- Experiments are logged (config, seed, commit, metrics) and every reported number is traceable.

---

## 7. Risk register

| # | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Pretrained bundle doesn't fit the 2D/2-channel design | Known | High | FlexibleUNet pretrained encoder (ADR-001) | AS |
| R2 | Kaggle quota or session limits | High | High | Cached data, AMP, resumable checkpoints (done), rotate accounts | AS |
| R3 | Data leakage | Med | Critical | Patient split + automated test (done) | PB |
| R4 | Dice below target | Med | Med | Ablations, 2.5D, post-processing, honest analysis | AS |
| R5 | BraTS access delay | Med | High | Request on day 1; synthetic pipeline keeps everyone unblocked | VP |
| R6 | ONNX export op or parity issues | Med | Med | Export early (Week 7); parity test in CI; opset 17 | AS |
| R7 | WebGPU unsupported or slow on some browsers | Med | Med | Auto-fallback to WASM; Web Worker; show time estimate; server mode default | SC |
| R8 | HF Space cold start (~30–60 s) during the demo | High | Med | "Waking server" UI state; warm-up ping before presenting; local Docker backup | PB |
| R9 | Two-language stack slows the team | Med | Med | Clear role split; API contract first; shadcn components | SC |
| R10 | NiiVue learning curve | Med | Med | Start from official examples; one viewer spike in P1 | VP |
| R11 | User uploads real PHI to the server | Low | High | Banner, consent, browser-side de-id, in-memory processing, Private-mode nudge | SC |
| R12 | Free tier changes its terms | Low | Med | Plan B column in § 3; everything containerised | PB |
| R13 | Over-claiming ("HIPAA-compliant", "diagnoses") | Med | High | Wording review in P8 | SC |
| R14 | Live demo failure | Med | High | Local Docker stack + recorded video | PB |

---

## 8. Quality plan
- **Python:** ruff, pytest (≥ 80% coverage on `src/btp`; currently 94%), pip-audit.
- **TypeScript:** ESLint, Prettier, `tsc --noEmit`, Vitest, npm audit.
- **E2E:** Playwright covering upload → result → viewer → export, in both modes.
- **ML:** overfit-one-batch, visual checks, independent metric check on 2 patients, ONNX parity test.
- **Accessibility:** axe-core in Playwright, keyboard navigation, colour-blind-safe overlays.
- **Privacy:** the checklist in `phases.md § P6`, plus a DevTools network capture proving that Private mode sends no scan bytes.

---

## 9. Deliverables
- [ ] Source (tagged v1.0): `src/btp`, `api/`, `web/`, scripts, notebooks
- [ ] Weights (PyTorch + ONNX) on HF Hub, with model card and SHA-256
- [ ] Live demo URLs (Vercel + HF Space) using sample cases only
- [ ] Results: metrics, ablations, failure gallery, ONNX parity, latency benchmarks
- [ ] Privacy pack: threat model, risk register, de-id tests, network-capture evidence, incident note
- [ ] User-test report (SUS)
- [ ] Report, poster v2, slides, demo video

---

## 10. Presentation strategy
1. **Hook:** a radiologist tracing slices at 2 a.m.
2. **Live demo:** drop a scan in, see the outline, then *rotate the 3D tumor*.
3. **Private mode moment:** switch Wi-Fi **off** and run the model in the browser anyway. "Your scan never left this laptop." This is the strongest moment of the demo.
4. **Honest results:** per-patient Dice against human inter-rater agreement, then the failure cases.
5. **Privacy & HIPAA**, the **user test**, and **future work**.

---

## 11. Immediate next steps
1. ⬜ The team reviews ADR-002 and these docs.
2. ⬜ Request BraTS 2021 access (longest lead time).
3. ⬜ Agree the `/v1/segment` API contract (`requirements.md § 3.4`).
4. ⬜ A NiiVue + onnxruntime-web spike (one day): load a phantom, overlay a mask, run a dummy ONNX model in the browser.
5. ⬜ Create free accounts: GitHub, Hugging Face, Vercel, Kaggle (no credit cards).
