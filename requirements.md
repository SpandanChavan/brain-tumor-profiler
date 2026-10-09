# 📋 Requirements Specification — Brain Tumor Segmentation & Profiler

> **Version** 0.2 (stack v2: React + NiiVue + FastAPI + ONNX, free tier only) · **Owner** Group BCAIAA20 · **Status** For review by Prof. Jyoti Gavhane
>
> Priority uses **MoSCoW**: **M**ust / **S**hould / **C**ould / **W**on't (this release).
> Each requirement has an ID so test cases, commits and the report can trace back to it.

---

## 1. Purpose & scope

**Purpose.** Build a research-grade tool that segments brain tumors in MRI (T1ce + FLAIR) using a fine-tuned pretrained MONAI model, shows the result in a React + NiiVue web viewer (2D, multi-planar, 3D), served by a FastAPI + ONNX Runtime API or run fully in the browser (Private mode), and reports honest performance metrics. All data handling follows HIPAA-aligned privacy principles.

**In scope**
- Binary whole-tumor segmentation.
- A BraTS subset of 100–150 patients.
- NIfTI input (DICOM as a Should).
- A web viewer, tumor profile and downloadable report.
- Free-tier compute.

**Out of scope (this release)**
- Clinical diagnosis or treatment advice, and prognosis.
- PACS integration.
- Real patient data.
- Regulatory certification.
- Mobile apps.

---

## 2. Stakeholders

| Stakeholder | Interest |
|---|---|
| Radiologist / clinician (primary persona) | Fast, trustworthy first-draft outlines |
| Medical student / resident | Learning tool |
| Faculty guide & evaluators | Rigour, novelty, honest results, good presentation |
| Project team | Feasible scope, learning, a strong portfolio piece |
| Patients (indirect) | Privacy, safety, no false reassurance |

---

## 3. Functional requirements

### 3.1 Data & training pipeline
| ID | Requirement | Priority |
|---|---|---|
| FR-D1 | Index the BraTS subset into a manifest (patient ID, file paths, tumor volume) | M |
| FR-D2 | **Patient-level** train/val/test split (≈70/15/15), stratified by tumor size, saved to `splits.json` and seeded | M |
| FR-D3 | Preprocessing: reorient to RAS, per-volume z-score on brain voxels, crop to the brain bounding box, resize slices to 224/256 | M |
| FR-D4 | Slice extraction that keeps all tumor slices and a sample of non-tumor slices (configurable ratio, e.g. 1:1) | M |
| FR-D5 | Binary label conversion: `seg > 0` | M |
| FR-D6 | Augmentation (flip, rotate ±15°, scale, intensity shift, noise) applied to image and mask together | M |
| FR-D7 | Multi-class labels (ET / TC / WT) kept available for the extension | C |
| FR-D8 | 2.5D input (neighbouring slices as channels) | C |

### 3.2 Model
| ID | Requirement | Priority |
|---|---|---|
| FR-M1 | Fine-tune a **pretrained MONAI network**: FlexibleUNet (EfficientNet encoder, pretrained) with 2 input channels → 1 output | M |
| FR-M2 | Loss: Dice + BCE (or DiceFocal); AdamW; cosine LR schedule; AMP; early stopping on val Dice | M |
| FR-M3 | Config-driven experiments (YAML), fully reproducible (seed, versions, git hash logged) | M |
| FR-M4 | Reference run of MONAI `brats_mri_segmentation` bundle (zero-shot, 4 modalities) for comparison | S |
| FR-M5 | Adapted 3D bundle (4→2 channel first layer, WT head) fine-tuned on patches | C |
| FR-M6 | Export best model to TorchScript/ONNX for fast CPU inference | S |
| FR-M7 | Multi-class sub-region model | C |

### 3.3 Evaluation
| ID | Requirement | Priority |
|---|---|---|
| FR-E1 | Per-patient **3D** Dice, IoU, HD95, sensitivity, precision, volume error on the test set | M |
| FR-E2 | Report mean ± SD, median, and per-patient table; box plots | M |
| FR-E3 | Error analysis: worst-5 cases visualised, with failure categories (small tumors, edges, artefacts) | M |
| FR-E4 | Slice-level detection metrics (tumor present? ROC-AUC) | S |
| FR-E5 | Calibration (reliability diagram, ECE) | C |
| FR-E6 | Ablations: T1ce-only vs FLAIR-only vs both; with/without pretraining; with/without TTA | S |

### 3.4 Inference API (FastAPI)
| ID | Requirement | Priority |
|---|---|---|
| FR-S1 | `GET /v1/health` (liveness + model loaded) and `GET /v1/model` (version, SHA-256, test metrics, limitations) | M |
| FR-S2 | `POST /v1/segment`: multipart `t1ce`, `flair` (NIfTI or zipped DICOM), options `tta`, `threshold`. Returns `{profile, warnings, timings, model_version}` + gzipped NIfTI mask & uncertainty | M |
| FR-S3 | `GET /v1/samples` + sample file download (test-split cases only, with expert labels) | M |
| FR-S4 | ONNX Runtime CPU inference reusing `btp` preprocessing/post-processing; flip-TTA | M |
| FR-S5 | Request validation with friendly error codes (wrong format, shape mismatch, too large) | M |
| FR-S6 | Rate limiting + max 2 concurrent jobs; 200 MB limit; zip-bomb guard; timeout | M |
| FR-S7 | Auto-generated OpenAPI docs; typed TS client generated from them | S |

### 3.5 Web application (React + NiiVue)
| ID | Requirement | Priority |
|---|---|---|
| FR-A1 | Consent gate before any upload/analysis | M |
| FR-A2 | Drag-and-drop upload of T1ce + FLAIR (`.nii`, `.nii.gz`, DICOM zip/folder) with format help and validation | M |
| FR-A3 | One-click **sample cases** gallery | M |
| FR-A4 | Processing screen: named stages, progress, expected time, "waking server" state for cold starts | M |
| FR-A5 | **NiiVue viewer**: axial / coronal / sagittal / multiplanar layouts, scroll/zoom/pan, crosshair, window/level | M |
| FR-A6 | Mask overlay: contour / filled, opacity, colour-blind-safe palettes, toggle on/off (raw image first) | M |
| FR-A7 | **3D render** of the brain with the tumor volume | S |
| FR-A8 | Uncertainty layer toggle | S |
| FR-A9 | AI-vs-expert comparison (TP / FP / FN) for sample cases | S |
| FR-A10 | Result card ("region suggestive of tumor" / "no tumor detected… does not rule out disease") | M |
| FR-A11 | Profile panel: volume, slice range, max-area slice, extent, side, components, mean uncertainty, per-slice area chart linked to the viewer | M |
| FR-A12 | Exports: mask `.nii.gz`, PNG screenshot, metadata-free PDF report | S |
| FR-A13 | About-the-model page (from `/v1/model`) and Privacy page | M |
| FR-A14 | **Private mode**: in-browser inference with onnxruntime-web (WebGPU → WASM) in a Web Worker; model cached locally | S |
| FR-A15 | Browser-side DICOM de-identification before display/upload | S |
| FR-A16 | Keyboard shortcuts (↑/↓ slice, O overlay, U uncertainty, 1–4 layouts) | C |
| FR-A17 | Responsive layout (laptop first; tablet usable) | S |
| FR-A18 | Manual mask editing | W |

## 4. Non-functional requirements

| ID | Category | Requirement | Priority |
|---|---|---|---|
| NFR-1 | Performance | Server (HF Spaces free CPU, warm) ≤ 15 s per volume; Private mode ≤ 30 s on a WebGPU laptop, ≤ 120 s on WASM | M |
| NFR-2 | Responsiveness | Viewer scrolls at 60 fps (GPU-rendered by NiiVue); first paint of a loaded volume ≤ 2 s | M |
| NFR-3 | Accuracy | Mean per-patient whole-tumor Dice ≥ 0.80 on the test set (stretch 0.85) | M |
| NFR-4 | Reliability | Deterministic inference: identical input gives identical output | M |
| NFR-5 | Robustness | Invalid/unsupported input never crashes the app; it shows a helpful error | M |
| NFR-6 | Cost | **Everything on free tiers**: Kaggle/Colab (training), HF Spaces CPU (API), Vercel Hobby (web), HF Hub (weights), GitHub Actions (CI). No credit card | M |
| NFR-6b | Model portability | ONNX export; ONNX-vs-PyTorch mask Dice ≥ 0.999; web model ≤ 30 MB | M |
| NFR-7 | Portability | Whole stack runs locally (`docker compose up` for the API, `npm run dev` for the web); latest Chrome/Edge/Firefox | M |
| NFR-8 | Maintainability | Typed Python (ruff) and strict TypeScript (ESLint); ≥ 80% coverage on `src/btp`; Vitest components; Playwright E2E | S |
| NFR-9 | Reproducibility | Every reported number traceable to config + seed + commit + weights hash | M |
| NFR-10 | Usability | SUS (System Usability Scale) score ≥ 70 in a 5–8 person user test | S |
| NFR-11 | Accessibility | WCAG 2.1 AA (axe-core clean); colour never the only cue; full keyboard operation | S |
| NFR-12 | Documentation | README, model card, user guide, API docstrings | M |

---

## 5. Privacy & security requirements (HIPAA-aligned)

> We describe the project as **HIPAA-aligned**, never "HIPAA-compliant". Mapping to HIPAA rules is in `knowledge.md § 8`.

| ID | HIPAA principle | Requirement | Priority |
|---|---|---|---|
| PR-1 | Privacy Rule: de-identified data | Train and demo only on de-identified public data (BraTS) | M |
| PR-2 | Minimum necessary | Accept only the 2 sequences needed; discard all other metadata | M |
| PR-3 | Safe Harbor | DICOM header scrubber removes all 18 identifier categories (names, IDs, dates, institution, device serials, etc.) before any processing | S |
| PR-4 | Safe Harbor (images) | Warn if an upload is not skull-stripped (face may be reconstructable); burned-in-text warning for DICOM | S |
| PR-5 | Consent / transparency | Upload requires checking "I confirm this contains no real identifiable patient data" | M |
| PR-6 | Public-host limitation | Persistent banner on the hosted demo: "Demo only. Do not upload real patient data" (free hosts sign no BAA) | M |
| SR-1 | Technical: transmission security | HTTPS only on deployment | M |
| SR-2 | Data retention | Uploads processed in memory/temp dir; deleted at session end; **"Delete now"** button | M |
| SR-3 | Encryption at rest | No persistence by default; any optional storage is encrypted (AES/Fernet) | S |
| SR-4 | Audit controls | Append-only audit log of events (timestamp, salted session hash, action, file SHA-256). **No PHI, no file contents, no IPs** | S |
| SR-5 | Access control | Optional authenticated "clinical mode" with session timeout (15 min idle) | C |
| SR-6 | Authentication | MFA documented as future work (aligned with the proposed 2025 Security Rule) | W |
| SR-7 | Integrity | Model weights verified by SHA-256 at load; version shown in UI and reports | S |
| SR-8 | No leakage | No PHI in URLs, query params, logs, error traces, analytics or exception reports; no analytics/cookies; no request-body logging on the API | M |
| SR-9 | Secrets | No secrets in git; `.env` + `.gitignore`; `data/` and `models/` git-ignored | M |
| SR-10 | Risk analysis | Written threat model (STRIDE) + risk register in `docs/risk_assessment.md` | M |
| SR-11 | Breach readiness | One-page incident-response note (what to do if data is exposed) | C |
| SR-12 | Dependency security | `pip-audit` + `npm audit` in CI | S |
| SR-13 | Private mode | Scan bytes never leave the browser; verified by HAR network capture | S |
| SR-14 | Web security | CSP, HSTS, Referrer-Policy `no-referrer`, Permissions-Policy; CORS limited to the frontend origin | M |
| SR-15 | Ephemeral results | Server results held in memory ≤ 10 min (TTL), then purged; never written to disk | M |

---

## 6. UX & human-factors requirements (from the empathy map)

| ID | Insight (poster) | Requirement | Priority |
|---|---|---|---|
| UX-1 | "How long until I get a result?" | Show expected time before running; staged progress during it | M |
| UX-2 | "Can I trust this outline?" | Dice score, uncertainty layer and limitations visible from the result screen | M |
| UX-3 | "Which scans do you need?" | Upload area states required sequences and formats, with example files | M |
| UX-4 | "Should assist, not replace" | All outputs labelled "AI suggestion. Clinical review required" | M |
| UX-5 | Fatigue | One primary action per screen; advanced options collapsed; sensible defaults | M |
| UX-6 | Border precision worry | Contour mode, opacity control, zoom | M |
| UX-7 | Cross-checking with colleagues | Shareable export (PNG/PDF/NIfTI) | S |
| UX-8 | Emotional safety | No alarming words, no prognosis; "no tumor detected" always says it does not rule out disease | M |
| UX-9 | Automation-bias guard | Raw image visible first / togglable; uncertainty highlights regions to re-check | S |

---

## 7. Data requirements

| Item | Detail |
|---|---|
| Source | BraTS 2021 training set (Synapse `syn25829067` / TCIA mirror). Licence checked and cited |
| Size | 100–150 patients (start with 100; scale if time and quota allow) |
| Modalities | T1ce, FLAIR (+ seg). T1/T2 only for the bundle reference run |
| Storage | Kaggle dataset / Google Drive (private); never committed to git |
| Demo cases | 2–3 BraTS test-split cases shipped with the app (allowed under licence, with attribution) |

---

## 8. Constraints & assumptions

- **Compute**: free tier only (Kaggle ~30 GPU-h/week, Colab with session limits).
- **Time**: one academic semester (see `workplan.md`).
- **Team**: 4 members.
- **Assumption**: BraTS volumes are already co-registered and skull-stripped. Arbitrary user uploads may not be, and results on those are not guaranteed.

---

## 9. Acceptance criteria (definition of done for the release)

- [ ] All **Must** requirements implemented and traced to a test or demo step
- [ ] Test-set metrics computed once, reported per-patient, with the worst cases shown
- [ ] Mean whole-tumor Dice ≥ 0.80 **or** an honest analysis of why not
- [ ] Web app (Vercel) + API (HF Spaces) live with sample cases; Private mode works offline
- [ ] Privacy page, model card, and limitations visible in the app
- [ ] Threat model and risk register written
- [ ] User test (≥ 5 participants) done; SUS score and feedback recorded
- [ ] Final report, poster v2, slides and demo video ready

---

## 10. Tech stack & dependencies (all free / open source)

### Python: training + API
```text
torch>=2.2  torchvision>=0.17  monai[nibabel,skimage,einops]>=1.4      # training
onnx>=1.16  onnxruntime>=1.18                                          # export + CPU serving
fastapi>=0.115  uvicorn[standard]>=0.30  pydantic>=2.7  python-multipart  slowapi
nibabel>=5.2  SimpleITK>=2.3  pydicom>=2.4
numpy  scipy  scikit-image  pandas  pyyaml  reportlab  cryptography
# dev: pytest pytest-cov httpx ruff pre-commit pip-audit tensorboard
```
> The API Docker image installs **CPU-only onnxruntime + btp, without PyTorch**, so it stays small for the free Space.

### Web (`web/package.json`)
```text
react@19 react-dom@19 react-router typescript vite
@niivue/niivue            # WebGL2 medical viewer (2D / MPR / 3D, overlays)
onnxruntime-web           # Private mode (WebGPU / WASM)
dcmjs                     # browser DICOM parsing + de-identification
tailwindcss  shadcn/ui (Radix)  lucide-react  recharts
@tanstack/react-query  zustand  openapi-typescript  jspdf
# dev: vitest @testing-library/react @playwright/test @axe-core/playwright eslint prettier
```

### Free services
| Purpose | Service |
|---|---|
| Training GPUs | Kaggle Notebooks, Google Colab |
| API hosting | Hugging Face Spaces (Docker, CPU basic) |
| Frontend hosting | Vercel Hobby (alt: Cloudflare Pages / GitHub Pages) |
| Weights | Hugging Face Hub |
| CI/CD | GitHub Actions |
| Tracking | Weights & Biases free / TensorBoard |

## 11. Traceability (excerpt)

| Poster element | Requirements |
|---|---|
| Req 1: Accurate Tumor Detection | FR-M1, FR-M2, FR-E1, NFR-3 |
| Req 2: Fast, Consistent Output | NFR-1, NFR-2, NFR-4, FR-E1 |
| Req 3: Accessible Interface | FR-S1–S7, FR-A1–A17, UX-1–UX-9, NFR-10, NFR-11 |
| Empathy map | UX-1–UX-9 |
| "Transparently reported Dice" | FR-E1, FR-E2, FR-A11 |
| Free-tier feasibility | NFR-6, NFR-6b, FR-M1 |
| Privacy-first (Private mode) | FR-A14, FR-A15, SR-13 |
| HIPAA principles (added) | PR-1–PR-6, SR-1–SR-12 |
