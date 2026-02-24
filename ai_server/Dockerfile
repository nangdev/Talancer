FROM python:3.11-slim

WORKDIR /app

# ✅ webrtcvad 빌드에 필요한 gcc / make / python headers
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    build-essential gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]