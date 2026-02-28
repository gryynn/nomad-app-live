from fastapi import APIRouter, UploadFile, File, HTTPException
from supabase import create_client
import uuid
from pathlib import Path
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/upload", tags=["upload"])

# Allowed audio file extensions
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}


def get_supabase_client():
    """Initialize Supabase client with service key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase configuration missing"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


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

    # For now, use a default user_id (will be replaced with actual user auth later)
    user_id = "default-user"

    # Construct storage path: {user_id}/{session_id}.{ext}
    storage_path = f"{user_id}/{session_id}{file_ext}"

    try:
        # Initialize Supabase client
        supabase = get_supabase_client()

        # Read file content
        file_content = await file.read()

        # Upload to Supabase Storage
        storage_response = supabase.storage.from_("nomad-audio").upload(
            path=storage_path,
            file=file_content,
            file_options={
                "content-type": file.content_type or "audio/mpeg",
                "upsert": "false"
            }
        )

        # Get public URL for the uploaded file
        file_url = supabase.storage.from_("nomad-audio").get_public_url(storage_path)

        # Create session record in app_nomad.sessions table
        # Using Supabase schema parameter to target app_nomad schema
        session_data = {
            "id": session_id,
            "user_id": user_id,
            "duration": 0,  # Will be updated later
            "input_mode": "upload",
            "status": "uploaded",
            "file_url": file_url,
        }

        # Insert session record with app_nomad schema
        # Note: Python Supabase client uses schema() method to target specific schema
        insert_response = (
            supabase.schema("app_nomad")
            .table("sessions")
            .insert(session_data)
            .execute()
        )

        return {
            "session_id": session_id,
            "file_url": file_url
        }

    except Exception as e:
        # Handle storage quota errors
        if "507" in str(e) or "quota" in str(e).lower():
            raise HTTPException(
                status_code=507,
                detail="Insufficient storage space"
            )
        # Handle other errors
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(e)}"
        )
