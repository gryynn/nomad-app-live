import httpx
from typing import Optional
from supabase import create_client, Client
from app.config import GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY


class GroqService:
    """Groq Whisper transcription service."""

    def __init__(self):
        self.api_key = GROQ_API_KEY
        self.api_url = "https://api.groq.com/openai/v1/audio/transcriptions"
        self.model = "whisper-large-v3"

        # Initialize Supabase client
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        else:
            self.supabase = None

    async def transcribe(self, session_id: str, file_url: str, engine: str = "groq-turbo") -> dict:
        """
        Transcribe an audio file using Groq Whisper API.

        Args:
            session_id: The session ID to update with transcription results
            file_url: URL to the audio file in Supabase Storage
            engine: The Groq engine to use (groq-turbo or groq-large)

        Returns:
            dict: Transcription result with text and segments

        Raises:
            ValueError: If GROQ_API_KEY is not configured
            httpx.HTTPError: If Groq API call fails
            Exception: If Supabase operations fail
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not configured")

        if not self.supabase:
            raise ValueError("Supabase client is not configured")

        # Download audio file from Supabase Storage
        audio_data = await self._download_audio(file_url)

        # Send to Groq API
        transcription_result = await self._call_groq_api(audio_data, engine)

        # Store transcript in Supabase
        await self._store_transcript(session_id, transcription_result)

        return transcription_result

    async def _download_audio(self, file_url: str) -> bytes:
        """
        Download audio file from Supabase Storage.

        Args:
            file_url: URL to the audio file

        Returns:
            bytes: Audio file content
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            response.raise_for_status()
            return response.content

    async def _call_groq_api(self, audio_data: bytes, engine: str) -> dict:
        """
        Call Groq Whisper API to transcribe audio.

        Args:
            audio_data: Audio file content as bytes
            engine: The Groq engine to use (groq-turbo or groq-large)

        Returns:
            dict: Groq API response with transcription text and segments
        """
        # Determine model based on engine
        # groq-turbo uses whisper-large-v3, groq-large uses whisper-large-v3-turbo
        model = "whisper-large-v3-turbo" if engine == "groq-turbo" else "whisper-large-v3"

        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }

        files = {
            "file": ("audio.mp3", audio_data, "audio/mpeg")
        }

        data = {
            "model": model,
            "response_format": "verbose_json",  # Get segments and timestamps
            "temperature": 0.0
        }

        async with httpx.AsyncClient(timeout=300.0) as client:  # 5 minute timeout
            response = await client.post(
                self.api_url,
                headers=headers,
                files=files,
                data=data
            )
            response.raise_for_status()
            return response.json()

    async def _store_transcript(self, session_id: str, transcription_result: dict) -> None:
        """
        Store transcription results in Supabase database.

        Args:
            session_id: The session ID to update
            transcription_result: Groq API response with text and segments
        """
        # Extract text and segments from Groq response
        transcript_text = transcription_result.get("text", "")
        segments = transcription_result.get("segments", [])

        # Update session record in app_nomad.sessions table
        response = self.supabase.table("sessions").update({
            "transcript": transcript_text,
            "transcript_segments": segments,
            "status": "transcribed"
        }).eq("id", session_id).execute()

        if not response.data:
            raise Exception(f"Failed to update session {session_id} with transcript")
