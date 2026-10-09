# 📚 Knowledge Base — Brain Tumor Segmentation & Profiler

> This is the team's research notebook. Each section answers a question the faculty or a viewer is likely to ask. Read it before you code, before reviews, and before the viva.

---

## Contents
1. [Clinical background: brain tumors & gliomas](#1-clinical-background)
2. [MRI basics: what the sequences show](#2-mri-basics)
3. [The BraTS dataset](#3-the-brats-dataset)
4. [Segmentation & deep learning concepts](#4-segmentation--deep-learning)
5. [MONAI and the "pretrained model" problem ⚠️](#5-monai--the-pretrained-model-problem)
6. [Evaluation metrics: honest measurement](#6-evaluation-metrics)
7. [Psychology & human factors](#7-psychology--human-factors)
8. [HIPAA & privacy principles](#8-hipaa--privacy)
9. [Ethics, bias, regulation](#9-ethics-bias-regulation)
10. [Glossary](#10-glossary)
11. [Reading list](#11-reading-list)
12. [Viva / review question bank](#12-viva-question-bank)
13. [Web stack research: why React + NiiVue + FastAPI + ONNX](#13-web-stack-research)

---

## 1. Clinical background

- **Gliomas** are the most common primary malignant brain tumors in adults. They grow from glial (supporting) cells.
- The **WHO CNS5 (2021)** classification grades gliomas 1–4 using histology *and* molecular markers (IDH mutation, 1p/19q codeletion, MGMT methylation).
  - **Low-grade (LGG):** slower growing.
  - **High-grade (HGG):** e.g. **glioblastoma (GBM), IDH-wildtype, grade 4**. Median survival is about 15 months even with treatment.
- **Why segmentation matters:**
  - **Surgery planning**: how much can be safely removed.
  - **Radiotherapy**: target volumes are drawn from these outlines.
  - **Monitoring**: response to treatment (RANO criteria) depends on tumor size changing over time.
  - **Research**: volumes are used as biomarkers.
- **Tumor sub-regions (BraTS labels):**

| Region | What it is | Best seen on |
|---|---|---|
| **Enhancing tumor (ET)** | Active tumor where contrast leaks through a broken blood–brain barrier | **T1ce** (bright rim) |
| **Necrotic core (NCR)** | Dead tissue in the middle | T1ce (dark centre) |
| **Peritumoral edema (ED)** | Swelling / infiltrated tissue around the tumor | **FLAIR** / T2 (bright) |
| **Tumor core (TC)** | ET + NCR | T1ce |
| **Whole tumor (WT)** | ET + NCR + ED | **FLAIR** |

> 💡 **This is why we chose T1ce + FLAIR.** FLAIR shows the *whole tumor extent*. T1ce shows the *active core*. Together they carry most of the signal needed for binary whole-tumor segmentation, at half the data cost of four sequences.

---

## 2. MRI basics

| Sequence | Looks like | Useful for |
|---|---|---|
| **T1** | Anatomy; fat bright, fluid dark | Structure reference |
| **T1ce (T1-Gd)** | T1 after gadolinium contrast | Enhancing tumor, necrosis |
| **T2** | Fluid bright | Edema, cysts |
| **FLAIR** | T2 with the CSF signal suppressed | Edema / whole tumor, the clearest "where is it" view |

**Technical facts that affect our code:**
- MRI intensities have **no absolute units** (unlike CT Hounsfield units). Scanners, sites and settings differ, so we must **normalize per volume**: z-score using non-zero brain voxels only.
- **Bias field**: smooth brightness variation across the image. BraTS data is already corrected.
- **Orientation**: volumes have an affine matrix (RAS/LPS). Always reorient to a common orientation (`Orientationd(axcodes="RAS")`) or overlays will be flipped.
- **Voxel spacing**: BraTS data is resampled to **1 mm³ isotropic, 240×240×155**, skull-stripped and co-registered. User uploads will **not** be, so the app must resample them and warn the user.
- **File formats**:
  - **DICOM**: one file per slice, with a header full of PHI.
  - **NIfTI (.nii/.nii.gz)**: one file per volume, with minimal metadata. This is the research standard.

---

## 3. The BraTS dataset

- **BraTS** (Brain Tumor Segmentation Challenge) has run at MICCAI since 2012. It is the benchmark for this task.
- **BraTS 2021** (RSNA-ASNR-MICCAI) had ~2,000 patients in total, of which **1,251 training cases have segmentation labels**.
- Each case has 4 NIfTI volumes (T1, T1ce, T2, FLAIR) plus `seg.nii.gz`.
- **Label values:** 0 = background, 1 = NCR, 2 = ED, **4 = ET** (relabelled to 3 in BraTS 2023+).
  - ⚠️ Label "4" catches people out: there is no label 3 in 2021 data.
- **Preprocessing already done:** co-registration, 1 mm³ resampling, skull-stripping.
- **Access and licensing:**
  - Official route: Synapse (BraTS 2021 is `syn25829067`) or the TCIA mirror (segmentation training set listed as CC BY 4.0).
  - Kaggle mirrors exist but are unofficial. **Check the licence before using one** and always cite the BraTS papers.
- **Our subset plan:** 100–150 patients.
  - Split **by patient**, e.g. 70% train / 15% val / 15% test. **Never split by slice.** Slices from the same patient on both sides of the split leak data and inflate scores.
  - Stratify by tumor size, so the test set includes both small and large tumors.
  - If possible, mix LGG and HGG-like cases.
- **Binary target:** `mask = seg > 0` (whole tumor).

---

## 4. Segmentation & deep learning

- **Semantic segmentation** assigns a class to every pixel/voxel.
- **2D vs 3D:**

| | 2D (slices) | 3D (volumes/patches) |
|---|---|---|
| GPU memory | Low ✅ (fits free T4) | High |
| Context | Misses context between slices | Full spatial context |
| Data per patient | ~60–100 useful slices | 1 sample (or patches) |
| Typical WT Dice | ~0.85–0.89 | ~0.90–0.93 |

  - **Middle ground:** "2.5D" uses neighbouring slices as extra input channels. This is cheap and gives some 3D context. It is a good stretch goal.
- **U-Net** (Ronneberger 2015) is an encoder–decoder with skip connections. It is the standard for medical segmentation.
- **Common variants:**
  - Attention U-Net.
  - **SegResNet** (Myronenko 2018, BraTS winner).
  - **nnU-Net**, which configures itself and is a very strong baseline.
  - **Swin-UNETR** (transformer-based, also in MONAI).
- **Transfer learning / fine-tuning**: start from weights trained on another dataset or task, then adapt them. This means faster convergence, less data and less compute.
- **Class imbalance**: tumor is often under 2% of brain voxels. Mitigations:
  - **Dice loss** or **Dice + BCE / Focal loss**.
  - Oversampling tumor-containing slices.
  - Cropping to the brain bounding box.
- **Augmentation** (MONAI transforms):
  - Flips, small rotations, scaling, elastic deformation.
  - Intensity scaling/shift, Gaussian noise.
  - Augmentation must be applied to **image and mask together**.
- **Post-processing:**
  - Remove tiny connected components (below N voxels).
  - Optionally keep the largest component.
  - Fill holes.
- **Uncertainty (for the trust UI):**
  - **MC-Dropout**: run inference N times with dropout on, then compute the per-pixel variance.
  - **Test-time augmentation (TTA)**: predict on flipped versions and average.
  - Either one gives a **confidence heat-map**.

---

## 5. MONAI & the "pretrained model" problem

**MONAI** (Medical Open Network for AI) is a PyTorch framework for medical imaging made by NVIDIA, King's College London and others. It offers:
- dictionary-based transforms (`LoadImaged`, `Orientationd`, `NormalizeIntensityd`, `RandCropByPosNegLabeld`…),
- networks (`UNet`, `SegResNet`, `SwinUNETR`, `FlexibleUNet`),
- losses (`DiceLoss`, `DiceCELoss`, `DiceFocalLoss`),
- metrics (`DiceMetric`, `HausdorffDistanceMetric`),
- `sliding_window_inference`,
- and the **Model Zoo**: pretrained "bundles".

### ⚠️ Key research finding: the poster's plan has a mismatch

The obvious pretrained model is MONAI's **`brats_mri_segmentation`** bundle. It is:
- a **3D SegResNet**,
- that takes **4 input channels (T1c, T1, T2, FLAIR)**,
- and outputs **3 overlapping channels (TC, WT, ET)**.
- It was trained on BraTS 2018 and recommends ≥16 GB of GPU memory. Apache-2.0 licence.

Our poster says **2D slices, 2 channels (T1ce + FLAIR), binary output**. That pretrained model **cannot be used as-is**. We have three options:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. 2D FlexibleUNet with pretrained encoder** ✅ *recommended core* | `monai.networks.nets.FlexibleUNet(in_channels=2, out_channels=1, backbone="efficientnet-b0", pretrained=True)` on 2D slices | Fits free GPU, fast, truly "fine-tunes a pretrained MONAI model", matches the poster exactly | Encoder was pretrained on ImageNet, not MRI; misses 3D context |
| **B. Adapt the 3D BraTS bundle** 🔬 *stretch / comparison* | Load bundle weights. Change the first conv from 4→2 input channels, initialising from the T1c and FLAIR filter weights. Use the WT output channel or swap the head to 1 channel. Fine-tune on 3D patches (e.g. 128³ → 96³) with AMP | MRI-specific pretraining, BraTS-native, strong | Heavier: needs smaller patches, batch 1, AMP; more engineering |
| **C. Zero-shot bundle** 📏 *baseline only* | Run the bundle on all 4 modalities to get a reference upper bound | Gives an "expert model" comparison point | Uses 4 modalities, so it is not our setting |

**Recommendation:** build **A** as the deliverable. Run **C** once as a reference. Attempt **B** if time allows. This also gives the report a nice **ablation/comparison table**, which reviewers love.

> 🗣️ **Viva line:** "We first tried the MONAI BraTS bundle. It expects 4-channel 3D input, so we compared two adaptation strategies within our compute budget."

---

## 6. Evaluation metrics

| Metric | Formula / meaning | Why |
|---|---|---|
| **Dice (DSC)** | 2\|P∩G\| / (\|P\|+\|G\|), range 0–1 | Main overlap metric used by BraTS |
| **IoU (Jaccard)** | \|P∩G\| / \|P∪G\| | Related: IoU = D/(2−D) |
| **HD95** | 95th percentile of boundary distances (mm) | Boundary quality. Dice can't see a stray blob far away; HD95 can |
| **Sensitivity / Recall** | TP/(TP+FN) | Clinical cost of **missing** tumor is high |
| **Precision / PPV** | TP/(TP+FP) | False alarms erode trust |
| **Volume error** | \|V_pred − V_gt\| / V_gt | Matters for the "Profiler" numbers |
| **Patient-level detection** | Does the model find any tumor when there is one? | For the "Tumor detected?" branch |
| **Calibration (ECE)** | Are the confidences honest? | Needed for the trust UI |

### Honest-measurement rules (non-negotiable)
1. **Report per-patient 3D Dice.** Reassemble the 2D predictions into a volume first, then compute Dice per patient, then report **mean ± SD and median** across test patients.
2. **Empty slices:** if both prediction and truth are empty, per-slice Dice is undefined (often treated as 1.0). Averaging these inflates scores. Report them separately.
3. **The test set is touched once**, at the end. All tuning happens on validation.
4. **Show failure cases** in the report: the worst 3 patients, with images.
5. **Inter-rater context:** human experts agree at roughly Dice ~0.85–0.90 on whole tumor (Menze 2015). A model in this range is about as consistent as a second expert, which makes it a meaningful benchmark.

---

## 7. Psychology & human factors

The poster's empathy map is a strong start. Here we turn each quadrant into **design decisions**.

### 7.1 Who are the users? (personas)

| Persona | Goal | Fear | Design response |
|---|---|---|---|
| **Dr. Meera, radiologist** (primary) | Get a fast first draft of the outline | Wrong outline she hasn't noticed; liability | Editable-looking overlay, opacity slider, uncertainty map, "AI draft" labelling |
| **Rahul, resident / student** (learner) | Learn what tumors look like on each sequence | Looking foolish | Teaching mode: legend explains ET/ED/NCR, side-by-side views |
| **Prof. evaluator / reviewer** | Judge rigour | Over-claimed results | Model card, honest metrics, limitations page |
| **Patient / family** (indirect) | Understand the result | Anxiety, fear | *Not a target user.* The app shows **no prognosis**, uses calm language, and is labelled "for clinicians" |

### 7.2 Empathy map → requirements

| They… | Insight | What we build |
|---|---|---|
| **Say** "How long until I get a result?" | Waiting creates anxiety, and an unknown wait feels longer | Progress bar with **named stages** ("Normalizing… Segmenting slice 45/155…"), plus the expected time shown up front |
| **Say** "Can I trust this outline?" | Trust has to be *earned and calibrated* | Visible Dice score, uncertainty heat-map, "Model performs worse on: small tumors, non-BraTS scans" |
| **Say** "Which scans do you need?" | Unclear input means failure and frustration | Upload screen lists exactly: *T1ce + FLAIR, NIfTI or DICOM*, with example files and validation that gives friendly errors |
| **Think** "Manual tracing takes too long" | Value = time saved | Show "Segmented 155 slices in 4.2 s" |
| **Think** "Are borders precise?" | Boundary anxiety | Contour-only mode (outline, not a filled blob), zoom, opacity slider |
| **Think** "Should assist, not replace" | **Autonomy** must be kept | Language: "AI suggestion", "review required"; the clinician has the final say |
| **Do** trace slice by slice | Mental model = slice scrolling | Slice slider + keyboard/mouse scroll; jump to "largest tumor slice" |
| **Do** cross-check with colleagues | Social verification | Exportable PNG/PDF report and mask (.nii.gz) to share and compare |
| **Feel** fatigued | Cognitive load | Clean UI, one primary action per screen, sensible defaults |
| **Feel** uncertain about consistency | Need for reliability | Deterministic inference (same input → same output), version shown |
| **Feel** reassured when output matches judgment | Confirmation matters | Side-by-side "image / overlay" makes agreement fast to verify |

### 7.3 Cognitive biases we must design against
- **Automation bias**: people over-trust confident machines and miss AI errors.
  → Show uncertainty. Never present output as definitive. Use the label "Review required".
- **Algorithm aversion**: one visible error makes people distrust everything.
  → Be upfront about limits *before* errors happen, which keeps trust calibrated.
- **Anchoring**: the AI outline anchors human judgment.
  → Default to **contour with adjustable opacity**, and let users view the raw image first.
- **Confirmation bias**: users accept output that matches what they expected.
  → The uncertainty map highlights the areas worth a second look.
- **Alarm fatigue**: too many warnings get ignored.
  → Use three warning levels (info / caution / critical) and keep critical ones rare.

### 7.4 Perception & visual design
- **Colour-blind-safe overlay**: ~8% of men have red–green colour deficiency.
  - Avoid red-vs-green.
  - Use a **viridis/cyan-magenta** palette or a high-contrast **yellow contour**.
- **Never encode meaning by colour alone.** Also use labels, patterns or contour style.
- **Pre-attentive attention**: a single bright contour on a greyscale MRI pops out immediately. Use one accent colour.
- **Hick's law**: fewer choices mean faster decisions. Advanced options are hidden behind an "Advanced" expander.
- **Fitts's law**: large slider and primary buttons.
- **Doherty threshold (~400 ms)**: moving the slice slider must feel instant.
  → Pre-compute all overlays once, then just index into them.
- **Peak-end rule**: users remember the best moment and the ending. Make the **result reveal** satisfying (smooth jump to the largest-tumor slice) and the **end** clear (summary card + download).
- **Nielsen's 10 heuristics** as a checklist, especially:
  - *visibility of system status*,
  - *error prevention*,
  - *recognition over recall*,
  - *help users recover from errors*.

### 7.5 Emotional tone of language
- ❌ "Malignant mass detected!" → ✅ "Region suggestive of tumor identified. Clinical review required."
- ❌ "No cancer" → ✅ "No tumor region detected by the model. This does not rule out disease."
- No prognosis and no survival numbers, ever.
- Errors are blameless: "We couldn't read this file. It may be a T2 scan; we need T1ce and FLAIR."

### 7.6 Presentation psychology (for demo day)
- **Story arc:** problem (a radiologist tracing at 2 a.m.) → struggle → our tool → live demo → honest numbers → future.
- **Lead with the demo** within the first 60 seconds. "Show, don't tell" builds credibility.
- **Pre-empt the hard question** ("Is it accurate?") with the metrics slide *before* anyone asks.
- **Rule of three:** three requirements, three key results, three future directions.
- **Prepare a backup:** a pre-recorded demo video plus local inference in case the Wi-Fi fails.

---

## 8. HIPAA & privacy

### 8.1 What HIPAA is
The **Health Insurance Portability and Accountability Act (1996, USA)**. Its rules:
- **Privacy Rule**: who may use and disclose **Protected Health Information (PHI)**, and the **"minimum necessary"** standard.
- **Security Rule**: protects **electronic PHI (ePHI)** through **administrative, physical and technical safeguards**.
- **Breach Notification Rule**: individuals and HHS must be notified of breaches; large breaches (over 500 people) also require media notice.
- **Enforcement Rule**: civil penalties, scaled by level of culpability.
- **HITECH Act (2009)**: strengthened penalties and extended obligations to **Business Associates**.

### 8.2 Does it apply to us?
**Legally, no.** HIPAA binds *covered entities* (providers, insurers, clearinghouses) and their *business associates*. We are a student team using public de-identified data, and we are in India.

**Why we adopt it anyway:**
1. Any real clinical deployment would need it.
2. It shows professional maturity.
3. India's **Digital Personal Data Protection (DPDP) Act, 2023** treats health data as personal data with similar duties: consent, purpose limitation, security safeguards, breach notification.

> ✅ Say **"HIPAA-aligned design"**. ❌ Never say **"HIPAA-compliant"**. Compliance needs a covered-entity context, BAAs, risk analyses and audits.

### 8.3 The 18 Safe-Harbor identifiers (must be removed to de-identify)
1. Names
2. Geographic units smaller than a state (first 3 ZIP digits may stay if the area has >20k people)
3. All date elements except year (birth, admission, scan…); ages over 89
4. Phone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health-plan beneficiary numbers
10. Account numbers
11. Certificate/licence numbers
12. Vehicle identifiers
13. Device identifiers/serials
14. URLs
15. IP addresses
16. Biometric identifiers
17. **Full-face photographs and comparable images**
18. Any other unique identifying number or code

The alternative route is **Expert Determination**: a statistician certifies that the re-identification risk is very small.

> 🧠 **Imaging-specific risks:**
> - **DICOM headers** contain PatientName, PatientID, BirthDate, InstitutionName, dates, and more.
> - **Burned-in text** may appear in pixel data.
> - **3D head MRI can be rendered into a recognisable face** (research has shown face-recognition matches). This is why datasets are **skull-stripped / defaced**. BraTS is skull-stripped, which removes this risk for our training data.

### 8.4 Security Rule safeguards → our implementation

| Safeguard | HIPAA expectation | Our design |
|---|---|---|
| **Administrative**: risk analysis | Identify threats to ePHI | `docs/risk_assessment.md` with a STRIDE threat model |
| Administrative: workforce training | Staff know the rules | Team privacy checklist; PR template asks "Does this touch user data?" |
| Administrative: BAAs | Vendors handling PHI sign a BAA | Free hosts (HF Spaces, Vercel, Colab) **do not sign BAAs**, so the **server demo = demo data only**, with an explicit banner. **Private mode** avoids the problem entirely: no PHI is ever transmitted |
| **Physical**: device/media controls | Secure hardware, disposal | No patient data on personal laptops; only BraTS data, kept in git-ignored folders |
| **Technical**: access control | Unique user IDs, auto-logoff | Public demo has no accounts; a future clinical mode would add login + MFA + session timeout |
| Technical: audit controls | Log access to ePHI | Append-only audit log: timestamp, session hash, action, file hash. **No content, no names** |
| Technical: integrity | Prevent improper alteration | SHA-256 of uploaded file and model weights; version shown in the report |
| Technical: transmission security | Encrypt in transit | HTTPS only (TLS 1.2+) |
| Technical: encryption at rest | Addressable today; **proposed to become mandatory** | No storage by default; opt-in storage encrypted (Fernet/AES) |
| Technical: authentication | Verify identity | Proposed rule would require **MFA**; documented as future work |

> 📌 **Current regulatory status (checked Oct 2026):** HHS proposed a major Security Rule update in **Jan 2025**: mandatory encryption, MFA, asset inventory, annual penetration tests, removal of "addressable" specs. It is **still not final**. The OMB agenda now points to **July 2027**. The existing rule stays in force. *Our design already meets the proposed encryption and MFA intentions, so the project is "future-ready". That is a good review talking point.*

### 8.5 Privacy-by-design principles we apply (Cavoukian's 7)
1. **Proactive, not reactive**: the threat model is written before deployment.
2. **Privacy as the default**: nothing is stored unless the user opts in.
3. **Privacy embedded in design**: the de-identification module sits *before* any processing.
4. **Full functionality**: privacy does not break features. We keep the image geometry and drop the identity.
5. **End-to-end security**: TLS in transit, deletion at session end.
6. **Visibility & transparency**: a Privacy page explains exactly what happens to the file.
7. **Respect for the user**: consent checkbox, plain language, delete-now button.

### 8.6 Data-flow with privacy gates
```
Upload ─▶ [Gate 1: consent + "no real PHI" ack] ─▶ [Gate 2: file type/size validation]
       ─▶ [Gate 3: DICOM header scrub + burned-in text warning] ─▶ in-memory NIfTI
       ─▶ inference ─▶ results in session state ─▶ [Gate 4: export strips metadata]
       ─▶ session end / "Delete now" ─▶ buffers wiped, temp files removed, audit event logged
```

---

## 9. Ethics, bias, regulation

- **Dataset bias**:
  - BraTS comes mostly from North American and European centres, with mostly adult gliomas.
  - The model may do worse on paediatric tumors, metastases, meningiomas, other scanners or other populations (including Indian hospitals).
  - **State this on the limitations page.**
- **Distribution shift**: uploads that are not skull-stripped or are oriented differently will degrade results. Add **input sanity checks**: intensity stats, shape, a brain-mask heuristic.
- **Accountability**: the clinician stays responsible, and the UI reinforces this.
- **Regulation**: software that diagnoses is **Software as a Medical Device (SaMD)**.
  - In the USA it is regulated by the FDA (510(k)/De Novo).
  - In India it falls under CDSCO's Medical Devices Rules 2017.
  - We stay "research use only".
- **Model card** (Mitchell et al. 2019): intended use, out-of-scope uses, training data, metrics, ethical considerations, caveats. *Ship one with the app.*
- **Environmental note**: fine-tuning instead of training from scratch reduces compute and carbon. This is a small but real ethics point.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **AMP** | Automatic Mixed Precision: fp16 training that saves memory |
| **BAA** | Business Associate Agreement (HIPAA vendor contract) |
| **BraTS** | Brain Tumor Segmentation Challenge / dataset |
| **Dice / DSC** | Overlap score, 0–1 |
| **ePHI / PHI** | (Electronic) Protected Health Information |
| **FLAIR** | Fluid-Attenuated Inversion Recovery MRI |
| **HD95** | 95th-percentile Hausdorff distance |
| **MONAI** | Medical Open Network for AI |
| **NIfTI** | Neuroimaging file format (.nii.gz) |
| **SaMD** | Software as a Medical Device |
| **T1ce** | Contrast-enhanced T1 MRI |
| **TTA** | Test-time augmentation |
| **WT / TC / ET** | Whole tumor / tumor core / enhancing tumor |

---

## 11. Reading list

**Must-read (core):**
1. Menze et al., *The Multimodal Brain Tumor Image Segmentation Benchmark (BRATS)*, IEEE TMI 2015.
2. Baid et al., *The RSNA-ASNR-MICCAI BraTS 2021 Benchmark*, arXiv:2107.02314.
3. Ronneberger et al., *U-Net*, MICCAI 2015.
4. Myronenko, *3D MRI brain tumor segmentation using autoencoder regularization*, BrainLes 2018.
5. Cardoso et al., *MONAI: An open-source framework for deep learning in healthcare*, arXiv:2211.02701.

**Strongly recommended:**
6. Isensee et al., *nnU-Net*, Nature Methods 2021.
7. Hatamizadeh et al., *Swin UNETR*, BrainLes 2021.
8. Maier-Hein et al., *Metrics Reloaded*, Nature Methods 2024 (choosing metrics properly).
9. Mitchell et al., *Model Cards for Model Reporting*, FAT* 2019.
10. Gal & Ghahramani, *Dropout as a Bayesian Approximation*, ICML 2016 (MC-Dropout).

**Human factors & privacy:**
11. Parasuraman & Riley, *Humans and Automation: Use, Misuse, Disuse, Abuse*, 1997 (automation bias).
12. Dietvorst et al., *Algorithm Aversion*, 2015.
13. HHS, *Guidance Regarding Methods for De-identification of PHI*, 2012.
14. HHS, *HIPAA Security Rule NPRM*, Federal Register, 6 Jan 2025.
15. Schwarz et al., *Identification of anonymous MRI research participants with face-recognition software*, NEJM 2019.

**Links:**
- MONAI Model Zoo: https://monai.io/model-zoo.html
- BraTS bundle: https://huggingface.co/MONAI/brats_mri_segmentation
- BraTS 2021 paper: https://arxiv.org/abs/2107.02314
- Security Rule delay coverage: https://www.fiercehealthcare.com/health-tech/feds-push-back-hipaa-security-rule-overhaul-july-2027

---

## 12. Viva question bank

| Question | Short answer |
|---|---|
| Why only T1ce and FLAIR? | FLAIR shows whole extent, T1ce the active core; together they cover most whole-tumor signal at half the data/compute cost. |
| Why 2D instead of 3D? | Fits free-tier GPUs; more training samples per patient; we compensate partly with 2.5D/TTA and report the trade-off honestly. |
| What does "fine-tuning a pretrained MONAI model" mean exactly? | We initialise a MONAI network with pretrained weights (encoder or BraTS bundle) and continue training on our subset with a lower LR. |
| How did you avoid data leakage? | Patient-level split, test set used once, normalisation stats computed per volume. |
| Why is Dice not enough? | It misses boundary errors and stray false positives; we add HD95, sensitivity, volume error. |
| How do you know a Dice of 0.8x is good? | Human inter-rater agreement on whole tumor is ~0.85–0.90. |
| Is your app HIPAA-compliant? | No. It is HIPAA-*aligned*: we implement the safeguards, but compliance requires a covered-entity context, BAAs and audits. |
| What if someone uploads real patient data to the demo? | Banner + consent gate, DICOM scrubbing, in-memory processing, auto-delete, no content logging. |
| How do you prevent over-reliance on the AI? | Uncertainty maps, "review required" language, contour-only default, published limitations. |
| What are the main limitations? | 2D context, small subset, BraTS-only distribution, binary output, not clinically validated. |
| Future work? | Multi-class sub-regions, 3D/2.5D models, editable masks, PACS/DICOM-SR integration, prospective validation. |
| Why not Streamlit? | It re-runs the whole script on every interaction, can't do GPU-rendered MPR/3D viewing, and forces server-side processing. React + NiiVue gives a real medical viewer, and ONNX lets the model run in the browser. |
| What is Private mode and why does it matter for HIPAA? | The ONNX model runs in the user's browser (WebGPU/WASM). The scan is never transmitted, so there is no third party, no BAA question and no server breach surface. We prove it with a network capture. |
| How do you know the browser/ONNX model equals the trained model? | Parity tests: ONNX vs PyTorch mask Dice ≥ 0.999, and browser vs server ≥ 0.99, on the same cases. |
| Is everything really free? | Yes: Kaggle/Colab for training, HF Spaces CPU for the API, Vercel Hobby for the web app, HF Hub for weights, GitHub Actions for CI. No credit card anywhere. |

---

## 13. Web stack research

### 13.1 Requirements that drive the choice
1. A **real medical viewer**: scroll, zoom, multi-planar views, 3D, overlays at 60 fps.
2. **Privacy**: ideally, the scan never leaves the device.
3. **Free hosting** only.
4. Reuse of the existing Python core (`src/btp`) and its tests.
5. A team of 4 students in one semester.

### 13.2 Viewer options
| Library | Strengths | Weaknesses | Fit |
|---|---|---|---|
| **NiiVue** (WebGL2) | Built for NIfTI; overlays with colormaps and opacity; MPR + 3D volume rendering; small; React-friendly; used by Brainchop and other BraTS/stroke web viewers | Less DICOM-centric | ✅ **Chosen** |
| Cornerstone3D / OHIF | Clinical-grade DICOM, PACS workflows, segmentation tools | Heavy; NIfTI is second-class; steep learning curve | Overkill |
| VTK.js | Very powerful 3D | Low-level; much more code | Too much effort |
| Papaya | Simple NIfTI viewer | Old, unmaintained | ❌ |
| Matplotlib images (Streamlit) | Easy | Not interactive, server round-trips | ❌ |

**NiiVue tips:**
- Load background + overlay via `loadVolumes([{url: t1ce}, {url: mask, colormap: 'red', opacity: 0.5}])`.
- Use `setSliceType` for axial / coronal / sagittal / multiplanar / render.
- Clean up WebGL contexts when switching cases; browsers cap the number of contexts.

### 13.3 In-browser inference (Private mode)
- **onnxruntime-web** runs ONNX models with a **WebGPU** backend (fast; Chrome/Edge, and increasingly others) or a **WASM** backend (works everywhere, slower). Microsoft reported large WebGPU speed-ups for segmentation-style models (e.g. Segment Anything encoder ~19×).
- **Precedent:** *Brainchop* runs whole-brain MRI segmentation in the browser with NiiVue. This shows the idea is feasible for neuroimaging.
- **Our model fits well:** a 2D EfficientNet-B0 U-Net is about 6M parameters (~25 MB FP32, ~13 MB FP16). Running ~100 brain slices at 256×256 is realistic on a laptop GPU.
- **Rules:**
  - Run inference in a **Web Worker** so the UI never freezes.
  - Cache the model in Cache Storage.
  - Check the WebGPU operator coverage of the exported graph.
  - Keep an automatic WASM fallback.

### 13.4 Backend options
| Option | Verdict |
|---|---|
| **FastAPI** | ✅ Async, typed (Pydantic), automatic OpenAPI → typed TS client; same language as `btp` |
| Flask | Simpler, but no typing or OpenAPI out of the box |
| Django | Too heavy for a stateless inference API |
| Node backend | Would need to rewrite the preprocessing in JS anyway |
| Serverless (Vercel functions) | Size and time limits are too small for an ML model |

**Serving:** ONNX Runtime CPU is typically 2–3× faster than eager PyTorch on CPU, and the Docker image is much smaller without torch. Both help on a free 2-vCPU Space.

### 13.5 Free hosting realities
- **HF Spaces (Docker, CPU basic):** free 2 vCPU / 16 GB, sleeps when idle. Cold start ~30–60 s → show a "waking server" state and warm it before demos.
- **Vercel Hobby:** free static hosting with preview deployments; intended for personal/non-commercial use (a student project qualifies). It holds no user data.
- **Kaggle:** ~30 GPU-hours per week. **GitHub Actions:** free minutes. **HF Hub:** free model hosting.
- None of these sign a **BAA**, which is exactly why the server demo is restricted to de-identified/sample data and Private mode exists.

### 13.6 Psychology of the new UI (additions to § 7)
- **Mode choice as an autonomy cue:** letting users choose Private vs Server mode increases perceived control and trust.
- **3D render = "aha" moment:** spatial understanding plus a memorable demo (peak-end rule).
- **Processing-state honesty:** "Waking the free server, ~40 s" is better than a frozen spinner, because uncertainty about waiting time increases perceived wait.
- **Familiar clinical layout:** a 4-panel MPR matches radiologists' mental models (recognition over recall).

### 13.7 Sources
- NiiVue: https://github.com/niivue/niivue · React example: https://github.com/niivue/niivue-react
- Example NiiVue + React + Vite medical viewer on HF Spaces: https://huggingface.co/spaces/VibecoderMcSwaggins/stroke-viewer-frontend
- ONNX Runtime Web + WebGPU: https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/
- Browser-native MRI rendering (2026): https://arxiv.org/abs/2605.19737
