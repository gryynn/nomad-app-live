"""
Supabase Storage backend.

Wraps Supabase Storage REST API. Used for legacy compatibility and as the
default for users who already have a Supabase project.

Two buckets are used:
- `nomad-audio`        for assembled audio files (final)
- `nomad-audio-chunks` for live recording chunks (intermediate)

The driver maps keys with a prefix:
- "audio/{key}"  → nomad-audio bucket
- "chunks/{key}" → nomad-audio-chunks bucket

This lets the backend code stay agnostic and use a single key namespace.
"""
from __future__ import annotations

import os
from typing import AsyncIterator, Optional

import httpx

from .base import StorageBackend


class SupabaseStorageBackend(StorageBackend):
    name = "supabase"

    def __init__(
        self,
        url: str,
        service_key: str,
        audio_bucket: str = "nomad-audio",
        chunks_bucket: str = "nomad-audio-chunks",
    ):
        if not url or not service_key:
            raise ValueError("SupabaseStorageBackend requires SUPABASE_URL and SUPABASE_SERVICE_KEY")
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        self.audio_bucket = audio_bucket
        self.chunks_bucket = chunks_bucket

    def _split(self, key: str) -> tuple[str, str]:
        """Map key prefix to (bucket, path)."""
        key = key.lstrip("/")
        if key.startswith("chunks/"):
            return self.chunks_bucket, key[len("chunks/") :]
        if key.startswith("audio/"):
            return self.audio_bucket, key[len("audio/") :]
        # Default: assume audio
        return self.audio_bucket, key

    def _object_url(self, key: str) -> str:
        bucket, path = self._split(key)
        return f"{self.url}/storage/v1/object/{bucket}/{path}"

    async def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            resp = await client.post(
                self._object_url(key),
                headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"},
                content=data,
            )
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Supabase upload failed ({resp.status_code}): {resp.text[:200]}")

    async def download(self, key: str) -> bytes:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            resp = await client.get(self._object_url(key), headers=self.headers)
            if resp.status_code == 404:
                raise FileNotFoundError(key)
            if resp.status_code != 200:
                raise RuntimeError(f"Supabase download failed ({resp.status_code})")
            return resp.content

    async def stream(
        self,
        key: str,
        start: int = 0,
        end: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        range_header = None
        if start or end is not None:
            range_header = f"bytes={start}-{end if end is not None else ''}"
        headers = dict(self.headers)
        if range_header:
            headers["Range"] = range_header

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            async with client.stream("GET", self._object_url(key), headers=headers) as resp:
                if resp.status_code == 404:
                    raise FileNotFoundError(key)
                if resp.status_code not in (200, 206):
                    body = await resp.aread()
                    raise RuntimeError(f"Supabase stream failed ({resp.status_code}): {body[:200]!r}")
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

    async def delete(self, key: str) -> None:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(self._object_url(key), headers=self.headers)
            if resp.status_code not in (200, 204, 404):
                raise RuntimeError(f"Supabase delete failed ({resp.status_code}): {resp.text[:200]}")

    async def exists(self, key: str) -> bool:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.head(self._object_url(key), headers=self.headers)
            return resp.status_code == 200

    async def size(self, key: str) -> int:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.head(self._object_url(key), headers=self.headers)
            if resp.status_code == 404:
                raise FileNotFoundError(key)
            return int(resp.headers.get("content-length", 0))

    async def list_prefix(self, prefix: str) -> list[str]:
        bucket, path_prefix = self._split(prefix)
        # Supabase has POST /list/{bucket} with {prefix, limit}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.url}/storage/v1/object/list/{bucket}",
                headers={**self.headers, "Content-Type": "application/json"},
                json={"prefix": path_prefix, "limit": 10000},
            )
            if resp.status_code != 200:
                return []
            items = resp.json()
            keys = []
            for item in items:
                if item.get("metadata"):
                    full = path_prefix + item["name"] if path_prefix.endswith("/") else f"{path_prefix}/{item['name']}"
                    if prefix.startswith("chunks/"):
                        keys.append(f"chunks/{full}".replace("//", "/"))
                    elif prefix.startswith("audio/"):
                        keys.append(f"audio/{full}".replace("//", "/"))
                    else:
                        keys.append(full)
            return keys
