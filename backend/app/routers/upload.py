from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
import httpx
import uuid
import tempfile
import subprocess
import os
from pathlib import Path
from app.config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    PUBLIC_BACKEND_URL,
    AUDIO_TOKEN_TTL_MINUTES,
)
from app.auth import get_current_user, create_audio_token
from app.services.storage import get_storage_backend
from app.services.storage.supabase import SupabaseStorageBackend

router = APIRouter(prefix="/upload", tags=["upload"])

# Optional prefix prepended to every storage_key written by the backend.
# Lets the deployer share a single mount root with sibling directories
# (e.g. Voice Recorder/, Sounds/, Legacy/) without colliding. OSS default = none.
STORAGE_KEY_PREFIX = (os.environ.get("STORAGE_KEY_PREFIX") or "").strip("/")


def _key(*parts: str) -> str:
    body = "/".join(p.strip("/") for p in parts if p)
    return f"{STORAGE_KEY_PREFIX}/{body}" if STORAGE_KEY_PREFIX else body


ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac"}

MIME_MAP = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"


def _audio_url_for(session_id: str, storage_key: str) -> str:
    """Compute the canonical audio_url stored in the DB.

    Two shapes:
    - Supabase legacy: full public bucket URL (kept for backward compat).
    - Any other driver: backend proxy URL `/api/audio/{session_id}`. Frontend
      players use the user's Bearer token; external services (Groq, Deepgram)
      get a short-lived signed token appended at call time, NOT stored in DB.
    """
    backend = get_storage_backend()
    if isinstance(backend, SupabaseStorageBackend):
        key = storage_key
        if STORAGE_KEY_PREFIX and key.startswith(f"{STORAGE_KEY_PREFIX}/"):
            key = key[len(STORAGE_KEY_PREFIX) + 1:]
        bucket_path = key.split("/", 1)[1] if "/" in key else key
        return f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{bucket_path}"
    return f"{PUBLIC_BACKEND_URL}/api/audio/{session_id}"


def signed_audio_url(session_id: str, base_audio_url: str) -> str:
    """Append a signed token to a backend-proxy audio URL — used right before
    handing the URL to an external service (Groq/Deepgram).

    On Supabase URLs we leave it untouched (already public).
    """
    if "/api/audio/" not in base_audio_url:
        return base_audio_url
    token = create_audio_token(session_id, expires_minutes=AUDIO_TOKEN_TTL_MINUTES)
    sep = "&" if "?" in base_audio_url else "?"
    return f"{base_audio_url}{sep}token={token}"


class AssembleRequest(BaseModel):
    session_id: str
    chunk_count: int
    mime_type: str = "audio/webm"
    title: str = ""
    notes: str = ""
    duration_seconds: int = 0
    input_mode: str = "rec"
    live_transcript: str = ""


class UploadInitRequest(BaseModel):
    filename: str
    size: int = 0


class UploadCompleteRequest(BaseModel):
    session_id: str
    storage_path: str
    filename: str
    size: int = 0


@router.post("/init")
async def upload_init(req: UploadInitRequest, user=Depends(get_current_user)):
    """Get a signed upload URL for direct client-to-Supabase upload.

    Currently Supabase-specific (depends on Supabase signed-URL primitive).
    For non-Supabase drivers, clients should fall back to POST /upload (legacy
    proxy) which works with any backend.
    """
    backend = get_storage_backend()
    if not isinstance(backend, SupabaseStorageBackend):
        raise HTTPException(
            status_code=400,
            detail=(
                f"/upload/init signed URLs are only supported on STORAGE_DRIVER=supabase "
                f"(current: {backend.name}). Use POST /upload to proxy via backend."
            ),
        )

    file_ext = Path(req.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    session_id = str(uuid.uuid4())
    user_id = user["id"]
    storage_path = f"{user_id}/{session_id}{file_ext}"
    content_type = MIME_MAP.get(file_ext, "audio/mpeg")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/storage/v1/object/upload/sign/nomad-audio/{storage_path}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create signed URL: {resp.text}"
                )

            signed_data = resp.json()
            signed_url = f"{SUPABASE_URL}{signed_data['url']}"

        storage_key = _key("audio", storage_path)
        return {
            "session_id": session_id,
            "storage_path": storage_path,
            "storage_key": storage_key,
            "upload_url": signed_url,
            "content_type": content_type,
            "audio_url": _audio_url_for(session_id, storage_key),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Init failed: {str(e)}")


@router.post("/complete")
async def upload_complete(req: UploadCompleteRequest, user=Depends(get_current_user)):
    """Create session record after client has uploaded directly to storage."""
    storage_key = _key("audio", req.storage_path)
    audio_url = _audio_url_for(req.session_id, storage_key)

    try:
        async with httpx.AsyncClient() as client:
            session_data = {
                "id": req.session_id,
                "user_id": user["id"],
                "duration_seconds": 0,
                "input_mode": "import",
                "status": "uploaded",
                "audio_url": audio_url,
                "storage_key": storage_key,
                "original_filename": req.filename,
                "file_size_bytes": req.size,
            }
            resp = await client.post(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                json=session_data,
            )
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Session create failed: {resp.text}")

        return {"session_id": req.session_id, "audio_url": audio_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Complete failed: {str(e)}")


@router.post("")
async def upload_audio_legacy(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Backend-proxied upload — works with any STORAGE_DRIVER.

    Reads the file into memory and stores it via the configured storage backend.
    """
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    session_id = str(uuid.uuid4())
    user_id = user["id"]
    storage_key = _key("audio", user_id, f"{session_id}{file_ext}")
    content_type = file.content_type or MIME_MAP.get(file_ext, "audio/mpeg")
    # Use the source filename (sans extension) as the session title so imported
    # recordings show up as "Voice memo 12" instead of "(sans titre)" in the UI.
    default_title = Path(file.filename).stem if file.filename else ""

    try:
        file_content = await file.read()
        file_size = len(file_content)

        backend = get_storage_backend()
        try:
            await backend.upload(storage_key, file_content, content_type)
        except Exception as e:
            # Surface a meaningful error for the most common case
            raise HTTPException(
                status_code=500,
                detail=f"Storage upload failed via {backend.name}: {e}"
            )

        audio_url = _audio_url_for(session_id, storage_key)

        async with httpx.AsyncClient() as client:
            session_data = {
                "id": session_id,
                "user_id": user_id,
                "title": default_title,
                "duration_seconds": 0,
                "input_mode": "import",
                "status": "uploaded",
                "audio_url": audio_url,
                "storage_key": storage_key,
                "original_filename": file.filename,
                "file_size_bytes": file_size,
            }
            resp = await client.post(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                json=session_data,
            )
            if resp.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Session create failed: {resp.text}")

        return {"session_id": session_id, "audio_url": audio_url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


async def _do_assembly_background(session_id: str, chunk_count: int, mime_type: str, user_id: str):
    """Background task: download chunks via backend, ffmpeg remux, upload assembled
    via backend, cleanup chunks via backend. 100% backend-mediated — works on
    every driver.
    """
    backend = get_storage_backend()
    ext = ".webm" if "webm" in mime_type else ".mp4"
    content_type = mime_type or "audio/webm"

    try:
        with tempfile.TemporaryDirectory(prefix="nomad_assemble_") as tmpdir:
            # 1. Download all chunks via the storage backend
            chunk_files = []
            for i in range(chunk_count):
                chunk_key = _key("chunks", session_id, f"chunk_{str(i).zfill(4)}.webm")
                try:
                    chunk_data = await backend.download(chunk_key)
                except FileNotFoundError:
                    raise Exception(f"Chunk {i} missing on storage backend ({backend.name})")
                chunk_file = os.path.join(tmpdir, f"chunk_{str(i).zfill(4)}.webm")
                with open(chunk_file, "wb") as f:
                    f.write(chunk_data)
                chunk_files.append(chunk_file)

            # 2. Remux via ffmpeg
            concat_list = os.path.join(tmpdir, "concat.txt")
            with open(concat_list, "w") as f:
                for cf in chunk_files:
                    safe_path = cf.replace("\\", "/")
                    f.write(f"file '{safe_path}'\n")

            output_file = os.path.join(tmpdir, f"assembled{ext}")
            result = subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
                 "-i", concat_list, "-c", "copy", output_file],
                capture_output=True, text=True, timeout=300,
            )
            if result.returncode != 0:
                print(f"[ASSEMBLE] ffmpeg stderr: {result.stderr[-500:]}")
                raise Exception(f"ffmpeg failed (code {result.returncode})")

            with open(output_file, "rb") as f:
                assembled_data = f.read()

            print(f"[ASSEMBLE] {chunk_count} chunks → {len(assembled_data) / 1024 / 1024:.1f} MB")

            # 3. Upload assembled file via the storage backend
            storage_key = _key("audio", user_id, f"{session_id}{ext}")
            await backend.upload(storage_key, assembled_data, content_type)

            # 4. Update session with audio_url + storage_key + status
            audio_url = _audio_url_for(session_id, storage_key)
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={
                        "audio_url": audio_url,
                        "storage_key": storage_key,
                        "file_size_bytes": len(assembled_data),
                        "status": "uploaded",
                    },
                )
            print(f"[ASSEMBLE] Session {session_id} stored on driver={backend.name}")

            # 4b. Auto-trigger transcription (respects user's auto_transcribe pref).
            # Without this the session would sit in 'uploaded' forever — the
            # frontend used to bail out at this point, expecting the user to
            # tap "Re-transcrire" manually. Lazy-imported to avoid a cycle.
            try:
                from app.routers.transcribe import enqueue_auto_transcribe
                await enqueue_auto_transcribe(session_id, audio_url, user_id)
            except Exception as e:
                print(f"[ASSEMBLE] auto-transcribe enqueue failed for {session_id}: {e}")

            # 5. Cleanup chunks via the storage backend
            for i in range(chunk_count):
                chunk_key = _key("chunks", session_id, f"chunk_{str(i).zfill(4)}.webm")
                try:
                    await backend.delete(chunk_key)
                except Exception:
                    pass  # best-effort cleanup

    except Exception as e:
        print(f"[ASSEMBLE] Background assembly failed for {session_id}: {e}")
        try:
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={"status": "error", "error_message": f"Assembly failed: {e}"},
                )
        except Exception:
            pass


@router.post("/chunk/{session_id}/{idx}")
async def upload_chunk(
    session_id: str,
    idx: int,
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    """Receive one live-recording chunk and store it via the configured backend.

    Replaces the legacy direct-to-Supabase chunk upload, so live recording works
    on every driver (local, nextcloud, s3, supabase).

    Frontend hook `useChunkUploader.js` POSTs each 30s slice here. The chunk is
    stored under key `chunks/{session_id}/chunk_NNNN.webm`. The assembler
    (`_do_assembly_background`) reads them back via `backend.download(...)`.
    """
    if idx < 0 or idx > 99999:
        raise HTTPException(status_code=400, detail="Invalid chunk index")

    backend = get_storage_backend()
    chunk_key = _key("chunks", session_id, f"chunk_{idx:04d}.webm")
    content_type = file.content_type or "audio/webm"

    try:
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty chunk")
        await backend.upload(chunk_key, data, content_type)
        return {"ok": True, "key": chunk_key, "size": len(data)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chunk upload failed: {e}")


@router.post("/assemble")
async def assemble_chunks(req: AssembleRequest, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """Create session immediately, then assemble chunks in background."""
    user_id = user["id"]

    try:
        session_data = {
            "id": req.session_id,
            "user_id": user_id,
            "duration_seconds": req.duration_seconds,
            "input_mode": req.input_mode,
            "status": "assembling",
            "original_filename": f"{req.input_mode}_{req.session_id}.webm",
        }
        if req.title:
            session_data["title"] = req.title
        if req.live_transcript:
            session_data["transcript"] = req.live_transcript
            session_data["status"] = "assembling"

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                json=session_data,
            )
            if resp.status_code not in (200, 201):
                raise HTTPException(
                    status_code=500,
                    detail=f"Session create failed: {resp.text[:200]}"
                )

            if req.notes:
                await client.post(
                    f"{BASE_URL}/notes",
                    headers=HEADERS,
                    json={
                        "session_id": req.session_id,
                        "user_id": user_id,
                        "content": req.notes,
                    },
                )

        background_tasks.add_task(
            _do_assembly_background,
            req.session_id,
            req.chunk_count,
            req.mime_type,
            user_id,
        )

        print(f"[ASSEMBLE] Session {req.session_id} created, assembly queued ({req.chunk_count} chunks)")
        return {"session_id": req.session_id, "status": "assembling"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assembly failed: {str(e)}")
