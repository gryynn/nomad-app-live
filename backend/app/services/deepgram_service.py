import httpx
from app.config import DEEPGRAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"


class DeepgramService:
    """Deepgram Nova-3 transcription service.

    Uses URL-based transcription — sends the audio URL to Deepgram
    which downloads it directly. No file size limit, supports hours-long files.
    Includes diarization (speaker identification) by default.
    """

    def __init__(self):
        self.api_key = DEEPGRAM_API_KEY
        self.api_url = "https://api.deepgram.com/v1/listen"

    async def transcribe(self, session_id: str, audio_url: str) -> dict:
        if not self.api_key:
            raise ValueError("DEEPGRAM_API_KEY is not configured")

        result = await self._call_deepgram(audio_url)
        await self._store_transcript(session_id, result)
        return result

    async def _call_deepgram(self, audio_url: str) -> dict:
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json",
        }
        params = {
            "model": "nova-3",
            "language": "fr",
            "punctuate": "true",
            "diarize": "true",
            "utterances": "true",
            "smart_format": "true",
        }
        body = {"url": audio_url}

        # Long timeout for hours-long files (up to 30 min processing)
        async with httpx.AsyncClient(timeout=httpx.Timeout(1800.0, connect=30.0)) as client:
            response = await client.post(
                self.api_url,
                headers=headers,
                params=params,
                json=body,
            )
            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"Deepgram API error ({response.status_code}): {error_text}")
            return response.json()

    async def _store_transcript(self, session_id: str, result: dict) -> None:
        # Extract transcript from Deepgram response
        channels = result.get("results", {}).get("channels", [])
        if not channels:
            raise Exception("Deepgram returned no channels")

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            raise Exception("Deepgram returned no alternatives")

        transcript_text = alternatives[0].get("transcript", "")
        word_count = len(transcript_text.split()) if transcript_text else 0

        # Build segments from utterances (includes speaker info + timestamps)
        utterances = result.get("results", {}).get("utterances", [])
        segments = []
        for u in utterances:
            segments.append({
                "start": u.get("start", 0),
                "end": u.get("end", 0),
                "text": u.get("transcript", ""),
                "speaker": u.get("speaker", None),
            })

        # Fallback: if no utterances, build segments from paragraphs
        if not segments:
            paragraphs = alternatives[0].get("paragraphs", {}).get("paragraphs", [])
            for para in paragraphs:
                speaker = para.get("speaker", None)
                for sentence in para.get("sentences", []):
                    segments.append({
                        "start": sentence.get("start", 0),
                        "end": sentence.get("end", 0),
                        "text": sentence.get("text", ""),
                        "speaker": speaker,
                    })

        # Extract duration from metadata
        duration = result.get("metadata", {}).get("duration", None)

        update_data = {
            "transcript": transcript_text,
            "transcript_segments": segments,
            "transcript_words": word_count,
            "engine_used": "deepgram",
            "status": "transcribed",
            "error_message": None,
        }
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
