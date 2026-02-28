from fastapi import APIRouter, UploadFile, File, HTTPException
import httpx
import uuid
from pathlib import Path
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/upload", tags=["upload"])

# Allowed audio file extensions
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}


HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"


@router.post("/")
async def upload_audio(file: UploadFile = File(...)):
    """
    Upload audio file to Supabase Storage and create session record.

    Accepts audio files in formats: .wav, .mp3, .m4a, .webm, .ogg
    Stores file in Supabase Storage bucket 'nomad-audio'
    Creates session record in app_nomad.sessions table

    Returns:
        session_id: UUID of created session
        file_url: Public URL of uploaded file
    """
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Generate session ID
    session_id = str(uuid.uuid4())

    user_id = "martun"

    # Construct storage path: {user_id}/{session_id}.{ext}
    storage_path = f"{user_id}/{session_id}{file_ext}"

    try:
        file_content = await file.read()
        file_size = len(file_content)

        async with httpx.AsyncClient() as client:
            # Upload to Supabase Storage bucket "nomad-audio"
            storage_headers = {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": file.content_type or "audio/mpeg",
            }
            storage_url = f"{SUPABASE_URL}/storage/v1/object/nomad-audio/{storage_path}"
            upload_resp = await client.post(
                storage_url, headers=storage_headers, content=file_content
            )
            if upload_resp.status_code not in (200, 201):
                raise HTTPException(
                    status_code=500,
                    detail=f"Storage upload failed: {upload_resp.text}"
                )

            # Build public URL
            audio_url = f"{SUPABASE_URL}/storage/v1/object/public/nomad-audio/{storage_path}"

            # Create session record
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
