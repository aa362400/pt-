FROM python:3.12-slim

LABEL description="ShopMate AI product image agent"
LABEL version="4.0"

WORKDIR /app

ENV AGENT_RUNTIME_DIR=/data/runtime \
    AGENT_LOG_DIR=/data/runtime/logs \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

COPY agent/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY agent/ ./agent/
COPY wiki/ ./wiki/

RUN mkdir -p /data/runtime/uploads \
    /data/runtime/outputs \
    /data/runtime/sessions \
    /data/runtime/jobs \
    /data/runtime/memory \
    /data/runtime/autonomy \
    /data/runtime/logs \
    /data/runtime/secrets

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')" || exit 1

CMD ["python", "agent/web/app.py", "--host", "0.0.0.0", "--port", "8080"]
