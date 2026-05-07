"""
Nextcloud WebDAV storage backend.

Uses Nextcloud's WebDAV API with HTTP Basic auth. Requires:
- NEXTCLOUD_URL=https://your-nextcloud.tld
- NEXTCLOUD_USER=login
- NEXTCLOUD_PASSWORD=app_password   (generate one in Nextcloud > Settings > Security)
- NEXTCLOUD_BASE_PATH=nomad-audio   (folder under the user's root, default: nomad-audio)

The driver writes to:
  {url}/remote.php/dav/files/{user}/{base_path}/{key}

Why an app password and not the main one:
- Nextcloud lets you generate revocable app passwords.
- If leaked, you revoke that password without changing your account.
- App passwords also bypass 2FA cleanly (which Basic Auth on the main pwd cannot).
"""
from __future__ import annotations

import os
import urllib.parse
from typing import AsyncIterator, Optional

import httpx

from .base import StorageBackend


class NextcloudBackend(StorageBackend):
    name = "nextcloud"

    def __init__(
        self,
        url: str,
        user: str,
        password: str,
        base_path: str = "nomad-audio",
    ):
        if not url or not user or not password:
            raise ValueError(
                "NextcloudBackend requires NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD"
            )
        self.url = url.rstrip("/")
        self.user = user
        self.auth = (user, password)
        self.base_path = base_path.strip("/")

    def _dav_url(self, key: str) -> str:
        key = key.lstrip("/")
        # Encode each path component separately (preserve slashes)
        parts = [urllib.parse.quote(p, safe="") for p in (self.base_path + "/" + key).split("/") if p]
        return f"{self.url}/remote.php/dav/files/{urllib.parse.quote(self.user, safe='')}/" + "/".join(parts)

    async def _ensure_dir(self, key: str) -> None:
        """Create parent collection(s) recursively via MKCOL (best-effort, idempotent)."""
        parts = (self.base_path + "/" + key.lstrip("/")).split("/")[:-1]
        if not parts:
            return
        path = ""
        async with httpx.AsyncClient(timeout=30.0, auth=self.auth) as client:
            for p in parts:
                if not p:
                    continue
                path = f"{path}/{p}" if path else p
                encoded = "/".join(urllib.parse.quote(x, safe="") for x in path.split("/") if x)
                mkcol_url = f"{self.url}/remote.php/dav/files/{urllib.parse.quote(self.user, safe='')}/{encoded}"
                try:
                    await client.request("MKCOL", mkcol_url)
                    # 201 = created, 405 = already exists, both fine
                except httpx.HTTPError:
                    pass

    async def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        await self._ensure_dir(key)
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0), auth=self.auth) as client:
            resp = await client.put(
                self._dav_url(key),
                content=data,
                headers={"Content-Type": content_type},
            )
            if resp.status_code not in (200, 201, 204):
                raise RuntimeError(f"Nextcloud upload failed ({resp.status_code}): {resp.text[:200]}")

    async def download(self, key: str) -> bytes:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0), auth=self.auth) as client:
            resp = await client.get(self._dav_url(key))
            if resp.status_code == 404:
                raise FileNotFoundError(key)
            if resp.status_code != 200:
                raise RuntimeError(f"Nextcloud download failed ({resp.status_code})")
            return resp.content

    async def stream(
        self,
        key: str,
        start: int = 0,
        end: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        headers = {}
        if start or end is not None:
            headers["Range"] = f"bytes={start}-{end if end is not None else ''}"
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0), auth=self.auth) as client:
            async with client.stream("GET", self._dav_url(key), headers=headers) as resp:
                if resp.status_code == 404:
                    raise FileNotFoundError(key)
                if resp.status_code not in (200, 206):
                    body = await resp.aread()
                    raise RuntimeError(f"Nextcloud stream failed ({resp.status_code}): {body[:200]!r}")
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

    async def delete(self, key: str) -> None:
        async with httpx.AsyncClient(timeout=30.0, auth=self.auth) as client:
            resp = await client.delete(self._dav_url(key))
            if resp.status_code not in (200, 204, 404):
                raise RuntimeError(f"Nextcloud delete failed ({resp.status_code}): {resp.text[:200]}")

    async def exists(self, key: str) -> bool:
        async with httpx.AsyncClient(timeout=15.0, auth=self.auth) as client:
            resp = await client.head(self._dav_url(key))
            return resp.status_code == 200

    async def size(self, key: str) -> int:
        async with httpx.AsyncClient(timeout=15.0, auth=self.auth) as client:
            resp = await client.head(self._dav_url(key))
            if resp.status_code == 404:
                raise FileNotFoundError(key)
            return int(resp.headers.get("content-length", 0))

    async def list_prefix(self, prefix: str) -> list[str]:
        # PROPFIND with depth=infinity
        propfind_body = (
            '<?xml version="1.0"?>'
            '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
        )
        async with httpx.AsyncClient(timeout=60.0, auth=self.auth) as client:
            resp = await client.request(
                "PROPFIND",
                self._dav_url(prefix.rstrip("/") + "/"),
                headers={"Depth": "infinity", "Content-Type": "application/xml"},
                content=propfind_body,
            )
            if resp.status_code not in (200, 207):
                return []
            # Quick & dirty: extract <d:href> entries that are not collections
            text = resp.text
            keys: list[str] = []
            base_href = f"/remote.php/dav/files/{urllib.parse.quote(self.user, safe='')}/{self.base_path}/"
            for chunk in text.split("<d:response>"):
                if "<d:collection/>" in chunk:
                    continue
                if "<d:href>" in chunk:
                    href = chunk.split("<d:href>")[1].split("</d:href>")[0]
                    if base_href in href:
                        rel = urllib.parse.unquote(href.split(base_href, 1)[1])
                        if rel:
                            keys.append(rel)
            return sorted(keys)
