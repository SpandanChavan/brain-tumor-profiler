# Brain Tumor Profiler API: Hugging Face Spaces (Docker SDK, free CPU basic)
# Build from the repo root:  docker build -f api/Dockerfile -t btp-api .
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    BTP_AUDIT_PATH=/tmp/btp_audit/audit.jsonl \
    OMP_NUM_THREADS=2

# HF Spaces runs containers as uid 1000
RUN useradd -m -u 1000 app
WORKDIR /home/app/btp

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# Only what the API needs: the torch-free parts of btp, the API, the ONNX model and samples
COPY src/btp src/btp
COPY api api
COPY models/btp_model.onnx models/model_card.json models/
COPY assets/demo assets/demo
ENV PYTHONPATH=/home/app/btp/src:/home/app/btp

USER app
EXPOSE 7860
HEALTHCHECK CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:7860/v1/health')"
# --no-access-log: no IPs/paths in logs (SR-8)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log", "--workers", "1"]
