# 🧠 Brain Tumor Segmentation & Profiler

> **A deep-learning web app that finds brain tumors in MRI and shows the result slice by slice and in 3D. It is built to *help* clinicians, not to replace them. Every service it uses is free tier.**

**MIT-ADT University · MIT School of Computing · Department of CSE**
Class **LY AIA-9** · Group **BCAIAA20** · Faculty Guide **Prof. Jyoti Gavhane**
Team: **Advait Samant · Piyush Bavane · Spandan Chavan · Vinit Pal**

> ⚠️ **Research & education use only.** This is not a medical device and must not be used for diagnosis or treatment. It runs only on public, de-identified data (BraTS). Its privacy and security design follows HIPAA principles (see [§ 8](#8--privacy--hipaa-aligned-design)).

---

## 1. Why this project exists

Radiologists outline gliomas by hand, slice by slice, across several MRI sequences. This is:

| Pain | Effect |
|---|---|
| **Slow**: one case can take tens of minutes to hours | Diagnosis and treatment planning are delayed |
| **Inconsistent**: two experts draw different boundaries | Volume and growth tracking become unreliable |
| **Tiring**: repetitive, high-focus work | Fatigue, which leads to errors |

The best current models need **expensive GPU infrastructure**. Students, small hospitals and learners cannot use them.

## 2. What we build

1. **Model**: a pretrained MONAI network fine-tuned on a BraTS subset (~100–150 patients, **T1ce + FLAIR**), then exported to **ONNX** so it runs fast on CPU and in the browser.
2. **Web app**: a React + **NiiVue** medical viewer:
   - axial / coronal / sagittal views and a **3D tumor rendering**;
   - outline, uncertainty and AI-vs-expert overlays;
   - smooth scroll, zoom and pan.
3. **Two inference modes:**
   - **Server mode** (default): a FastAPI + ONNX Runtime API with test-time augmentation.
   - **🔒 Private mode**: the model runs **inside your browser** (WebGPU/WASM). The scan never leaves your device.
4. **Profiler**: estimated volume, extent, side, slice range, a per-slice area chart, and mean uncertainty.
5. **Transparency**: the measured test Dice, a model card, and a limitations page, all visible in the app.
6. **Privacy by design**: HIPAA-aligned. DICOM de-identification, in-memory processing, an audit log that records no PHI, and a consent gate.

**Core deliverable:** binary whole-tumor segmentation. **Extension:** multi-class sub-regions (ET / TC / WT).

## 3. Architecture

```
                        ┌────────────────────── Browser (React + TypeScript) ───────────────────────┐
                        │  Upload & consent ─▶ local DICOM de-id / NIfTI parse                       │
 User ──HTTPS──────────▶│  NiiVue viewer: 2D slices · MPR · 3D render · overlays · uncertainty      │
                        │  ┌───────────── Private mode ─────────────┐                               │
                        │  │ onnxruntime-web (WebGPU → WASM)        │  scan never leaves the device │
                        │  └────────────────────────────────────────┘                               │
                        └───────────────┬──────────────────────────────────────────────────────────┘
                                        │ Server mode: POST /v1/segment (multipart, TLS)
                        ┌───────────────▼─────────── FastAPI on HF Spaces (Docker, CPU, free) ──────┐
                        │ validate ─▶ de-identify ─▶ preprocess (btp) ─▶ ONNX Runtime + flip-TTA    │
                        │ ─▶ post-process ─▶ profile ─▶ response (mask .nii.gz + JSON)              │
                        │ in-memory only · event-only audit log · rate limit · no request logging   │
                        └───────────────────────────────────────────────────────────────────────────┘
 Training: Kaggle GPU ─▶ PyTorch/MONAI ─▶ best.pt ─▶ ONNX export + parity test ─▶ HF Hub model repo
```

## 4. Tech stack (100% free tier)

| Layer | Choice | Why |
|---|---|---|
| **Training** | Python 3.11, PyTorch 2.x, **MONAI**, Kaggle / Colab GPUs | Medical-imaging standard; free GPUs |
| **Model serving** | **ONNX** + ONNX Runtime (server) / **onnxruntime-web** (browser) | 2–3× faster CPU inference; the same model runs in both places |
| **Backend** | **FastAPI**, Pydantic v2, Uvicorn | Async, typed, auto OpenAPI docs; reuses `src/btp` |
| **Medical I/O** | nibabel, pydicom, SimpleITK (server); NiiVue loaders, dcmjs (browser) | NIfTI + DICOM |
| **Frontend** | **React 19 + TypeScript + Vite** | Fast dev loop, typed |
| **Viewer** | **NiiVue** (WebGL2) | Built for NIfTI: overlays, MPR, 3D volume rendering |
| **UI** | Tailwind CSS + **shadcn/ui** (Radix), lucide icons, Recharts | Accessible components; good-looking defaults |
| **State / data** | TanStack Query, Zustand | API caching, simple global state |
| **Reports** | ReportLab (server) / jsPDF (private mode) | Metadata-free PDF |
| **Testing** | pytest, **Vitest** + Testing Library, **Playwright** (E2E), axe-core (a11y) | Full pyramid |
| **Quality** | ruff, ESLint, Prettier, pre-commit, pip-audit, npm audit | |
| **CI/CD** | GitHub Actions | Free |
| **Hosting** | **Vercel Hobby** (frontend) + **Hugging Face Spaces Docker CPU** (API) + **HF Hub** (weights) | Free, HTTPS |
| **Tracking** | Weights & Biases (free) / TensorBoard | |

Full reasoning: [`docs/adr/002-app-stack.md`](docs/adr/002-app-stack.md).

## 5. Repository layout

```
├── src/btp/              # ✅ built: data, preprocessing, models, training, evaluation,
│                         #    inference, profiling, privacy, io, viz, report, synthetic
├── api/                  # FastAPI service: routes, schemas, ONNX runner, Dockerfile
├── web/                  # React + Vite + NiiVue frontend
│   ├── src/components/   # Viewer, Upload, ResultCard, ProfilePanel, ConsentGate, ...
│   ├── src/inference/    # onnxruntime-web private mode (+ Web Worker)
│   └── e2e/              # Playwright tests
├── scripts/              # prepare_data · train · evaluate · export_onnx · make_demo_assets · bundle_reference
├── configs/  notebooks/  tests/  docs/
└── workplan.md · phases.md · knowledge.md · requirements.md
```

## 6. Quick start

**1. Python core (training, evaluation, API):**
```bash
python -m venv .venv
```
```bash
.venv\Scripts\activate
```
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```
```bash
pip install -r requirements-dev.txt && pip install -e .
```

**2. Demo model without BraTS (synthetic phantoms, CPU, ~10 min):**
```bash
python scripts/prepare_data.py --config configs/synthetic.yaml --synthetic 24
```
```bash
python scripts/train.py --config configs/synthetic.yaml --no-resume
```
```bash
python scripts/evaluate.py --config configs/synthetic.yaml --weights outputs/synthetic_smoke/best.pt --split test
```
```bash
python scripts/make_demo_assets.py --config configs/synthetic.yaml --weights outputs/synthetic_smoke/best.pt --eval outputs/synthetic_smoke/eval_test/summary.json --synthetic --version v0.1-synthetic
```
```bash
python scripts/export_onnx.py
```

**3. Run the API (http://localhost:8000/docs):**
```bash
uvicorn api.main:app --port 8000
```

**4. Run the web app (http://localhost:5173):**
```bash
cd web && npm install && npm run dev
```

**One-command API (same image as the HF Space):** `docker compose up --build` → http://localhost:8000/docs

**Tests:** `pytest` (Python + API + ONNX parity) · `cd web && npm test && npm run typecheck` · E2E: `python scripts/make_dicom_fixture.py` then `cd web && npx playwright test`

**Deploy (free):** API → HF Spaces via `.github/workflows/deploy-api.yml` (or `docker build -f api/Dockerfile .`). Web → import `web/` into Vercel and set `VITE_API_URL` to the Space URL.

## 7. Target results

| Metric (held-out test patients, whole tumor, per-patient 3D) | Target | Achieved |
|---|---|---|
| Mean Dice | ≥ 0.80 (stretch 0.85) | _TBD_ |
| HD95 (mm) | ≤ 10 | _TBD_ |
| Patient-level detection sensitivity | ≥ 0.95 | _TBD_ |
| Server inference per volume (free CPU) | ≤ 15 s | ✅ 4.3 s in Docker (128×128×80 demo case, TTA) |
| Private-mode inference (WebGPU laptop) | ≤ 30 s | ✅ 7.4 s (128×128×80 demo case, with TTA) |
| Viewer slice scroll | 60 fps | _TBD_ |
| ONNX vs PyTorch mask agreement | Dice ≥ 0.999 | ✅ 1.000 (demo model) |

## 8. 🔒 Privacy & HIPAA-aligned design

We are not a HIPAA covered entity, but we **design as if we were**:
- **Private mode**: inference runs on the user's own device. No PHI is ever transmitted.
- **Server mode**: processing happens in memory. Nothing is stored, request bodies are never logged, and HTTPS is used throughout.
- **DICOM de-identification** of all 18 Safe-Harbor identifier categories happens *in the browser, before upload*, and again on the server.
- The audit log records **events only**: no file names, patient fields or IPs.
- A consent gate plus a "demo data only" banner, because free hosts sign no BAA.
- No analytics or tracking cookies.

Details: [`knowledge.md § 8`](knowledge.md) · [`requirements.md § 5`](requirements.md) · [`docs/risk_assessment.md`](docs/risk_assessment.md)

## 9. Project documents

| File | What's inside |
|---|---|
| [`workplan.md`](workplan.md) | Goals, decisions, roles, timeline, risks, free-tier budget |
| [`phases.md`](phases.md) | Phase-by-phase tasks, exit gates, current build status |
| [`knowledge.md`](knowledge.md) | Domain research: MRI, BraTS, MONAI, metrics, psychology, HIPAA, web stack |
| [`requirements.md`](requirements.md) | Functional / non-functional / privacy / UX requirements, dependencies |
| [`docs/`](docs/) | ADR-001 (model), ADR-002 (app stack), eval protocol, risk assessment, model card, incident response |

## 10. Acknowledgements & licence
- BraTS Challenge data. Cite Menze 2015, Bakas 2017, Baid 2021.
- MONAI (Apache-2.0), NiiVue (BSD-2), ONNX Runtime (MIT).
- Code: MIT (proposed). Data is never redistributed in this repo.
