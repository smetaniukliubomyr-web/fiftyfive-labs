"""
Structured Logging with Loguru
Professional logging system with rotation, filtering, and formatting
"""
import sys
from pathlib import Path
from loguru import logger
from server.config import DATA_DIR

# Remove default handler
logger.remove()

# Console handler - colored, readable format
logger.add(
    sys.stdout,
    colorize=True,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | <level>{message}</level>",
    level="INFO",
    backtrace=True,
    diagnose=True
)

# File handler - JSON format for parsing
log_dir = DATA_DIR / "logs"
log_dir.mkdir(exist_ok=True)

logger.add(
    log_dir / "app.log",
    rotation="100 MB",
    retention="30 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
    level="DEBUG",
    backtrace=True,
    diagnose=True
)

# Error log - separate file for errors only
logger.add(
    log_dir / "error.log",
    rotation="50 MB",
    retention="90 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message} | {extra}",
    level="ERROR",
    backtrace=True,
    diagnose=True
)

# Task log - for task lifecycle
logger.add(
    log_dir / "tasks.log",
    rotation="100 MB",
    retention="30 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {extra[task_id]} | {message}",
    filter=lambda record: "task_id" in record["extra"],
    level="INFO"
)

def get_logger(name: str):
    """Get a logger instance with context"""
    return logger.bind(module=name)

# Export main logger
__all__ = ["logger", "get_logger"]
