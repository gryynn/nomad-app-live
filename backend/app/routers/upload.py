from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
import httpx
import uuid
import tempfile
import subprocess
import os
from pathlib import Path
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/upload", tags=["upload"])

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
async def upload_init(req: UploadInitRequest):
    """Get a signed upload URL for direct client-to-Supabase upload.

    Returns a signed URL that the client can PUT the file to directly,
    bypassing the backend entirely. No file size limit.
    """
    file_ext = Path(req.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    session_id = str(uuid.uuid4())
    user_id = "martun"
    storage_path = f"{user_id}/{session_id}{file_ext}"
    content_type = MIME_MAP.get(file_ext, "audio/mpeg")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create signed upload URL via Supabase Storage API
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
            # Supabase returns a relative URL like /storage/v1/object/upload/sign/...?token=...
            signed_url = f"{SUPABASE_URL}{signed_data['url']}"

        return {
            "session_id": session_id,
            "storage_path": storage_path,
            "upload_url": signed_url,
            "content_type": content_type,
            "audio_url": f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{storage_path}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Init failed: {str(e)}")


@router.post("/complete")
async def upload_complete(req: UploadCompleteRequest):
    """Create session record after client has uploaded directly to storage."""
    audio_url = f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{req.storage_path}"

    try:
        async with httpx.AsyncClient() as client:
            session_data = {
                "id": req.session_id,
                "user_id": "martun",
                "duration_seconds": 0,
                "input_mode": "import",
                "status": "uploaded",
                "audio_url": audio_url,
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


# Keep legacy endpoint for backward compatibility
@router.post("")
async def upload_audio_legacy(file: UploadFile = File(...)):
    """Legacy: Upload via backend (kept for backward compat, prefer init+complete flow)."""
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    session_id = str(uuid.uuid4())
    user_id = "martun"
    storage_path = f"{user_id}/{session_id}{file_ext}"

    try:
        file_content = await file.read()
        file_size = len(file_content)

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            storage_headers = {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": file.content_type or "audio/mpeg",
            }
            storage_url = f"{SUPABASE_URL}/storage/v1/object/nomad-audio/{storage_path}"
            upload_resp = await client.post(
                storage_url, headers=storage_headers, content=file_content
            )
            if upload_resp.status_code == 413:
                raise HTTPException(
                    status_code=413,
                    detail=f"Fichier trop volumineux ({file_size / 1024 / 1024:.0f} MB). Augmentez la limite dans Supabase Dashboard → Storage → Settings."
                )
            if upload_resp.status_code not in (200, 201):
                raise HTTPException(
                    status_code=500,
                    detail=f"Storage upload failed ({upload_resp.status_code}): {upload_resp.text}"
                )

            audio_url = f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{storage_path}"
            session_data = {
                "id": session_id,
                "user_id": user_id,
                "duration_seconds": 0,
                "input_mode": "import",
                "status": "uploaded",
                "audio_url": audio_url,
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


async def _do_assembly_background(session_id: str, chunk_count: int, mime_type: str):
    """Background task: download chunks, ffmpeg remux, upload assembled file, update session."""
    user_id = "martun"
    storage_headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    ext = ".webm" if "webm" in mime_type else ".mp4"
    content_type = mime_type or "audio/webm"

    try:
        with tempfile.TemporaryDirectory(prefix="nomad_assemble_") as tmpdir:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
                # 1. Download all chunks
                chunk_files = []
                for i in range(chunk_count):
                    chunk_path = f"{session_id}/chunk_{str(i).zfill(4)}.webm"
                    chunk_url = f"{SUPABASE_URL}/storage/v1/object/nomad-audio-chunks/{chunk_path}"
                    resp = await client.get(chunk_url, headers=storage_headers)
                    if resp.status_code != 200:
                        raise Exception(f"Failed to download chunk {i}: {resp.status_code}")
                    chunk_file = os.path.join(tmpdir, f"chunk_{str(i).zfill(4)}.webm")
                    with open(chunk_file, "wb") as f:
                        f.write(resp.content)
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

                # 3. Upload assembled file
                storage_path = f"{user_id}/{session_id}{ext}"
                upload_url = f"{SUPABASE_URL}/storage/v1/object/nomad-audio/{storage_path}"
                upload_resp = await client.post(
                    upload_url,
                    headers={**storage_headers, "Content-Type": content_type},
                    content=assembled_data,
                )
                if upload_resp.status_code not in (200, 201):
                    raise Exception(f"Upload failed ({upload_resp.status_code})")

                # 4. Update session with audio_url + status
                audio_url = f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{storage_path}"
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={
                        "audio_url": audio_url,
                        "file_size_bytes": len(assembled_data),
                        "status": "uploaded",
                    },
                )
                print(f"[ASSEMBLE] Session {session_id} updated with audio_url")

                # 5. Cleanup chunks
                for i in range(chunk_count):
                    chunk_path = f"{session_id}/chunk_{str(i).zfill(4)}.webm"
                    await client.delete(
                        f"{SUPABASE_URL}/storage/v1/object/nomad-audio-chunks/{chunk_path}",
                        headers=storage_headers,
                    )

    except Exception as e:
        print(f"[ASSEMBLE] Background assembly failed for {session_id}: {e}")
        # Mark session as error so user knows
        try:
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={"status": "error", "error_message": f"Assembly failed: {e}"},
                )
        except Exception:
            pass


@router.post("/assemble")
async def assemble_chunks(req: AssembleRequest, background_tasks: BackgroundTasks):
    """Create session immediately, then assemble chunks in background.

    Returns instantly with session_id. The background task downloads chunks,
    remuxes via ffmpeg, uploads the assembled file, and updates the session.
    """
    user_id = "martun"

    try:
        # Create session record NOW (no audio_url yet, status="assembling")
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
            session_data["status"] = "assembling"  # still assembling even with transcript

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

            # Save notes if provided
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

        # Launch assembly in background — returns immediately
        background_tasks.add_task(
            _do_assembly_background,
            req.session_id,
            req.chunk_count,
            req.mime_type,
        )

        print(f"[ASSEMBLE] Session {req.session_id} created, assembly queued ({req.chunk_count} chunks)")
        return {"session_id": req.session_id, "status": "assembling"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assembly failed: {str(e)}")
