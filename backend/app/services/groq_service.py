import httpx
from app.config import GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"


class GroqService:

    def __init__(self):
        self.api_key = GROQ_API_KEY
        self.api_url = "https://api.groq.com/openai/v1/audio/transcriptions"

    # Map extensions to MIME types for Groq API
    MIME_MAP = {
        ".mp3": ("audio.mp3", "audio/mpeg"),
        ".wav": ("audio.wav", "audio/wav"),
        ".m4a": ("audio.m4a", "audio/mp4"),
        ".ogg": ("audio.ogg", "audio/ogg"),
        ".webm": ("audio.webm", "audio/webm"),
        ".flac": ("audio.flac", "audio/flac"),
    }

    async def transcribe(self, session_id: str, audio_url: str, engine: str = "groq-turbo") -> dict:
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not configured")

        audio_data = await self._download_audio(audio_url)
        result = await self._call_groq_api(audio_data, engine, audio_url)
        await self._store_transcript(session_id, result, engine)
        return result

    async def _download_audio(self, audio_url: str) -> bytes:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(audio_url)
            response.raise_for_status()
            return response.content

    def _detect_mime(self, audio_url: str) -> tuple[str, str]:
        """Detect filename and MIME type from URL."""
        url_path = audio_url.split("?")[0].lower()
        for ext, (fname, mime) in self.MIME_MAP.items():
            if url_path.endswith(ext):
                return fname, mime
        return "audio.mp3", "audio/mpeg"  # default fallback

    async def _call_groq_api(self, audio_data: bytes, engine: str, audio_url: str = "") -> dict:
        model = "whisper-large-v3-turbo" if engine == "groq-turbo" else "whisper-large-v3"

        fname, mime = self._detect_mime(audio_url)
        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {"file": (fname, audio_data, mime)}
        data = {
            "model": model,
            "response_format": "verbose_json",
            "temperature": 0.0,
        }

        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                self.api_url, headers=headers, files=files, data=data
            )
            response.raise_for_status()
            return response.json()

    async def _store_transcript(self, session_id: str, result: dict, engine: str = "groq-turbo") -> None:
        transcript_text = result.get("text", "")
        segments = result.get("segments", [])
        word_count = len(transcript_text.split()) if transcript_text else 0

        update_data = {
            "transcript": transcript_text,
            "transcript_segments": segments,
            "transcript_words": word_count,
            "engine_used": engine,
            "status": "transcribed",
            "error_message": None,
        }

        # Groq verbose_json includes duration
        duration = result.get("duration")
        if duration:
            update_data["duration_seconds"] = int(duration)

        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{BASE_URL}/sessions?id=eq.{session_id}",
                headers=HEADERS,
                json=update_data,
            )
            if resp.status_code not in (200, 204):
                raise Exception(f"Failed to update session {session_id}: {resp.text}")
