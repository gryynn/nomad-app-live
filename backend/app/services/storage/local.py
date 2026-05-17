"""
LocalFS storage backend.

Stores files under a local directory. Default = ./data/audio/ (relative to CWD).
For Docker deployments, mount a host volume to /app/data/audio.

Use case:
- OSS users running `docker compose up` with zero external services
- Dev / tests
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import AsyncIterator, Optional

from .base import StorageBackend


class LocalFSBackend(StorageBackend):
    name = "local"

    def __init__(self, base_dir: str = "./data/audio"):
        self.base = Path(base_dir).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Sanity: prevent path traversal
        key = key.lstrip("/")
        target = (self.base / key).resolve()
        if not str(target).startswith(str(self.base)):
            raise ValueError(f"Invalid key (path traversal): {key}")
        return target

    async def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)

    async def download(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return await asyncio.to_thread(path.read_bytes)

    async def stream(
        self,
        key: str,
        start: int = 0,
        end: Optional[int] = None,
        chunk_size: int = 64 * 1024,
    ) -> AsyncIterator[bytes]:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)

        def _iter():
            with path.open("rb") as f:
                if start:
                    f.seek(start)
                remaining = (end - start + 1) if end is not None else None
                while True:
                    read_size = chunk_size
                    if remaining is not None:
                        if remaining <= 0:
                            break
                        read_size = min(chunk_size, remaining)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    if remaining is not None:
                        remaining -= len(chunk)
                    yield chunk

        # Bridge sync iterator → async generator
        for chunk in await asyncio.to_thread(lambda: list(_iter())):
            yield chunk

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            await asyncio.to_thread(os.remove, path)
        # Cleanup empty parent dir(s) up to base
        try:
            parent = path.parent
            while parent != self.base and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
                parent = parent.parent
        except Exception:
            pass

    async def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    async def size(self, key: str) -> int:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path.stat().st_size

    async def list_prefix(self, prefix: str) -> list[str]:
        prefix = prefix.lstrip("/")
        prefix_dir = self.base / prefix
        if not prefix_dir.exists():
            return []
        if prefix_dir.is_file():
            return [prefix]
        result = []
        for path in prefix_dir.rglob("*"):
            if path.is_file():
                rel = path.relative_to(self.base)
                result.append(str(rel).replace(os.sep, "/"))
        return sorted(result)
