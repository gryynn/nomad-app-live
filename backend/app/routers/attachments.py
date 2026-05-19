"""POST/GET/DELETE /api/sessions/{id}/attachments — photos taken during or
after a recording, anchored to an audio timestamp + wall clock so the
NOMAD → Obsidian pipeline can reference them later.

The audio storage backend (driver=local in prod) is reused: photos live under
`{STORAGE_KEY_PREFIX}/photos/{session_id}/{attachment_id}.{ext}` so they
inherit the same mount + backup as the session audio.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.auth import get_current_user
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, PUBLIC_BACKEND_URL
from app.routers.upload import STORAGE_KEY_PREFIX
from app.services.storage import get_storage_backend


router = APIRouter(prefix="/sessions", tags=["attachments"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".heic": "image/heic",
    ".webp": "image/webp",
}


def _key(*parts: str) -> str:
    body = "/".join(p.strip("/") for p in parts if p)
    return f"{STORAGE_KEY_PREFIX}/{body}" if STORAGE_KEY_PREFIX else body


@router.post("/{session_id}/attachments", status_code=201)
async def create_attachment(
    session_id: str,
    file: UploadFile = File(...),
    audio_timestamp_ms: Optional[int] = Form(None),
    caption: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    """Upload a photo (or screenshot) tied to a session.

    The mobile / web client captures the audio elapsed-time at the moment of
    the shutter press and posts it as `audio_timestamp_ms`. wall_clock_ts is
    stamped server-side so timezone drift between clients doesn't matter.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Verify the session belongs to this user.
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/sessions",
            headers=HEADERS,
            params={
                "id": f"eq.{session_id}",
                "user_id": f"eq.{user['id']}",
                "select": "id",
            },
        )
        if resp.status_code != 200 or not resp.json():
            raise HTTPException(status_code=404, detail="Session not found")

    att_id = str(uuid.uuid4())
    storage_key = _key("photos", session_id, f"{att_id}{ext}")
    content_type = file.content_type or MIME_MAP.get(ext, "application/octet-stream")

    backend = get_storage_backend()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    await backend.upload(storage_key, data, content_type)

    row = {
        "id": att_id,
        "session_id": session_id,
        "user_id": user["id"],
        "kind": "photo",
        "storage_provider": "local",
        "storage_path": storage_key,
        "public_url": f"{PUBLIC_BACKEND_URL}/api/sessions/{session_id}/attachments/{att_id}/blob",
        "mime_type": content_type,
        "size_bytes": len(data),
        "audio_timestamp_ms": audio_timestamp_ms,
        "caption": caption,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/session_attachments",
            headers=HEADERS,
            json=row,
        )
        if resp.status_code not in (200, 201):
            # Best-effort rollback of the uploaded blob so we don't orphan it.
            try:
                await backend.delete(storage_key)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"DB insert failed: {resp.text}")

    return row


@router.get("/{session_id}/attachments")
async def list_attachments(session_id: str, user=Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/session_attachments",
            headers=HEADERS,
            params={
                "session_id": f"eq.{session_id}",
                "user_id": f"eq.{user['id']}",
                "deleted_at": "is.null",
                "order": "audio_timestamp_ms.asc.nullslast,created_at.asc",
                "select": "id,kind,storage_path,public_url,mime_type,size_bytes,audio_timestamp_ms,wall_clock_ts,caption,created_at",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"DB query failed: {resp.text}")
        return resp.json()


@router.get("/{session_id}/attachments/{attachment_id}/blob")
async def get_attachment_blob(session_id: str, attachment_id: str):
    """Streams the actual photo bytes from the storage backend. Public access
    is gated by knowledge of both session_id and attachment_id (122 bits +
    122 bits) — same security-through-obscurity model as /api/audio."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/session_attachments",
            headers=HEADERS,
            params={
                "id": f"eq.{attachment_id}",
                "session_id": f"eq.{session_id}",
                "deleted_at": "is.null",
                "select": "storage_path,mime_type",
            },
        )
        if resp.status_code != 200 or not resp.json():
            raise HTTPException(status_code=404, detail="Attachment not found")
        row = resp.json()[0]
        key = row["storage_path"]
        mime = row.get("mime_type") or "application/octet-stream"

    backend = get_storage_backend()

    async def _iter():
        async for chunk in backend.stream(key):
            yield chunk

    return StreamingResponse(_iter(), media_type=mime)


@router.delete("/{session_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(session_id: str, attachment_id: str, user=Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{BASE_URL}/session_attachments?id=eq.{attachment_id}&user_id=eq.{user['id']}",
            headers={**HEADERS, "Prefer": "return=minimal"},
            json={"deleted_at": "now()"},
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=500, detail=f"Delete failed: {resp.text}")
    return None
