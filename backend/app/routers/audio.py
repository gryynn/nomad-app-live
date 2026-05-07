"""
GET /api/audio/{session_id}

Streams the audio file for a given session via the configured storage backend.
Supports HTTP Range requests so HTML5 <audio> seeking works.

Auth model (V0):
- Public read by session_id (UUIDv4 = 122 bits, security-through-obscurity).
- This is no worse than the previous public Supabase Storage URLs.
- V1 will add signed-URL tokens (?token=JWT) for stricter access control.
"""
from __future__ import annotations

import re
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, RedirectResponse

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.services.storage import get_storage_backend
from app.services.storage.supabase import SupabaseStorageBackend


router = APIRouter(prefix="/audio", tags=["audio"])

BASE_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Accept-Profile": "app_nomad",
}

# Map of file extension to MIME type
MIME_MAP = {
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}


async def _resolve_storage_key(session_id: str) -> Optional[str]:
    """Look up storage_key for a given session.

    Returns the key passed to the storage backend (e.g. "audio/{user}/{id}.webm").
    Falls back to None if the session has no audio.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{BASE_URL}/sessions",
            headers=HEADERS,
            params={
                "id": f"eq.{session_id}",
                "select": "user_id,storage_key,audio_url,original_filename",
            },
        )
        if resp.status_code != 200:
            return None
        rows = resp.json()
        if not rows:
            return None
        row = rows[0]
        # Prefer explicit storage_key column (V1+); fall back to deriving from audio_url
        return row.get("storage_key") or _derive_key_from_url(row.get("audio_url"))


def _derive_key_from_url(url: Optional[str]) -> Optional[str]:
    """Best-effort: extract a backend-style key from a legacy public URL."""
    if not url:
        return None
    # Pattern: .../nomad-audio/{rest}
    m = re.search(r"/nomad-audio/(.+?)(?:\?|$)", url)
    if m:
        return f"audio/{m.group(1)}"
    return None


_RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")


@router.get("/{session_id}")
async def get_audio(session_id: str, request: Request):
    backend = get_storage_backend()
    key = await _resolve_storage_key(session_id)
    if not key:
        raise HTTPException(status_code=404, detail="Session has no audio")

    # If running on Supabase backend, redirect 302 to the legacy public URL
    # so we don't proxy bytes through the API for nothing.
    if isinstance(backend, SupabaseStorageBackend):
        # Strip "audio/" or "chunks/" prefix to rebuild the bucket path
        bucket_key = key.split("/", 1)[1] if "/" in key else key
        return RedirectResponse(
            url=f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{bucket_key}",
            status_code=302,
        )

    try:
        total_size = await backend.size(key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Determine MIME type from extension
    ext = "." + key.rsplit(".", 1)[-1].lower() if "." in key else ".webm"
    media_type = MIME_MAP.get(ext, "application/octet-stream")

    # Range support
    range_header = request.headers.get("range") or request.headers.get("Range")
    if range_header:
        m = _RANGE_RE.match(range_header)
        if not m:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else total_size - 1
        end = min(end, total_size - 1)
        if start > end or start >= total_size:
            raise HTTPException(status_code=416, detail="Range out of bounds")
        content_length = end - start + 1

        async def gen():
            async for chunk in backend.stream(key, start=start, end=end):
                yield chunk

        return StreamingResponse(
            gen(),
            status_code=206,
            media_type=media_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{total_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Cache-Control": "private, max-age=3600",
            },
        )

    # Full file
    async def gen_full():
        async for chunk in backend.stream(key):
            yield chunk

    return StreamingResponse(
        gen_full(),
        status_code=200,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total_size),
            "Cache-Control": "private, max-age=3600",
        },
    )
