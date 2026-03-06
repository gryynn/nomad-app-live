from fastapi import APIRouter, HTTPException, BackgroundTasks
import httpx
from app.models.schemas import TranscribeRequest
from app.services.queue_manager import QueueManager
from app.services.groq_service import GroqService
from app.services.deepgram_service import DeepgramService
from app.services.wynona_service import WynonaService
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DEEPGRAM_API_KEY

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"

# Groq file size limit: 25 MB
GROQ_SIZE_LIMIT = 25 * 1024 * 1024

# Initialize services
queue_manager = QueueManager()
groq_service = GroqService()
deepgram_service = DeepgramService()
wynona_service = WynonaService()


async def resolve_engine(engine: str, audio_url: str) -> str:
    """Auto-select engine based on file size when engine is 'auto'."""
    if engine != "auto":
        return engine
    # Check file size via HEAD request
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.head(audio_url)
            size = int(resp.headers.get("content-length", "0"))
            if size > GROQ_SIZE_LIMIT:
                if DEEPGRAM_API_KEY:
                    print(f"[AUTO-ENGINE] File {size / 1024 / 1024:.1f} MB > 25 MB → deepgram")
                    return "deepgram"
                else:
                    print(f"[AUTO-ENGINE] WARNING: File {size / 1024 / 1024:.1f} MB > 25 MB but no DEEPGRAM_API_KEY, Groq will likely fail")
            else:
                print(f"[AUTO-ENGINE] File {size / 1024 / 1024:.1f} MB ≤ 25 MB → groq-turbo")
    except Exception as e:
        print(f"[AUTO-ENGINE] HEAD request failed ({e}), defaulting to groq-turbo")
    return "groq-turbo"


async def process_transcription(job_id: str, session_id: str, engine: str, audio_url: str):
    try:
        queue_manager.update_status(job_id, "processing")

        # Resolve auto engine
        resolved = await resolve_engine(engine, audio_url)
        print(f"[TRANSCRIBE] job={job_id} engine={engine}→{resolved}")

        # Store which engine is being used
        try:
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={"engine_used": resolved, "status": "processing"},
                )
        except Exception:
            pass

        if resolved in ["groq-turbo", "groq-large"]:
            await groq_service.transcribe(session_id, audio_url, resolved)
            queue_manager.update_status(job_id, "completed")
        elif resolved == "deepgram":
            await deepgram_service.transcribe(session_id, audio_url)
            queue_manager.update_status(job_id, "completed")
        elif resolved == "wynona":
            await wynona_service.transcribe(session_id, audio_url)
            queue_manager.update_status(job_id, "completed")
        else:
            raise ValueError(f"Unknown engine: {resolved}")

    except Exception as e:
        queue_manager.update_status(job_id, "failed")
        error_msg = str(e)
        print(f"Transcription job {job_id} failed: {error_msg}")
        # Store error message on the session
        try:
            async with httpx.AsyncClient() as client:
                await client.patch(
                    f"{BASE_URL}/sessions?id=eq.{session_id}",
                    headers=HEADERS,
                    json={"status": "error", "error_message": error_msg},
                )
        except Exception:
            pass  # Best-effort error storage


@router.post("/{session_id}")
async def transcribe_session(
    session_id: str,
    request: TranscribeRequest,
    background_tasks: BackgroundTasks
):
    if not session_id:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    valid_engines = ["auto", "groq-turbo", "groq-large", "deepgram", "wynona"]
    if request.engine not in valid_engines:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid engine. Must be one of: {', '.join(valid_engines)}"
        )

    # Check if session exists via httpx REST API
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{BASE_URL}/sessions?id=eq.{session_id}&select=id,audio_url",
                headers=HEADERS,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to query session")

            rows = resp.json()
            if not rows:
                raise HTTPException(status_code=404, detail="Session not found")

            audio_url = rows[0].get("audio_url")
            if not audio_url:
                raise HTTPException(status_code=400, detail="Session has no audio file")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify session: {str(e)}")

    job_id = queue_manager.add_job(session_id, request.engine)

    background_tasks.add_task(
        process_transcription,
        job_id,
        session_id,
        request.engine,
        audio_url
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "session_id": session_id,
        "engine": request.engine
    }


@router.get("/queue")
async def get_queue():
    jobs = queue_manager.get_jobs()
    return {"jobs": jobs, "total": len(jobs)}
