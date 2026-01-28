# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY server/ ./server/

# Copy built frontend
COPY --from=frontend-builder /app/dist ./dist

# Create data directory
RUN mkdir -p /app/data/images /app/data/audio /app/data/backups

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/app/data
ENV DB_PATH=/app/data/fiftyfive.db
ENV PORT=8000

# Expose port (Render sets PORT at runtime)
EXPOSE 8000

# Health check (uses PORT at runtime)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD sh -c 'curl -sf "http://localhost:${PORT:-8000}/api/health" || exit 1'

# Run server (Render provides PORT)
CMD ["sh", "-c", "python -m uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
