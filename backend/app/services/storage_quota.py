"""Per-user storage quota check.

Sums `app_nomad.sessions.file_size_bytes` for the active rows of a user
and compares against `STORAGE_QUOTA_MB_PER_USER` (env, in MB). Soft-
deleted sessions don't count, since their files are eventually purged.

Set to 0 (or unset entirely) to disable the quota check.
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


def _limit_mb() -> int:
    raw = os.environ.get("STORAGE_QUOTA_MB_PER_USER", "")
    if not raw:
        return 0
    try:
        return max(0, int(raw))
    except ValueError:
        return 0


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

    `allowed=False` means current + additional would exceed the limit.
    Caller is responsible for raising 413 with these numbers in the
    detail so the user knows what to delete.
    """
    limit_mb = _limit_mb()
    if limit_mb <= 0:
        return True, 0, 0
    used_bytes = await current_usage_bytes(user_id)
    projected_mb = (used_bytes + max(0, additional_bytes)) // (1024 * 1024)
    return projected_mb <= limit_mb, projected_mb, limit_mb
