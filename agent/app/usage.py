"""Small, dependency-free model usage accounting and a cost safety fuse."""

from __future__ import annotations

from collections import Counter
from functools import lru_cache
import logging
from threading import Lock
from time import monotonic, time
from typing import Any


logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def redis_client(url: str):
    """Return a lazy Redis client without making Redis mandatory for local dev."""
    try:
        import redis
    except ImportError:
        logger.warning("REDIS_URL is configured but the redis package is unavailable")
        return None
    return redis.Redis.from_url(
        url, decode_responses=True, socket_connect_timeout=0.25, socket_timeout=0.25
    )


class ModelUsage:
    """Tracks aggregate usage only; never stores prompts or user identifiers."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._started_at = monotonic()
        self._window_started_at = self._started_at
        self._reserved_calls = 0
        self._calls_by_kind: Counter[str] = Counter()
        self._cache_hits_by_kind: Counter[str] = Counter()
        self._failures_by_kind: Counter[str] = Counter()
        self._denied_by_kind: Counter[str] = Counter()
        self._input_tokens = 0
        self._output_tokens = 0
        self._total_tokens = 0
        self._redis_errors = 0
        self._last_global_budget_count: int | None = None

    def reserve(
        self,
        kind: str,
        max_calls_per_hour: int,
        redis_url: str | None = None,
        redis_key_prefix: str = "scentsphere-agent",
    ) -> bool:
        """Reserve one billable request, refusing it after the hourly ceiling."""
        now = monotonic()
        if redis_url and max_calls_per_hour:
            try:
                client = redis_client(redis_url)
                if client is not None:
                    key = f"{redis_key_prefix}:model-calls:{int(time() // 3600)}"
                    global_count = int(client.incr(key))
                    if global_count == 1:
                        client.expire(key, 3700)
                    with self._lock:
                        self._last_global_budget_count = global_count
                        if global_count > max_calls_per_hour:
                            self._denied_by_kind[kind] += 1
                            return False
            except Exception as error:  # Redis must never take down recommendations.
                logger.warning("Redis model budget unavailable; using local budget: %s", error)
                self.note_redis_error()
        with self._lock:
            if now - self._window_started_at >= 3600:
                self._window_started_at = now
                self._reserved_calls = 0
            if max_calls_per_hour and self._reserved_calls >= max_calls_per_hour:
                self._denied_by_kind[kind] += 1
                return False
            self._reserved_calls += 1
            self._calls_by_kind[kind] += 1
            return True

    def cache_hit(self, kind: str) -> None:
        with self._lock:
            self._cache_hits_by_kind[kind] += 1

    def failure(self, kind: str) -> None:
        with self._lock:
            self._failures_by_kind[kind] += 1

    def note_redis_error(self) -> None:
        with self._lock:
            self._redis_errors += 1

    def success(self, completion: Any) -> None:
        usage = getattr(completion, "usage", None)
        if usage is None:
            return
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        total_tokens = getattr(usage, "total_tokens", 0) or input_tokens + output_tokens
        with self._lock:
            self._input_tokens += int(input_tokens)
            self._output_tokens += int(output_tokens)
            self._total_tokens += int(total_tokens)

    def snapshot(self, max_calls_per_hour: int, redis_enabled: bool = False) -> dict[str, object]:
        with self._lock:
            return {
                "window_seconds": round(monotonic() - self._window_started_at, 1),
                "max_calls_per_hour": max_calls_per_hour,
                "reserved_model_calls": self._reserved_calls,
                "distributed_budget_enabled": redis_enabled,
                "global_calls_this_hour": self._last_global_budget_count,
                "redis_errors": self._redis_errors,
                "model_calls_by_kind": dict(self._calls_by_kind),
                "cache_hits_by_kind": dict(self._cache_hits_by_kind),
                "model_failures_by_kind": dict(self._failures_by_kind),
                "calls_denied_by_budget": dict(self._denied_by_kind),
                "input_tokens": self._input_tokens,
                "output_tokens": self._output_tokens,
                "total_tokens": self._total_tokens,
            }


model_usage = ModelUsage()
