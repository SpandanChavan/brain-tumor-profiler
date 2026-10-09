---
title: Brain Tumor Profiler API
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Research-only MRI tumor segmentation API (de-identified data only)
---

# Brain Tumor Profiler: inference API

FastAPI + ONNX Runtime (CPU). **Research & education only. Not a medical device. Upload de-identified data only.**

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Liveness + model loaded |
| `GET /v1/model` | Model card (version, metrics, limitations) |
| `GET /v1/samples` | Bundled sample cases (test split) |
| `GET /v1/samples/{id}/{t1ce\|flair\|seg}.nii.gz` | Sample files |
| `POST /v1/samples/{id}/segment` | Segment a sample (includes agreement with the expert outline) |
| `POST /v1/segment` | Multipart `t1ce`, `flair` (NIfTI or zipped DICOM), `consent=true`, `tta` |
| `GET /v1/results/{job}/{mask\|uncertainty\|label}.nii.gz` | Results (in memory, expire after 10 min) |
| `DELETE /v1/results/{job}` | Delete now |

Interactive docs: `/docs`.

**Privacy:**
- In-memory processing, nothing written to disk.
- Results expire after a TTL.
- No access logs. The audit log records events only.
- CORS is limited to the frontend origin (`BTP_ALLOWED_ORIGINS`).

## Local run
```bash
uvicorn api.main:app --port 8000 --reload
```

## Deploy to a free HF Space
1. Create a Space with SDK **Docker** and hardware **CPU basic (free)**.
2. Push the repo with this file as the Space `README.md` (or use the GitHub Action in `.github/workflows/deploy-api.yml`).
3. Set the Space variable `BTP_ALLOWED_ORIGINS=https://<your-app>.vercel.app`.
