from fastapi import APIRouter, HTTPException, BackgroundTasks
from supabase import create_client
from app.models.schemas import TranscribeRequest
from app.services.queue_manager import QueueManager
from app.services.groq_service import GroqService
from app.services.wynona_service import WynonaService
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

# Initialize services
queue_manager = QueueManager()
groq_service = GroqService()
wynona_service = WynonaService()


def get_supabase_client():
    """Initialize Supabase client with service key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase configuration missing"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def process_transcription(job_id: str, session_id: str, engine: str, file_url: str):
    """
    Background task to process transcription.

    Args:
        job_id: The job ID in the queue
        session_id: The session ID to transcribe
        engine: The transcription engine to use
        file_url: URL to the audio file
    """
    try:
        # Update job status to processing
        queue_manager.update_status(job_id, "processing")

        # Process based on engine
        if engine in ["groq-turbo", "groq-large"]:
            await groq_service.transcribe(session_id, file_url, engine)
            queue_manager.update_status(job_id, "completed")
        elif engine == "wynona":
            # Will raise NotImplementedError
            await wynona_service.transcribe(session_id, file_url)
            queue_manager.update_status(job_id, "completed")
        elif engine == "deepgram":
            # Not implemented yet
            raise NotImplementedError("Deepgram transcription not yet implemented")
        else:
            raise ValueError(f"Unknown engine: {engine}")

    except Exception as e:
        # Mark job as failed
        queue_manager.update_status(job_id, "failed")
        # Log error (in production, use proper logging)
        print(f"Transcription job {job_id} failed: {str(e)}")


@router.post("/{session_id}")
async def transcribe_session(
    session_id: str,
    request: TranscribeRequest,
    background_tasks: BackgroundTasks
):
    """
    Queue a transcription job for the given session.

    This endpoint accepts a session ID and transcription engine preference,
    then queues the audio file for transcription processing.

    Args:
        session_id: UUID of the session to transcribe
        request: TranscribeRequest with engine selection
        background_tasks: FastAPI background tasks handler

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

    # Check if session exists in Supabase
    try:
        supabase = get_supabase_client()
        session_response = (
            supabase.schema("app_nomad")
            .table("sessions")
            .select("id, file_url")
            .eq("id", session_id)
            .execute()
        )

        if not session_response.data:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )

        session_data = session_response.data[0]
        file_url = session_data.get("file_url")

        if not file_url:
            raise HTTPException(
                status_code=400,
                detail="Session has no audio file"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify session: {str(e)}"
        )

    # Add job to queue
    job_id = queue_manager.add_job(session_id, request.engine)

    # Start background transcription processing
    background_tasks.add_task(
        process_transcription,
        job_id,
        session_id,
        request.engine,
        file_url
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "session_id": session_id,
        "engine": request.engine
    }


@router.get("/queue")
async def get_queue():
    """
    Get the current transcription queue status.

    Returns a list of pending and active transcription jobs.

    Returns:
        List of queued transcription jobs with their status
    """
    jobs = queue_manager.get_jobs()

    return {
        "jobs": jobs,
        "total": len(jobs)
    }
