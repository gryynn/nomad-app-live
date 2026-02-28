import httpx
from typing import Optional
from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


class WynonaService:
    """WhisperX transcription service on WYNONA GPU server."""

    def __init__(self):
        # Initialize Supabase client
        if SUPABASE_URL and SUPABASE_SERVICE_KEY:
            self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        else:
            self.supabase = None

    async def transcribe(self, session_id: str, file_url: str, engine: str = "wynona-base") -> dict:
        """
        Transcribe an audio file using WhisperX on WYNONA GPU server.

        Args:
            session_id: The session ID to update with transcription results
            file_url: URL to the audio file in Supabase Storage
            engine: The WhisperX engine to use (wynona-base, wynona-medium, wynona-large)

        Returns:
            dict: Transcription result with text and segments

        Raises:
            ValueError: If Supabase client is not configured
            httpx.HTTPError: If WYNONA API call fails
            Exception: If Supabase operations fail
        """
        raise NotImplementedError("WynonaService.transcribe() not yet implemented")

    async def _download_audio(self, file_url: str) -> bytes:
        """
        Download audio file from Supabase Storage.

        Args:
            file_url: URL to the audio file

        Returns:
            bytes: Audio file content
        """
        raise NotImplementedError("WynonaService._download_audio() not yet implemented")

    async def _call_wynona_api(self, audio_data: bytes, engine: str) -> dict:
        """
        Call WYNONA WhisperX API to transcribe audio.

        Args:
            audio_data: Audio file content as bytes
            engine: The WhisperX engine to use (wynona-base, wynona-medium, wynona-large)

        Returns:
            dict: WYNONA API response with transcription text and segments
        """
        raise NotImplementedError("WynonaService._call_wynona_api() not yet implemented")

    async def _store_transcript(self, session_id: str, transcription_result: dict) -> None:
        """
        Store transcription results in Supabase database.

        Args:
            session_id: The session ID to update
            transcription_result: WYNONA API response with text and segments
        """
        raise NotImplementedError("WynonaService._store_transcript() not yet implemented")
