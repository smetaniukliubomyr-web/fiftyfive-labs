"""
Configuration Management
Centralized configuration with environment variables
"""
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# =============================================================================
# Paths
# =============================================================================
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("DB_PATH", str(PROJECT_ROOT / "data" / "fiftyfive.db"))).resolve()
DATA_DIR = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT / "data"))).resolve()
IMAGES_DIR = DATA_DIR / "images"
AUDIO_DIR = DATA_DIR / "audio"
BACKUP_DIR = DATA_DIR / "backups"

# Create directories
for directory in [IMAGES_DIR, AUDIO_DIR, BACKUP_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# =============================================================================
# API Configuration
# =============================================================================
VOICER_API_BASE = os.getenv("VOICER_API_BASE", "https://api.voicer.app")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

# =============================================================================
# Redis Configuration
# =============================================================================
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_URL = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}" if REDIS_PASSWORD else f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"

# =============================================================================
# Celery Configuration
# =============================================================================
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

# =============================================================================
# Rate Limiting
# =============================================================================
DEFAULT_HOURLY_LIMIT = int(os.getenv("DEFAULT_HOURLY_LIMIT", "2000"))
DEFAULT_CONCURRENT_LIMIT = int(os.getenv("DEFAULT_CONCURRENT_LIMIT", "3"))
MAX_CONCURRENT_PER_KEY = int(os.getenv("MAX_CONCURRENT_PER_KEY", "10"))

# =============================================================================
# Timeouts
# =============================================================================
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
IMAGE_TTL_SECONDS = int(os.getenv("IMAGE_TTL_SECONDS", "86400"))  # 24 hours
JOB_HARD_TTL_SECONDS = int(os.getenv("JOB_HARD_TTL_SECONDS", "2592000"))  # 30 days

# =============================================================================
# Monitoring
# =============================================================================
PROMETHEUS_PORT = int(os.getenv("PROMETHEUS_PORT", "9090"))
ENABLE_METRICS = os.getenv("ENABLE_METRICS", "true").lower() == "true"

# =============================================================================
# WebSocket
# =============================================================================
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT", "8001"))

# =============================================================================
# Constants
# =============================================================================
DAY_MS = 24 * 60 * 60 * 1000
HOUR_MS = 60 * 60 * 1000
MINUTE_MS = 60 * 1000

# Task statuses
class TaskStatus:
    QUEUED = "queued"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

# Task priorities
class TaskPriority:
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3
