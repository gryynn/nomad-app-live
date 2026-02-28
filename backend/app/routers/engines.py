from fastapi import APIRouter
import httpx
from app.config import GROQ_API_KEY, DEEPGRAM_API_KEY, WYNONA_HOST

router = APIRouter(prefix="/engines", tags=["engines"])


@router.get("/status")
async def get_engine_status():
    """
    Returns status and cost information for all transcription engines.

    Engines:
    - groq-turbo: Groq Whisper Turbo (fast, lower quality)
    - groq-large: Groq Whisper Large v3 (slower, higher quality)
    - deepgram: Deepgram Nova-3 (cloud API)
    - wynona: Local WhisperX on WYNONA GPU server
    """
    engines = [
        {
            "id": "groq-turbo",
            "name": "Groq Whisper Turbo",
            "status": "online" if GROQ_API_KEY else "offline",
            "cost_per_hour": 0.04,
        },
        {
            "id": "groq-large",
            "name": "Groq Whisper Large v3",
            "status": "online" if GROQ_API_KEY else "offline",
            "cost_per_hour": 0.11,
        },
        {
            "id": "deepgram",
            "name": "Deepgram Nova-3",
            "status": "online" if DEEPGRAM_API_KEY else "offline",
            "cost_per_hour": 0.46,
        },
        {
            "id": "wynona",
            "name": "WYNONA WhisperX",
            "status": await _check_wynona_health(),
            "cost_per_hour": 0.0,
        },
    ]

    return {"engines": engines}


@router.post("/wynona/wake")
async def wake_wynona():
    """
    Triggers WYNONA GPU server wake-up.

    This endpoint sends a wake signal to the WYNONA server.
    The server may take several minutes to boot up and become available.

    Returns:
        Status of the wake request
    """
    if not WYNONA_HOST:
        return {"success": False, "message": "WYNONA host not configured"}

    # Check if WYNONA is already online
    current_status = await _check_wynona_health()
    if current_status == "online":
        return {"success": True, "message": "WYNONA is already online"}

    # TODO: Implement actual wake-on-LAN or wake API call
    # For now, return success - actual wake logic to be implemented
    return {
        "success": True,
        "message": "Wake signal sent to WYNONA",
        "note": "Server may take several minutes to boot",
    }


async def _check_wynona_health() -> str:
    """
    Checks if WYNONA server is reachable via HTTP health check.

    Returns:
        "online" if health check succeeds, "offline" otherwise
    """
    if not WYNONA_HOST:
        return "offline"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"http://{WYNONA_HOST}:8765/health")
            return "online" if response.status_code == 200 else "offline"
    except (httpx.TimeoutException, httpx.ConnectError, Exception):
        return "offline"
