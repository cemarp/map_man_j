FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Playwright and OpenCV in a single cached layer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libgl1 \
    libglib2.0-0t64 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install requirements and playwright Chromium dependencies in a single consolidated layer
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
