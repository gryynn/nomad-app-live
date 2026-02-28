from fastapi import APIRouter, HTTPException
from app.models.schemas import TranscribeRequest

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


@router.post("/{session_id}")
async def transcribe_session(session_id: str, request: TranscribeRequest):
    """
    Queue a transcription job for the given session.

    This endpoint accepts a session ID and transcription engine preference,
    then queues the audio file for transcription processing.

    Args:
        session_id: UUID of the session to transcribe
        request: TranscribeRequest with engine selection

    Returns:
        Status of the transcription job
    """
    # Validate session_id format (basic check)
    if not session_id or len(session_id) < 1:
        raise HTTPException(
            status_code=400,
            detail="Invalid session_id"
        )

    # Validate engine selection
    valid_engines = ["auto", "groq-turbo", "groq-large", "deepgram", "wynona"]
    if request.engine not in valid_engines:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid engine. Must be one of: {', '.join(valid_engines)}"
        )

    # TODO: Implement actual transcription queue logic
    # For now, return success response
    return {
        "success": True,
        "session_id": session_id,
        "engine": request.engine,
        "status": "queued",
        "message": "Transcription job queued successfully"
    }
