"""
Redis Client & Cache Management
Centralized Redis connection with caching utilities
"""
import json
import pickle
from typing import Any, Optional, Dict
from datetime import timedelta
import redis.asyncio as aioredis
from server.config import REDIS_URL, HOUR_MS, DAY_MS
from server.logger import get_logger

logger = get_logger(__name__)

class RedisClient:
    """Async Redis client with convenience methods"""
    
    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self._connected = False
    
    async def connect(self):
        """Initialize Redis connection"""
        try:
            self.redis = await aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=False,
                max_connections=50
            )
            # Test connection
            await self.redis.ping()
            self._connected = True
            logger.info(f"✅ Redis connected: {REDIS_URL}")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            self._connected = False
            raise
    
    async def disconnect(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()
            self._connected = False
            logger.info("Redis disconnected")
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    # =============================================================================
    # Basic Operations
    # =============================================================================
    
    async def get(self, key: str) -> Optional[str]:
        """Get string value"""
        try:
            value = await self.redis.get(key)
            return value.decode() if value else None
        except Exception as e:
            logger.error(f"Redis GET error for {key}: {e}")
            return None
    
    async def set(self, key: str, value: str, ex: Optional[int] = None):
        """Set string value with optional expiration (seconds)"""
        try:
            await self.redis.set(key, value, ex=ex)
        except Exception as e:
            logger.error(f"Redis SET error for {key}: {e}")
    
    async def delete(self, *keys: str):
        """Delete one or more keys"""
        try:
            await self.redis.delete(*keys)
        except Exception as e:
            logger.error(f"Redis DELETE error: {e}")
    
    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            return await self.redis.exists(key) > 0
        except Exception as e:
            logger.error(f"Redis EXISTS error for {key}: {e}")
            return False
    
    # =============================================================================
    # JSON Operations
    # =============================================================================
    
    async def get_json(self, key: str) -> Optional[Dict]:
        """Get JSON value"""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                logger.error(f"Failed to decode JSON for key: {key}")
        return None
    
    async def set_json(self, key: str, value: Dict, ex: Optional[int] = None):
        """Set JSON value"""
        await self.set(key, json.dumps(value), ex=ex)
    
    # =============================================================================
    # Counter Operations
    # =============================================================================
    
    async def incr(self, key: str, amount: int = 1) -> int:
        """Increment counter"""
        try:
            return await self.redis.incrby(key, amount)
        except Exception as e:
            logger.error(f"Redis INCR error for {key}: {e}")
            return 0
    
    async def decr(self, key: str, amount: int = 1) -> int:
        """Decrement counter"""
        try:
            return await self.redis.decrby(key, amount)
        except Exception as e:
            logger.error(f"Redis DECR error for {key}: {e}")
            return 0
    
    async def get_counter(self, key: str) -> int:
        """Get counter value"""
        value = await self.get(key)
        return int(value) if value else 0
    
    # =============================================================================
    # Hash Operations
    # =============================================================================
    
    async def hset(self, name: str, key: str, value: str):
        """Set hash field"""
        try:
            await self.redis.hset(name, key, value)
        except Exception as e:
            logger.error(f"Redis HSET error for {name}.{key}: {e}")
    
    async def hget(self, name: str, key: str) -> Optional[str]:
        """Get hash field"""
        try:
            value = await self.redis.hget(name, key)
            return value.decode() if value else None
        except Exception as e:
            logger.error(f"Redis HGET error for {name}.{key}: {e}")
            return None
    
    async def hgetall(self, name: str) -> Dict[str, str]:
        """Get all hash fields"""
        try:
            data = await self.redis.hgetall(name)
            return {k.decode(): v.decode() for k, v in data.items()}
        except Exception as e:
            logger.error(f"Redis HGETALL error for {name}: {e}")
            return {}
    
    async def hdel(self, name: str, *keys: str):
        """Delete hash fields"""
        try:
            await self.redis.hdel(name, *keys)
        except Exception as e:
            logger.error(f"Redis HDEL error for {name}: {e}")
    
    # =============================================================================
    # List Operations (for Queue)
    # =============================================================================
    
    async def lpush(self, key: str, *values: str):
        """Push to left of list"""
        try:
            await self.redis.lpush(key, *values)
        except Exception as e:
            logger.error(f"Redis LPUSH error for {key}: {e}")
    
    async def rpush(self, key: str, *values: str):
        """Push to right of list"""
        try:
            await self.redis.rpush(key, *values)
        except Exception as e:
            logger.error(f"Redis RPUSH error for {key}: {e}")
    
    async def lpop(self, key: str) -> Optional[str]:
        """Pop from left of list"""
        try:
            value = await self.redis.lpop(key)
            return value.decode() if value else None
        except Exception as e:
            logger.error(f"Redis LPOP error for {key}: {e}")
            return None
    
    async def rpop(self, key: str) -> Optional[str]:
        """Pop from right of list"""
        try:
            value = await self.redis.rpop(key)
            return value.decode() if value else None
        except Exception as e:
            logger.error(f"Redis RPOP error for {key}: {e}")
            return None
    
    async def llen(self, key: str) -> int:
        """Get list length"""
        try:
            return await self.redis.llen(key)
        except Exception as e:
            logger.error(f"Redis LLEN error for {key}: {e}")
            return 0
    
    async def lrange(self, key: str, start: int, end: int) -> list:
        """Get list range"""
        try:
            values = await self.redis.lrange(key, start, end)
            return [v.decode() for v in values]
        except Exception as e:
            logger.error(f"Redis LRANGE error for {key}: {e}")
            return []
    
    # =============================================================================
    # Sorted Set Operations (for Priority Queue)
    # =============================================================================
    
    async def zadd(self, key: str, mapping: Dict[str, float]):
        """Add to sorted set with scores"""
        try:
            await self.redis.zadd(key, mapping)
        except Exception as e:
            logger.error(f"Redis ZADD error for {key}: {e}")
    
    async def zpopmin(self, key: str, count: int = 1) -> list:
        """Pop minimum score items"""
        try:
            items = await self.redis.zpopmin(key, count)
            return [(item[0].decode(), item[1]) for item in items]
        except Exception as e:
            logger.error(f"Redis ZPOPMIN error for {key}: {e}")
            return []
    
    async def zcard(self, key: str) -> int:
        """Get sorted set size"""
        try:
            return await self.redis.zcard(key)
        except Exception as e:
            logger.error(f"Redis ZCARD error for {key}: {e}")
            return 0
    
    async def zrange(self, key: str, start: int, end: int, withscores: bool = False) -> list:
        """Get sorted set range"""
        try:
            items = await self.redis.zrange(key, start, end, withscores=withscores)
            if withscores:
                return [(item[0].decode(), item[1]) for item in items]
            else:
                return [item.decode() for item in items]
        except Exception as e:
            logger.error(f"Redis ZRANGE error for {key}: {e}")
            return []
    
    # =============================================================================
    # Pub/Sub Operations
    # =============================================================================
    
    async def publish(self, channel: str, message: str):
        """Publish message to channel"""
        try:
            await self.redis.publish(channel, message)
        except Exception as e:
            logger.error(f"Redis PUBLISH error for {channel}: {e}")
    
    # =============================================================================
    # Cache Utilities
    # =============================================================================
    
    def cache_key(self, *parts: str) -> str:
        """Generate cache key"""
        return ":".join(str(p) for p in parts)
    
    async def cache_get(self, *key_parts: str) -> Optional[Any]:
        """Get from cache with auto-deserialization"""
        key = self.cache_key(*key_parts)
        return await self.get_json(key)
    
    async def cache_set(self, *key_parts: str, value: Any, ttl: int = 3600):
        """Set cache with auto-serialization"""
        key = self.cache_key(*key_parts)
        await self.set_json(key, value, ex=ttl)
    
    async def cache_delete(self, *key_parts: str):
        """Delete from cache"""
        key = self.cache_key(*key_parts)
        await self.delete(key)

# Global instance
redis_client = RedisClient()

__all__ = ["redis_client", "RedisClient"]
