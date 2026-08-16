# Use the existing LibreDWG image which contains dwg2dxf and Ubuntu 22.04 base
FROM local-libredwg

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python and curl (for healthchecks)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Setup non-root user
RUN useradd -m -d /app -s /bin/bash appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy FastAPI application
COPY app/ ./app/
COPY tests/ ./tests/

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Start Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
