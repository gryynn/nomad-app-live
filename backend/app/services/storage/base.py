"""
Storage backend abstraction.

Each driver (local, nextcloud, s3, supabase) implements this interface.
The backend code never deals with URLs directly — it manipulates `keys`
(relative paths like "{user_id}/{session_id}.webm") and asks the driver
to store/fetch/delete the bytes behind them.

The public-facing audio_url stored in app_nomad.sessions becomes a
backend-served URL (`/api/audio/{session_id}`) instead of a direct
storage URL — that gives the backend the freedom to switch drivers
later without touching DB rows or migrating clients.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional


class StorageBackend(ABC):
    """Abstract storage backend. All keys are relative paths (no leading slash)."""

    name: str = "abstract"

    @abstractmethod
    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Store bytes at `key`. Overwrite if exists."""

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """Read full file. Raise FileNotFoundError if missing."""

    @abstractmethod
    async def stream(
        self,
        key: str,
        start: int = 0,
        end: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        """
        Yield chunks of the file (for HTTP streaming).
        If start/end are given, return only that byte range (HTTP Range support).
        """

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete `key`. No-op if already absent."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """True if `key` is present."""

    @abstractmethod
    async def size(self, key: str) -> int:
        """Size in bytes. Raise FileNotFoundError if missing."""

    @abstractmethod
    async def list_prefix(self, prefix: str) -> list[str]:
        """List all keys starting with `prefix` (used to clean session chunks)."""
