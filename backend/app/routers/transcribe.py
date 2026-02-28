from fastapi import APIRouter, HTTPException, BackgroundTasks
import httpx
from app.models.schemas import TranscribeRequest
from app.services.queue_manager import QueueManager
from app.services.groq_service import GroqService
from app.services.wynona_service import WynonaService
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"

# Initialize services
queue_manager = QueueManager()
groq_service = GroqService()
wynona_service = WynonaService()


async def process_transcription(job_id: str, session_id: str, engine: str, audio_url: str):
    try:
        queue_manager.update_status(job_id, "processing")

        if engine in ["groq-turbo", "groq-large"]:
            await groq_service.transcribe(session_id, audio_url, engine)
            queue_manager.update_status(job_id, "completed")
        elif engine == "wynona":
            await wynona_service.transcribe(session_id, audio_url)
            queue_manager.update_status(job_id, "completed")
        elif engine == "deepgram":
            raise NotImplementedError("Deepgram transcription not yet implemented")
        else:
            raise ValueError(f"Unknown engine: {engine}")

    except Exception as e:
        queue_manager.update_status(job_id, "failed")
        print(f"Transcription job {job_id} failed: {str(e)}")


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
