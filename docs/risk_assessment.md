# Privacy & security risk assessment (SR-10)

> This is a HIPAA Security Rule-style risk analysis for a research prototype. Scope: the React/NiiVue web app (incl. Private mode), the FastAPI inference API, the training pipeline and the repository. Version 1 was written in Phase 1; this copy is updated for Phase 6.

## 1. Data inventory
| Data | Source | Sensitivity | Where it lives |
|---|---|---|---|
| BraTS training scans | Public, de-identified, skull-stripped | Low (de-identified), but bound by licence terms | Kaggle input / local `data/` (git-ignored) |
| User uploads | Demo users | **Potentially PHI** if misused | Server: process memory, TTL ≤ 10 min · Private mode: browser only |
| Results (mask, profile) | Derived | Same as the upload | Same as uploads; user-initiated downloads |
| Audit log | App | Low (no PHI by design) | `audit/audit.jsonl` (git-ignored) |
| Model weights | Trained by us | Low | `models/` (git-ignored, SHA-256 pinned) |

## 2. Data flow & trust boundaries
```
Browser (de-id, viewer, Private-mode inference) ──HTTPS──▶ FastAPI (memory) ─▶ de-id ─▶ preprocessing ─▶ ONNX ─▶ TTL result cache
   ▲                         │                                                         │
   └──── downloads ◀─────────┘◀──────────────── exports (metadata-free) ◀──────────────┘
Boundary 1: internet ↔ server        Boundary 2: request ↔ request (results keyed by random job id, TTL ≤ 10 min)
Private mode: no boundary crossed; data stays in the browser
```

## 3. STRIDE threat model
| Threat | Example | Mitigation | Residual |
|---|---|---|---|
| **S**poofing | Someone uses the "clinical mode" without authorisation | Public demo has no PHI; optional auth + timeout is future work (SR-5) | Low |
| **T**ampering | Swapped model weights produce wrong outlines | SHA-256 check at load (SR-7); version shown in UI/PDF | Low |
| **R**epudiation | "I never exported that report" | Event-level audit log with session hash | Low |
| **I**nformation disclosure | PHI in DICOM headers; results leak between users; PHI in logs or stack traces | Safe-Harbor scrubber before processing (PR-3); per-request job ids; logs whitelist keys; no request-body logging; generic errors; no analytics | **Medium**: burned-in pixel text is flagged but not redacted |
| Information disclosure | Face reconstruction from 3D head MRI | Skull-strip warning (PR-4); BraTS is skull-stripped | Medium (user may ignore the warning) |
| **D**enial of service | Huge uploads, zip bombs | 200 MB cap; zip-bomb guard; rate limit (slowapi); max 2 concurrent jobs | Medium (free host) |
| **E**levation of privilege | Path traversal via file names | Uploads never touch the filesystem; `SessionStore` strips paths | Low |

## 4. Risk register
| ID | Risk | L | I | Score | Owner | Status |
|---|---|---|---|---|---|---|
| P1 | User uploads real PHI to the public demo | 2 | 4 | 8 | SC | Mitigated: banner + consent + in-memory + de-id |
| P2 | Imaging data committed to git | 2 | 4 | 8 | SC | Mitigated: `.gitignore` + pre-commit hook blocks `.nii/.dcm/.npy` |
| P3 | Cross-request data leak | 1 | 5 | 5 | PB | Mitigated: unguessable job ids, TTL purge, no shared caches of user data |
| P8 | Malicious script on the web origin steals scans | 1 | 4 | 4 | PB | Mitigated: strict CSP, no third-party scripts, no analytics |
| P4 | Burned-in identifiers in DICOM pixels | 2 | 3 | 6 | SC | Partially: flagged in the UI, not redacted |
| P5 | Dependency vulnerability | 3 | 2 | 6 | PB | Mitigated: `pip-audit` + `npm audit` in CI |
| P6 | Over-claiming compliance | 2 | 3 | 6 | SC | Mitigated: "HIPAA-aligned" wording everywhere |
| P7 | BraTS licence breach (redistribution) | 1 | 3 | 3 | VP | Mitigated: data never in repo; only test-split samples with attribution |

L = likelihood (1–5), I = impact (1–5).

## 5. Alignment with the proposed 2025 HIPAA Security Rule (NPRM, not final as of Oct 2026)
- **Encryption at rest and in transit:** HTTPS; no persistence; Fernet available for opt-in storage. ✅
- **MFA:** not implemented (no accounts on the demo). Documented as future work.
- **Asset inventory / network map:** sections 1–2 above. ✅
- **Annual penetration test / vulnerability scans:** out of scope for a student project; `pip-audit` covers dependencies.
