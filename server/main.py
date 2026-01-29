"""
FiftyFive Labs - AI Image Generation Platform
Backend API Server
"""

import os
import json
import uuid
import time
import math
import hashlib
import secrets
import sqlite3
import asyncio
from pathlib import Path
from typing import Any, Dict, Optional, List, Tuple
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

import base64
import httpx
import aiofiles
from fastapi import FastAPI, HTTPException, Header, Query, Body, Request, Response, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field

# =============================================================================
# Configuration
# =============================================================================
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("DB_PATH", str(_PROJECT_ROOT / "data" / "fiftyfive.db"))).resolve()
DATA_DIR = Path(os.getenv("DATA_DIR", str(_PROJECT_ROOT / "data"))).resolve()
IMAGES_DIR = DATA_DIR / "images"
AUDIO_STORAGE_PATH = DATA_DIR / "audio"
BACKUP_DIR = DATA_DIR / "backups"

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(AUDIO_STORAGE_PATH, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

DEBUG = os.getenv("DEBUG", "").lower() in ("1", "true", "yes")

def _debug_log(*args, **kwargs):
    if DEBUG:
        _debug_log(*args, **kwargs)

# API Configuration
IMAGE_API_URL = os.getenv("IMAGE_API_URL", "https://api.together.xyz/v1/images/generations")
IMAGE_API_KEY = os.getenv("IMAGE_API_KEY", "")

# Admin Configuration
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

# Security
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()] or ["*"]

# Rate Limiting Defaults
DEFAULT_HOURLY_LIMIT = int(os.getenv("DEFAULT_HOURLY_LIMIT", "2000"))  # Images per hour per API key
DEFAULT_CONCURRENT_LIMIT = int(os.getenv("DEFAULT_CONCURRENT_LIMIT", "3"))  # Concurrent generations per user
MAX_CONCURRENT_PER_KEY = int(os.getenv("MAX_CONCURRENT_PER_KEY", "10"))  # Concurrent generations per API key

# Timing
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
IMAGE_TTL_SECONDS = int(os.getenv("IMAGE_TTL_SECONDS", "86400"))  # 24 hours
JOB_HARD_TTL_SECONDS = int(os.getenv("JOB_HARD_TTL_SECONDS", "2592000"))  # 30 days

DAY_MS = 24 * 60 * 60 * 1000

# =============================================================================
# Helpers
# =============================================================================
def now_ms() -> int:
    return int(time.time() * 1000)

def db_conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con

async def download_and_save_audio(audio_url: str, task_id: str) -> Optional[str]:
    """Download audio from external URL and save locally"""
    try:
        local_filename = f"{task_id}.mp3"
        local_path = AUDIO_STORAGE_PATH / local_filename
        
        _debug_log("[AUDIO] Downloading", audio_url)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(audio_url)
            if response.status_code == 200:
                async with aiofiles.open(local_path, 'wb') as f:
                    await f.write(response.content)
                _debug_log("[AUDIO] Saved locally:", local_filename)
                return f"/audio/{task_id}.mp3"
            else:
                _debug_log("[AUDIO] Failed to download:", response.status_code)
                return None
    except Exception as e:
        _debug_log("[AUDIO] Error saving audio:", e)
        return None

def _pbkdf2_hash(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return dk.hex()

def _make_password(password: str) -> Tuple[str, str]:
    salt_hex = secrets.token_hex(16)
    return salt_hex, _pbkdf2_hash(password, salt_hex)

def _verify_password(password: str, salt_hex: str, pw_hash_hex: str) -> bool:
    try:
        return secrets.compare_digest(_pbkdf2_hash(password, salt_hex), pw_hash_hex)
    except Exception:
        return False

def _generate_api_key() -> str:
    return f"ff_{secrets.token_hex(24)}"

def _generate_user_api_key() -> str:
    return f"ffu_{secrets.token_hex(20)}"

def _generate_task_id() -> str:
    """Generate FiftyFive Labs task ID: FFS_XXXXXXX (7 random alphanumeric chars)"""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    random_part = "".join(secrets.choice(alphabet) for _ in range(7))
    return f"FFS_{random_part}"

def _require_admin(x_admin_token: Optional[str]) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(403, "Admin disabled (ADMIN_TOKEN not set)")
    if (x_admin_token or "") != ADMIN_TOKEN:
        raise HTTPException(403, "Admin token required")

def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)

# =============================================================================
# Rate Limiting
# =============================================================================
class RateLimiter:
    """In-memory rate limiter with hourly reset"""
    
    def __init__(self):
        self.api_key_usage: Dict[str, Dict] = {}  # {api_key: {count: int, reset_at: int}}
        self.api_key_concurrent: Dict[str, int] = {}  # {api_key: current_count}
        self.user_concurrent: Dict[str, int] = {}  # {user_id: current_count}
        self._lock = asyncio.Lock()
    
    async def check_api_key_limit(self, api_key_id: str, hourly_limit: int) -> Tuple[bool, int, int]:
        """Check if API key has capacity. Returns (allowed, remaining, reset_in_seconds)"""
        async with self._lock:
            now = int(time.time())
            hour_start = now - (now % 3600)
            reset_at = hour_start + 3600
            
            if api_key_id not in self.api_key_usage:
                self.api_key_usage[api_key_id] = {"count": 0, "reset_at": reset_at}
            
            usage = self.api_key_usage[api_key_id]
            
            # Reset if hour passed
            if now >= usage["reset_at"]:
                usage["count"] = 0
                usage["reset_at"] = reset_at
            
            remaining = max(0, hourly_limit - usage["count"])
            reset_in = usage["reset_at"] - now
            
            if usage["count"] >= hourly_limit:
                return False, remaining, reset_in
            
            return True, remaining, reset_in
    
    async def increment_api_key_usage(self, api_key_id: str):
        """Increment usage count for API key"""
        async with self._lock:
            if api_key_id in self.api_key_usage:
                self.api_key_usage[api_key_id]["count"] += 1
    
    async def check_concurrent(self, api_key_id: str, user_id: str, 
                                api_key_limit: int, user_limit: int) -> Tuple[bool, str]:
        """Check concurrent generation limits"""
        async with self._lock:
            api_concurrent = self.api_key_concurrent.get(api_key_id, 0)
            user_concurrent = self.user_concurrent.get(user_id, 0)
            
            if api_concurrent >= api_key_limit:
                return False, f"API key concurrent limit reached ({api_key_limit})"
            
            if user_concurrent >= user_limit:
                return False, f"User concurrent limit reached ({user_limit})"
            
            return True, ""
    
    async def acquire_concurrent(self, api_key_id: str, user_id: str):
        """Acquire concurrent slot"""
        async with self._lock:
            self.api_key_concurrent[api_key_id] = self.api_key_concurrent.get(api_key_id, 0) + 1
            self.user_concurrent[user_id] = self.user_concurrent.get(user_id, 0) + 1
    
    async def release_concurrent(self, api_key_id: str, user_id: str):
        """Release concurrent slot"""
        async with self._lock:
            if api_key_id in self.api_key_concurrent:
                self.api_key_concurrent[api_key_id] = max(0, self.api_key_concurrent[api_key_id] - 1)
            if user_id in self.user_concurrent:
                self.user_concurrent[user_id] = max(0, self.user_concurrent[user_id] - 1)
    
    def get_stats(self) -> Dict:
        """Get current rate limiter stats"""
        return {
            "api_key_usage": dict(self.api_key_usage),
            "api_key_concurrent": dict(self.api_key_concurrent),
            "user_concurrent": dict(self.user_concurrent)
        }
    
    def get_user_concurrent(self, user_id: str) -> int:
        """Get current concurrent count for a user"""
        return self.user_concurrent.get(user_id, 0)

rate_limiter = RateLimiter()

# =============================================================================
# Database Initialization
# =============================================================================
def init_db():
    con = db_conn()
    cur = con.cursor()
    
    # Users table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            nickname TEXT UNIQUE,
            password_salt TEXT,
            password_hash TEXT,
            auth_token TEXT,
            credits_balance INTEGER DEFAULT 0,
            credits_used INTEGER DEFAULT 0,
            plan_id TEXT,
            plan_expires_at_ms INTEGER,
            referral_code TEXT,
            referrer_id TEXT,
            referral_credits_earned INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0,
            concurrent_limit INTEGER DEFAULT 3,
            created_at_ms INTEGER,
            last_login_ms INTEGER,
            metadata_json TEXT DEFAULT '{}'
        )
    """)

    # Migration: user plan/referral columns (backwards compatible)
    for stmt in [
        "ALTER TABLE users ADD COLUMN plan_id TEXT",
        "ALTER TABLE users ADD COLUMN plan_expires_at_ms INTEGER",
        "ALTER TABLE users ADD COLUMN referral_code TEXT",
        "ALTER TABLE users ADD COLUMN referrer_id TEXT",
        "ALTER TABLE users ADD COLUMN referral_credits_earned INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN concurrent_slots INTEGER DEFAULT 1",
        "ALTER TABLE users ADD COLUMN image_concurrent_slots INTEGER DEFAULT 3",
    ]:
        try:
            cur.execute(stmt)
            con.commit()
        except Exception:
            pass  # Column already exists
    
    # API Keys table (admin-managed pool)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            name TEXT,
            api_key TEXT NOT NULL,
            provider TEXT DEFAULT 'together',
            hourly_limit INTEGER DEFAULT 2000,
            concurrent_limit INTEGER DEFAULT 10,
            is_active INTEGER DEFAULT 1,
            total_requests INTEGER DEFAULT 0,
            failed_requests INTEGER DEFAULT 0,
            created_at_ms INTEGER,
            last_used_ms INTEGER,
            metadata_json TEXT DEFAULT '{}'
        )
    """)
    
    # User API Keys (for external API access)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            name TEXT,
            hourly_limit INTEGER DEFAULT 100,
            is_active INTEGER DEFAULT 1,
            total_requests INTEGER DEFAULT 0,
            created_at_ms INTEGER,
            last_used_ms INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Generation Jobs
    cur.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            api_key_id TEXT,
            status TEXT DEFAULT 'pending',
            prompt TEXT,
            negative_prompt TEXT,
            model TEXT DEFAULT 'black-forest-labs/FLUX.1-schnell-Free',
            width INTEGER DEFAULT 1024,
            height INTEGER DEFAULT 1024,
            steps INTEGER DEFAULT 4,
            seed INTEGER,
            image_path TEXT,
            error TEXT,
            credits_charged INTEGER DEFAULT 1,
            char_count INTEGER DEFAULT 0,
            created_at_ms INTEGER,
            started_at_ms INTEGER,
            completed_at_ms INTEGER,
            expires_at_ms INTEGER,
            metadata_json TEXT DEFAULT '{}',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Migration: Add char_count column if it doesn't exist
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN char_count INTEGER DEFAULT 0")
        con.commit()
    except:
        pass  # Column already exists
    
    # Event Log
    cur.execute("""
        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT,
            event_type TEXT,
            message TEXT,
            user_id TEXT,
            metadata_json TEXT,
            created_at_ms INTEGER
        )
    """)
    
    # Plans table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            title TEXT,
            subtitle TEXT,
            price_usd REAL,
            credits INTEGER,
            duration_days INTEGER DEFAULT 30,
            description TEXT,
            features_json TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            popular INTEGER DEFAULT 0
        )
    """)
    
    # Model Pricing table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS model_pricing (
            model_id TEXT PRIMARY KEY,
            credits_per_image INTEGER DEFAULT 1,
            updated_at_ms INTEGER
        )
    """)
    
    # Initialize default pricing if table is empty (all image generation models)
    default_pricing = [
        ('IMAGEN_4', 1),
        ('GEM_PIX', 1),
        ('GEM_PIX_2', 2),
        ('IMAGEN_3_5', 1),
        ('GROK', 1),
        ('gpt-image-1', 1),
        ('gpt-image-1.5', 1),
        ('imagen-3.0-generate-002', 2),
        ('flux-kontext-pro', 3),
        ('midjourney', 10),
        ('NAGA_DALLE3', 1),
        ('NAGA_FLUX', 1),
    ]
    for model_id, credits in default_pricing:
        try:
            cur.execute("INSERT OR IGNORE INTO model_pricing (model_id, credits_per_image, updated_at_ms) VALUES (?, ?, ?)",
                       (model_id, credits, now_ms()))
        except:
            pass
    
    con.commit()
    
    # Payments table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            plan_id TEXT,
            amount_usd REAL,
            status TEXT DEFAULT 'pending',
            payment_url TEXT,
            order_id TEXT,
            created_at_ms INTEGER,
            paid_at_ms INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Credit Packages table (expiring credit packages with terms)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS credit_packages (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            credits_initial INTEGER NOT NULL,
            credits_remaining INTEGER NOT NULL,
            expires_at_ms INTEGER NOT NULL,
            created_at_ms INTEGER NOT NULL,
            source TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_credit_packages_user_expires ON credit_packages(user_id, expires_at_ms)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_credit_packages_expires ON credit_packages(expires_at_ms)")
    
    # Create indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_token ON users(auth_token)")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON users(referrer_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_users_plan_id ON users(plan_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_user_api_keys_key ON user_api_keys(api_key)")
    
    # Insert default plans
    default_plans = [
        ("STARTER", "Starter", "Basic", 5.00, 100, 30, "For beginners", '["100 credits", "30 days", "All models", "Standard queue"]', 1, 1, 0),
        ("CREATOR", "Creator", "Popular", 15.00, 500, 30, "For content creators", '["500 credits", "30 days", "All models", "Priority queue"]', 1, 2, 1),
        ("PRO", "Professional", "Best Value", 39.00, 2000, 30, "For professionals", '["2000 credits", "30 days", "All models", "Priority queue", "API access"]', 1, 3, 0),
        ("UNLIMITED", "Unlimited", "Enterprise", 99.00, -1, 30, "Unlimited generation", '["Unlimited credits", "30 days", "All models", "Priority queue", "API access", "Dedicated support"]', 1, 4, 0),
    ]
    
    for plan in default_plans:
        cur.execute("""
            INSERT OR IGNORE INTO plans (id, title, subtitle, price_usd, credits, duration_days, description, features_json, is_active, sort_order, popular)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, plan)
    
    con.commit()
    con.close()

def log_event(level: str, event_type: str, message: str, user_id: str = None, meta: dict = None):
    """Log an event to the database"""
    con = db_conn()
    try:
        con.execute(
            "INSERT INTO event_log (level, event_type, message, user_id, metadata_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
            (level, event_type, message, user_id, _json_dumps(meta or {}), now_ms())
        )
        con.commit()
    except Exception as e:
        _debug_log("Log error:", e)
    finally:
        con.close()

# =============================================================================
# Lifespan
# =============================================================================
async def cleanup_expired_files():
    """Background task to clean up expired audio files"""
    while True:
        try:
            con = db_conn()
            try:
                # Find expired jobs with audio files
                expired = con.execute("""
                    SELECT id, image_path FROM jobs 
                    WHERE expires_at_ms < ? AND image_path IS NOT NULL
                """, (now_ms(),)).fetchall()
                
                for job in expired:
                    if job["image_path"]:
                        try:
                            path = Path(job["image_path"])
                            if path.exists():
                                path.unlink()
                                log_event("info", "file_deleted", f"Deleted expired file: {path}")
                        except Exception as e:
                            log_event("error", "file_delete_failed", str(e))
                    
                    # Clear the path from database
                    con.execute("UPDATE jobs SET image_path = NULL WHERE id = ?", (job["id"],))
                
                con.commit()
            finally:
                con.close()
        except Exception as e:
            log_event("error", "cleanup_error", str(e))
        
        # Run every 10 minutes
        await asyncio.sleep(600)

async def cleanup_stuck_tasks():
    """Background task to clean up stuck processing tasks (stuck for more than 30 minutes)"""
    STUCK_THRESHOLD_MS = 30 * 60 * 1000  # 30 minutes
    
    while True:
        try:
            con = db_conn()
            try:
                # Find processing jobs older than threshold
                stuck_jobs = con.execute("""
                    SELECT id, user_id, api_key_id, created_at_ms 
                    FROM jobs 
                    WHERE status = 'processing' 
                    AND created_at_ms < ?
                """, (now_ms() - STUCK_THRESHOLD_MS,)).fetchall()
                
                for job in stuck_jobs:
                    log_event("warning", "stuck_task", f"Found stuck task {job['id']}, marking as failed")
                    
                    # Release concurrent slot
                    if job["api_key_id"]:
                        await rate_limiter.release_concurrent(job["api_key_id"], job["user_id"])
                    
                    # Mark as failed
                    con.execute(
                        "UPDATE jobs SET status = 'failed', error = 'Task timed out', completed_at_ms = ? WHERE id = ?",
                        (now_ms(), job["id"])
                    )
                
                con.commit()
            finally:
                con.close()
        except Exception as e:
            log_event("error", "stuck_cleanup_error", str(e))
        
        # Run every 5 minutes
        await asyncio.sleep(300)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log_event("info", "server_start", "FiftyFive Labs API started")
    
    # Start cleanup tasks
    cleanup_task = asyncio.create_task(cleanup_expired_files())
    stuck_cleanup_task = asyncio.create_task(cleanup_stuck_tasks())
    
    yield
    
    # Cancel cleanup tasks
    cleanup_task.cancel()
    stuck_cleanup_task.cancel()
    log_event("info", "server_stop", "FiftyFive Labs API stopped")

# =============================================================================
# FastAPI App
# =============================================================================
app = FastAPI(
    title="FiftyFive Labs API",
    description="AI Image Generation Platform",
    version="1.0.0",
    lifespan=lifespan
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# =============================================================================
# Pydantic Models
# =============================================================================
class RegisterRequest(BaseModel):
    nickname: str
    password: str
    email: Optional[str] = None
    referral_code: Optional[str] = None

class LoginRequest(BaseModel):
    nickname: str
    password: str

class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    model: Optional[str] = "black-forest-labs/FLUX.1-schnell-Free"
    width: Optional[int] = 1024
    height: Optional[int] = 1024
    steps: Optional[int] = 4
    seed: Optional[int] = None

class AdminUpdateUser(BaseModel):
    credits_balance: Optional[int] = None
    is_active: Optional[bool] = None
    concurrent_limit: Optional[int] = None
    concurrent_slots: Optional[int] = None
    image_concurrent_slots: Optional[int] = None
    plan_id: Optional[str] = None

class AdminTopUpUser(BaseModel):
    credits: int = Field(..., ge=1, le=10_000_000)
    note: Optional[str] = None

class AdminCreateApiKey(BaseModel):
    name: str
    api_key: str
    provider: Optional[str] = "together"
    hourly_limit: Optional[int] = 2000
    concurrent_limit: Optional[int] = 10

class AdminUpdateApiKey(BaseModel):
    name: Optional[str] = None
    hourly_limit: Optional[int] = None
    concurrent_limit: Optional[int] = None
    is_active: Optional[bool] = None

# =============================================================================
# Auth Helpers
# =============================================================================
def _extract_token(authorization: Optional[str], token: Optional[str]) -> Optional[str]:
    if authorization:
        if authorization.startswith("Bearer "):
            return authorization[7:]
        return authorization
    return token

def require_user(token: Optional[str]) -> Dict:
    if not token:
        raise HTTPException(401, "Authentication required")
    
    con = db_conn()
    try:
        user = con.execute("SELECT * FROM users WHERE auth_token = ? AND is_active = 1", (token,)).fetchone()
        if not user:
            raise HTTPException(401, "Invalid or expired token")
        return dict(user)
    finally:
        con.close()

def require_api_key(api_key: Optional[str]) -> Tuple[Dict, Dict]:
    """Validate user API key and return (user, api_key_record)"""
    if not api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        user = con.execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1",
            (key_record["user_id"],)
        ).fetchone()
        
        if not user:
            raise HTTPException(401, "User not found or inactive")
        
        return dict(user), dict(key_record)
    finally:
        con.close()

def _generate_referral_code() -> str:
    # Short, URL-safe, readable-ish code
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))

def _ensure_referral_code(con: sqlite3.Connection, user_id: str) -> str:
    """Ensure user has a referral_code, return it."""
    existing = con.execute("SELECT referral_code FROM users WHERE id = ?", (user_id,)).fetchone()
    if not existing:
        return ""
    code = existing["referral_code"]
    if code:
        return code

    for _ in range(10):
        code = _generate_referral_code()
        dup = con.execute("SELECT id FROM users WHERE referral_code = ?", (code,)).fetchone()
        if not dup:
            con.execute("UPDATE users SET referral_code = ? WHERE id = ?", (code, user_id))
            con.commit()
            return code

    # Fallback: longer token if collisions keep happening
    code = secrets.token_urlsafe(12).replace("-", "").replace("_", "")[:12].upper()
    con.execute("UPDATE users SET referral_code = ? WHERE id = ?", (code, user_id))
    con.commit()
    return code

def _get_referral_tier_rate(con: sqlite3.Connection, referrer_id: str) -> float:
    """5% базово, 10% якщо >=25 користувачів, 15% якщо >=70."""
    cnt = con.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?",
        (referrer_id,),
    ).fetchone()["cnt"]
    if cnt >= 70:
        return 0.15
    if cnt >= 25:
        return 0.10
    return 0.05

def _apply_referral_bonus(con: sqlite3.Connection, referred_user_id: str, credits_added: int) -> Dict[str, Any]:
    """Apply referral bonus to referrer (if any). Returns details for UI/logging."""
    row = con.execute(
        "SELECT id, nickname, referrer_id FROM users WHERE id = ?",
        (referred_user_id,),
    ).fetchone()
    if not row:
        return {"applied": False}
    referrer_id = row["referrer_id"]
    if not referrer_id:
        return {"applied": False}

    rate = _get_referral_tier_rate(con, referrer_id)
    bonus = int(math.floor(float(credits_added) * rate))
    if bonus <= 0:
        return {"applied": False, "rate": rate, "bonus": 0, "referrer_id": referrer_id}

    referrer = con.execute("SELECT id FROM users WHERE id = ?", (referrer_id,)).fetchone()
    if not referrer:
        return {"applied": False}

    # Add bonus as a credit package (30 days validity)
    _add_credit_package(con, referrer_id, bonus, duration_days=30, source="referral_bonus", apply_referral=False)

    # Track total earnings
    con.execute(
        "UPDATE users SET referral_credits_earned = COALESCE(referral_credits_earned, 0) + ? WHERE id = ?",
        (bonus, referrer_id),
    )

    log_event(
        "info",
        "referral_bonus",
        f"Referral bonus: +{bonus} credits",
        user_id=referrer_id,
        meta={
            "rate": rate,
            "bonus": bonus,
            "credits_added": credits_added,
            "referred_user_id": referred_user_id,
        },
    )

    return {"applied": True, "rate": rate, "bonus": bonus, "referrer_id": referrer_id}

def _add_credit_package(con: sqlite3.Connection, user_id: str, credits: int, duration_days: int, source: str = "purchase", apply_referral: bool = True):
    """Add a credit package to user with expiration term"""
    package_id = str(uuid.uuid4())
    created_at = now_ms()
    expires_at = created_at + (duration_days * DAY_MS)
    
    con.execute("""
        INSERT INTO credit_packages (id, user_id, credits_initial, credits_remaining, expires_at_ms, created_at_ms, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (package_id, user_id, credits, credits, expires_at, created_at, source))
    
    # Apply referral bonus if flag is enabled and source is purchase or admin
    # Do this BEFORE committing to avoid separate transaction
    if apply_referral and source in ["purchase", "admin"]:
        result = _apply_referral_bonus(con, referred_user_id=user_id, credits_added=credits)
        if result.get("applied"):
            # Log event (uses separate connection, won't block)
            try:
                log_event(
                    "info",
                    "referral_bonus_applied",
                    f"Referral bonus: {result.get('bonus')} credits to referrer",
                    user_id=result.get("referrer_id"),
                    meta={"source": source, "referred_user": user_id, "credits_added": credits, "bonus": result.get("bonus")}
                )
            except Exception as e:
                # Don't fail if logging fails
                _debug_log(f"Failed to log referral bonus: {e}")
    
    # Single commit at the end
    con.commit()
    
    return package_id

def _deduct_credits_from_packages(con: sqlite3.Connection, user_id: str, amount: int) -> bool:
    """Deduct credits from user's packages (FIFO by expiration date). Returns True if successful."""
    # Get active packages ordered by expiration (use earliest expiring first)
    packages = con.execute("""
        SELECT id, credits_remaining, expires_at_ms 
        FROM credit_packages 
        WHERE user_id = ? AND credits_remaining > 0 AND expires_at_ms > ?
        ORDER BY expires_at_ms ASC
    """, (user_id, now_ms())).fetchall()
    
    total_available = sum(p["credits_remaining"] for p in packages)
    if total_available < amount:
        return False  # Not enough credits
    
    remaining_to_deduct = amount
    for package in packages:
        if remaining_to_deduct <= 0:
            break
        
        deduct_from_this = min(package["credits_remaining"], remaining_to_deduct)
        new_remaining = package["credits_remaining"] - deduct_from_this
        
        con.execute("""
            UPDATE credit_packages 
            SET credits_remaining = ? 
            WHERE id = ?
        """, (new_remaining, package["id"]))
        
        remaining_to_deduct -= deduct_from_this
    
    return True

def _get_user_credit_packages(con: sqlite3.Connection, user_id: str) -> list:
    """Get user's active credit packages"""
    packages = con.execute("""
        SELECT id, credits_initial, credits_remaining, expires_at_ms, created_at_ms, source
        FROM credit_packages
        WHERE user_id = ? AND credits_remaining > 0 AND expires_at_ms > ?
        ORDER BY expires_at_ms ASC
    """, (user_id, now_ms())).fetchall()
    
    return [dict(p) for p in packages]

def _get_total_credits_from_packages(con: sqlite3.Connection, user_id: str) -> int:
    """Calculate total available credits from all packages"""
    result = con.execute("""
        SELECT SUM(credits_remaining) as total
        FROM credit_packages
        WHERE user_id = ? AND credits_remaining > 0 AND expires_at_ms > ?
    """, (user_id, now_ms())).fetchone()
    
    return result["total"] or 0

def _build_usage_series(rows: List[sqlite3.Row], period: str) -> List[Dict[str, Any]]:
    """Build chart buckets from job rows (created_at_ms, chars)."""
    now = datetime.now(timezone.utc)

    if period == "today":
        # last 24 hours bucketed by hour label
        buckets = []
        index = {}
        for i in range(23, -1, -1):
            dt = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
            label = dt.strftime("%H:00")
            start_ms = int(dt.timestamp() * 1000)
            buckets.append({"label": label, "start_ms": start_ms, "chars": 0, "tasks": 0})
            index[(dt.year, dt.month, dt.day, dt.hour)] = len(buckets) - 1

        for r in rows:
            dt = datetime.fromtimestamp((r["created_at_ms"] or 0) / 1000, tz=timezone.utc)
            key = (dt.year, dt.month, dt.day, dt.hour)
            if key in index:
                b = buckets[index[key]]
                b["chars"] += int(r["chars"] or 0)
                b["tasks"] += 1
        return buckets

    days = 7 if period == "7d" else 30
    buckets = []
    index = {}
    for i in range(days - 1, -1, -1):
        dt = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        label = dt.strftime("%d")  # Only day number, no month
        start_ms = int(dt.timestamp() * 1000)
        buckets.append({"label": label, "start_ms": start_ms, "chars": 0, "tasks": 0})
        index[(dt.year, dt.month, dt.day)] = len(buckets) - 1

    for r in rows:
        dt = datetime.fromtimestamp((r["created_at_ms"] or 0) / 1000, tz=timezone.utc)
        key = (dt.year, dt.month, dt.day)
        if key in index:
            b = buckets[index[key]]
            b["chars"] += int(r["chars"] or 0)
            b["tasks"] += 1

    return buckets

def _fetch_usage_rows(con: sqlite3.Connection, period: str, user_id: Optional[str]) -> List[sqlite3.Row]:
    if period not in ("today", "7d", "30d"):
        raise HTTPException(400, "Invalid period. Use today, 7d, or 30d.")

    end_ms = now_ms()
    if period == "today":
        start_ms = end_ms - DAY_MS
    elif period == "7d":
        start_ms = end_ms - (7 * DAY_MS)
    else:
        start_ms = end_ms - (30 * DAY_MS)

    where = ["created_at_ms BETWEEN ? AND ?", "status != 'cancelled'"]
    params: List[Any] = [start_ms, end_ms]
    if user_id:
        where.append("user_id = ?")
        params.append(user_id)

    rows = con.execute(
        f"""
        SELECT created_at_ms, COALESCE(char_count, width, 0) as chars
        FROM jobs
        WHERE {' AND '.join(where)}
        """,
        params,
    ).fetchall()
    return rows

def get_active_api_key() -> Optional[Dict]:
    """Get an active API key from the pool"""
    con = db_conn()
    try:
        # Get least recently used active API key
        key = con.execute("""
            SELECT * FROM api_keys 
            WHERE is_active = 1 
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        return dict(key) if key else None
    finally:
        con.close()

# =============================================================================
# Health Check
# =============================================================================
@app.get("/api/health")
async def health():
    return {"ok": True, "service": "FiftyFive Labs", "timestamp": now_ms()}

# =============================================================================
# Auth Endpoints
# =============================================================================
@app.post("/api/auth/register")
async def register(body: RegisterRequest):
    nickname = body.nickname.strip()
    password = body.password
    email = body.email.strip().lower() if body.email else None
    incoming_ref = (body.referral_code or "").strip().upper()
    
    if len(nickname) < 3:
        raise HTTPException(400, "Nickname must be at least 3 characters")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    
    con = db_conn()
    try:
        # Check if nickname exists
        existing = con.execute("SELECT id FROM users WHERE nickname = ?", (nickname,)).fetchone()
        if existing:
            raise HTTPException(400, "Nickname already taken")
        
        if email:
            existing_email = con.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing_email:
                raise HTTPException(400, "Email already registered")
        
        user_id = str(uuid.uuid4())
        auth_token = secrets.token_hex(32)
        salt, pw_hash = _make_password(password)

        # Resolve referrer (optional)
        referrer_id = None
        if incoming_ref:
            ref = con.execute("SELECT id FROM users WHERE referral_code = ?", (incoming_ref,)).fetchone()
            if ref:
                referrer_id = ref["id"]

        # Create referral code for the new user
        referral_code = _generate_referral_code()
        for _ in range(10):
            dup = con.execute("SELECT id FROM users WHERE referral_code = ?", (referral_code,)).fetchone()
            if not dup:
                break
            referral_code = _generate_referral_code()
        
        con.execute("""
            INSERT INTO users (id, email, nickname, password_salt, password_hash, auth_token, 
                             credits_balance, created_at_ms, last_login_ms, referral_code, referrer_id, image_concurrent_slots)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, email, nickname, salt, pw_hash, auth_token, 10, now_ms(), now_ms(), referral_code, referrer_id, 3))  # 10 free credits, 3 image concurrent slots
        
        con.commit()
        
        log_event("info", "user_register", f"User registered: {nickname}", user_id=user_id)
        if referrer_id:
            log_event(
                "info",
                "referral_signup",
                f"User registered via referral: {nickname}",
                user_id=referrer_id,
                meta={"referred_user_id": user_id, "referral_code": incoming_ref},
            )
        
        packages = _get_user_credit_packages(con, user_id)
        
        return {
            "ok": True,
            "token": auth_token,
            "user": {
                "id": user_id,
                "nickname": nickname,
                "email": email,
                "credits_balance": 10,
                "credits_used": 0,
                "plan_id": None,
                "plan_expires_at_ms": None,
                "referral_code": referral_code,
                "referrer_id": referrer_id,
                "credit_packages": packages
            }
        }
    finally:
        con.close()

@app.post("/api/auth/login")
async def login(body: LoginRequest):
    nickname = body.nickname.strip()
    password = body.password
    
    con = db_conn()
    try:
        user = con.execute("SELECT * FROM users WHERE nickname = ?", (nickname,)).fetchone()
        
        if not user:
            raise HTTPException(401, "Invalid credentials")
        
        if not user["is_active"]:
            raise HTTPException(403, "Account is disabled")
        
        if not _verify_password(password, user["password_salt"], user["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        
        # Generate new token (+ ensure referral_code exists)
        auth_token = secrets.token_hex(32)
        con.execute("UPDATE users SET auth_token = ?, last_login_ms = ? WHERE id = ?",
                   (auth_token, now_ms(), user["id"]))
        _ensure_referral_code(con, user["id"])
        con.commit()
        
        log_event("info", "user_login", f"User logged in: {nickname}", user_id=user["id"])
        
        # Reload to include potential referral_code assignment
        user = con.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        user = dict(user) if user else None
        
        packages = _get_user_credit_packages(con, user["id"])
        
        return {
            "ok": True,
            "token": auth_token,
            "user": {
                "id": user["id"],
                "nickname": user["nickname"],
                "email": user["email"],
                "credits_balance": user["credits_balance"],
                "credits_used": user["credits_used"],
                "concurrent_limit": user["concurrent_limit"],
                "plan_id": user.get("plan_id"),
                "plan_expires_at_ms": user.get("plan_expires_at_ms"),
                "referral_code": user.get("referral_code"),
                "referrer_id": user.get("referrer_id"),
                "credit_packages": packages
            }
        }
    finally:
        con.close()

@app.get("/api/me")
async def get_me(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        # Ensure referral_code exists for older users
        _ensure_referral_code(con, user["id"])
        user = con.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        user = dict(user) if user else user
        
        # Get credit packages
        packages = _get_user_credit_packages(con, user["id"])
    finally:
        con.close()

    return {
        "ok": True,
        "user": {
            "id": user["id"],
            "nickname": user["nickname"],
            "email": user["email"],
            "credits_balance": user["credits_balance"],
            "credits_used": user["credits_used"],
            "concurrent_limit": user["concurrent_limit"],
            "concurrent_slots": user.get("concurrent_slots", 1),
            "image_concurrent_slots": user.get("image_concurrent_slots", 3),
            "is_admin": bool(user["is_admin"]),
            "plan_id": user.get("plan_id"),
            "plan_expires_at_ms": user.get("plan_expires_at_ms"),
            "referral_code": user.get("referral_code"),
            "referrer_id": user.get("referrer_id"),
            "credit_packages": packages
        }
    }

@app.get("/api/user/profile")
async def user_profile(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)

    con = db_conn()
    try:
        # Ensure referral code exists
        referral_code = _ensure_referral_code(con, user["id"])

        # Plan details (if any)
        plan = None
        if user.get("plan_id"):
            p = con.execute("SELECT id, title, subtitle, price_usd, credits, duration_days FROM plans WHERE id = ?", (user["plan_id"],)).fetchone()
            if p:
                plan = dict(p)

        # Referral stats
        referred_count = con.execute(
            "SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?",
            (user["id"],),
        ).fetchone()["cnt"]
        tier_rate = _get_referral_tier_rate(con, user["id"])
        referral_earned = int(user.get("referral_credits_earned") or 0)

        # Get credit packages
        packages = _get_user_credit_packages(con, user["id"])
        total_from_packages = _get_total_credits_from_packages(con, user["id"])

        return {
            "ok": True,
            "profile": {
                "id": user["id"],
                "nickname": user["nickname"],
                "email": user.get("email"),
                "credits_balance": total_from_packages,  # Use total from packages
                "credits_used": user["credits_used"],
                "plan": plan,
                "plan_id": user.get("plan_id"),
                "plan_expires_at_ms": user.get("plan_expires_at_ms"),
                "referral": {
                    "code": referral_code,
                    "referred_count": referred_count,
                    "tier_rate": tier_rate,
                    "credits_earned": referral_earned,
                },
                "credit_packages": packages,
            },
        }
    finally:
        con.close()

@app.get("/api/user/usage")
async def user_usage(
    period: str = Query("7d"),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    con = db_conn()
    try:
        rows = _fetch_usage_rows(con, period=period, user_id=user["id"])
        series = _build_usage_series(rows, period=period)
        return {"ok": True, "period": period, "series": series}
    finally:
        con.close()

@app.post("/api/auth/logout")
async def logout(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        con.execute("UPDATE users SET auth_token = NULL WHERE id = ?", (user["id"],))
        con.commit()
        return {"ok": True}
    finally:
        con.close()

# =============================================================================
# User API Keys
# =============================================================================
@app.get("/api/user/api-keys")
async def list_user_api_keys(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        keys = con.execute(
            "SELECT * FROM user_api_keys WHERE user_id = ? ORDER BY created_at_ms DESC",
            (user["id"],)
        ).fetchall()
        
        return {
            "ok": True,
            "api_keys": [
                {
                    "id": k["id"],
                    "name": k["name"],
                    "api_key": k["api_key"][:12] + "..." + k["api_key"][-4:],
                    "hourly_limit": k["hourly_limit"],
                    "is_active": bool(k["is_active"]),
                    "total_requests": k["total_requests"],
                    "created_at_ms": k["created_at_ms"],
                    "last_used_ms": k["last_used_ms"]
                }
                for k in keys
            ]
        }
    finally:
        con.close()

@app.post("/api/user/api-keys")
async def create_user_api_key(
    name: str = Body(..., embed=True),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        # Limit number of keys per user
        count = con.execute(
            "SELECT COUNT(*) as cnt FROM user_api_keys WHERE user_id = ?",
            (user["id"],)
        ).fetchone()["cnt"]
        
        if count >= 5:
            raise HTTPException(400, "Maximum 5 API keys per user")
        
        key_id = str(uuid.uuid4())
        api_key = _generate_user_api_key()
        
        con.execute("""
            INSERT INTO user_api_keys (id, user_id, api_key, name, created_at_ms)
            VALUES (?, ?, ?, ?, ?)
        """, (key_id, user["id"], api_key, name, now_ms()))
        con.commit()
        
        return {
            "ok": True,
            "api_key": {
                "id": key_id,
                "name": name,
                "api_key": api_key,  # Show full key only on creation
                "hourly_limit": 100
            }
        }
    finally:
        con.close()

@app.delete("/api/user/api-keys/{key_id}")
async def delete_user_api_key(
    key_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        con.execute(
            "DELETE FROM user_api_keys WHERE id = ? AND user_id = ?",
            (key_id, user["id"])
        )
        con.commit()
        return {"ok": True}
    finally:
        con.close()

# =============================================================================
# Image Generation
# =============================================================================
async def generate_image_task(job_id: str, api_key_id: str, user_id: str):
    """Background task to generate image"""
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            return
        
        # Get API key
        api_key_record = con.execute("SELECT * FROM api_keys WHERE id = ?", (api_key_id,)).fetchone()
        if not api_key_record:
            con.execute("UPDATE jobs SET status = 'failed', error = 'No API key available' WHERE id = ?", (job_id,))
            con.commit()
            return
        
        # Update job status
        con.execute("UPDATE jobs SET status = 'processing', started_at_ms = ? WHERE id = ?", (now_ms(), job_id))
        con.commit()
        
        # Make API request
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                payload = {
                    "model": job["model"],
                    "prompt": job["prompt"],
                    "width": job["width"],
                    "height": job["height"],
                    "steps": job["steps"],
                    "n": 1,
                    "response_format": "b64_json"
                }
                
                if job["negative_prompt"]:
                    payload["negative_prompt"] = job["negative_prompt"]
                if job["seed"]:
                    payload["seed"] = job["seed"]
                
                response = await client.post(
                    IMAGE_API_URL,
                    headers={
                        "Authorization": f"Bearer {api_key_record['api_key']}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )
                
                if response.status_code != 200:
                    error_msg = response.text[:500]
                    con.execute(
                        "UPDATE jobs SET status = 'failed', error = ?, completed_at_ms = ? WHERE id = ?",
                        (error_msg, now_ms(), job_id)
                    )
                    con.execute(
                        "UPDATE api_keys SET failed_requests = failed_requests + 1 WHERE id = ?",
                        (api_key_id,)
                    )
                    con.commit()
                    return
                
                data = response.json()
                
                if "data" in data and len(data["data"]) > 0:
                    image_data = data["data"][0].get("b64_json", "")
                    
                    if image_data:
                        image_path = IMAGES_DIR / f"{job_id}.png"
                        async with aiofiles.open(image_path, "wb") as f:
                            await f.write(base64.b64decode(image_data))
                        
                        # Update job
                        expires_at = now_ms() + (IMAGE_TTL_SECONDS * 1000)
                        con.execute("""
                            UPDATE jobs SET 
                                status = 'completed',
                                image_path = ?,
                                completed_at_ms = ?,
                                expires_at_ms = ?
                            WHERE id = ?
                        """, (str(image_path), now_ms(), expires_at, job_id))
                        
                        # Update API key stats
                        con.execute(
                            "UPDATE api_keys SET total_requests = total_requests + 1, last_used_ms = ? WHERE id = ?",
                            (now_ms(), api_key_id)
                        )
                        
                        # Update rate limiter
                        await rate_limiter.increment_api_key_usage(api_key_id)
                        
                        con.commit()
                        
                        log_event("info", "generation_completed", f"Image generated: {job_id}", user_id=user_id)
                        return
                
                con.execute(
                    "UPDATE jobs SET status = 'failed', error = 'No image data in response', completed_at_ms = ? WHERE id = ?",
                    (now_ms(), job_id)
                )
                con.commit()
                
        except Exception as e:
            con.execute(
                "UPDATE jobs SET status = 'failed', error = ?, completed_at_ms = ? WHERE id = ?",
                (str(e)[:500], now_ms(), job_id)
            )
            con.commit()
            log_event("error", "generation_failed", f"Generation failed: {str(e)}", user_id=user_id)
    
    finally:
        # Release concurrent slot
        await rate_limiter.release_concurrent(api_key_id, user_id)
        con.close()

@app.post("/api/generate")
async def generate_image(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None)
):
    """Generate an image"""
    
    # Authenticate via token or API key
    if x_api_key:
        user, user_key = require_api_key(x_api_key)
        user_id = user["id"]
    else:
        tok = _extract_token(authorization, token)
        user = require_user(tok)
        user_id = user["id"]
        user_key = None
    
    # Check credits
    credits_balance = user["credits_balance"]
    if credits_balance != -1 and credits_balance <= 0:  # -1 = unlimited
        raise HTTPException(402, "Insufficient credits")
    
    # Get API key from pool
    api_key_record = get_active_api_key()
    if not api_key_record:
        raise HTTPException(503, "No API keys available")
    
    api_key_id = api_key_record["id"]
    
    # Check rate limits
    allowed, remaining, reset_in = await rate_limiter.check_api_key_limit(
        api_key_id, api_key_record["hourly_limit"]
    )
    if not allowed:
        raise HTTPException(429, f"Rate limit exceeded. Resets in {reset_in} seconds")
    
    # Check concurrent limits
    user_concurrent_limit = user.get("concurrent_limit", DEFAULT_CONCURRENT_LIMIT)
    api_concurrent_limit = api_key_record.get("concurrent_limit", MAX_CONCURRENT_PER_KEY)
    
    allowed, msg = await rate_limiter.check_concurrent(
        api_key_id, user_id, api_concurrent_limit, user_concurrent_limit
    )
    if not allowed:
        raise HTTPException(429, msg)
    
    # Acquire concurrent slot
    await rate_limiter.acquire_concurrent(api_key_id, user_id)
    
    # Create job
    job_id = str(uuid.uuid4())
    
    con = db_conn()
    try:
        con.execute("""
            INSERT INTO jobs (id, user_id, api_key_id, status, prompt, negative_prompt, 
                            model, width, height, steps, seed, created_at_ms)
            VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            job_id, user_id, api_key_id, body.prompt, body.negative_prompt,
            body.model, body.width, body.height, body.steps, body.seed, now_ms()
        ))
        
        # Deduct credits
        if credits_balance != -1:
            con.execute(
                "UPDATE users SET credits_balance = credits_balance - 1, credits_used = credits_used + 1 WHERE id = ?",
                (user_id,)
            )
        
        # Update user API key stats if used
        if user_key:
            con.execute(
                "UPDATE user_api_keys SET total_requests = total_requests + 1, last_used_ms = ? WHERE id = ?",
                (now_ms(), user_key["id"])
            )
        
        con.commit()
    finally:
        con.close()
    
    # Start background generation
    background_tasks.add_task(generate_image_task, job_id, api_key_id, user_id)
    
    log_event("info", "generation_started", f"Generation started: {job_id}", user_id=user_id)
    
    return {
        "ok": True,
        "job_id": job_id,
        "status": "pending"
    }

@app.get("/api/jobs/{job_id}")
async def get_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None)
):
    """Get job status"""
    if x_api_key:
        user, _ = require_api_key(x_api_key)
    else:
        tok = _extract_token(authorization, token)
        user = require_user(tok)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user["id"])).fetchone()
        
        if not job:
            raise HTTPException(404, "Job not found")
        
        return {
            "ok": True,
            "job": {
                "id": job["id"],
                "status": job["status"],
                "prompt": job["prompt"],
                "model": job["model"],
                "width": job["width"],
                "height": job["height"],
                "error": job["error"],
                "created_at_ms": job["created_at_ms"],
                "completed_at_ms": job["completed_at_ms"],
                "expires_at_ms": job["expires_at_ms"]
            }
        }
    finally:
        con.close()

@app.delete("/api/jobs/{job_id}")
async def delete_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Delete a job"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Job not found")
        
        if job["user_id"] != user["id"]:
            raise HTTPException(403, "Access denied")
        
        con.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        con.commit()
        
        return {"ok": True, "message": "Job deleted"}
    finally:
        con.close()

@app.get("/api/jobs/{job_id}/image")
async def get_job_image(
    job_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None)
):
    """Download generated image"""
    if x_api_key:
        user, _ = require_api_key(x_api_key)
    else:
        tok = _extract_token(authorization, token)
        user = require_user(tok)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user["id"])).fetchone()
        
        if not job:
            raise HTTPException(404, "Job not found")
        
        if job["status"] != "completed":
            raise HTTPException(400, f"Job not completed. Status: {job['status']}")
        
        if not job["image_path"] or not Path(job["image_path"]).exists():
            raise HTTPException(404, "Image not found")
        
        # Check expiration
        if job["expires_at_ms"] and now_ms() > job["expires_at_ms"]:
            raise HTTPException(410, "Image expired")
        
        return FileResponse(
            job["image_path"],
            media_type="image/png",
            filename=f"fiftyfive_{job_id}.png"
        )
    finally:
        con.close()

@app.get("/api/history")
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None),  # 'voice' or 'image'
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get generation history"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        offset = (page - 1) * limit
        
        # Build query with optional type filter
        if type == 'image':
            # Filter for image type - check for "type":"image" in metadata_json
            query = """
                SELECT * FROM jobs 
                WHERE user_id = ? 
                AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')
                ORDER BY created_at_ms DESC 
                LIMIT ? OFFSET ?
            """
            count_query = """
                SELECT COUNT(*) as cnt FROM jobs 
                WHERE user_id = ? 
                AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')
            """
        elif type == 'voice':
            # Filter for voice type - exclude images (NULL or not containing image type)
            query = """
                SELECT * FROM jobs 
                WHERE user_id = ? 
                AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))
                ORDER BY created_at_ms DESC 
                LIMIT ? OFFSET ?
            """
            count_query = """
                SELECT COUNT(*) as cnt FROM jobs 
                WHERE user_id = ? 
                AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))
            """
        else:
            query = """
                SELECT * FROM jobs 
                WHERE user_id = ? 
                ORDER BY created_at_ms DESC 
                LIMIT ? OFFSET ?
            """
            count_query = "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ?"
        
        if type:
            jobs = con.execute(query, (user["id"], limit, offset)).fetchall()
            total = con.execute(count_query, (user["id"],)).fetchone()["cnt"]
        else:
            jobs = con.execute(query, (user["id"], limit, offset)).fetchall()
            total = con.execute(count_query, (user["id"],)).fetchone()["cnt"]
        
        return {
            "ok": True,
            "jobs": [
                {
                    "id": j["id"],
                    "status": j["status"],
                    "prompt": j["prompt"][:100] + "..." if len(j["prompt"] or "") > 100 else j["prompt"],
                    "model": j["model"],
                    "width": j["width"],
                    "height": j["height"],
                    "created_at_ms": j["created_at_ms"],
                    "completed_at_ms": j["completed_at_ms"],
                    "expires_at_ms": j["expires_at_ms"],
                    "is_expired": j["expires_at_ms"] and now_ms() > j["expires_at_ms"],
                    "metadata_json": j["metadata_json"]
                }
                for j in jobs
            ],
            "total": total,
            "page": page,
            "pages": math.ceil(total / limit)
        }
    finally:
        con.close()

@app.get("/api/tasks/active")
async def get_active_tasks(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get user's active (processing/pending/queued) VOICE tasks with progress"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        # Exclude image tasks (they have "type":"image" or "type": "image" in metadata)
        jobs = con.execute("""
            SELECT * FROM jobs 
            WHERE user_id = ? AND status IN ('processing', 'pending', 'queued')
            AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))
            ORDER BY created_at_ms ASC
        """, (user["id"],)).fetchall()
        
        result = []
        for j in jobs:
            # Витягуємо metadata для прогресу
            metadata = {}
            try:
                metadata = json.loads(j["metadata_json"] or "{}")
            except:
                pass
            
            # Підраховуємо queue_position тільки серед voice queued
            queue_position = None
            if j["status"] == "queued":
                voice_q = " AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%\"type\":\"image\"%' AND metadata_json NOT LIKE '%\"type\": \"image\"%'))"
                position = con.execute(
                    "SELECT COUNT(*) as pos FROM jobs WHERE user_id = ? AND status = 'queued' AND created_at_ms < ? " + voice_q,
                    (user["id"], j["created_at_ms"])
                ).fetchone()
                queue_position = (position["pos"] if position else 0) + 1
            
            # Прогрес для processing (початково 0, polling оновить до реального)
            progress = 0
            if j["status"] == "processing":
                progress = metadata.get("progress", 0)  # Default 0%, polling оновить
            
            result.append({
                "id": j["id"],
                "status": j["status"],
                "prompt": j["prompt"],
                "model": j["model"],
                "char_count": j["width"],  # We store char count in width
                "credits_charged": j["credits_charged"],
                "created_at_ms": j["created_at_ms"],
                "started_at_ms": j["started_at_ms"],
                "progress": progress,
                "queue_position": queue_position
            })
        
        return {
            "ok": True,
            "tasks": result
        }
    finally:
        con.close()

@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Cancel user's own task"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ? AND user_id = ?", (task_id, user["id"])).fetchone()
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["status"] not in ("pending", "processing", "queued"):
            raise HTTPException(400, "Task cannot be cancelled")
        
        # Try to cancel in Voicer API only for voice tasks (image tasks use different providers)
        metadata = json.loads(job["metadata_json"] or "{}")
        if job["status"] == "processing" and metadata.get("type") != "image":
            try:
                voicer_task_id = metadata.get("voicer_task_id") or task_id
                key_data = get_voicer_api_key()
                if key_data:
                    _, voicer_key = key_data
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.post(
                            f"{VOICER_API_BASE}/voice/cancel/{voicer_task_id}",
                            headers={"Authorization": f"Bearer {voicer_key}"}
                        )
            except Exception as e:
                _debug_log(f"[CANCEL] Could not cancel in Voicer API: {e}")
        
        # Release concurrent slot if processing
        if job["api_key_id"] and job["status"] == "processing":
            await rate_limiter.release_concurrent(job["api_key_id"], job["user_id"])
            _debug_log(f"[CANCEL] Released slot for user {user['id']}")
        
        # Update status
        con.execute(
            "UPDATE jobs SET status = 'cancelled', error = 'Cancelled by user', completed_at_ms = ? WHERE id = ?",
            (now_ms(), task_id)
        )
        
        # Refund credits to credit packages (add back as a package)
        if job["credits_charged"] > 0:
            # Add refunded credits as a new package (7 days validity)
            _add_credit_package(con, user["id"], job["credits_charged"], 7, "refund", apply_referral=False)
            
            # Update credits_used counter
            con.execute(
                "UPDATE users SET credits_used = credits_used - ? WHERE id = ?",
                (job["credits_charged"], user["id"])
            )
        
        con.commit()
        log_event("info", "task_cancelled_by_user", f"Task {task_id} cancelled by user", user_id=user["id"], meta={"task_id": task_id})
        
        return {"ok": True, "message": "Task cancelled", "credits_refunded": job["credits_charged"]}
    finally:
        con.close()

# =============================================================================
# Plans
# =============================================================================
@app.get("/api/plans")
async def get_plans():
    """Get available plans"""
    con = db_conn()
    try:
        plans = con.execute("SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC").fetchall()
        
        return {
            "ok": True,
            "plans": [
                {
                    "id": p["id"],
                    "title": p["title"],
                    "subtitle": p["subtitle"],
                    "price_usd": p["price_usd"],
                    "credits": p["credits"],
                    "duration_days": p["duration_days"],
                    "description": p["description"],
                    "features": json.loads(p["features_json"]) if p["features_json"] else [],
                    "popular": bool(p["popular"])
                }
                for p in plans
            ]
        }
    finally:
        con.close()

# Admin: Get all plans (including inactive)
@app.get("/api/admin/plans")
async def admin_get_plans(x_admin_token: str = Header(None)):
    """Get all plans for admin"""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    con = db_conn()
    try:
        plans = con.execute("SELECT * FROM plans ORDER BY sort_order ASC, id ASC").fetchall()
        
        return {
            "ok": True,
            "plans": [
                {
                    "id": p["id"],
                    "title": p["title"],
                    "subtitle": p["subtitle"],
                    "price_usd": p["price_usd"],
                    "credits": p["credits"],
                    "duration_days": p["duration_days"],
                    "description": p["description"],
                    "features": json.loads(p["features_json"]) if p["features_json"] else [],
                    "popular": bool(p["popular"]),
                    "is_active": bool(p["is_active"]),
                    "sort_order": p["sort_order"]
                }
                for p in plans
            ]
        }
    finally:
        con.close()

# Admin: Create plan
@app.post("/api/admin/plans")
async def admin_create_plan(request: Request, x_admin_token: str = Header(None)):
    """Create a new plan"""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    data = await request.json()
    plan_id = data.get("id", "").strip().lower().replace(" ", "_")
    
    if not plan_id:
        raise HTTPException(status_code=400, detail="Plan ID is required")
    
    con = db_conn()
    try:
        # Check if plan exists
        existing = con.execute("SELECT id FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Plan with this ID already exists")
        
        features_json = json.dumps(data.get("features", []))
        
        con.execute("""
            INSERT INTO plans (id, title, subtitle, price_usd, credits, duration_days, description, features_json, is_active, sort_order, popular)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            plan_id,
            data.get("title", ""),
            data.get("subtitle", ""),
            float(data.get("price_usd", 0)),
            int(data.get("credits", 10000)),
            int(data.get("duration_days", 30)),
            data.get("description", ""),
            features_json,
            1 if data.get("is_active", True) else 0,
            int(data.get("sort_order", 0)),
            1 if data.get("popular", False) else 0
        ))
        con.commit()
        
        return {"ok": True, "message": "Plan created", "plan_id": plan_id}
    finally:
        con.close()

# Admin: Update plan
@app.patch("/api/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, request: Request, x_admin_token: str = Header(None)):
    """Update a plan"""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    data = await request.json()
    
    con = db_conn()
    try:
        # Check if plan exists
        existing = con.execute("SELECT id FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        updates = []
        params = []
        
        if "title" in data:
            updates.append("title = ?")
            params.append(data["title"])
        if "subtitle" in data:
            updates.append("subtitle = ?")
            params.append(data["subtitle"])
        if "price_usd" in data:
            updates.append("price_usd = ?")
            params.append(float(data["price_usd"]))
        if "credits" in data:
            updates.append("credits = ?")
            params.append(int(data["credits"]))
        if "duration_days" in data:
            updates.append("duration_days = ?")
            params.append(int(data["duration_days"]))
        if "description" in data:
            updates.append("description = ?")
            params.append(data["description"])
        if "features" in data:
            updates.append("features_json = ?")
            params.append(json.dumps(data["features"]))
        if "is_active" in data:
            updates.append("is_active = ?")
            params.append(1 if data["is_active"] else 0)
        if "sort_order" in data:
            updates.append("sort_order = ?")
            params.append(int(data["sort_order"]))
        if "popular" in data:
            updates.append("popular = ?")
            params.append(1 if data["popular"] else 0)
        
        if updates:
            params.append(plan_id)
            con.execute(f"UPDATE plans SET {', '.join(updates)} WHERE id = ?", params)
            con.commit()
        
        return {"ok": True, "message": "Plan updated"}
    finally:
        con.close()

# Admin: Delete plan
@app.delete("/api/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, x_admin_token: str = Header(None)):
    """Delete a plan"""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    con = db_conn()
    try:
        existing = con.execute("SELECT id FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        con.execute("DELETE FROM plans WHERE id = ?", (plan_id,))
        con.commit()
        
        return {"ok": True, "message": "Plan deleted"}
    finally:
        con.close()

# =============================================================================
# Models
# =============================================================================
@app.get("/api/models")
async def get_models():
    """Get available models"""
    models = [
        {
            "id": "black-forest-labs/FLUX.1-schnell-Free",
            "name": "FLUX.1 Schnell",
            "description": "Fast, high-quality generation",
            "default_steps": 4,
            "max_steps": 4
        },
        {
            "id": "black-forest-labs/FLUX.1.1-pro",
            "name": "FLUX 1.1 Pro",
            "description": "Professional quality",
            "default_steps": 25,
            "max_steps": 50
        },
        {
            "id": "stabilityai/stable-diffusion-xl-base-1.0",
            "name": "Stable Diffusion XL",
            "description": "Classic SDXL model",
            "default_steps": 30,
            "max_steps": 50
        }
    ]
    
    return {"ok": True, "models": models}

# =============================================================================
# Admin Endpoints
# =============================================================================
@app.get("/api/admin/stats")
async def admin_stats(x_admin_token: Optional[str] = Header(None)):
    """Get admin dashboard stats"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        # User stats
        total_users = con.execute("SELECT COUNT(*) as cnt FROM users").fetchone()["cnt"]
        active_users_24h = con.execute(
            "SELECT COUNT(*) as cnt FROM users WHERE last_login_ms > ?",
            (now_ms() - DAY_MS,)
        ).fetchone()["cnt"]
        
        # Job stats
        total_jobs = con.execute("SELECT COUNT(*) as cnt FROM jobs").fetchone()["cnt"]
        completed_jobs = con.execute("SELECT COUNT(*) as cnt FROM jobs WHERE status = 'completed'").fetchone()["cnt"]
        failed_jobs = con.execute("SELECT COUNT(*) as cnt FROM jobs WHERE status = 'failed'").fetchone()["cnt"]
        pending_jobs = con.execute("SELECT COUNT(*) as cnt FROM jobs WHERE status IN ('pending', 'processing')").fetchone()["cnt"]
        
        jobs_24h = con.execute(
            "SELECT COUNT(*) as cnt FROM jobs WHERE created_at_ms > ?",
            (now_ms() - DAY_MS,)
        ).fetchone()["cnt"]
        
        # Total characters used (from completed voice jobs)
        # Use char_count if available, fall back to width (which stored char_count for voice jobs)
        total_chars_result = con.execute(
            "SELECT COALESCE(SUM(COALESCE(char_count, width)), 0) as total FROM jobs WHERE status = 'completed'"
        ).fetchone()
        total_characters = total_chars_result["total"] if total_chars_result else 0
        
        # Characters used today
        today_start = now_ms() - DAY_MS
        chars_today_result = con.execute(
            "SELECT COALESCE(SUM(COALESCE(char_count, width)), 0) as total FROM jobs WHERE status = 'completed' AND created_at_ms > ?",
            (today_start,)
        ).fetchone()
        characters_today = chars_today_result["total"] if chars_today_result else 0
        
        # API key stats
        total_api_keys = con.execute("SELECT COUNT(*) as cnt FROM api_keys").fetchone()["cnt"]
        active_api_keys = con.execute("SELECT COUNT(*) as cnt FROM api_keys WHERE is_active = 1").fetchone()["cnt"]
        
        # Rate limiter stats
        rate_stats = rate_limiter.get_stats()
        
        return {
            "ok": True,
            "stats": {
                "users": {
                    "total": total_users,
                    "active_24h": active_users_24h
                },
                "jobs": {
                    "total": total_jobs,
                    "completed": completed_jobs,
                    "failed": failed_jobs,
                    "pending": pending_jobs,
                    "last_24h": jobs_24h,
                    "total_characters": total_characters,
                    "characters_today": characters_today
                },
                "api_keys": {
                    "total": total_api_keys,
                    "active": active_api_keys
                },
                "rate_limiter": rate_stats
            }
        }
    finally:
        con.close()

@app.get("/api/admin/usage")
async def admin_usage(
    period: str = Query("7d"),
    x_admin_token: Optional[str] = Header(None)
):
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        rows = _fetch_usage_rows(con, period=period, user_id=None)
        series = _build_usage_series(rows, period=period)
        return {"ok": True, "period": period, "series": series}
    finally:
        con.close()

@app.get("/api/admin/task-log")
async def admin_task_log(
    limit: int = Query(200, ge=1, le=500),
    x_admin_token: Optional[str] = Header(None)
):
    """Get log of recent tasks and events"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        # Get tasks
        tasks = con.execute("""
            SELECT j.id, j.user_id, j.status, j.prompt, COALESCE(j.char_count, j.width, 0) as char_count, j.error,
                   j.created_at_ms, j.started_at_ms, j.completed_at_ms,
                   j.model, j.metadata_json,
                   u.nickname as user_nickname
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            ORDER BY j.created_at_ms DESC
            LIMIT ?
        """, (limit,)).fetchall()
        
        # Get events (logins, logouts, registrations, etc.)
        events = con.execute("""
            SELECT e.id, e.user_id, e.event_type as status, e.message as prompt, e.created_at_ms,
                   u.nickname as user_nickname
            FROM event_log e
            LEFT JOIN users u ON e.user_id = u.id
            ORDER BY e.created_at_ms DESC
            LIMIT ?
        """, (limit,)).fetchall()
        
        # Combine and sort
        all_items = []
        
        for t in tasks:
            all_items.append({
                "id": t["id"],
                "user_id": t["user_id"],
                "user_nickname": t["user_nickname"] or "Unknown",
                "status": t["status"],
                "prompt": (t["prompt"] or "")[:100] + ("..." if t["prompt"] and len(t["prompt"]) > 100 else ""),
                "char_count": t["char_count"] or 0,
                "model": t["model"],
                "metadata_json": t["metadata_json"],
                "error": t["error"],
                "created_at_ms": t["created_at_ms"],
                "started_at_ms": t["started_at_ms"],
                "completed_at_ms": t["completed_at_ms"],
                "type": "task"
            })
        
        for e in events:
            all_items.append({
                "id": e["id"],
                "user_id": e["user_id"],
                "user_nickname": e["user_nickname"] or "System",
                "status": e["status"],
                "prompt": e["prompt"] or "",
                "char_count": 0,
                "error": None,
                "created_at_ms": e["created_at_ms"],
                "started_at_ms": None,
                "completed_at_ms": None,
                "type": "event"
            })
        
        # Sort by created_at_ms descending
        all_items.sort(key=lambda x: x["created_at_ms"] or 0, reverse=True)
        
        return {
            "ok": True,
            "tasks": all_items[:limit]
        }
    finally:
        con.close()

@app.get("/api/admin/users")
async def admin_list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    x_admin_token: Optional[str] = Header(None)
):
    """List all users"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        offset = (page - 1) * limit
        
        if search:
            users = con.execute("""
                SELECT * FROM users 
                WHERE nickname LIKE ? OR email LIKE ? OR id LIKE ?
                ORDER BY created_at_ms DESC 
                LIMIT ? OFFSET ?
            """, (f"%{search}%", f"%{search}%", f"%{search}%", limit, offset)).fetchall()
            total = con.execute(
                "SELECT COUNT(*) as cnt FROM users WHERE nickname LIKE ? OR email LIKE ? OR id LIKE ?",
                (f"%{search}%", f"%{search}%", f"%{search}%")
            ).fetchone()["cnt"]
        else:
            users = con.execute("""
                SELECT * FROM users 
                ORDER BY created_at_ms DESC 
                LIMIT ? OFFSET ?
            """, (limit, offset)).fetchall()
        
        # Calculate total count
        if search:
            total = con.execute(
                "SELECT COUNT(*) as cnt FROM users WHERE nickname LIKE ? OR email LIKE ? OR id LIKE ?",
                (f"%{search}%", f"%{search}%", f"%{search}%")
            ).fetchone()["cnt"]
        else:
            total = con.execute("SELECT COUNT(*) as cnt FROM users").fetchone()["cnt"]
        
        # Add referral count and credit packages for each user
        users_list = []
        for user in users:
            user_dict = dict(user)
            
            # Count referrals
            ref_count = con.execute(
                "SELECT COUNT(*) as cnt FROM users WHERE referrer_id = ?",
                (user["id"],)
            ).fetchone()["cnt"]
            user_dict["referral_count"] = ref_count
            
            # Get credit packages
            packages = _get_user_credit_packages(con, user["id"])
            user_dict["credit_packages"] = packages
            
            # Count active voice tasks only (exclude image; match both "type":"image" and "type": "image")
            active_tasks = con.execute(
                """SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing'
                   AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))""",
                (user["id"],)
            ).fetchone()["cnt"]
            user_dict["active_tasks"] = active_tasks
            
            # Count active image tasks (only processing, not queued)
            active_image_tasks = con.execute(
                """SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing'
                   AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')""",
                (user["id"],)
            ).fetchone()["cnt"]
            user_dict["active_image_tasks"] = active_image_tasks
            
            users_list.append(user_dict)
        
        return {
            "ok": True,
            "users": [
                {
                    "id": u["id"],
                    "nickname": u["nickname"],
                    "email": u.get("email"),
                    "credits_balance": u.get("credits_balance", 0),
                    "credits_used": u.get("credits_used", 0),
                    "plan_id": u.get("plan_id"),
                    "plan_expires_at_ms": u.get("plan_expires_at_ms"),
                    "referral_code": u.get("referral_code"),
                    "referrer_id": u.get("referrer_id"),
                    "referral_count": u.get("referral_count", 0),
                    "concurrent_limit": u.get("concurrent_limit", 1),
                    "concurrent_slots": u.get("concurrent_slots", 1),
                    "image_concurrent_slots": u.get("image_concurrent_slots", 3),
                    "active_tasks": u.get("active_tasks", 0),
                    "active_image_tasks": u.get("active_image_tasks", 0),
                    "is_active": bool(u.get("is_active", 1)),
                    "is_admin": bool(u.get("is_admin", 0)),
                    "created_at_ms": u.get("created_at_ms", 0),
                    "last_login_ms": u.get("last_login_ms", 0),
                    "credit_packages": u.get("credit_packages", [])
                }
                for u in users_list
            ],
            "total": total,
            "page": page,
            "pages": math.ceil(total / limit)
        }
    finally:
        con.close()

@app.patch("/api/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: AdminUpdateUser,
    x_admin_token: Optional[str] = Header(None)
):
    """Update user"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        user = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        prev_credits = user["credits_balance"]
        
        updates = []
        params = []
        
        if body.credits_balance is not None:
            updates.append("credits_balance = ?")
            params.append(body.credits_balance)
        
        if body.is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if body.is_active else 0)
        
        if body.concurrent_limit is not None:
            updates.append("concurrent_limit = ?")
            params.append(body.concurrent_limit)

        if body.concurrent_slots is not None:
            updates.append("concurrent_slots = ?")
            params.append(body.concurrent_slots)

        if body.image_concurrent_slots is not None:
            updates.append("image_concurrent_slots = ?")
            params.append(body.image_concurrent_slots)

        if body.plan_id is not None:
            updates.append("plan_id = ?")
            params.append(body.plan_id)
        
        if updates:
            params.append(user_id)
            con.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            con.commit()
            
            log_event("info", "admin_update_user", f"User updated: {user_id}", meta=body.model_dump())

            # If admin increased credits_balance, treat as top-up for referral bonus.
            # (This makes referral rewards work with the current UI credits editor.)
            try:
                new_credits = body.credits_balance
                if (
                    new_credits is not None
                    and prev_credits is not None
                    and prev_credits != -1
                    and new_credits != -1
                    and int(new_credits) > int(prev_credits)
                ):
                    delta = int(new_credits) - int(prev_credits)
                    # Log balance change explicitly (requested for Activity Log)
                    log_event(
                        "info",
                        "credits_balance_changed",
                        f"Credits added: +{delta}",
                        user_id=user_id,
                        meta={"delta": delta, "before": int(prev_credits), "after": int(new_credits)},
                    )
                    _apply_referral_bonus(con, referred_user_id=user_id, credits_added=delta)
                    con.commit()
                elif (
                    new_credits is not None
                    and prev_credits is not None
                    and prev_credits != -1
                    and new_credits != -1
                    and int(new_credits) < int(prev_credits)
                ):
                    delta = int(prev_credits) - int(new_credits)
                    log_event(
                        "info",
                        "credits_balance_changed",
                        f"Credits removed: -{delta}",
                        user_id=user_id,
                        meta={"delta": -delta, "before": int(prev_credits), "after": int(new_credits)},
                    )
                    con.commit()
            except Exception as e:
                log_event("warning", "referral_bonus_failed", str(e), user_id=user_id, meta={"user_id": user_id})
        
        return {"ok": True}
    finally:
        con.close()

@app.post("/api/admin/users/{user_id}/topup")
async def admin_topup_user(
    user_id: str,
    body: AdminTopUpUser,
    x_admin_token: Optional[str] = Header(None)
):
    """Add credits to user and apply referral bonus if eligible."""
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        user = con.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        # Add as a credit package with 30 days validity
        # Apply referral bonus since this is a purchase-like topup
        package_id = _add_credit_package(con, user_id, body.credits, duration_days=30, source="admin_topup", apply_referral=True)
        con.commit()

        log_event(
            "info",
            "admin_topup_user",
            f"Admin topup: +{body.credits} credits",
            user_id=user_id,
            meta={"credits": body.credits, "note": body.note, "package_id": package_id},
        )

        return {"ok": True, "package_id": package_id}
    finally:
        con.close()

@app.get("/api/admin/users/{user_id}/packages")
async def admin_get_user_packages(user_id: str, x_admin_token: Optional[str] = Header(None)):
    """Get user's credit packages"""
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        packages = _get_user_credit_packages(con, user_id)
        return {"ok": True, "packages": packages}
    finally:
        con.close()

@app.get("/api/admin/users/{user_id}/referrals")
async def admin_get_user_referrals(user_id: str, x_admin_token: Optional[str] = Header(None)):
    """Get list of users referred by this user"""
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        referrals = con.execute("""
            SELECT id, nickname, email, created_at_ms
            FROM users 
            WHERE referrer_id = ?
            ORDER BY created_at_ms DESC
        """, (user_id,)).fetchall()
        
        return {
            "ok": True,
            "referrals": [
                {
                    "id": r["id"],
                    "nickname": r["nickname"],
                    "email": r["email"],
                    "created_at_ms": r["created_at_ms"]
                }
                for r in referrals
            ]
        }
    finally:
        con.close()

class AddPackageRequest(BaseModel):
    credits: int
    duration_days: int
    source: str = "admin"

@app.post("/api/admin/users/{user_id}/packages")
async def admin_add_user_package(user_id: str, body: AddPackageRequest, x_admin_token: Optional[str] = Header(None)):
    """Add a credit package to user"""
    _require_admin(x_admin_token)
    
    # Validate
    if body.credits < 1000000 or body.credits > 30000000:
        raise HTTPException(400, "Credits must be between 1,000,000 and 30,000,000")
    if body.duration_days not in [30, 60, 90]:
        raise HTTPException(400, "Duration must be 30, 60, or 90 days")
    
    con = db_conn()
    try:
        user = con.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        
        # Apply referral bonus for both "purchase" and "admin" sources
        # Admin is adding credits to user, if user is someone's referral - give bonus
        apply_ref = (body.source in ["purchase", "admin"])
        package_id = _add_credit_package(con, user_id, body.credits, body.duration_days, body.source, apply_referral=apply_ref)
        
        log_event(
            "info",
            "admin_add_package",
            f"Admin added {body.credits:,} credits package for {body.duration_days} days",
            user_id=user_id,
            meta={"credits": body.credits, "duration_days": body.duration_days, "package_id": package_id, "source": body.source}
        )
        
        return {"ok": True, "package_id": package_id}
    finally:
        con.close()

@app.patch("/api/admin/users/{user_id}/packages/{package_id}")
async def admin_update_user_package(user_id: str, package_id: str, body: dict, x_admin_token: Optional[str] = Header(None)):
    """Update a credit package (edit remaining credits and/or duration)"""
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        package = con.execute("SELECT * FROM credit_packages WHERE id = ? AND user_id = ?", (package_id, user_id)).fetchone()
        if not package:
            raise HTTPException(404, "Package not found")
        
        new_remaining = body.get("credits_remaining")
        new_duration_days = body.get("duration_days")
        
        if new_remaining is not None:
            if new_remaining < 0 or new_remaining > package["credits_initial"]:
                raise HTTPException(400, "Invalid credits_remaining value")
            con.execute(
                "UPDATE credit_packages SET credits_remaining = ? WHERE id = ?",
                (new_remaining, package_id)
            )
        
        if new_duration_days is not None:
            if new_duration_days not in [30, 60, 90]:
                raise HTTPException(400, "Duration must be 30, 60, or 90 days")
            new_expires_at = package["created_at_ms"] + (new_duration_days * DAY_MS)
            con.execute(
                "UPDATE credit_packages SET expires_at_ms = ? WHERE id = ?",
                (new_expires_at, package_id)
            )
        
        con.commit()
        
        log_event(
            "info",
            "admin_update_package",
            f"Admin updated credit package {package_id}",
            user_id=user_id,
            meta={"package_id": package_id, "updates": body}
        )
        
        return {"ok": True}
    finally:
        con.close()

@app.delete("/api/admin/users/{user_id}/packages/{package_id}")
async def admin_delete_user_package(user_id: str, package_id: str, x_admin_token: Optional[str] = Header(None)):
    """Delete a credit package"""
    _require_admin(x_admin_token)
    con = db_conn()
    try:
        package = con.execute("SELECT * FROM credit_packages WHERE id = ? AND user_id = ?", (package_id, user_id)).fetchone()
        if not package:
            raise HTTPException(404, "Package not found")
        
        con.execute("DELETE FROM credit_packages WHERE id = ?", (package_id,))
        con.commit()
        
        log_event(
            "info",
            "admin_delete_package",
            f"Admin deleted credit package {package_id}",
            user_id=user_id,
            meta={"package_id": package_id, "credits_remaining": package["credits_remaining"]}
        )
        
        return {"ok": True}
    finally:
        con.close()

@app.get("/api/admin/api-keys")
async def admin_list_api_keys(x_admin_token: Optional[str] = Header(None)):
    """List all API keys"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        keys = con.execute("SELECT * FROM api_keys ORDER BY created_at_ms DESC").fetchall()
        
        result_keys = []
        for k in keys:
            provider = k["provider"] if k["provider"] else "together"
            # Normalize provider name for consistency
            if provider not in ["voicer", "elevenlabs", "whisk", "voidai", "naga", "together"]:
                _debug_log(f"[ADMIN] Warning: Unknown provider '{provider}' for key {k['id']}, keeping as is")
            
            result_keys.append({
                "id": k["id"],
                "name": k["name"],
                "api_key": k["api_key"][:12] + "..." + k["api_key"][-4:] if k["api_key"] else "",
                "provider": provider,  # Use normalized provider
                "hourly_limit": k["hourly_limit"],
                "concurrent_limit": k["concurrent_limit"],
                "is_active": bool(k["is_active"]),
                "total_requests": k["total_requests"],
                "failed_requests": k["failed_requests"],
                "created_at_ms": k["created_at_ms"],
                "last_used_ms": k["last_used_ms"],
                "current_usage": rate_limiter.api_key_usage.get(k["id"], {}).get("count", 0),
                "current_concurrent": rate_limiter.api_key_concurrent.get(k["id"], 0)
            })
        
        return {
            "ok": True,
            "api_keys": result_keys
        }
    finally:
        con.close()

# Get model pricing (public endpoint for users)
@app.get("/api/model-pricing")
async def get_model_pricing():
    """Get model pricing for current user"""
    con = db_conn()
    try:
        pricing = con.execute("SELECT * FROM model_pricing ORDER BY model_id").fetchall()
        return {
            "ok": True,
            "pricing": [{"model_id": p["model_id"], "credits_per_image": p["credits_per_image"]} for p in pricing]
        }
    finally:
        con.close()

# Admin: Get model pricing
@app.get("/api/admin/model-pricing")
async def admin_get_model_pricing(x_admin_token: Optional[str] = Header(None)):
    """Get model pricing"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        pricing = con.execute("SELECT * FROM model_pricing ORDER BY model_id").fetchall()
        return {
            "ok": True,
            "pricing": [{"model_id": p["model_id"], "credits_per_image": p["credits_per_image"]} for p in pricing]
        }
    finally:
        con.close()

# Admin: Update model pricing
@app.patch("/api/admin/model-pricing/{model_id}")
async def admin_update_model_pricing(
    model_id: str,
    request: Request,
    x_admin_token: Optional[str] = Header(None)
):
    """Update model pricing"""
    _require_admin(x_admin_token)
    
    body = await request.json()
    credits_per_image = int(body.get("credits_per_image", 1))
    
    if credits_per_image < 1 or credits_per_image > 100000:
        raise HTTPException(400, "Credits per image must be between 1 and 100,000")
    
    con = db_conn()
    try:
        # Check if pricing exists
        existing = con.execute("SELECT * FROM model_pricing WHERE model_id = ?", (model_id,)).fetchone()
        
        if existing:
            con.execute(
                "UPDATE model_pricing SET credits_per_image = ?, updated_at_ms = ? WHERE model_id = ?",
                (credits_per_image, now_ms(), model_id)
            )
        else:
            con.execute(
                "INSERT INTO model_pricing (model_id, credits_per_image, updated_at_ms) VALUES (?, ?, ?)",
                (model_id, credits_per_image, now_ms())
            )
        
        con.commit()
        log_event("info", "admin_update_model_pricing", f"Model {model_id} pricing updated to {credits_per_image} credits/image")
        
        return {"ok": True, "message": "Pricing updated"}
    finally:
        con.close()

@app.post("/api/admin/api-keys")
async def admin_create_api_key(
    body: AdminCreateApiKey,
    x_admin_token: Optional[str] = Header(None)
):
    """Create API key"""
    _require_admin(x_admin_token)
    
    # Validate and normalize provider - ensure it's exactly as sent
    provider = body.provider
    if not provider:
        provider = "together"
    
    # Normalize provider name (lowercase, trim)
    provider = provider.strip().lower()
    
    valid_providers = ["voicer", "elevenlabs", "whisk", "voidai", "naga", "together"]
    if provider not in valid_providers:
        raise HTTPException(400, f"Invalid provider: '{body.provider}'. Valid providers: {', '.join(valid_providers)}")
    
    _debug_log(f"[ADMIN] Creating API key - received provider: '{body.provider}', normalized: '{provider}', name: {body.name}")
    
    con = db_conn()
    try:
        key_id = str(uuid.uuid4())
        
        # Insert with explicit provider value
        con.execute("""
            INSERT INTO api_keys (id, name, api_key, provider, hourly_limit, concurrent_limit, created_at_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (key_id, body.name, body.api_key, provider, body.hourly_limit, body.concurrent_limit, now_ms()))
        con.commit()
        
        # Verify it was saved correctly - read directly from DB
        saved_key = con.execute("SELECT provider FROM api_keys WHERE id = ?", (key_id,)).fetchone()
        saved_provider = saved_key["provider"] if saved_key else None
        _debug_log(f"[ADMIN] API key saved - ID: {key_id[:8]}..., provider in DB: '{saved_provider}'")
        
        if saved_provider != provider:
            _debug_log(f"[ADMIN] WARNING: Provider mismatch! Expected '{provider}', got '{saved_provider}'")
            # Try to fix it
            con.execute("UPDATE api_keys SET provider = ? WHERE id = ?", (provider, key_id))
            con.commit()
            _debug_log(f"[ADMIN] Fixed provider to '{provider}'")
        
        log_event("info", "admin_create_api_key", f"API key created: {body.name}, provider: {provider}")
        
        return {"ok": True, "id": key_id, "provider": provider}
    finally:
        con.close()

@app.patch("/api/admin/api-keys/{key_id}")
async def admin_update_api_key(
    key_id: str,
    body: AdminUpdateApiKey,
    x_admin_token: Optional[str] = Header(None)
):
    """Update API key"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        key = con.execute("SELECT * FROM api_keys WHERE id = ?", (key_id,)).fetchone()
        if not key:
            raise HTTPException(404, "API key not found")
        
        updates = []
        params = []
        
        if body.name is not None:
            updates.append("name = ?")
            params.append(body.name)
        
        if body.hourly_limit is not None:
            updates.append("hourly_limit = ?")
            params.append(body.hourly_limit)
        
        if body.concurrent_limit is not None:
            updates.append("concurrent_limit = ?")
            params.append(body.concurrent_limit)
        
        if body.is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if body.is_active else 0)
        
        if updates:
            params.append(key_id)
            con.execute(f"UPDATE api_keys SET {', '.join(updates)} WHERE id = ?", params)
            con.commit()
            
            log_event("info", "admin_update_api_key", f"API key updated: {key_id}", meta=body.model_dump())
        
        return {"ok": True}
    finally:
        con.close()

@app.delete("/api/admin/api-keys/{key_id}")
async def admin_delete_api_key(
    key_id: str,
    x_admin_token: Optional[str] = Header(None)
):
    """Delete API key"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        con.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        con.commit()
        
        log_event("info", "admin_delete_api_key", f"API key deleted: {key_id}")
        
        return {"ok": True}
    finally:
        con.close()

@app.get("/api/admin/logs")
async def admin_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    level: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),  # supports CSV: "a,b,c"
    scope: Optional[str] = Query(None),  # all | system | user
    x_admin_token: Optional[str] = Header(None)
):
    """Get event logs"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        offset = (page - 1) * limit
        
        where_clauses = []
        params = []
        
        if level:
            where_clauses.append("level = ?")
            params.append(level)
        
        if event_type:
            types = [t.strip() for t in (event_type or "").split(",") if t.strip()]
            if len(types) == 1:
                where_clauses.append("event_type = ?")
                params.append(types[0])
            elif len(types) > 1:
                where_clauses.append(f"event_type IN ({','.join(['?'] * len(types))})")
                params.extend(types)

        if scope == "system":
            where_clauses.append("user_id IS NULL")
        elif scope == "user":
            where_clauses.append("user_id IS NOT NULL")
        
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        logs = con.execute(f"""
            SELECT e.*, u.nickname as user_nickname
            FROM event_log e
            LEFT JOIN users u ON e.user_id = u.id
            {where_sql}
            ORDER BY e.created_at_ms DESC 
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()
        
        total = con.execute(f"SELECT COUNT(*) as cnt FROM event_log {where_sql}", params).fetchone()["cnt"]
        
        return {
            "ok": True,
            "logs": [
                {
                    "id": l["id"],
                    "level": l["level"],
                    "event_type": l["event_type"],
                    "message": l["message"],
                    "user_id": l["user_id"],
                    "user_nickname": l["user_nickname"],
                    "metadata": json.loads(l["metadata_json"]) if l["metadata_json"] else {},
                    "created_at_ms": l["created_at_ms"]
                }
                for l in logs
            ],
            "total": total,
            "page": page,
            "pages": math.ceil(total / limit)
        }
    finally:
        con.close()

# =============================================================================
# Voice Generation (Voicer API Proxy)
# =============================================================================
VOICER_API_BASE = "https://elevenlabs-unlimited.net/api/v1"
AUDIO_DIR = Path(DB_PATH).parent / "audio"
AUDIO_DIR.mkdir(exist_ok=True)

def get_voicer_api_key() -> Optional[tuple]:
    """Get an active Voicer API key from the pool. Returns (key_id, api_key) or None"""
    con = db_conn()
    try:
        key = con.execute("""
            SELECT id, api_key FROM api_keys 
            WHERE is_active = 1 AND provider = 'voicer'
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        if key:
            # Update last_used_ms
            con.execute("UPDATE api_keys SET last_used_ms = ? WHERE id = ?", (now_ms(), key["id"]))
            con.commit()
            return (key["id"], key["api_key"])
        return None
    finally:
        con.close()

def get_elevenlabs_api_key() -> Optional[str]:
    """Get an active ElevenLabs API key for voice library. Returns api_key or None"""
    con = db_conn()
    try:
        key = con.execute("""
            SELECT api_key FROM api_keys 
            WHERE is_active = 1 AND provider = 'elevenlabs'
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        if key:
            return key["api_key"]
        return None
    finally:
        con.close()

def get_whisk_api_key() -> Optional[tuple]:
    """Get an active Fast Gen API key from the pool (Imagen 4, Flow, Grok). Returns (key_id, api_key) or None.
    If no key in DB, uses env WHISK_API_KEY (key_id will be 'env')."""
    con = db_conn()
    try:
        key = con.execute("""
            SELECT id, api_key FROM api_keys 
            WHERE is_active = 1 AND provider = 'whisk'
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        if key:
            con.execute("UPDATE api_keys SET last_used_ms = ? WHERE id = ?", (now_ms(), key["id"]))
            con.commit()
            return (key["id"], key["api_key"])
        env_key = os.getenv("WHISK_API_KEY")
        if env_key:
            return ("env", env_key)
        return None
    finally:
        con.close()

def get_voidai_api_key() -> Optional[tuple]:
    """Get an active VoidAI API key from the pool. Returns (key_id, api_key) or None"""
    con = db_conn()
    try:
        # Debug: check all keys
        all_keys = con.execute("SELECT id, provider, is_active FROM api_keys").fetchall()
        _debug_log(f"[VOIDAI] All API keys in DB: {[(str(k['id'])[:8] if k['id'] else 'None', k['provider'], k['is_active']) for k in all_keys]}")
        
        key = con.execute("""
            SELECT id, api_key FROM api_keys 
            WHERE is_active = 1 AND provider = 'voidai'
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        
        if key:
            # Update last_used_ms
            con.execute("UPDATE api_keys SET last_used_ms = ? WHERE id = ?", (now_ms(), key["id"]))
            con.commit()
            _debug_log(f"[VOIDAI] Found key: {key['id'][:8]}...")
            return (key["id"], key["api_key"])
        else:
            _debug_log(f"[VOIDAI] No active voidai keys found. Checking all voidai keys...")
            voidai_keys = con.execute("SELECT id, provider, is_active FROM api_keys WHERE provider = 'voidai'").fetchall()
            _debug_log(f"[VOIDAI] All voidai keys: {[(k['id'][:8] if k['id'] else 'None', k.get('is_active')) for k in voidai_keys]}")
        return None
    finally:
        con.close()


def get_naga_api_key() -> Optional[tuple]:
    """Get an active Naga API key. Returns (key_id, api_key) or None."""
    con = db_conn()
    try:
        key = con.execute("""
            SELECT id, api_key FROM api_keys
            WHERE is_active = 1 AND provider = 'naga'
            ORDER BY last_used_ms ASC NULLS FIRST
            LIMIT 1
        """).fetchone()
        if key:
            con.execute("UPDATE api_keys SET last_used_ms = ? WHERE id = ?", (now_ms(), key["id"]))
            con.commit()
            return (key["id"], key["api_key"])
        return None
    finally:
        con.close()


# =============================================================================
# Voice Library (ElevenLabs API) - Direct API filtering like amulet-voice
# =============================================================================
ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"

# Fallback sample voices when API fails
SAMPLE_VOICES = [
    {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "labels": {"gender": "female", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/6edb9076-c3e4-420c-b6ab-11d43fe341c8.mp3"},
    {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "labels": {"gender": "female", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/69c5373f-0dc2-4efd-9232-a0140182c0a9.mp3"},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "labels": {"gender": "female", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/04e6e7b7-6779-48f5-8389-85c926f02c50.mp3"},
    {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "labels": {"gender": "male", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38d8f8f0-1122-4333-b323-0b87478d506a.mp3"},
    {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "labels": {"gender": "female", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/e7c9cc1c-db70-4319-9d24-de0c7c467866.mp3"},
    {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "labels": {"gender": "male", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/0b3c164f-f67d-4e19-8896-6bd7db1d3c42.mp3"},
    {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "labels": {"gender": "male", "age": "middle_aged", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/3a348d6f-e659-46b1-9c9c-3bc21d9f8819.mp3"},
    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "labels": {"gender": "male", "age": "middle_aged", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/e0b45450-78db-49b9-aaa4-d5358a6871bd.mp3"},
    {"voice_id": "yoZ06aMxZJJ28mfd3POQ", "name": "Sam", "labels": {"gender": "male", "age": "young", "accent": "american"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/yoZ06aMxZJJ28mfd3POQ/1c4d417c-ba80-4de8-874a-a1c57987ea63.mp3"},
    {"voice_id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "labels": {"gender": "male", "age": "middle_aged", "accent": "british"}, "category": "premade", "preview_url": "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007c53.mp3"},
    {"voice_id": "g5CIjZEefAph4nQFvHAz", "name": "Serena", "labels": {"gender": "female", "age": "middle_aged", "accent": "american"}, "category": "premade", "preview_url": None},
    {"voice_id": "jsCqWAovK2LkecY7zXl4", "name": "Freya", "labels": {"gender": "female", "age": "young", "accent": "american"}, "category": "premade", "preview_url": None},
]

def _get_elevenlabs_headers():
    """Get headers for ElevenLabs API with API key"""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    api_key = get_elevenlabs_api_key()
    if api_key:
        headers["xi-api-key"] = api_key
    return headers

@app.get("/api/elevenlabs/voices")
async def get_elevenlabs_voices(
    page_size: int = Query(100, ge=1, le=100),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get voices from official ElevenLabs /voices API (premade/cloned)"""
    tok = _extract_token(authorization, token)
    require_user(tok)
    
    api_key = get_elevenlabs_api_key()
    if not api_key:
        return {"ok": False, "error": "ElevenLabs API key not configured in admin panel"}
    
    try:
        params = {"page_size": page_size}
        if search:
            params["search"] = search
        if category:
            params["category"] = category
        
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{ELEVENLABS_API_BASE}/voices",
                params=params,
                headers=_get_elevenlabs_headers()
            )
            if resp.status_code != 200:
                log_event("warning", "elevenlabs_voices_error", f"Status {resp.status_code}")
                return {"ok": False, "error": f"ElevenLabs API error: {resp.status_code}"}
            
            data = resp.json()
            voices_raw = data.get("voices", [])
            
            voices = []
            for v in voices_raw:
                labels = v.get("labels", {}) or {}
                voice_data = {
                    "voice_id": v.get("voice_id"),
                    "name": v.get("name", "Unknown"),
                    "category": v.get("category", ""),
                    "description": v.get("description", ""),
                    "preview_url": v.get("preview_url", ""),
                    "gender": labels.get("gender", ""),
                    "age": labels.get("age", ""),
                    "accent": labels.get("accent", ""),
                    "use_case": labels.get("use_case", ""),
                    "descriptive": labels.get("descriptive", ""),
                    "language": labels.get("language", "") or (v.get("fine_tuning") or {}).get("language", ""),
                    "labels": labels
                }
                voices.append(voice_data)
            
            return {"ok": True, "voices": voices}
    except Exception as e:
        log_event("error", "elevenlabs_voices_error", str(e))
        return {"ok": False, "error": str(e)}

@app.get("/api/elevenlabs/shared-voices")
async def get_elevenlabs_shared_voices(
    page_size: int = Query(100, ge=1, le=100),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    age: Optional[str] = Query(None),
    accent: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    use_case: Optional[str] = Query(None),
    featured: bool = Query(False),
    page: int = Query(0, ge=0),
    sort: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get shared voices from ElevenLabs Voice Library with server-side filtering"""
    tok = _extract_token(authorization, token)
    require_user(tok)
    
    api_key = get_elevenlabs_api_key()
    if not api_key:
        return {"ok": False, "error": "ElevenLabs API key not configured in admin panel"}
    
    try:
        # Build params for ElevenLabs API - server-side filtering
        params = {
            "page_size": page_size,
            "page": page,
        }
        # Pass filters directly to ElevenLabs API
        if search:
            params["search"] = search
        if category and category != 'all':
            params["category"] = category
        if gender and gender != 'all':
            params["gender"] = gender
        if age and age != 'all':
            params["age"] = age
        if accent and accent != 'all':
            params["accent"] = accent
        if language and language != 'all':
            params["language"] = language
        if use_case and use_case != 'all':
            params["use_case"] = use_case
        if featured:
            params["featured"] = "true"
        if sort:
            params["sort"] = sort
        
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{ELEVENLABS_API_BASE}/shared-voices",
                params=params,
                headers=_get_elevenlabs_headers()
            )
            if resp.status_code != 200:
                log_event("warning", "elevenlabs_shared_error", f"Status {resp.status_code}: {resp.text}")
                return {"ok": False, "error": f"ElevenLabs API error: {resp.status_code}"}
            
            data = resp.json()
            voices_raw = data.get("voices", [])
            has_more = data.get("has_more", False)
            
            # Transform voices to standard format
            voices = []
            for v in voices_raw:
                labels = v.get("labels", {}) or {}
                voice_data = {
                    "voice_id": v.get("voice_id") or v.get("public_owner_id"),
                    "name": v.get("name", "Unknown"),
                    "category": v.get("category", ""),
                    "description": v.get("description", ""),
                    "preview_url": v.get("preview_url", ""),
                    "gender": labels.get("gender", "") or v.get("gender", ""),
                    "age": labels.get("age", "") or v.get("age", ""),
                    "accent": labels.get("accent", "") or v.get("accent", ""),
                    "use_case": labels.get("use_case", "") or v.get("use_case", ""),
                    "descriptive": labels.get("descriptive", "") or v.get("descriptive", ""),
                    "language": labels.get("language", "") or v.get("language", "") or (v.get("fine_tuning") or {}).get("language", ""),
                    "labels": labels
                }
                voices.append(voice_data)
            
            log_event("info", "elevenlabs_shared", f"Page {page}: {len(voices)} voices, has_more={has_more}")
            return {"ok": True, "voices": voices, "has_more": has_more, "page": page}
    except Exception as e:
        log_event("error", "elevenlabs_shared_error", str(e))
        return {"ok": False, "error": str(e)}

@app.get("/api/elevenlabs/filters")
async def get_elevenlabs_filters(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get available filter options for ElevenLabs voices"""
    tok = _extract_token(authorization, token)
    require_user(tok)
    
    return {
        "ok": True,
        "filters": {
            "genders": ["male", "female"],
            "ages": ["young", "middle_aged", "old"],
            "accents": ["american", "british", "australian", "indian", "african", "irish", "italian", "spanish", "french", "german", "polish", "portuguese", "russian", "swedish", "chinese", "japanese", "korean"],
            "languages": ["en", "uk", "pl", "de", "fr", "es", "it", "pt", "ru", "zh", "ja", "ko", "ar", "hi", "tr", "nl", "sv", "cs", "ro", "hu", "el", "fi", "da", "no", "he", "id", "ms", "th", "vi", "ta", "fil"],
            "categories": ["professional", "high_quality"],
            "use_cases": ["narration", "news", "audiobook", "conversational", "characters_animation", "meditation", "interactive", "informative", "social_media", "gaming"],
            "descriptives": ["calm", "confident", "casual", "deep", "warm", "soft", "authoritative", "energetic", "seductive", "raspy", "bright", "whisper", "ground", "intense", "serious", "playful", "humorous", "neutral"]
        }
    }

# Legacy endpoint for backward compatibility - redirects to new API
@app.get("/api/voices/library")
async def get_voice_library(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    age: Optional[str] = Query(None),
    accent: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    use_case: Optional[str] = Query(None),
    page: int = Query(0, ge=0),
    page_size: int = Query(100, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Legacy endpoint - redirects to ElevenLabs shared-voices API"""
    result = await get_elevenlabs_shared_voices(
        page_size=page_size,
        search=search,
        category=category,
        gender=gender,
        age=age,
        accent=accent,
        language=language,
        use_case=use_case,
        page=page,
        authorization=authorization,
        token=token
    )
    
    if result.get("ok"):
        return {
            "voices": result.get("voices", []),
            "total": len(result.get("voices", [])),
            "has_more": result.get("has_more", False),
            "page": result.get("page", 0)
        }
    else:
        # Fallback to sample voices
        return {
            "voices": SAMPLE_VOICES,
            "total": len(SAMPLE_VOICES),
            "has_more": False,
            "page": 0,
            "warning": result.get("error", "API error")
        }

# =============================================================================
# Public API for User API Keys
# =============================================================================

@app.post("/api/v1/synthesize")
async def api_v1_synthesize(
    request: Request,
    x_api_key: Optional[str] = Header(None)
):
    """
    Public API endpoint for voice synthesis using user API keys
    
    This endpoint works exactly like the web interface - it checks user balance,
    concurrent slots, respects limits, and queues tasks when slots are full.
    
    Authentication: X-API-Key header with user's API key
    
    Request body:
    {
        "text": "Text to synthesize (required)",
        "voice_id": "Voice ID from ElevenLabs (required)",
        "model_id": "Model ID (optional, default: eleven_multilingual_v2)",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": true
        },
        "speed": 1.0  // Optional, 0.25-4.0
    }
    
    Response:
    {
        "ok": true,
        "task_id": "task-uuid",
        "status": "processing" or "queued",
        "credits_charged": 31443,
        "message": "Task started" or "Task queued"
    }
    
    Rate limits:
    - Hourly limit: 100 requests per hour (configurable per key)
    - Concurrent slots: Based on user's concurrent_slots setting
    - Credit check: Deducts from user's credit packages (FIFO by expiration)
    
    Error codes:
    - 401: Invalid or missing API key
    - 402: Insufficient credits
    - 429: Rate limit exceeded
    - 503: Service unavailable
    """
    if not x_api_key:
        raise HTTPException(401, "API key required. Provide X-API-Key header.")
    
    # Validate API key and get user
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        user = con.execute("SELECT * FROM users WHERE id = ?", (key_record["user_id"],)).fetchone()
        if not user or not user["is_active"]:
            raise HTTPException(403, "User account is inactive")
        
        # Check hourly rate limit
        hour_ago = now_ms() - (60 * 60 * 1000)
        recent_requests = con.execute(
            "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND created_at_ms > ?",
            (user["id"], hour_ago)
        ).fetchone()["cnt"]
        
        hourly_limit = key_record["hourly_limit"] or 100
        if recent_requests >= hourly_limit:
            raise HTTPException(429, f"Hourly limit exceeded. Limit: {hourly_limit} requests/hour")
        
    finally:
        con.close()
    
    # Parse request body
    body = await request.json()
    
    # Validate required fields
    text = body.get("text", "")
    voice_id = body.get("voice_id")
    
    if not text:
        raise HTTPException(400, "Text is required")
    if not voice_id:
        raise HTTPException(400, "voice_id is required")
    
    # Calculate credits
    char_count = len(text)
    
    # Check credits and slots (same as web interface)
    con = db_conn()
    try:
        total_credits = _get_total_credits_from_packages(con, user["id"])
        if total_credits < char_count:
            raise HTTPException(402, f"Insufficient credits. Need {char_count:,}, have {total_credits:,}")
        
        # Check concurrent slots (voice only; exclude image tasks)
        concurrent_slots = user["concurrent_slots"] or 1
        active_processing = con.execute(
            """SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing'
               AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))""",
            (user["id"],)
        ).fetchone()["cnt"]
        
        should_queue = active_processing >= concurrent_slots
    finally:
        con.close()
    
    # Get API key for Voicer
    key_data = get_voicer_api_key()
    if not key_data:
        raise HTTPException(503, "Service temporarily unavailable")
    
    api_key_id, voicer_key = key_data
    
    # Generate task ID and prepare
    if should_queue:
        task_id = _generate_task_id()  # FFS_XXXXXXX format
        task_status = "queued"
        result_msg = "Task queued, will start when slot available"
    else:
        # Send to Voicer API
        await rate_limiter.acquire_concurrent(api_key_id, user["id"])
        
        # Create CLEAN payload - only valid ElevenLabs API fields!
        voicer_payload = {
            "text": text,
            "voice_id": voice_id,
            "model_id": body.get("model_id", "eleven_multilingual_v2")
        }
        
        # Add voice_settings if present (filter to valid fields only)
        if "voice_settings" in body:
            vs = body["voice_settings"]
            voicer_payload["voice_settings"] = {
                k: v for k, v in vs.items()
                if k in ["stability", "similarity_boost", "style", "use_speaker_boost", "speed"]
            }
        
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{VOICER_API_BASE}/voice/synthesize",
                headers={
                    "Authorization": f"Bearer {voicer_key}",
                    "Content-Type": "application/json"
                },
                json=voicer_payload
            )
            
            if response.status_code != 200:
                await rate_limiter.release_concurrent(api_key_id, user["id"])
                raise HTTPException(response.status_code, f"Voicer API error: {response.text}")
            
            result = response.json()
            task_id = result.get("task_id")
            task_status = "processing"
            result_msg = "Task started"
    
    # Deduct credits and save job
    con = db_conn()
    try:
        if not _deduct_credits_from_packages(con, user["id"], char_count):
            raise HTTPException(402, "Failed to deduct credits")
        
        con.execute(
            "UPDATE users SET credits_used = credits_used + ? WHERE id = ?",
            (char_count, user["id"])
        )
        
        expires_at = now_ms() + (12 * 60 * 60 * 1000)
        con.execute("""
            INSERT INTO jobs (id, user_id, api_key_id, status, prompt, model, width, height, 
                             credits_charged, char_count, created_at_ms, expires_at_ms, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task_id,
            user["id"],
            api_key_id,
            task_status,
            text[:500],
            body.get("model_id", "eleven_multilingual_v2"),
            char_count,
            0,
            char_count,
            char_count,
            now_ms(),
            expires_at,
            _json_dumps({
                "type": "voice",
                "voice_id": voice_id,
                "model_id": body.get("model_id", "eleven_multilingual_v2"),
                "full_text_length": char_count,
                "voice_settings": body.get("voice_settings", {}),
                "full_text": text if task_status == "queued" else None,
                "api_key_name": key_record["name"],
                "via_api": True
            })
        ))
        
        # Update API key stats
        con.execute(
            "UPDATE user_api_keys SET total_requests = total_requests + 1, last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.execute(
            "UPDATE api_keys SET total_requests = total_requests + 1 WHERE id = ?",
            (api_key_id,)
        )
        con.commit()
    finally:
        con.close()
    
    return {
        "ok": True,
        "task_id": task_id,
        "status": task_status,
        "credits_charged": char_count,
        "message": result_msg
    }

@app.get("/api/v1/status/{task_id}")
async def api_v1_status(
    task_id: str,
    x_api_key: Optional[str] = Header(None)
):
    """
    Check task status using user API key
    
    Authentication: X-API-Key header
    
    Response:
    {
        "status": "queued" | "processing" | "completed" | "failed",
        "progress": 0-100,
        "queue_position": 1-N (only for queued tasks),
        "audio_url": "..." (only for completed tasks),
        "error": "..." (only for failed tasks)
    }
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    # Validate API key and get user
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        user = con.execute("SELECT * FROM users WHERE id = ?", (key_record["user_id"],)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        
        # Check if task belongs to this user
        job = con.execute(
            "SELECT * FROM jobs WHERE id = ? AND user_id = ?",
            (task_id, user["id"])
        ).fetchone()
        
        if not job:
            raise HTTPException(404, "Task not found or access denied")
        
        # Update API key last used
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.commit()
    finally:
        con.close()
    
    # Check status using same logic as web interface
    # (handles queued -> processing transition, progress updates, etc.)
    
    # If queued, check if can start (same as voice_status)
    if job["status"] == "queued":
        con = db_conn()
        try:
            voice_filter = " AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%\"type\":\"image\"%' AND metadata_json NOT LIKE '%\"type\": \"image\"%'))"
            # Check if this is the oldest queued VOICE task
            oldest_queued = con.execute(
                "SELECT id FROM jobs WHERE user_id = ? AND status = 'queued' " + voice_filter + " ORDER BY created_at_ms ASC LIMIT 1",
                (user["id"],)
            ).fetchone()
            
            if oldest_queued and oldest_queued["id"] == task_id:
                # This is oldest voice queued, check voice slots only
                concurrent_slots = user["concurrent_slots"] or 1
                active_processing = con.execute(
                    "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing' " + voice_filter,
                    (user["id"],)
                ).fetchone()["cnt"]
                
                if active_processing < concurrent_slots:
                    # Try to start it (same logic as voice_status)
                    metadata = json.loads(job["metadata_json"] or "{}")
                    full_text = metadata.get("full_text")
                    
                    if full_text:
                        key_data = get_voicer_api_key()
                        if key_data:
                            api_key_id, voicer_key = key_data
                            
                            try:
                                async with httpx.AsyncClient(timeout=60) as client:
                                    response = await client.post(
                                        f"{VOICER_API_BASE}/voice/synthesize",
                                        headers={"Authorization": f"Bearer {voicer_key}", "Content-Type": "application/json"},
                                        json={
                                            "text": full_text,
                                            "voice_id": metadata.get("voice_id"),
                                            "model_id": job["model"] or "eleven_multilingual_v2",
                                            "voice_settings": metadata.get("voice_settings", {})
                                        }
                                    )
                                    
                                    if response.status_code == 200:
                                        voicer_result = response.json()
                                        voicer_task_id = voicer_result.get("task_id")
                                        
                                        metadata["voicer_task_id"] = voicer_task_id
                                        metadata["full_text"] = None
                                        
                                        con.execute("""
                                            UPDATE jobs 
                                            SET status = 'processing', started_at_ms = ?, metadata_json = ?
                                            WHERE id = ?
                                        """, (now_ms(), _json_dumps(metadata), task_id))
                                        con.commit()
                                        
                                        await rate_limiter.acquire_concurrent(api_key_id, user["id"])
                                        
                                        return {"status": "processing", "progress": 0}
                            except Exception as e:
                                _debug_log(f"[API] Error starting queued task: {e}")
            
            # Still queued; position among voice queued only
            queue_position = con.execute(
                "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'queued' AND created_at_ms < ? " + voice_filter,
                (user["id"], job["created_at_ms"])
            ).fetchone()["cnt"]
            
            return {"status": "queued", "progress": 0, "queue_position": queue_position + 1}
        finally:
            con.close()
    
    # If processing, check Voicer API
    if job["status"] == "processing":
        metadata = json.loads(job["metadata_json"] or "{}")
        voicer_task_id = metadata.get("voicer_task_id") or task_id
        
        key_data = get_voicer_api_key()
        if key_data:
            _, voicer_key = key_data
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.get(
                        f"{VOICER_API_BASE}/voice/status/{voicer_task_id}",
                        headers={"Authorization": f"Bearer {voicer_key}"}
                    )
                    
                    if response.status_code == 200:
                        return response.json()
            except Exception as e:
                _debug_log(f"[API] Error checking status: {e}")
    
    # Fallback
    return {
        "status": job["status"],
        "progress": 100 if job["status"] == "completed" else 0,
        "error": job["error"]
    }

@app.get("/api/v1/tasks")
async def api_v1_list_tasks(
    x_api_key: Optional[str] = Header(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, le=100)
):
    """
    List user's tasks via API key
    
    Query parameters:
    - status: Filter by status (processing, queued, completed, failed)
    - limit: Max number of tasks (default 20, max 100)
    
    Response:
    {
        "ok": true,
        "tasks": [
            {
                "id": "task-id",
                "status": "completed",
                "created_at": 1234567890,
                "credits_charged": 1234,
                "progress": 100
            }
        ]
    }
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        # Build query
        query = "SELECT * FROM jobs WHERE user_id = ?"
        params = [key_record["user_id"]]
        
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY created_at_ms DESC LIMIT ?"
        params.append(limit)
        
        jobs = con.execute(query, params).fetchall()
        
        # Update API key last used
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.commit()
        
        return {
            "ok": True,
            "tasks": [
                {
                    "id": job["id"],
                    "status": job["status"],
                    "created_at": job["created_at_ms"],
                    "credits_charged": job["credits_charged"],
                    "char_count": job["char_count"],
                    "model": job["model"],
                    "progress": 100 if job["status"] == "completed" else 0
                }
                for job in jobs
            ]
        }
    finally:
        con.close()

@app.get("/api/v1/download/{task_id}")
async def api_v1_download(
    task_id: str,
    x_api_key: Optional[str] = Header(None),
    format: str = Query("redirect", regex="^(redirect|json)$")
):
    """
    Download audio file for completed task
    
    Query Parameters:
    - format: "redirect" (default) - redirect to audio URL
              "json" - return JSON with audio URL and metadata
    
    Returns the audio file directly (redirect) or JSON with URL and metadata
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        job = con.execute(
            "SELECT * FROM jobs WHERE id = ? AND user_id = ?",
            (task_id, key_record["user_id"])
        ).fetchone()
        
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["status"] != "completed":
            raise HTTPException(400, f"Task not completed yet (status: {job['status']})")
        
        if not job["result_url"]:
            raise HTTPException(404, "Audio file not available")
        
        # Update API key stats
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.commit()
        
        # Return based on format
        if format == "json":
            metadata = json.loads(job["metadata_json"] or "{}")
            return {
                "ok": True,
                "task_id": task_id,
                "status": "completed",
                "audio_url": job["result_url"],
                "char_count": job["char_count"],
                "credits_charged": job["credits_charged"],
                "model": job["model"],
                "created_at": job["created_at_ms"],
                "completed_at": job.get("completed_at_ms"),
                "voice_id": metadata.get("voice_id"),
                "duration_ms": job.get("duration_ms")
            }
        else:
            # Return redirect to audio URL
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=job["result_url"])
    finally:
        con.close()

@app.delete("/api/v1/tasks/{task_id}")
async def api_v1_cancel_task(
    task_id: str,
    x_api_key: Optional[str] = Header(None)
):
    """
    Cancel a task (queued or processing)
    
    Response:
    {
        "ok": true,
        "message": "Task cancelled",
        "credits_refunded": 1234
    }
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        user = con.execute("SELECT * FROM users WHERE id = ?", (key_record["user_id"],)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        
        job = con.execute(
            "SELECT * FROM jobs WHERE id = ? AND user_id = ?",
            (task_id, user["id"])
        ).fetchone()
        
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["status"] in ("completed", "failed", "cancelled"):
            raise HTTPException(400, f"Cannot cancel task with status: {job['status']}")
        
        credits_to_refund = job["credits_charged"] or 0
        
        # Try to cancel in external API if processing
        if job["status"] == "processing":
            metadata = json.loads(job["metadata_json"] or "{}")
            voicer_task_id = metadata.get("voicer_task_id") or task_id
            
            key_data = get_voicer_api_key()
            if key_data:
                _, voicer_key = key_data
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.delete(
                            f"{VOICER_API_BASE}/voice/cancel/{voicer_task_id}",
                            headers={"Authorization": f"Bearer {voicer_key}"}
                        )
                except:
                    pass
        
        # Refund credits
        if credits_to_refund > 0:
            _add_credit_package(con, user["id"], credits_to_refund, 7, source="refund")
            con.execute(
                "UPDATE users SET credits_used = credits_used - ? WHERE id = ?",
                (credits_to_refund, user["id"])
            )
        
        # Update job status
        con.execute(
            "UPDATE jobs SET status = 'cancelled' WHERE id = ?",
            (task_id,)
        )
        
        # Update API key stats
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        
        con.commit()
        
        return {
            "ok": True,
            "message": "Task cancelled successfully",
            "credits_refunded": credits_to_refund
        }
    finally:
        con.close()

@app.get("/api/v1/voices")
async def api_v1_list_voices(
    x_api_key: Optional[str] = Header(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100)
):
    """
    List available voices
    
    Response:
    {
        "ok": true,
        "voices": [
            {
                "voice_id": "21m00Tcm4TlvDq8ikWAM",
                "name": "Rachel",
                "category": "premade"
            }
        ],
        "has_more": true
    }
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        # Get voices from Voicer API
        key_data = get_voicer_api_key()
        if not key_data:
            raise HTTPException(503, "Service unavailable")
        
        _, voicer_key = key_data
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{VOICER_API_BASE}/voices",
                headers={"Authorization": f"Bearer {voicer_key}"},
                params={"page": page, "limit": limit}
            )
            
            if response.status_code != 200:
                raise HTTPException(503, "Failed to fetch voices")
            
            result = response.json()
        
        # Update API key stats
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.commit()
        
        return result
    finally:
        con.close()

@app.get("/api/v1/balance")
async def api_v1_get_balance(
    x_api_key: Optional[str] = Header(None)
):
    """
    Get user's credit balance
    
    Response:
    {
        "ok": true,
        "total_credits": 1234567,
        "packages": [
            {
                "id": "pkg-id",
                "credits": 1000000,
                "expires_at": 1234567890
            }
        ]
    }
    """
    if not x_api_key:
        raise HTTPException(401, "API key required")
    
    con = db_conn()
    try:
        key_record = con.execute(
            "SELECT * FROM user_api_keys WHERE api_key = ? AND is_active = 1",
            (x_api_key,)
        ).fetchone()
        
        if not key_record:
            raise HTTPException(401, "Invalid API key")
        
        user = con.execute("SELECT * FROM users WHERE id = ?", (key_record["user_id"],)).fetchone()
        if not user:
            raise HTTPException(404, "User not found")
        
        # Get all active packages
        packages = con.execute("""
            SELECT * FROM credit_packages 
            WHERE user_id = ? AND credits_remaining > 0 AND expires_at_ms > ?
            ORDER BY expires_at_ms ASC
        """, (user["id"], now_ms())).fetchall()
        
        total_credits = sum(p["credits_remaining"] for p in packages)
        
        # Update API key stats
        con.execute(
            "UPDATE user_api_keys SET last_used_ms = ? WHERE id = ?",
            (now_ms(), key_record["id"])
        )
        con.commit()
        
        return {
            "ok": True,
            "total_credits": total_credits,
            "concurrent_slots": user["concurrent_slots"] or 1,
            "packages": [
                {
                    "id": p["id"],
                    "credits": p["credits_remaining"],
                    "expires_at": p["expires_at_ms"],
                    "days_remaining": max(0, (p["expires_at_ms"] - now_ms()) // (24 * 60 * 60 * 1000))
                }
                for p in packages
            ]
        }
    finally:
        con.close()

@app.post("/api/voice/synthesize")
async def voice_synthesize(
    request: Request,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Proxy voice synthesis to Voicer API (for web interface) - STABLE VERSION"""
    try:
        tok = _extract_token(authorization, token)
        user = require_user(tok)
    
        key_data = get_voicer_api_key()
        if not key_data:
            _debug_log("[SYNTH] ❌ No Voicer API keys configured")
            raise HTTPException(503, "No Voicer API keys configured")
        
        api_key_id, voicer_key = key_data
        
        body = await request.json()
        
        # Calculate character count for credits
        text = body.get("text", "")
        char_count = len(text)
        
        _debug_log(f"[SYNTH] 📝 User {user['id']} requesting synthesis: {char_count} chars")
        
        # Check credits and slots in ONE database transaction
        con = db_conn()
        task_id = _generate_task_id()  # FFS_XXXXXXX format
        task_status = None
        voicer_task_id = None
        
        _debug_log(f"[SYNTH] 🆔 Generated task ID: {task_id}")
        
        try:
            # Check credits
            total_credits = _get_total_credits_from_packages(con, user["id"])
            if total_credits < char_count:
                _debug_log(f"[SYNTH] ❌ Insufficient credits: need {char_count}, have {total_credits}")
                raise HTTPException(402, f"Insufficient credits. Need {char_count}, have {total_credits}")
            
            # Check concurrent slots (voice only; exclude image tasks)
            concurrent_slots = user.get("concurrent_slots", 1)
            active_processing = con.execute(
                """SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing'
                   AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%"type":"image"%' AND metadata_json NOT LIKE '%"type": "image"%'))""",
                (user["id"],)
            ).fetchone()["cnt"]
            
            should_queue = active_processing >= concurrent_slots
            _debug_log(f"[SYNTH] 🎯 Voice slots: {active_processing}/{concurrent_slots}, should_queue: {should_queue}")
    
            # Deduct credits BEFORE creating task (atomic operation)
            if not _deduct_credits_from_packages(con, user["id"], char_count):
                _debug_log(f"[SYNTH] ❌ Failed to deduct credits")
                raise HTTPException(402, "Failed to deduct credits")
            
            # Update credits_used counter
            con.execute(
                "UPDATE users SET credits_used = credits_used + ? WHERE id = ?",
                (char_count, user["id"])
            )
            
            # Determine task status
            if should_queue:
                task_status = "queued"
                _debug_log(f"[SYNTH] 📋 Task will be queued: {task_id}")
            else:
                task_status = "processing"
            
            # Save job to database FIRST (before external API call)
            expires_at = now_ms() + (12 * 60 * 60 * 1000)  # 12 hours
            con.execute("""
                INSERT INTO jobs (id, user_id, api_key_id, status, prompt, model, width, height, credits_charged, char_count, created_at_ms, expires_at_ms, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task_id,
                user["id"],
                api_key_id,
                task_status,
                text[:500],
                body.get("model_id", "eleven_multilingual_v2"),
                char_count,
                0,
                char_count,
                char_count,
                now_ms(),
                expires_at,
                _json_dumps({
                    "type": "voice", 
                    "voice_id": body.get("voice_id"), 
                    "model_id": body.get("model_id", "eleven_multilingual_v2"),
                    "full_text_length": char_count,
                    "voice_settings": body.get("voice_settings", {}),
                    "full_text": text if task_status == "queued" else None
                })
            ))
            
            # Update API key stats
            con.execute(
                "UPDATE api_keys SET total_requests = total_requests + 1 WHERE id = ?",
                (api_key_id,)
            )
            
            con.commit()
            _debug_log(f"[SYNTH] ✅ Task saved to DB: {task_id}, status: {task_status}")
            
        except HTTPException:
            con.rollback()
            raise
        except Exception as e:
            con.rollback()
            _debug_log(f"[SYNTH] ❌ Database error: {e}")
            raise HTTPException(500, f"Database error: {str(e)}")
        finally:
            con.close()
        
        # Now call external API if not queued
        if task_status == "processing":
            try:
                await rate_limiter.acquire_concurrent(api_key_id, user["id"])
                _debug_log(f"[SYNTH] 🚀 Sending to Voicer API...")
                
                # Create CLEAN payload - only valid ElevenLabs API fields!
                voicer_payload = {
                    "text": text,
                    "voice_id": body.get("voice_id"),
                    "model_id": body.get("model_id", "eleven_multilingual_v2")
                }
                
                # Add voice_settings if present (filter to valid fields only)
                if "voice_settings" in body:
                    vs = body["voice_settings"]
                    voicer_payload["voice_settings"] = {
                        k: v for k, v in vs.items()
                        if k in ["stability", "similarity_boost", "style", "use_speaker_boost", "speed"]
                    }
                
                _debug_log(f"[SYNTH] 📦 Clean payload keys: {list(voicer_payload.keys())}")
                
                async with httpx.AsyncClient(timeout=90) as client:  # Increased timeout
                    response = await client.post(
                        f"{VOICER_API_BASE}/voice/synthesize",
                        headers={
                            "Authorization": f"Bearer {voicer_key}",
                            "Content-Type": "application/json"
                        },
                        json=voicer_payload
                    )
                    
                    if response.status_code != 200:
                        _debug_log(f"[SYNTH] ❌ Voicer API error: {response.status_code}")
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        
                        # Mark task as failed in database
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (f"Voicer API error: {response.status_code}", task_id)
                            )
                            con2.commit()
                        finally:
                            con2.close()
                        
                        raise HTTPException(response.status_code, response.text)
                    
                    result = response.json()
                    voicer_task_id = result.get("task_id")
                    _debug_log(f"[SYNTH] ✅ Voicer task created: {voicer_task_id}")
                    
                    # Update metadata with voicer_task_id
                    con2 = db_conn()
                    try:
                        job = con2.execute("SELECT metadata_json FROM jobs WHERE id = ?", (task_id,)).fetchone()
                        if job:
                            metadata = json.loads(job["metadata_json"] or "{}")
                            metadata["voicer_task_id"] = voicer_task_id
                            con2.execute(
                                "UPDATE jobs SET metadata_json = ?, started_at_ms = ? WHERE id = ?",
                                (_json_dumps(metadata), now_ms(), task_id)
                            )
                            con2.commit()
                    finally:
                        con2.close()
                    
                    return {"task_id": task_id, "status": "processing", "voicer_task_id": voicer_task_id}
                    
            except httpx.TimeoutException:
                _debug_log(f"[SYNTH] ⏰ Voicer API timeout")
                await rate_limiter.release_concurrent(api_key_id, user["id"])
                con2 = db_conn()
                try:
                    con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("Voicer API timeout", task_id))
                    con2.commit()
                finally:
                    con2.close()
                raise HTTPException(504, "Voicer API timeout")
            except Exception as e:
                _debug_log(f"[SYNTH] ❌ Voicer API exception: {e}")
                await rate_limiter.release_concurrent(api_key_id, user["id"])
                con2 = db_conn()
                try:
                    con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (str(e), task_id))
                    con2.commit()
                finally:
                    con2.close()
                raise HTTPException(500, f"Voicer API error: {str(e)}")
        
        # Return result for queued task
        _debug_log(f"[SYNTH] ✅ Task queued successfully: {task_id}")
        return {"task_id": task_id, "status": "queued", "message": "Task queued, will start when slot available"}
    
    except HTTPException:
        raise
    except Exception as e:
        _debug_log(f"[SYNTH] ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Internal server error: {str(e)}")

@app.get("/api/voice/status/{task_id}")
async def voice_status(
    task_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Proxy voice status check to Voicer API. Voice tasks only."""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    # First check our database status - avoid unnecessary API calls
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (task_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["user_id"] != user["id"]:
            raise HTTPException(403, "Access denied")
        
        # Image tasks must use /api/image/status, not Voicer
        metadata = json.loads(job["metadata_json"] or "{}")
        if metadata.get("type") == "image":
            raise HTTPException(400, "Not a voice task. Use /api/image/status for image generation.")
        
        # If this is a queued task, check if we should start the OLDEST queued VOICE task (not necessarily this one)
        # This ensures FIFO order. Only consider voice tasks (exclude image).
        voice_queue_filter = " AND (metadata_json IS NULL OR (metadata_json NOT LIKE '%\"type\":\"image\"%' AND metadata_json NOT LIKE '%\"type\": \"image\"%'))"
        if job["status"] == "queued":
            oldest_queued = con.execute(
                "SELECT id FROM jobs WHERE user_id = ? AND status = 'queued' " + voice_queue_filter + " ORDER BY created_at_ms ASC LIMIT 1",
                (user["id"],)
            ).fetchone()
            
            if oldest_queued and oldest_queued["id"] != task_id:
                queue_position = con.execute(
                    "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'queued' AND created_at_ms < ? " + voice_queue_filter,
                    (user["id"], job["created_at_ms"])
                ).fetchone()["cnt"]
                
                _debug_log(f"[QUEUE] Task {task_id} is not the oldest (oldest: {oldest_queued['id']}), position: {queue_position + 1}")
                
                metadata = json.loads(job["metadata_json"] or "{}")
                voicer_task_id = metadata.get("voicer_task_id")
                return {
                    "status": "queued",
                    "progress": 0,
                    "queue_position": queue_position + 1,
                    "voicer_task_id": voicer_task_id
                }
            # If this IS the oldest task, continue to check if we can start it below
            _debug_log(f"[QUEUE] Task {task_id} is the OLDEST queued task, checking if can start...")
        
        # If already completed/failed/cancelled in our DB, return that status immediately
        if job["status"] in ("completed", "failed", "cancelled"):
            metadata = json.loads(job["metadata_json"] or "{}")
            voicer_task_id = metadata.get("voicer_task_id")
            return {
                "status": job["status"],
                "progress": 100 if job["status"] == "completed" else 0,
                "error": job["error"],
                "voicer_task_id": voicer_task_id
            }
        
        # If still queued (not yet sent to Voicer), check if we can start it
        if job["status"] == "queued":
            _debug_log(f"[QUEUE] Task {task_id} is queued, checking slots...")
            
            # Check if user has available VOICE slots (only count voice processing tasks)
            concurrent_slots = user.get("concurrent_slots", 1)
            active_processing = con.execute(
                "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'processing' " + voice_queue_filter,
                (user["id"],)
            ).fetchone()["cnt"]
            
            _debug_log(f"[QUEUE] User {user['id']}: {active_processing}/{concurrent_slots} voice slots used")
            
            # If slot available, start the task
            if active_processing < concurrent_slots:
                _debug_log(f"[QUEUE] Slot available! Starting task {task_id}")
                
                # Get task data from metadata
                metadata = json.loads(job["metadata_json"] or "{}")
                full_text = metadata.get("full_text")
                
                _debug_log(f"[QUEUE] full_text length: {len(full_text) if full_text else 0}")
                
                if full_text:
                    # Send to Voicer API now
                    try:
                        key_data = get_voicer_api_key()
                        if key_data:
                            api_key_id, voicer_key = key_data
                            _debug_log(f"[QUEUE] Sending to Voicer API...")
                            
                            payload = {
                                "text": full_text,
                                "voice_id": metadata.get("voice_id"),
                                "model_id": job["model"] or "eleven_multilingual_v2",
                                "voice_settings": metadata.get("voice_settings", {})
                            }
                            
                            async with httpx.AsyncClient(timeout=60) as client:
                                response = await client.post(
                                    f"{VOICER_API_BASE}/voice/synthesize",
                                    headers={
                                        "Authorization": f"Bearer {voicer_key}",
                                        "Content-Type": "application/json"
                                    },
                                    json=payload
                                )
                                
                                _debug_log(f"[QUEUE] Voicer API response: {response.status_code}")
                                
                                if response.status_code == 200:
                                    result = response.json()
                                    voicer_task_id = result.get("task_id")
                                    _debug_log(f"[QUEUE] Got Voicer task ID: {voicer_task_id}")
                                    
                                    # Update job: change status to processing and store voicer_task_id in metadata
                                    metadata["voicer_task_id"] = voicer_task_id
                                    metadata["full_text"] = None  # Remove to save space
                                    
                                    con.execute("""
                                        UPDATE jobs 
                                        SET status = 'processing', 
                                            started_at_ms = ?,
                                            metadata_json = ?
                                        WHERE id = ?
                                    """, (now_ms(), _json_dumps(metadata), task_id))
                                    con.commit()
                                    
                                    await rate_limiter.acquire_concurrent(api_key_id, user["id"])
                                    
                                    _debug_log(f"[QUEUE] Task started successfully! Task {task_id} now processing (Voicer ID: {voicer_task_id})")
                                    
                                    # Return processing status with voicer_task_id for status checks
                                    return {
                                        "status": "processing",
                                        "progress": 0,
                                        "voicer_task_id": voicer_task_id
                                    }
                                else:
                                    _debug_log(f"[QUEUE] Voicer API error: {response.text}")
                        else:
                            _debug_log(f"[QUEUE] No Voicer API key available!")
                    except Exception as e:
                        _debug_log(f"[QUEUE] Error starting queued task: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    _debug_log(f"[QUEUE] No full_text in metadata!")
            else:
                _debug_log(f"[QUEUE] No slots available ({active_processing}/{concurrent_slots})")
            
            # Still queued; position among voice queued only
            queue_position = con.execute(
                "SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status = 'queued' AND created_at_ms < ? " + voice_queue_filter,
                (user["id"], job["created_at_ms"])
            ).fetchone()["cnt"]
            
            return {
                "status": "queued",
                "progress": 0,
                "queue_position": queue_position + 1
            }
    finally:
        con.close()
    
    # If job is processing, check with Voicer API using voicer_task_id from metadata
    if job["status"] == "processing":
        metadata = json.loads(job["metadata_json"] or "{}")
        voicer_task_id = metadata.get("voicer_task_id")
        
        # If no voicer_task_id in metadata, this is an old-style job, use task_id directly
        if not voicer_task_id:
            voicer_task_id = task_id
        
        key_data = get_voicer_api_key()
        if not key_data:
            raise HTTPException(503, "No Voicer API keys configured")
        _, voicer_key = key_data
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    f"{VOICER_API_BASE}/voice/status/{voicer_task_id}",
                    headers={"Authorization": f"Bearer {voicer_key}"}
                )
            
            # If Voicer API returns error, mark task as failed
            if response.status_code != 200:
                log_event("error", "voicer_status_error", f"Voicer API error: {response.status_code}", meta={"task_id": task_id})
                # Mark as failed in our database
                con = db_conn()
                try:
                    job = con.execute("SELECT user_id, api_key_id, status FROM jobs WHERE id = ?", (task_id,)).fetchone()
                    if job and job["status"] == "processing":
                        if job["api_key_id"]:
                            await rate_limiter.release_concurrent(job["api_key_id"], job["user_id"])
                        con.execute(
                            "UPDATE jobs SET status = 'failed', error = ?, completed_at_ms = ? WHERE id = ?",
                            (f"Voicer API error: {response.status_code}", now_ms(), task_id)
                        )
                        con.commit()
                        log_event("info", "task_failed", f"Task {task_id} marked as failed due to API error")
                finally:
                    con.close()
                return {"status": "failed", "error": f"API error: {response.status_code}"}
            
            result = response.json()
            
            # Add voicer_task_id to response
            result["voicer_task_id"] = voicer_task_id
            
            # Update job status in database and release concurrent slot
            status = result.get("status")
            if status in ("completed", "failed"):
                con = db_conn()
                try:
                    # Get job and check if still processing (prevent double updates)
                    job = con.execute("SELECT user_id, api_key_id, image_path, status FROM jobs WHERE id = ?", (task_id,)).fetchone()
                    
                    # Only update if still processing
                    if job and job["status"] == "processing":
                        # Release concurrent slot FIRST
                        if job["api_key_id"]:
                            await rate_limiter.release_concurrent(job["api_key_id"], job["user_id"])
                            log_event("info", "slot_released", f"Released slot for task {task_id}")
                        
                        audio_path = None
                        # If completed, try to download audio in background (don't block status response)
                        if status == "completed":
                            # Start download in background - user can retry if it fails
                            asyncio.create_task(ensure_audio_downloaded(task_id, voicer_key))
                        
                        # Update database status (audio path is updated by ensure_audio_downloaded)
                        con.execute(
                            "UPDATE jobs SET status = ?, completed_at_ms = ?, error = ? WHERE id = ?",
                            (status, now_ms(), result.get("error"), task_id)
                        )
                        con.commit()
                        log_event("info", "task_status_updated", f"Task {task_id} status updated to {status}")
                finally:
                    con.close()
            
            return result
        except httpx.TimeoutException:
            log_event("error", "voicer_timeout", f"Voicer API timeout for task {task_id}")
            return {"status": "processing", "progress": 0, "error": "Timeout, retrying..."}
        except Exception as e:
            log_event("error", "voicer_error", f"Error checking status: {e}", meta={"task_id": task_id})
            return {"status": "processing", "progress": 0}

async def ensure_audio_downloaded(task_id: str, voicer_key: str) -> Optional[str]:
    """Ensure audio file is downloaded and saved locally. Returns path if successful."""
    local_path = str(AUDIO_DIR / f"{task_id}.mp3")
    
    # If file already exists, return it
    if Path(local_path).exists():
        return local_path
    
    # Get voicer_task_id from metadata
    con = db_conn()
    try:
        job = con.execute("SELECT metadata_json FROM jobs WHERE id = ?", (task_id,)).fetchone()
        if not job:
            log_event("error", "task_not_found", f"Task {task_id} not found in database")
            return None
        
        metadata = json.loads(job["metadata_json"] or "{}")
        voicer_task_id = metadata.get("voicer_task_id")
        
        # If no voicer_task_id in metadata, this is an old-style job, use task_id directly
        if not voicer_task_id:
            voicer_task_id = task_id
    finally:
        con.close()
    
    # Try to download from Voicer API with retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.get(
                    f"{VOICER_API_BASE}/voice/download/{voicer_task_id}",
                    headers={"Authorization": f"Bearer {voicer_key}"}
                )
                
                if response.status_code == 200:
                    # Save to local file
                    with open(local_path, "wb") as f:
                        f.write(response.content)
                    
                    # Verify file was written
                    if Path(local_path).exists() and Path(local_path).stat().st_size > 0:
                        log_event("info", "audio_downloaded", f"Audio downloaded for task {task_id}", meta={"path": local_path, "attempt": attempt + 1, "task_id": task_id})
                        
                        # Update database
                        con = db_conn()
                        try:
                            con.execute("UPDATE jobs SET image_path = ? WHERE id = ?", (local_path, task_id))
                            con.commit()
                        finally:
                            con.close()
                        
                        return local_path
                    else:
                        log_event("error", "audio_write_failed", f"File write failed for task {task_id}")
                else:
                    log_event("error", "audio_download_failed", f"Voicer returned {response.status_code} for task {task_id}", meta={"attempt": attempt + 1, "task_id": task_id})
        except Exception as e:
            log_event("error", "audio_download_error", f"Error downloading audio: {e}", meta={"task_id": task_id, "attempt": attempt + 1})
        
        # Wait before retry
        if attempt < max_retries - 1:
            await asyncio.sleep(2)
    
    return None

# =============================================================================
# Image Generation Endpoints (Fast Gen: Imagen 4, Nano Banana, Grok + VoidAI + Naga)
# =============================================================================

# Fast Gen (googler.fast-gen.ai): Imagen 4, Flow/Nano Banana, Grok — same base & X-API-Key
FAST_GEN_API_BASE_DEFAULT = "https://googler.fast-gen.ai"
WHISK_API_BASE = (os.getenv("WHISK_API_BASE") or os.getenv("FAST_GEN_API_BASE") or FAST_GEN_API_BASE_DEFAULT).rstrip("/")

# Same API base/key: Flow (Nano, Nano Pro, Imagen 3.5) and Grok
FLOW_MODELS = ["GEM_PIX", "GEM_PIX_2", "IMAGEN_3_5"]  # POST /api/v4/flow/image/generate
GROK_MODEL = "GROK"  # POST /api/v4/grok/image/generate (returns 4 images)

VOIDAI_API_BASE = os.getenv("VOIDAI_API_BASE", "https://api.voidai.app/v1")
VOIDAI_MODELS = [
    "gpt-image-1",
    "gpt-image-1.5",
    "imagen-3.0-generate-002",
    "flux-kontext-pro",
    "midjourney",
]

NAGA_API_BASE = os.getenv("NAGA_API_BASE", "https://api.naga.ac/v1")
NAGA_MODELS = ["NAGA_DALLE3", "NAGA_FLUX"]
NAGA_MODEL_MAP = {
    "NAGA_DALLE3": "dall-e-3:free",
    "NAGA_FLUX": "flux-1-schnell:free",
}


def _naga_resolve_size(aspect_ratio: str) -> str:
    """Map aspect_ratio to Naga size (landscape 16:9, portrait 9:16, square 1:1)."""
    if aspect_ratio == "landscape":
        return "1792x1024"
    if aspect_ratio == "portrait":
        return "1024x1792"
    return "1024x1024"


async def _naga_images_generate(api_key: str, model: str, prompt: str, size: str) -> dict:
    """
    POST /v1/images/generations. Body: model, prompt, size, n=1, response_format=url.
    size from aspect_ratio: 1792x1024, 1024x1792, 1024x1024.
    """
    api_url = f"{NAGA_API_BASE.rstrip('/')}/images/generations"
    payload = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "response_format": "url",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    last_err = None
    for attempt in range(2):
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(api_url, headers=headers, json=payload)
        if resp.status_code == 200:
            return resp.json()
        err_body = (resp.text or "")[:500]
        try:
            j = resp.json()
            err = j.get("error")
            msg = err.get("message", err_body) if isinstance(err, dict) else (j.get("message") or err_body)
        except Exception:
            msg = err_body or f"Naga API {resp.status_code}"
        last_err = msg or f"Naga API {resp.status_code}"
        if attempt == 0 and "upstream" in (last_err or "").lower():
            await asyncio.sleep(2)
            continue
        raise RuntimeError(last_err)
    raise RuntimeError(last_err)


@app.post("/api/image/generate")
async def image_generate(
    request: Request,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Generate image using Fast Gen (Imagen 4, Nano Banana, Grok), VoidAI or Naga API"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(400, "Prompt is required")
    
    # Map model from frontend
    model_old = body.get("model", "IMAGEN_4")
    
    # Determine provider based on model (same Fast Gen API base for Imagen 4, Flow, Grok)
    is_whisk = model_old == "IMAGEN_4"
    is_flow = model_old in FLOW_MODELS
    is_grok = model_old == GROK_MODEL
    is_voidai = model_old in VOIDAI_MODELS
    is_naga = model_old in NAGA_MODELS
    
    _debug_log(f"[IMAGE] Model received: {model_old}, is_whisk: {is_whisk}, is_flow: {is_flow}, is_grok: {is_grok}, is_voidai: {is_voidai}, is_naga: {is_naga}")
    
    # Initialize variables
    api_key_id = None
    voidai_api_key = None
    naga_api_key = None
    whisk_api_key = None
    provider = None
    model = None
    
    if is_whisk:
        key_data = get_whisk_api_key()
        if not key_data:
            raise HTTPException(503, "No Fast Gen API key. Add a Fast Gen API key in admin or set WHISK_API_KEY.")
        api_key_id, whisk_api_key = key_data
        provider = "whisk"
        model = "imagen4"
    elif is_flow:
        key_data = get_whisk_api_key()
        if not key_data:
            raise HTTPException(503, "No Fast Gen API key. Add a Fast Gen API key in admin or set WHISK_API_KEY.")
        api_key_id, whisk_api_key = key_data
        provider = "flow"
        model = model_old  # GEM_PIX, GEM_PIX_2, IMAGEN_3_5
    elif is_grok:
        key_data = get_whisk_api_key()
        if not key_data:
            raise HTTPException(503, "No Fast Gen API key. Add a Fast Gen API key in admin or set WHISK_API_KEY.")
        api_key_id, whisk_api_key = key_data
        provider = "grok"
        model = "grok"
    elif is_voidai:
        key_data = get_voidai_api_key()
        if not key_data:
            raise HTTPException(503, "No VoidAI API keys configured. Please add a VoidAI API key in the admin panel.")
        api_key_id, voidai_api_key = key_data
        model = model_old
        provider = "voidai"
    elif is_naga:
        key_data = get_naga_api_key()
        if not key_data:
            raise HTTPException(503, "No Naga API keys configured. Please add a Naga API key in the admin panel.")
        api_key_id, naga_api_key = key_data
        model = NAGA_MODEL_MAP.get(model_old, "flux-1-schnell:free")
        provider = "naga"
    else:
        raise HTTPException(400, f"Unknown model: {model_old}. Use IMAGEN_4, GEM_PIX, GEM_PIX_2, IMAGEN_3_5, GROK, VoidAI or Naga models.")
    
    # Validate
    if not api_key_id or not provider:
        raise HTTPException(500, f"Failed to initialize provider. api_key_id={api_key_id}, provider={provider}")
    
    # Aspect ratio: keep enum for Fast Gen API; map to landscape/portrait/square for metadata and other providers
    aspect_ratio_old = body.get("aspect_ratio", "IMAGE_ASPECT_RATIO_LANDSCAPE")
    if aspect_ratio_old not in ("IMAGE_ASPECT_RATIO_PORTRAIT", "IMAGE_ASPECT_RATIO_LANDSCAPE", "IMAGE_ASPECT_RATIO_SQUARE"):
        aspect_ratio_old = "IMAGE_ASPECT_RATIO_LANDSCAPE"
    if aspect_ratio_old == "IMAGE_ASPECT_RATIO_LANDSCAPE":
        aspect_ratio = "landscape"
    elif aspect_ratio_old == "IMAGE_ASPECT_RATIO_PORTRAIT":
        aspect_ratio = "portrait"
    else:
        aspect_ratio = "square"
    
    seed = body.get("seed")
    num_images = body.get("num_images", 1)
    
    con = db_conn()
    
    # Get dynamic cost per image from model pricing
    try:
        pricing = con.execute(
            "SELECT credits_per_image FROM model_pricing WHERE model_id = ?",
            (model_old,)
        ).fetchone()
        if pricing:
            credits_per_image = pricing["credits_per_image"]
        else:
            # Default: 1 credit per image
            credits_per_image = 1
    except:
        # Default: 1 credit per image if table doesn't exist or error
        credits_per_image = 1
    
    # Calculate total cost: credits_per_image * num_images
    credits_cost = credits_per_image * num_images
    task_id = _generate_task_id()
    task_status = None
    
    try:
        # Check credits
        total_credits = _get_total_credits_from_packages(con, user["id"])
        if total_credits < credits_cost:
            raise HTTPException(402, f"Insufficient credits. Need {credits_cost}, have {total_credits}")
        
        # Check concurrent slots for images (separate limit)
        image_concurrent_slots = user.get("image_concurrent_slots", 3)  # Default 3 for images
        active_processing = con.execute(
            """SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status IN ('processing')
               AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')""",
            (user["id"],)
        ).fetchone()["cnt"]
        
        should_queue = active_processing >= image_concurrent_slots
        
        # Deduct credits
        if not _deduct_credits_from_packages(con, user["id"], credits_cost):
            raise HTTPException(402, "Failed to deduct credits")
        
        con.execute(
            "UPDATE users SET credits_used = credits_used + ? WHERE id = ?",
            (credits_cost, user["id"])
        )
        
        task_status = "queued" if should_queue else "processing"
        
        # Save job
        expires_at = now_ms() + (12 * 60 * 60 * 1000)
        # Prepare metadata - will be updated with task_id after API call
        metadata = {
            "type": "image",
            "provider": provider,
            "aspect_ratio": aspect_ratio,
            "aspect_ratio_enum": aspect_ratio_old,
            "model": model,
            "model_old": model_old,
            "seed": seed,
            "full_prompt": prompt if task_status == "queued" else None
        }
        
        con.execute("""
            INSERT INTO jobs (id, user_id, api_key_id, status, prompt, model, width, height, credits_charged, char_count, created_at_ms, expires_at_ms, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task_id,
            user["id"],
            api_key_id,
            task_status,
            prompt[:500],
            model,
            0,
            0,
            credits_cost,
            0,
            now_ms(),
            expires_at,
            _json_dumps(metadata)
        ))
        
        con.execute(
            "UPDATE api_keys SET total_requests = total_requests + 1 WHERE id = ?",
            (api_key_id,)
        )
        con.commit()
        
    except HTTPException:
        con.rollback()
        raise
    except Exception as e:
        con.rollback()
        raise HTTPException(500, f"Database error: {str(e)}")
    finally:
        con.close()
    
    # Call API if not queued
    if task_status == "processing":
        try:
            if is_voidai and not voidai_api_key:
                raise HTTPException(500, "VoidAI API key not available")
            if is_naga and not naga_api_key:
                raise HTTPException(500, "Naga API key not available")
            if (is_whisk or is_flow or is_grok) and not whisk_api_key:
                raise HTTPException(500, "Fast Gen API key not available")
            
            await rate_limiter.acquire_concurrent(api_key_id, user["id"])
            
            if is_voidai:
                # VoidAI API call
                # Map aspect ratio to VoidAI size format
                size_map = {
                    "landscape": "1536x1024",
                    "portrait": "1024x1536",
                    "square": "1024x1024"
                }
                voidai_size = size_map.get(aspect_ratio, "1024x1024")
                
                # num_images is already defined earlier in the function
                voidai_payload = {
                    "model": model,
                    "prompt": prompt,
                    "n": min(num_images, 10),  # Max 10 images
                    "size": voidai_size,
                    "response_format": "b64_json",  # Use b64_json for more reliable delivery
                    "quality": "standard"
                }
                
                _debug_log(f"[IMAGE] Requesting VoidAI API: {VOIDAI_API_BASE}/images/generations")
                _debug_log(f"[IMAGE] Payload: {_json_dumps(voidai_payload)}")
                _debug_log(f"[IMAGE] VoidAI - model: {model}, prompt length: {len(prompt)}, num_images: {num_images}, size: {voidai_size}")
                _debug_log(f"[IMAGE] VoidAI - API key available: {bool(voidai_api_key)}, key prefix: {voidai_api_key[:15] if voidai_api_key else 'NONE'}...")
                
                async with httpx.AsyncClient(timeout=120) as client:
                    try:
                        full_url = f"{VOIDAI_API_BASE}/images/generations"
                        _debug_log(f"[IMAGE] VoidAI full URL: {full_url}")
                        
                        response = await client.post(
                            full_url,
                            headers={
                                "Authorization": f"Bearer {voidai_api_key}",
                                "Content-Type": "application/json"
                            },
                            json=voidai_payload
                        )
                        
                        response_text = response.text
                        _debug_log(f"[IMAGE] VoidAI API response status: {response.status_code}")
                        _debug_log(f"[IMAGE] VoidAI API response body (first 1000 chars): {response_text[:1000]}")
                        
                        if response.status_code != 200:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            
                            error_msg = f"VoidAI API error: {response.status_code}"
                            try:
                                error_data = response.json()
                                _debug_log(f"[IMAGE] VoidAI error data: {_json_dumps(error_data)}")
                                if "error" in error_data:
                                    error_info = error_data["error"]
                                    if isinstance(error_info, dict):
                                        error_msg = error_info.get("message", error_msg)
                                        if "code" in error_info:
                                            error_msg = f"{error_info.get('code')}: {error_msg}"
                                    else:
                                        error_msg = str(error_info)
                                elif "message" in error_data:
                                    error_msg = error_data.get("message", error_msg)
                            except Exception as parse_err:
                                _debug_log(f"[IMAGE] Failed to parse error response: {parse_err}")
                                error_msg = f"VoidAI API error {response.status_code}: {response_text[:500]}"
                            
                            con2 = db_conn()
                            try:
                                con2.execute(
                                    "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                    (error_msg, task_id)
                                )
                                con2.commit()
                                log_event("info", "task_failed", f"Task {task_id} marked as failed due to API error: {error_msg}", user_id=user["id"])
                            finally:
                                con2.close()
                            
                            raise HTTPException(response.status_code, error_msg)
                    except httpx.RequestError as req_err:
                        # Network/DNS errors
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        error_msg = f"VoidAI API request failed: {str(req_err)}"
                        _debug_log(f"[IMAGE] {error_msg}")
                        _debug_log(f"[IMAGE] Request error type: {type(req_err).__name__}")
                        import traceback
                        _debug_log(f"[IMAGE] Traceback: {traceback.format_exc()}")
                        
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (error_msg, task_id)
                            )
                            con2.commit()
                            log_event("info", "task_failed", f"Task {task_id} marked as failed due to network error: {error_msg}", user_id=user["id"])
                        finally:
                            con2.close()
                        
                        raise HTTPException(500, error_msg)
                    except httpx.HTTPStatusError as status_err:
                        # HTTP status errors
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        error_msg = f"VoidAI API HTTP error: {status_err.response.status_code}"
                        try:
                            error_data = status_err.response.json()
                            if "error" in error_data:
                                error_info = error_data["error"]
                                if isinstance(error_info, dict):
                                    error_msg = error_info.get("message", error_msg)
                        except:
                            error_msg = f"VoidAI API HTTP error {status_err.response.status_code}: {status_err.response.text[:500]}"
                        
                        _debug_log(f"[IMAGE] {error_msg}")
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (error_msg, task_id)
                            )
                            con2.commit()
                            log_event("info", "task_failed", f"Task {task_id} marked as failed: {error_msg}", user_id=user["id"])
                        finally:
                            con2.close()
                        
                        raise HTTPException(status_err.response.status_code, error_msg)
                    
                    # Process successful response
                    try:
                        result = response.json()
                    except Exception as json_err:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        error_msg = f"Failed to parse VoidAI API response as JSON: {str(json_err)}"
                        _debug_log(f"[IMAGE] {error_msg}")
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (error_msg, task_id)
                            )
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, error_msg)
                    
                    _debug_log(f"[IMAGE] VoidAI API result keys: {list(result.keys()) if isinstance(result, dict) else 'Not a dict'}")
                    
                    # VoidAI returns images directly, not a task_id
                    images_data = result.get("data", [])
                    _debug_log(f"[IMAGE] VoidAI images_data length: {len(images_data) if images_data else 0}")
                    if not images_data:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        error_msg = "No images in VoidAI API response"
                        _debug_log(f"[IMAGE] {error_msg}, full result: {_json_dumps(result)}")
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (error_msg, task_id)
                            )
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, error_msg)
                    
                    # Process all images from VoidAI response
                    IMAGE_DIR = Path(DB_PATH).parent / "images"
                    IMAGE_DIR.mkdir(exist_ok=True)
                    
                    processed_images = []
                    for idx, image_obj in enumerate(images_data):
                        img_b64_data = image_obj.get("b64_json")
                        image_url = image_obj.get("url")
                        revised_prompt = image_obj.get("revised_prompt")
                        
                        if not img_b64_data and not image_url:
                            _debug_log(f"[IMAGE] VoidAI: Image {idx} has no data (b64_json or url), keys: {list(image_obj.keys())}")
                            continue
                        
                        # Process image data
                        if img_b64_data:
                            # Use base64 data directly
                            try:
                                img_data = base64.b64decode(img_b64_data)
                                _debug_log(f"[IMAGE] VoidAI: Image {idx} - Using b64_json data, decoded size: {len(img_data)} bytes")
                            except Exception as decode_err:
                                _debug_log(f"[IMAGE] VoidAI: Failed to decode base64 for image {idx}: {str(decode_err)}")
                                continue
                        else:
                            # Download from URL
                            _debug_log(f"[IMAGE] VoidAI: Image {idx} - Downloading from URL: {image_url[:50]}...")
                            try:
                                async with httpx.AsyncClient(timeout=60) as download_client:
                                    img_response = await download_client.get(image_url)
                                    if img_response.status_code != 200:
                                        _debug_log(f"[IMAGE] VoidAI: Failed to download image {idx}: {img_response.status_code}")
                                        continue
                                    img_data = img_response.content
                                    _debug_log(f"[IMAGE] VoidAI: Image {idx} - Downloaded, size: {len(img_data)} bytes")
                            except Exception as download_err:
                                _debug_log(f"[IMAGE] VoidAI: Error downloading image {idx}: {str(download_err)}")
                                continue
                        
                        # Save image locally
                        image_suffix = f"_{idx}" if len(images_data) > 1 else ""
                        local_path = IMAGE_DIR / f"{task_id}{image_suffix}.png"
                        with open(local_path, "wb") as f:
                            f.write(img_data)
                        
                        # Convert to base64 data URI for frontend
                        img_b64 = base64.b64encode(img_data).decode("utf-8")
                        data_uri = f"data:image/png;base64,{img_b64}"
                        
                        processed_images.append({
                            "path": str(local_path),
                            "url": image_url,
                            "data_uri": data_uri,
                            "revised_prompt": revised_prompt
                        })
                    
                    if not processed_images:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        error_msg = "Failed to process any images from VoidAI API response"
                        con2 = db_conn()
                        try:
                            con2.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                (error_msg, task_id)
                            )
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, error_msg)
                    
                    # Update job with result - use first image as primary, store all in metadata
                    primary_image = processed_images[0]
                    con2 = db_conn()
                    try:
                        con2.execute(
                            "UPDATE jobs SET status = 'completed', error = NULL, image_path = ?, completed_at_ms = ? WHERE id = ?",
                            (primary_image["path"], now_ms(), task_id)
                        )
                        if primary_image["url"]:
                            metadata["result_url"] = primary_image["url"]
                        metadata["data_uri"] = primary_image["data_uri"]
                        if primary_image.get("revised_prompt"):
                            metadata["revised_prompt"] = primary_image["revised_prompt"]
                        # Store all images if multiple
                        if len(processed_images) > 1:
                            metadata["all_images"] = processed_images
                        con2.execute(
                            "UPDATE jobs SET metadata_json = ? WHERE id = ?",
                            (_json_dumps(metadata), task_id)
                        )
                        con2.commit()
                        log_event("info", "task_completed", f"Task {task_id} completed via VoidAI with {len(processed_images)} image(s)", user_id=user["id"])
                    finally:
                        con2.close()
                    
                    await rate_limiter.release_concurrent(api_key_id, user["id"])
                    _debug_log(f"[IMAGE] VoidAI task completed: {task_id} with {len(processed_images)} image(s)")
                    # Return immediately so frontend can add to Completed (task not in /active)
                    all_images_payload = [{"data_uri": p["data_uri"], "url": p.get("url"), "revised_prompt": p.get("revised_prompt")} for p in processed_images]
                    out = {
                        "ok": True,
                        "task_id": task_id,
                        "status": "completed",
                        "data_uri": primary_image["data_uri"],
                        "result": primary_image["data_uri"],
                        "all_images": all_images_payload,
                        "prompt": (prompt or "")[:500],
                    }
                    return out
            elif is_naga:
                # Naga: minimal doc payload — model, prompt, 1024x1024, n=1, response_format=url.
                naga_size = _naga_resolve_size(aspect_ratio)
                _debug_log(f"[IMAGE] Naga API: model={model} size={naga_size} n=1 response_format=url")
                try:
                    result = await _naga_images_generate(naga_api_key, model, prompt, naga_size)
                except Exception as e:
                    await rate_limiter.release_concurrent(api_key_id, user["id"])
                    err_msg = str(e)
                    _debug_log(f"[IMAGE] Naga API error: {err_msg}")
                    con2 = db_conn()
                    try:
                        con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (err_msg, task_id))
                        con2.commit()
                    finally:
                        con2.close()
                    raise HTTPException(500, err_msg)
                data = result.get("data") or []
                if not data:
                    await rate_limiter.release_concurrent(api_key_id, user["id"])
                    con2 = db_conn()
                    try:
                        con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("No images in Naga response", task_id))
                        con2.commit()
                    finally:
                        con2.close()
                    raise HTTPException(500, "No images in Naga API response")
                IMAGE_DIR = Path(DB_PATH).parent / "images"
                IMAGE_DIR.mkdir(exist_ok=True)
                processed = []
                for idx, item in enumerate(data):
                    b64_raw = getattr(item, "b64_json", None) or (item.get("b64_json") if isinstance(item, dict) else None)
                    url = getattr(item, "url", None) or (item.get("url") if isinstance(item, dict) else None)
                    if b64_raw:
                        try:
                            img_data = base64.b64decode(b64_raw)
                        except Exception:
                            continue
                    elif url:
                        try:
                            async with httpx.AsyncClient(timeout=60) as dc:
                                r = await dc.get(url, headers={"Authorization": f"Bearer {naga_api_key}", "User-Agent": "Mozilla/5.0"})
                                if r.status_code == 403:
                                    r = await dc.get(url, headers={"User-Agent": "Mozilla/5.0"})
                                if r.status_code != 200:
                                    continue
                                img_data = r.content
                        except Exception:
                            continue
                    else:
                        continue
                    suf = f"_{idx}" if len(data) > 1 else ""
                    local_path = IMAGE_DIR / f"{task_id}{suf}.png"
                    with open(local_path, "wb") as f:
                        f.write(img_data)
                    b64 = base64.b64encode(img_data).decode("utf-8")
                    data_uri = f"data:image/png;base64,{b64}"
                    processed.append({"path": str(local_path), "url": url, "data_uri": data_uri})
                if not processed:
                    await rate_limiter.release_concurrent(api_key_id, user["id"])
                    con2 = db_conn()
                    try:
                        con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("Failed to process Naga images", task_id))
                        con2.commit()
                    finally:
                        con2.close()
                    raise HTTPException(500, "Failed to process Naga images")
                primary = processed[0]
                con2 = db_conn()
                try:
                    con2.execute(
                        "UPDATE jobs SET status = 'completed', error = NULL, image_path = ?, completed_at_ms = ? WHERE id = ?",
                        (primary["path"], now_ms(), task_id),
                    )
                    metadata["data_uri"] = primary["data_uri"]
                    if len(processed) > 1:
                        metadata["all_images"] = processed
                    con2.execute("UPDATE jobs SET metadata_json = ? WHERE id = ?", (_json_dumps(metadata), task_id))
                    con2.commit()
                    log_event("info", "task_completed", f"Task {task_id} completed via Naga with {len(processed)} image(s)", user_id=user["id"])
                finally:
                    con2.close()
                await rate_limiter.release_concurrent(api_key_id, user["id"])
                all_payload = [{"data_uri": p["data_uri"], "url": p.get("url")} for p in processed]
                out = {
                    "ok": True,
                    "task_id": task_id,
                    "status": "completed",
                    "data_uri": primary["data_uri"],
                    "result": primary["data_uri"],
                    "all_images": all_payload,
                    "prompt": (prompt or "")[:500],
                }
                return out
            elif is_flow:
                # POST /api/v4/flow/image/generate - Flow: GEM_PIX, GEM_PIX_2, IMAGEN_3_5 (aspect_ratio PORTRAIT or LANDSCAPE only)
                flow_ar = aspect_ratio_old if aspect_ratio_old in ("IMAGE_ASPECT_RATIO_PORTRAIT", "IMAGE_ASPECT_RATIO_LANDSCAPE") else "IMAGE_ASPECT_RATIO_LANDSCAPE"
                flow_payload = {"prompt": prompt, "aspect_ratio": flow_ar, "model": model}
                if seed is not None:
                    flow_payload["seed"] = seed
                whisk_headers = {"Content-Type": "application/json"}
                if whisk_api_key:
                    whisk_headers["X-API-Key"] = whisk_api_key
                _debug_log(f"[IMAGE] Requesting Fast Gen Flow API: {WHISK_API_BASE}/api/v4/flow/image/generate")
                async with httpx.AsyncClient(timeout=120) as client:
                    try:
                        response = await client.post(
                            f"{WHISK_API_BASE}/api/v4/flow/image/generate",
                            headers=whisk_headers,
                            json=flow_payload,
                        )
                        response_text = response.text
                        _debug_log(f"[IMAGE] Flow API response: {response.status_code}, body: {response_text[:500]}")
                        if response.status_code not in [200, 201]:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            try:
                                err_j = response.json()
                                error_msg = err_j.get("detail", err_j.get("message", response_text)) or response_text
                                if isinstance(error_msg, list):
                                    error_msg = error_msg[0].get("msg", str(error_msg)) if error_msg else response_text
                            except Exception:
                                error_msg = response_text[:500] or f"Flow API error: {response.status_code}"
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (error_msg, task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(response.status_code, error_msg)
                        result = response.json()
                        operation_id = result.get("operation_id")
                        if not operation_id:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("No operation_id in Flow response", task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(500, "No operation_id in Flow API response")
                        metadata["whisk_operation_id"] = operation_id
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET metadata_json = ? WHERE id = ?", (_json_dumps(metadata), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        _debug_log(f"[IMAGE] Flow operation_id: {operation_id}")
                    except HTTPException:
                        raise
                    except Exception as e:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (str(e), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, str(e))
            elif is_grok:
                # POST /api/v4/grok/image/generate - returns 4 images; aspect_ratio: 1:1, 2:3, 3:2, 9:16, 16:9
                grok_ar_map = {"landscape": "16:9", "portrait": "9:16", "square": "1:1"}
                grok_ar = grok_ar_map.get(aspect_ratio, "3:2")
                grok_payload = {"prompt": prompt, "aspect_ratio": grok_ar}
                whisk_headers = {"Content-Type": "application/json"}
                if whisk_api_key:
                    whisk_headers["X-API-Key"] = whisk_api_key
                _debug_log(f"[IMAGE] Requesting Fast Gen Grok API: {WHISK_API_BASE}/api/v4/grok/image/generate")
                async with httpx.AsyncClient(timeout=120) as client:
                    try:
                        response = await client.post(
                            f"{WHISK_API_BASE}/api/v4/grok/image/generate",
                            headers=whisk_headers,
                            json=grok_payload,
                        )
                        response_text = response.text
                        _debug_log(f"[IMAGE] Grok API response: {response.status_code}, body: {response_text[:500]}")
                        if response.status_code not in [200, 201]:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            try:
                                err_j = response.json()
                                error_msg = err_j.get("detail", err_j.get("message", response_text)) or response_text
                                if isinstance(error_msg, list):
                                    error_msg = error_msg[0].get("msg", str(error_msg)) if error_msg else response_text
                            except Exception:
                                error_msg = response_text[:500] or f"Grok API error: {response.status_code}"
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (error_msg, task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(response.status_code, error_msg)
                        result = response.json()
                        operation_id = result.get("operation_id")
                        if not operation_id:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("No operation_id in Grok response", task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(500, "No operation_id in Grok API response")
                        metadata["whisk_operation_id"] = operation_id
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET metadata_json = ? WHERE id = ?", (_json_dumps(metadata), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        _debug_log(f"[IMAGE] Grok operation_id: {operation_id}")
                    except HTTPException:
                        raise
                    except Exception as e:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (str(e), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, str(e))
            else:
                # Fast Gen Imagen 4: POST /api/v4/whisk/image/generate
                whisk_payload = {
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio_old,
                }
                if seed is not None:
                    whisk_payload["seed"] = seed
                whisk_headers = {"Content-Type": "application/json"}
                if whisk_api_key:
                    whisk_headers["X-API-Key"] = whisk_api_key
                _debug_log(f"[IMAGE] Requesting Fast Gen Whisk (Imagen 4) API: {WHISK_API_BASE}/api/v4/whisk/image/generate")
                async with httpx.AsyncClient(timeout=120) as client:
                    try:
                        response = await client.post(
                            f"{WHISK_API_BASE}/api/v4/whisk/image/generate",
                            headers=whisk_headers,
                            json=whisk_payload,
                        )
                        response_text = response.text
                        _debug_log(f"[IMAGE] Fast Gen Whisk API response status: {response.status_code}, body: {response_text[:500]}")
                        if response.status_code not in [200, 201]:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            try:
                                err_j = response.json()
                                error_msg = err_j.get("detail", err_j.get("message", response_text)) or response_text
                                if isinstance(error_msg, list):
                                    error_msg = error_msg[0].get("msg", str(error_msg)) if error_msg else response_text
                            except Exception:
                                error_msg = response_text[:500] or f"Fast Gen API error: {response.status_code}"
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (error_msg, task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(response.status_code, error_msg)
                        result = response.json()
                        operation_id = result.get("operation_id")
                        if not operation_id:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                            error_msg = "No operation_id in Fast Gen API response"
                            con2 = db_conn()
                            try:
                                con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (error_msg, task_id))
                                con2.commit()
                            finally:
                                con2.close()
                            raise HTTPException(500, error_msg)
                        metadata["whisk_operation_id"] = operation_id
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET metadata_json = ? WHERE id = ?", (_json_dumps(metadata), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        _debug_log(f"[IMAGE] Fast Gen operation_id: {operation_id}, task_id: {task_id}")
                    except HTTPException:
                        raise
                    except Exception as parse_error:
                        _debug_log(f"[IMAGE] Fast Gen request error: {parse_error}")
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        con2 = db_conn()
                        try:
                            con2.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (str(parse_error), task_id))
                            con2.commit()
                        finally:
                            con2.close()
                        raise HTTPException(500, str(parse_error))
        except HTTPException:
            raise
        except Exception as e:
            _debug_log(f"[IMAGE] Exception during image generation: {e}")
            import traceback
            traceback.print_exc()
            await rate_limiter.release_concurrent(api_key_id, user["id"])
            con2 = db_conn()
            try:
                error_msg = f"Image generation error: {str(e)}"
                con2.execute(
                    "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                    (error_msg, task_id)
                )
                con2.commit()
                log_event("info", "task_failed", f"Task {task_id} marked as failed: {error_msg}")
            finally:
                con2.close()
            raise HTTPException(500, str(e))
    
    return {"ok": True, "task_id": task_id, "status": task_status}

@app.get("/api/image/status/{task_id}")
async def image_status(
    task_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get image generation status. Image tasks only."""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (task_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["user_id"] != user["id"]:
            raise HTTPException(403, "Access denied")
        
        metadata = json.loads(job["metadata_json"] or "{}")
        
        # Voice tasks must use /api/voice/status, not image provider
        if metadata.get("type") != "image":
            raise HTTPException(400, "Not an image task. Use /api/voice/status for voice synthesis.")
        
        job_prompt = (job["prompt"] or "")[:500]
        if job["status"] == "completed":
            _debug_log(f"[IMAGE] /status {task_id}: returning completed")
            return {
                "status": "completed",
                "result": metadata.get("data_uri") or metadata.get("result"),
                "data_uri": metadata.get("data_uri"),
                "all_images": metadata.get("all_images"),
                "progress": 100,
                "prompt": job_prompt
            }
        elif job["status"] == "failed":
            return {
                "status": "failed",
                "error": job["error"] if job["error"] else "Generation failed",
                "progress": 0,
                "prompt": job_prompt
            }
        elif job["status"] == "cancelled":
            return {
                "status": "cancelled",
                "error": job["error"] if job["error"] else "Cancelled by user",
                "progress": 0,
                "prompt": job_prompt
            }
        elif job["status"] == "processing":
            # Check if result already available in metadata
            result = metadata.get("data_uri") or metadata.get("result")
            if result:
                return {
                    "status": "completed",
                    "result": result,
                    "data_uri": metadata.get("data_uri"),
                    "all_images": metadata.get("all_images"),
                    "progress": 100,
                    "prompt": job_prompt
                }
            
            # Poll Fast Gen API: GET /api/v4/operations/{operation_id}
            whisk_operation_id = metadata.get("whisk_operation_id")
            if whisk_operation_id and WHISK_API_BASE:
                key_data = get_whisk_api_key()
                whisk_key = key_data[1] if key_data else None
                try:
                    async with httpx.AsyncClient(timeout=30) as client:
                        headers = {"X-API-Key": whisk_key} if whisk_key else {}
                        poll_response = await client.get(
                            f"{WHISK_API_BASE}/api/v4/operations/{whisk_operation_id}",
                            headers=headers,
                        )
                        if poll_response.status_code == 404:
                            # Operation not found or expired (per OpenAPI)
                            con.execute(
                                "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?",
                                ("Operation expired or not found", task_id),
                            )
                            con.commit()
                            return {"status": "failed", "error": "Operation expired or not found", "progress": 0, "prompt": job_prompt}
                        if poll_response.status_code == 200:
                            op_data = poll_response.json()
                            op_status = op_data.get("status")
                            if op_status == "success":
                                # Per OpenAPI: result is "List of results" (array of strings, e.g. data URIs). Grok returns 4.
                                raw_result = op_data.get("result")
                                if isinstance(raw_result, list) and len(raw_result) > 0:
                                    image_data_uri = raw_result[0]
                                    all_uris = raw_result
                                elif isinstance(raw_result, str):
                                    image_data_uri = raw_result
                                    all_uris = [raw_result]
                                else:
                                    image_data_uri = None
                                    all_uris = []
                                if image_data_uri:
                                    _IMAGES_DIR = Path(DB_PATH).parent / "images"
                                    _IMAGES_DIR.mkdir(exist_ok=True)
                                    image_path = _IMAGES_DIR / f"{task_id}.png"
                                    try:
                                        raw = base64.b64decode(image_data_uri.split(",", 1)[-1]) if "," in image_data_uri else base64.b64decode(image_data_uri)
                                        with open(image_path, "wb") as f:
                                            f.write(raw)
                                    except Exception:
                                        image_path = None
                                    metadata["result"] = image_data_uri
                                    metadata["data_uri"] = image_data_uri
                                    metadata["all_images"] = [{"data_uri": u} for u in all_uris]
                                    con.execute(
                                        "UPDATE jobs SET status = 'completed', error = NULL, completed_at_ms = ?, image_path = ?, metadata_json = ? WHERE id = ?",
                                        (now_ms(), str(image_path) if image_path else None, _json_dumps(metadata), task_id),
                                    )
                                    con.commit()
                                    return {
                                        "status": "completed",
                                        "result": image_data_uri,
                                        "data_uri": image_data_uri,
                                        "all_images": metadata.get("all_images", []),
                                        "progress": 100,
                                        "prompt": job_prompt,
                                    }
                            elif op_status == "error":
                                error_msg = op_data.get("error") or op_data.get("message") or "Generation failed"
                                if isinstance(error_msg, dict):
                                    error_msg = error_msg.get("message", str(error_msg))
                                con.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (error_msg, task_id))
                                con.commit()
                                return {"status": "failed", "error": error_msg, "progress": 0, "prompt": job_prompt}
                except Exception as e:
                    _debug_log(f"[IMAGE] Error polling Fast Gen operation: {e}")
            
            # Still processing
            return {"status": "processing", "progress": 50}
        elif job["status"] == "queued":
            image_filter = """(metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')"""
            image_concurrent_slots = user.get("image_concurrent_slots", 3)
            active_processing = con.execute(
                f"""SELECT COUNT(*) as cnt FROM jobs WHERE user_id = ? AND status IN ('processing') AND {image_filter}""",
                (user["id"],)
            ).fetchone()["cnt"]

            # Oldest-first: only try to start the oldest queued image task when a slot is free
            oldest = con.execute(
                f"""SELECT id FROM jobs WHERE user_id = ? AND status = 'queued' AND {image_filter}
                    ORDER BY created_at_ms ASC LIMIT 1""",
                (user["id"],)
            ).fetchone()

            if oldest and oldest["id"] != task_id:
                # Not the oldest – just return queue position; do not start
                position = con.execute(
                    f"""SELECT COUNT(*) as pos FROM jobs WHERE user_id = ? AND status = 'queued' AND {image_filter}
                        AND created_at_ms < ?""",
                    (user["id"], job["created_at_ms"])
                ).fetchone()["pos"]
                return {"status": "queued", "progress": 0, "queue_position": position + 1}

            if active_processing < image_concurrent_slots:
                metadata = json.loads(job["metadata_json"] or "{}")
                prompt = metadata.get("full_prompt") or job["prompt"]
                aspect_ratio = metadata.get("aspect_ratio", "landscape")
                model_old = metadata.get("model_old")
                is_naga_queued = metadata.get("provider") == "naga" and model_old in NAGA_MODELS

                if is_naga_queued:
                    key_data = get_naga_api_key()
                    if not key_data:
                        position = con.execute(
                            f"""SELECT COUNT(*) as pos FROM jobs WHERE user_id = ? AND status = 'queued' AND {image_filter}
                                AND created_at_ms < ?""",
                            (user["id"], job["created_at_ms"])
                        ).fetchone()["pos"]
                        return {"status": "queued", "progress": 0, "queue_position": position + 1}
                    api_key_id, naga_api_key = key_data
                    naga_model = NAGA_MODEL_MAP.get(model_old, "flux-1-schnell:free")
                    naga_size = _naga_resolve_size(aspect_ratio)
                    try:
                        await rate_limiter.acquire_concurrent(api_key_id, user["id"])
                        result = await _naga_images_generate(naga_api_key, naga_model, prompt, naga_size)
                    except Exception as e:
                        try:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                        except Exception:
                            pass
                        err_msg = str(e)
                        con.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (err_msg, task_id))
                        con.commit()
                        return {"status": "failed", "error": err_msg, "progress": 0, "prompt": (prompt or "")[:500]}
                    data = result.get("data") or []
                    if not data:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        con.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("No images in Naga response", task_id))
                        con.commit()
                        return {"status": "failed", "error": "No images in Naga response", "progress": 0, "prompt": (prompt or "")[:500]}
                    IMAGE_DIR = Path(DB_PATH).parent / "images"
                    IMAGE_DIR.mkdir(exist_ok=True)
                    processed = []
                    for idx, item in enumerate(data):
                        b64_raw = getattr(item, "b64_json", None) or (item.get("b64_json") if isinstance(item, dict) else None)
                        url = getattr(item, "url", None) or (item.get("url") if isinstance(item, dict) else None)
                        if b64_raw:
                            try:
                                img_data = base64.b64decode(b64_raw)
                            except Exception:
                                continue
                        elif url:
                            try:
                                async with httpx.AsyncClient(timeout=60) as dc:
                                    dr = await dc.get(url, headers={"Authorization": f"Bearer {naga_api_key}", "User-Agent": "Mozilla/5.0"})
                                    if dr.status_code == 403:
                                        dr = await dc.get(url, headers={"User-Agent": "Mozilla/5.0"})
                                    if dr.status_code != 200:
                                        continue
                                    img_data = dr.content
                            except Exception:
                                continue
                        else:
                            continue
                        suf = f"_{idx}" if len(data) > 1 else ""
                        lp = IMAGE_DIR / f"{task_id}{suf}.png"
                        with open(lp, "wb") as f:
                            f.write(img_data)
                        b64 = base64.b64encode(img_data).decode("utf-8")
                        du = f"data:image/png;base64,{b64}"
                        processed.append({"path": str(lp), "url": url, "data_uri": du})
                    if not processed:
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                        con.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", ("Failed to process Naga images", task_id))
                        con.commit()
                        return {"status": "failed", "error": "Failed to process Naga images", "progress": 0, "prompt": (prompt or "")[:500]}
                    primary = processed[0]
                    metadata["data_uri"] = primary["data_uri"]
                    if len(processed) > 1:
                        metadata["all_images"] = processed
                    metadata.pop("full_prompt", None)
                    con.execute(
                        "UPDATE jobs SET status = 'completed', error = NULL, image_path = ?, completed_at_ms = ?, metadata_json = ? WHERE id = ?",
                        (primary["path"], now_ms(), _json_dumps(metadata), task_id),
                    )
                    con.commit()
                    await rate_limiter.release_concurrent(api_key_id, user["id"])
                    all_imgs = [{"data_uri": p["data_uri"], "url": p.get("url")} for p in processed]
                    return {"status": "completed", "result": primary["data_uri"], "data_uri": primary["data_uri"], "all_images": all_imgs, "progress": 100, "prompt": (prompt or "")[:500]}

                # Queued Fast Gen (Whisk/Flow/Grok): start via same API base
                is_whisk_queued = metadata.get("provider") == "whisk"
                is_flow_queued = metadata.get("provider") == "flow"
                is_grok_queued = metadata.get("provider") == "grok"
                aspect_ratio_enum = metadata.get("aspect_ratio_enum") or (
                    "IMAGE_ASPECT_RATIO_LANDSCAPE" if aspect_ratio == "landscape" else
                    "IMAGE_ASPECT_RATIO_PORTRAIT" if aspect_ratio == "portrait" else
                    "IMAGE_ASPECT_RATIO_SQUARE"
                )
                seed = metadata.get("seed")
                model_queued = metadata.get("model_old")
                if is_whisk_queued or is_flow_queued or is_grok_queued:
                    key_data = get_whisk_api_key()
                    if not key_data:
                        position = con.execute(
                            f"""SELECT COUNT(*) as pos FROM jobs WHERE user_id = ? AND status = 'queued' AND {image_filter}
                                AND created_at_ms < ?""",
                            (user["id"], job["created_at_ms"])
                        ).fetchone()["pos"]
                        return {"status": "queued", "progress": 0, "queue_position": position + 1}
                    api_key_id, whisk_api_key = key_data
                    try:
                        await rate_limiter.acquire_concurrent(api_key_id, user["id"])
                        headers = {"Content-Type": "application/json"}
                        if whisk_api_key:
                            headers["X-API-Key"] = whisk_api_key
                        if is_flow_queued:
                            flow_ar = aspect_ratio_enum if aspect_ratio_enum in ("IMAGE_ASPECT_RATIO_PORTRAIT", "IMAGE_ASPECT_RATIO_LANDSCAPE") else "IMAGE_ASPECT_RATIO_LANDSCAPE"
                            payload = {"prompt": prompt, "aspect_ratio": flow_ar, "model": model_queued or "GEM_PIX_2"}
                            if seed is not None:
                                payload["seed"] = seed
                            url = f"{WHISK_API_BASE}/api/v4/flow/image/generate"
                        elif is_grok_queued:
                            grok_ar = {"landscape": "16:9", "portrait": "9:16", "square": "1:1"}.get(aspect_ratio, "3:2")
                            payload = {"prompt": prompt, "aspect_ratio": grok_ar}
                            url = f"{WHISK_API_BASE}/api/v4/grok/image/generate"
                        else:
                            payload = {"prompt": prompt, "aspect_ratio": aspect_ratio_enum}
                            if seed is not None:
                                payload["seed"] = seed
                            url = f"{WHISK_API_BASE}/api/v4/whisk/image/generate"
                        async with httpx.AsyncClient(timeout=120) as client:
                            response = await client.post(url, headers=headers, json=payload)
                        if response.status_code in [200, 201]:
                            result = response.json()
                            operation_id = result.get("operation_id")
                            if operation_id:
                                metadata["whisk_operation_id"] = operation_id
                                metadata.pop("full_prompt", None)
                                con.execute(
                                    "UPDATE jobs SET status = 'processing', metadata_json = ? WHERE id = ?",
                                    (_json_dumps(metadata), task_id)
                                )
                                con.commit()
                                _debug_log(f"[IMAGE] Queued {task_id} → processing (Fast Gen operation_id: {operation_id})")
                                return {"status": "processing", "progress": 50}
                        await rate_limiter.release_concurrent(api_key_id, user["id"])
                    except Exception as e:
                        try:
                            await rate_limiter.release_concurrent(api_key_id, user["id"])
                        except Exception:
                            pass
                        _debug_log(f"[IMAGE] Error starting queued Fast Gen task {task_id}: {e}")
                        con.execute("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?", (str(e), task_id))
                        con.commit()
                        return {"status": "failed", "error": str(e), "progress": 0, "prompt": (prompt or "")[:500]}

            position = con.execute(
                f"""SELECT COUNT(*) as pos FROM jobs WHERE user_id = ? AND status = 'queued' AND {image_filter}
                    AND created_at_ms < ?""",
                (user["id"], job["created_at_ms"])
            ).fetchone()["pos"]
            return {"status": "queued", "progress": 0, "queue_position": position + 1}
        else:
            return {"status": job["status"], "progress": 0}
    finally:
        con.close()

@app.get("/api/image/tasks/active")
async def get_active_image_tasks(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Get user's active image generation tasks"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    con = db_conn()
    try:
        # Match both "type":"image" and "type": "image" (json.dumps adds space)
        jobs = con.execute("""
            SELECT * FROM jobs 
            WHERE user_id = ? AND status IN ('processing', 'pending', 'queued')
            AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')
            ORDER BY created_at_ms ASC
        """, (user["id"],)).fetchall()
        
        result = []
        for j in jobs:
            metadata = json.loads(j["metadata_json"] or "{}")
            
            queue_position = None
            if j["status"] == "queued":
                row = con.execute("""
                    SELECT COUNT(*) as cnt FROM jobs
                    WHERE user_id = ? AND status = 'queued' 
                    AND (metadata_json LIKE '%"type":"image"%' OR metadata_json LIKE '%"type": "image"%')
                    AND created_at_ms < ?
                """, (user["id"], j["created_at_ms"])).fetchone()
                cnt = row["cnt"] if row else 0
                queue_position = cnt + 1
            
            result.append({
                "id": j["id"],
                "prompt": j["prompt"],
                "status": j["status"],
                "progress": 50 if j["status"] == "processing" else 0,
                "created_at_ms": j["created_at_ms"],
                "result": metadata.get("result"),
                "queue_position": queue_position
            })
        
        if result:
            _debug_log(f"[IMAGE] /api/image/tasks/active: user={user['id'][:8]}... tasks={len(result)} {[r['id'][:8] for r in result]}")
        return {"ok": True, "tasks": result}
    finally:
        con.close()

@app.get("/api/voice/download/{task_id}")
async def voice_download(
    task_id: str,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Download voice audio from local storage"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    # Check if job exists and not expired
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (task_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Job not found")
        if job["expires_at_ms"] and now_ms() > job["expires_at_ms"]:
            raise HTTPException(410, "File expired")
        if job["status"] != "completed":
            raise HTTPException(400, "Job not completed yet")
        
        audio_path = job["image_path"] if job["image_path"] else None
    finally:
        con.close()
    
    # Try local file first
    if audio_path and Path(audio_path).exists():
        file_size = Path(audio_path).stat().st_size
        if file_size > 0:
            return FileResponse(
                audio_path,
                media_type="audio/mpeg",
                filename=f"voice_{task_id}.mp3"
            )
    
    # Audio not available locally - try to download from Voicer API
    key_data = get_voicer_api_key()
    if not key_data:
        raise HTTPException(503, "No API keys configured")
    _, voicer_key = key_data
    
    # Try to download with retries
    local_path = await ensure_audio_downloaded(task_id, voicer_key)
    
    if local_path and Path(local_path).exists():
        return FileResponse(
            local_path,
            media_type="audio/mpeg",
            filename=f"voice_{task_id}.mp3"
        )
    
    raise HTTPException(503, "Audio file temporarily unavailable. Please try again.")

@app.get("/api/admin/realtime-stats")
async def admin_realtime_stats(x_admin_token: Optional[str] = Header(None)):
    """Get real-time concurrent usage stats"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        # Get all users with their concurrent limits
        users = con.execute("""
            SELECT id, nickname, concurrent_limit FROM users WHERE is_active = 1
        """).fetchall()
        
        user_stats = []
        for u in users:
            concurrent = rate_limiter.get_user_concurrent(u["id"])
            if concurrent > 0:  # Only show users with active tasks
                user_stats.append({
                    "user_id": u["id"],
                    "nickname": u["nickname"],
                    "current_concurrent": concurrent,
                    "concurrent_limit": u["concurrent_limit"]
                })
        
        # Get API key stats
        keys = con.execute("SELECT id, name, concurrent_limit FROM api_keys WHERE is_active = 1").fetchall()
        key_stats = []
        total_concurrent = 0
        for k in keys:
            concurrent = rate_limiter.api_key_concurrent.get(k["id"], 0)
            total_concurrent += concurrent
            key_stats.append({
                "key_id": k["id"],
                "name": k["name"],
                "current_concurrent": concurrent,
                "concurrent_limit": k["concurrent_limit"]
            })
        
        return {
            "ok": True,
            "users": user_stats,
            "api_keys": key_stats,
            "voicer_total_concurrent": total_concurrent,
            "timestamp": now_ms()
        }
    finally:
        con.close()

@app.get("/api/admin/active-tasks")
async def admin_active_tasks(x_admin_token: Optional[str] = Header(None)):
    """Get all active (processing/pending/queued) tasks with full details"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        # Get all active jobs (processing, pending, queued) with user info
        tasks = con.execute("""
            SELECT j.*, u.nickname, u.email, ak.name as api_key_name
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            LEFT JOIN api_keys ak ON j.api_key_id = ak.id
            WHERE j.status IN ('processing', 'pending', 'queued')
            ORDER BY j.created_at_ms ASC
        """).fetchall()
        
        result = []
        for t in tasks:
            metadata = {}
            try:
                metadata = json.loads(t["metadata_json"] or "{}")
            except:
                pass
            
            task_type = "image" if metadata.get("type") == "image" else "voice"
            
            # Підраховуємо queue_position для queued задач
            queue_position = None
            if t["status"] == "queued":
                # Рахуємо позицію в черзі
                position = con.execute("""
                    SELECT COUNT(*) as pos FROM jobs 
                    WHERE user_id = ? AND status = 'queued' AND created_at_ms < ?
                """, (t["user_id"], t["created_at_ms"])).fetchone()
                queue_position = (position["pos"] if position else 0) + 1
            
            # Прогрес для processing (початково 0, polling оновить до реального)
            progress = 0
            if t["status"] == "processing":
                progress = metadata.get("progress", 0)  # Default 0%, polling оновить
            
            result.append({
                "id": t["id"],
                "type": task_type,
                "user_id": t["user_id"],
                "nickname": t["nickname"],
                "email": t["email"],
                "api_key_name": t["api_key_name"],
                "status": t["status"],
                "prompt": t["prompt"],
                "model": t["model"],
                "char_count": t["width"],  # We store char count in width
                "credits_charged": t["credits_charged"],
                "created_at_ms": t["created_at_ms"],
                "started_at_ms": t["started_at_ms"],
                "progress": progress,
                "queue_position": queue_position,
                "metadata": metadata
            })
        
        return {
            "ok": True,
            "tasks": result,
            "total": len(result),
            "timestamp": now_ms()
        }
    finally:
        con.close()

@app.post("/api/admin/tasks/{task_id}/cancel")
async def admin_cancel_task(task_id: str, x_admin_token: Optional[str] = Header(None)):
    """Cancel a task (admin only)"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        job = con.execute("SELECT * FROM jobs WHERE id = ?", (task_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Task not found")
        
        if job["status"] not in ("pending", "processing"):
            raise HTTPException(400, "Task cannot be cancelled")
        
        # Release concurrent slot if processing
        if job["api_key_id"]:
            await rate_limiter.release_concurrent(job["api_key_id"], job["user_id"])
        
        # Update status
        con.execute(
            "UPDATE jobs SET status = 'cancelled', error = 'Cancelled by admin', completed_at_ms = ? WHERE id = ?",
            (now_ms(), task_id)
        )
        
        # Refund credits
        if job["credits_charged"] > 0:
            con.execute(
                "UPDATE users SET credits_balance = credits_balance + ?, credits_used = credits_used - ? WHERE id = ? AND credits_balance != -1",
                (job["credits_charged"], job["credits_charged"], job["user_id"])
            )
        
        con.commit()
        log_event("info", "task_cancelled", f"Task {task_id} cancelled by admin", user_id=job["user_id"], meta={"task_id": task_id})
        
        return {"ok": True, "message": "Task cancelled"}
    finally:
        con.close()

@app.post("/api/admin/reset-concurrent")
async def admin_reset_concurrent(x_admin_token: Optional[str] = Header(None)):
    """Reset all concurrent slots (use when slots are stuck)"""
    _require_admin(x_admin_token)
    
    # Get current state before reset
    old_state = {
        "api_key_concurrent": dict(rate_limiter.api_key_concurrent),
        "user_concurrent": dict(rate_limiter.user_concurrent)
    }
    
    # Reset all concurrent counters
    async with rate_limiter._lock:
        rate_limiter.api_key_concurrent.clear()
        rate_limiter.user_concurrent.clear()
    
    log_event("warning", "concurrent_reset", "Admin reset all concurrent slots", meta={"old_state": old_state})
    
    return {
        "ok": True,
        "message": "All concurrent slots reset",
        "old_state": old_state
    }

@app.post("/api/admin/sync-concurrent")
async def admin_sync_concurrent(x_admin_token: Optional[str] = Header(None)):
    """Sync concurrent slots with actual processing jobs in database"""
    _require_admin(x_admin_token)
    
    con = db_conn()
    try:
        # Get all actually processing jobs
        processing_jobs = con.execute("""
            SELECT user_id, api_key_id, COUNT(*) as cnt 
            FROM jobs 
            WHERE status = 'processing' 
            GROUP BY user_id, api_key_id
        """).fetchall()
        
        # Get old state
        old_state = {
            "api_key_concurrent": dict(rate_limiter.api_key_concurrent),
            "user_concurrent": dict(rate_limiter.user_concurrent)
        }
        
        # Reset and rebuild
        async with rate_limiter._lock:
            rate_limiter.api_key_concurrent.clear()
            rate_limiter.user_concurrent.clear()
            
            for job in processing_jobs:
                user_id = job["user_id"]
                api_key_id = job["api_key_id"]
                count = job["cnt"]
                
                if api_key_id:
                    rate_limiter.api_key_concurrent[api_key_id] = rate_limiter.api_key_concurrent.get(api_key_id, 0) + count
                if user_id:
                    rate_limiter.user_concurrent[user_id] = rate_limiter.user_concurrent.get(user_id, 0) + count
        
        new_state = {
            "api_key_concurrent": dict(rate_limiter.api_key_concurrent),
            "user_concurrent": dict(rate_limiter.user_concurrent)
        }
        
        log_event("info", "concurrent_synced", "Admin synced concurrent slots with DB", meta={
            "old_state": old_state,
            "new_state": new_state
        })
        
        return {
            "ok": True,
            "message": "Concurrent slots synced with database",
            "old_state": old_state,
            "new_state": new_state,
            "processing_jobs": len(processing_jobs)
        }
    finally:
        con.close()

@app.get("/api/voice/stats")
async def voice_stats(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    """Proxy user stats from Voicer API"""
    tok = _extract_token(authorization, token)
    user = require_user(tok)
    
    key_data = get_voicer_api_key()
    if not key_data:
        raise HTTPException(503, "No Voicer API keys configured")
    _, voicer_key = key_data
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{VOICER_API_BASE}/user/stats",
            headers={"Authorization": f"Bearer {voicer_key}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(response.status_code, response.text)
        
        return response.json()

# =============================================================================
# Serve Frontend
# =============================================================================
DIST_DIR = None
try:
    possible_paths = [
        Path(__file__).resolve().parent.parent / 'dist',
        Path(__file__).resolve().parent / 'dist',
        Path('/app/dist'),
    ]
    for p in possible_paths:
        if p.exists():
            DIST_DIR = p
            break
except Exception:
    pass

if DIST_DIR:
    assets_dir = DIST_DIR / 'assets'
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    
    @app.get("/favicon.ico")
    async def favicon():
        favicon_path = DIST_DIR / "favicon.ico"
        if favicon_path.exists():
            return FileResponse(favicon_path)
        raise HTTPException(404)
    
    @app.get("/favicon.svg")
    async def favicon_svg():
        favicon_path = DIST_DIR / "favicon.svg"
        if favicon_path.exists():
            return FileResponse(favicon_path)
        raise HTTPException(404)
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(404, "Not found")
        
        if full_path:
            file_path = DIST_DIR / full_path
            if file_path.is_file():
                return FileResponse(file_path)
        
        index_path = DIST_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)
        
        raise HTTPException(404, "Not found")
