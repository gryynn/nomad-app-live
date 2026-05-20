"""Per-user storage quota check.

Sums `app_nomad.sessions.file_size_bytes` for the active rows of a user
and compares against the user's limit. Lookup order:

1. `app_nomad.user_settings.storage_quota_mb_override` (per-user, NULL = no override)
2. `STORAGE_QUOTA_MB_PER_USER` env (global default for invitees)
3. 0 = disabled

A soft-warning threshold (default 80% of the hard limit) lets the caller
warn the user before they hit the wall. The PWA surfaces this via the
`x-storage-warning` header when it's set.
"""
from __future__ import annotations

import os

import httpx

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Accept-Profile": "app_nomad",
    "Prefer": "count=exact",
}
_BASE_URL = f"{SUPABASE_URL}/rest/v1"


def _global_limit_mb() -> int:
    raw = os.environ.get("STORAGE_QUOTA_MB_PER_USER", "")
    if not raw:
        return 0
    try:
        return max(0, int(raw))
    except ValueError:
        return 0


def _warning_ratio() -> float:
    raw = os.environ.get("STORAGE_QUOTA_WARNING_RATIO", "0.8")
    try:
        ratio = float(raw)
    except ValueError:
        return 0.8
    return max(0.0, min(0.99, ratio))


async def _user_override_mb(user_id: str) -> int | None:
    """Return the user's quota override in MB, or None if not set."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{_BASE_URL}/user_settings",
            headers={**_HEADERS, "Accept": "application/json"},
            params={
                "user_id": f"eq.{user_id}",
                "select": "storage_quota_mb_override",
            },
        )
        if resp.status_code != 200:
            return None
        rows = resp.json()
        if not rows:
            return None
        val = rows[0].get("storage_quota_mb_override")
        return int(val) if val is not None else None


async def resolve_limit_mb(user_id: str) -> int:
    """Return the effective hard limit for this user. 0 = no quota."""
    override = await _user_override_mb(user_id)
    if override is not None:
        return max(0, override)
    return _global_limit_mb()


async def current_usage_bytes(user_id: str) -> int:
    """Sum file_size_bytes for the user's non-soft-deleted sessions.

    Uses PostgREST aggregate (Prefer: count=exact) on a select of just
    `file_size_bytes`. A single round-trip — cheap enough to do on every
    upload while we have a single-digit user count.
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{_BASE_URL}/sessions",
            headers={**_HEADERS, "Accept": "application/json"},
            params={
                "user_id": f"eq.{user_id}",
                "deleted_at": "is.null",
                "select": "file_size_bytes",
            },
        )
        if resp.status_code != 200:
            return 0  # fail-open: better to allow than block on a Supabase blip
        rows = resp.json()
    return sum((r.get("file_size_bytes") or 0) for r in rows)


async def check_quota(user_id: str, additional_bytes: int = 0) -> tuple[bool, int, int]:
    """Returns (allowed, current_mb, limit_mb).

    `allowed=False` means current + additional would exceed the hard limit.
    Caller is responsible for raising 413 with these numbers in the
    detail so the user knows what to delete.
    """
    limit_mb = await resolve_limit_mb(user_id)
    if limit_mb <= 0:
        return True, 0, 0
    used_bytes = await current_usage_bytes(user_id)
    projected_mb = (used_bytes + max(0, additional_bytes)) // (1024 * 1024)
    return projected_mb <= limit_mb, projected_mb, limit_mb


async def usage_report(user_id: str) -> dict:
    """Full state for the `/api/storage/usage` endpoint. Returns:

    {
      used_mb: int,
      limit_mb: int,        # 0 means unlimited
      warning_at_mb: int,   # 80% of limit by default (0 if unlimited)
      over_warning: bool,
      over_limit: bool,
    }
    """
    limit_mb = await resolve_limit_mb(user_id)
    used_bytes = await current_usage_bytes(user_id)
    used_mb = used_bytes // (1024 * 1024)
    if limit_mb <= 0:
        return {
            "used_mb": used_mb,
            "limit_mb": 0,
            "warning_at_mb": 0,
            "over_warning": False,
            "over_limit": False,
        }
    warning_at_mb = int(limit_mb * _warning_ratio())
    return {
        "used_mb": used_mb,
        "limit_mb": limit_mb,
        "warning_at_mb": warning_at_mb,
        "over_warning": used_mb >= warning_at_mb,
        "over_limit": used_mb >= limit_mb,
    }
