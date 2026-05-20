"""Tiny in-memory rate limiter, sliding window.

Not durable across restarts (acceptable: an attacker can't game it by
forcing a restart, and a quick container kill would also kill their
ongoing abuse). For multi-replica deployments swap the backing dict for
Redis — same API.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, DefaultDict


_locks: DefaultDict[str, Lock] = defaultdict(Lock)
_hits: DefaultDict[str, Deque[float]] = defaultdict(deque)


def _limit_for(action: str) -> int:
    """Read the configured limit per hour for an action. 0 disables it.

    Examples:
        RATE_LIMIT_TRANSCRIBE_PER_HOUR=60   # 60 transcribe req / user / hour
        RATE_LIMIT_TRANSCRIBE_PER_HOUR=0    # off
    """
    env_name = f"RATE_LIMIT_{action.upper()}_PER_HOUR"
    raw = os.environ.get(env_name, "")
    if not raw:
        return _default_for(action)
    try:
        return max(0, int(raw))
    except ValueError:
        return _default_for(action)


def _default_for(action: str) -> int:
    return {
        "transcribe": 60,           # 60 transcribes / hour / user → ~1 / minute
        "transcribe_chunk": 600,    # LIVE chunks fire ~1 per 30s, so 600/h gives plenty of room
    }.get(action, 60)


def check(user_id: str, action: str, *, window_seconds: int = 3600) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds).

    `retry_after_seconds` is 0 when allowed, otherwise the soonest a
    request would succeed (= time until the oldest hit ages out).
    """
    limit = _limit_for(action)
    if limit <= 0:
        return True, 0

    key = f"{user_id}:{action}"
    now = time.monotonic()
    cutoff = now - window_seconds

    with _locks[key]:
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = max(1, int(bucket[0] + window_seconds - now) + 1)
            return False, retry
        bucket.append(now)
        return True, 0


def reset(user_id: str | None = None) -> None:
    """Wipe rate-limit state. Useful in tests."""
    if user_id is None:
        _hits.clear()
        return
    for k in list(_hits.keys()):
        if k.startswith(f"{user_id}:"):
            _hits.pop(k, None)
