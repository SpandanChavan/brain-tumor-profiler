"""Brain Tumor Profiler inference API (Phase 5a; FR-S1..S7, SR-8, SR-14, SR-15).

Run locally:   uvicorn api.main:app --port 8000
Docs:          http://localhost:8000/docs
"""

from __future__ import annotations

import asyncio
import re
import uuid
from contextlib import asynccontextmanager

import nibabel as nib
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from btp import DISCLAIMER, __version__
from btp.io import read_upload
from btp.privacy.audit import AuditLog, sha256_bytes

from .pipeline import Segmenter
from .settings import settings
from .store import RateLimiter, ResultStore

segmenter = Segmenter(settings.model_path, settings.card_path, settings.threads)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the ONNX session in the background at startup, so the first user doesn't pay the
    # model-load cost (it showed up as a ~25 s first analysis). Startup itself is not blocked.
    warm = asyncio.create_task(run_in_threadpool(lambda: segmenter.ready))
    yield
    warm.cancel()


app = FastAPI(title="Brain Tumor Profiler API", version=__version__, lifespan=lifespan,
              description=f"{DISCLAIMER} De-identified research data only.")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                   allow_methods=["GET", "POST", "DELETE"], allow_headers=["*"])

store = ResultStore(settings.result_ttl_seconds)
limiter = RateLimiter(settings.rate_limit_per_minute)
jobs = asyncio.Semaphore(settings.max_concurrent_jobs)
audit = AuditLog(settings.audit_path)
SAFE_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
MODALITIES = ("t1ce", "flair", "seg")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Frame-Options"] = "DENY"
    return resp


@app.exception_handler(Exception)
async def generic_error(_: Request, exc: Exception):  # SR-8: never leak traces/file names
    return JSONResponse(status_code=500, content={"detail": "Internal error. No data was kept."})


def _client_key(request: Request) -> str:
    return request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]


async def _run_job(request: Request, fn, *args, **kw):
    if not limiter.allow(_client_key(request)):
        raise HTTPException(429, "Too many analyses in the last minute. Please wait a moment.")
    try:
        await asyncio.wait_for(jobs.acquire(), timeout=60)
    except TimeoutError:
        raise HTTPException(503, "The free server is busy. Please try again shortly.") from None
    try:
        return await run_in_threadpool(fn, *args, **kw)
    except ValueError as e:  # friendly validation errors from btp (FR-S5)
        raise HTTPException(422, str(e)) from None
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from None
    finally:
        jobs.release()


def _finish(body: dict, files: dict[str, bytes], session: str) -> dict:
    job_id = store.put(files)
    body.update({"job_id": job_id, "files": {k: f"/v1/results/{job_id}/{k}.nii.gz" for k in files},
                 "expires_in_s": settings.result_ttl_seconds, "disclaimer": DISCLAIMER})
    audit.log(session, "inference_run", seconds=body["timings"]["total_s"],
              detected=body["profile"]["detected"], model_version=body["model_version"])
    return body


# ---------------------------------------------------------------- endpoints

@app.get("/v1/health")
def health():
    return {"status": "ok", "model_loaded": segmenter.ready, "version": __version__}


@app.get("/v1/model")
def model_info():
    card = dict(segmenter.card)
    card.pop("sha256", None)
    return {**card, "disclaimer": DISCLAIMER}


@app.get("/v1/samples")
def list_samples():
    d = settings.samples_dir
    out = []
    for p in sorted(d.iterdir()) if d.exists() else []:
        if p.is_dir() and SAFE_ID.match(p.name):
            files = {m: any(p.glob(f"*_{m}.nii.gz")) for m in MODALITIES}
            if files["t1ce"] and files["flair"]:
                out.append({"id": p.name, "has_label": files["seg"],
                            "synthetic": p.name.startswith("synthetic")})
    return out


def _sample_file(sample_id: str, modality: str):
    if not SAFE_ID.match(sample_id) or modality not in MODALITIES:
        raise HTTPException(404, "Not found")
    f = next((settings.samples_dir / sample_id).glob(f"*_{modality}.nii.gz"), None)
    if f is None:
        raise HTTPException(404, "Not found")
    return f


@app.get("/v1/samples/{sample_id}/{modality}.nii.gz")
def sample_file(sample_id: str, modality: str):
    return Response(_sample_file(sample_id, modality).read_bytes(), media_type="application/gzip")


@app.post("/v1/samples/{sample_id}/segment")
async def segment_sample(sample_id: str, request: Request, tta: bool = True):
    session = uuid.uuid4().hex
    t1, fl = _sample_file(sample_id, "t1ce"), _sample_file(sample_id, "flair")
    try:
        seg = nib.load(_sample_file(sample_id, "seg"))
    except HTTPException:
        seg = None
    audit.log(session, "sample_loaded")
    body, files = await _run_job(request, segmenter.run, nib.load(t1), nib.load(fl), seg, tta=tta)
    return _finish(body, files, session)


@app.post("/v1/segment")
async def segment(request: Request, t1ce: UploadFile = File(...), flair: UploadFile = File(...),
                  consent: bool = Form(...), tta: bool = Form(True)):
    """Segment an uploaded T1ce + FLAIR pair. Processed in memory; nothing is stored on disk."""
    if not consent:  # PR-5
        raise HTTPException(400, "Consent is required: confirm the files contain no real patient data.")
    session = uuid.uuid4().hex
    audit.log(session, "consent_given")
    imgs, deid = [], []
    for up in (t1ce, flair):
        data = await up.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(413, "File is larger than 200 MB.")
        try:
            img, rep = read_upload(data, up.filename or "")
        except ValueError as e:
            audit.log(session, "upload_rejected", reason="unreadable")
            raise HTTPException(422, str(e)) from None
        audit.log(session, "upload_accepted", file_sha256=sha256_bytes(data),
                  format=rep.get("format", "dicom"))
        if "removed" in rep:
            audit.log(session, "deid_applied", n_removed=len(rep["removed"]),
                      burned_in=rep["burned_in_annotation"])
            deid.append({"removed": len(rep["removed"]), "burned_in_annotation": rep["burned_in_annotation"]})
        imgs.append(img)
        del data
    body, files = await _run_job(request, segmenter.run, imgs[0], imgs[1], tta=tta)
    body["deidentification"] = deid
    return _finish(body, files, session)


@app.get("/v1/results/{job_id}/{name}.nii.gz")
def result_file(job_id: str, name: str):
    data = store.get(job_id, name)
    if data is None:
        raise HTTPException(404, "Result expired or not found (results are kept for 10 minutes).")
    return Response(data, media_type="application/gzip")


@app.delete("/v1/results/{job_id}")
def delete_result(job_id: str):
    """'Delete now' (SR-2): purge a result immediately."""
    if store.delete(job_id):
        audit.log(job_id, "data_deleted")
    return {"deleted": True}
