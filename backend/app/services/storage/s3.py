"""
S3-compatible storage backend.

Works with AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi, etc.

Configuration:
- S3_ENDPOINT_URL=https://...      (omit for AWS S3 default)
- S3_BUCKET=your-bucket
- S3_REGION=auto                   (R2: "auto"; AWS: "us-east-1" etc.)
- S3_ACCESS_KEY=...
- S3_SECRET_KEY=...
- S3_FORCE_PATH_STYLE=false        (true for MinIO)

Why aioboto3 (not boto3): the rest of the backend is async; using sync
boto3 would block the event loop on uploads of multi-MB blobs.
"""
from __future__ import annotations

import asyncio
import os
from typing import AsyncIterator, Optional

from .base import StorageBackend

try:
    import aioboto3  # type: ignore
except ImportError:  # pragma: no cover
    aioboto3 = None  # Imported lazily — keeps the dep optional.


class S3Backend(StorageBackend):
    name = "s3"

    def __init__(
        self,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "auto",
        endpoint_url: Optional[str] = None,
        force_path_style: bool = False,
    ):
        if aioboto3 is None:
            raise RuntimeError(
                "S3Backend requires `aioboto3`. Install it: pip install aioboto3"
            )
        if not bucket or not access_key or not secret_key:
            raise ValueError("S3Backend requires S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY")
        self.bucket = bucket
        self.region = region
        self.endpoint_url = endpoint_url or None
        self.force_path_style = force_path_style
        self._session = aioboto3.Session(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def _client_kwargs(self) -> dict:
        kwargs: dict = {"service_name": "s3"}
        if self.endpoint_url:
            kwargs["endpoint_url"] = self.endpoint_url
        if self.force_path_style:
            from botocore.config import Config  # type: ignore
            kwargs["config"] = Config(s3={"addressing_style": "path"})
        return kwargs

    async def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        async with self._session.client(**self._client_kwargs()) as s3:
            await s3.put_object(
                Bucket=self.bucket,
                Key=key.lstrip("/"),
                Body=data,
                ContentType=content_type,
            )

    async def download(self, key: str) -> bytes:
        async with self._session.client(**self._client_kwargs()) as s3:
            try:
                resp = await s3.get_object(Bucket=self.bucket, Key=key.lstrip("/"))
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(key)
            async with resp["Body"] as stream:
                return await stream.read()

    async def stream(
        self,
        key: str,
        start: int = 0,
        end: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        kwargs = {"Bucket": self.bucket, "Key": key.lstrip("/")}
        if start or end is not None:
            kwargs["Range"] = f"bytes={start}-{end if end is not None else ''}"
        async with self._session.client(**self._client_kwargs()) as s3:
            try:
                resp = await s3.get_object(**kwargs)
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(key)
            async with resp["Body"] as stream:
                while True:
                    chunk = await stream.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk

    async def delete(self, key: str) -> None:
        async with self._session.client(**self._client_kwargs()) as s3:
            await s3.delete_object(Bucket=self.bucket, Key=key.lstrip("/"))

    async def exists(self, key: str) -> bool:
        async with self._session.client(**self._client_kwargs()) as s3:
            try:
                await s3.head_object(Bucket=self.bucket, Key=key.lstrip("/"))
                return True
            except Exception:
                return False

    async def size(self, key: str) -> int:
        async with self._session.client(**self._client_kwargs()) as s3:
            try:
                resp = await s3.head_object(Bucket=self.bucket, Key=key.lstrip("/"))
            except Exception:
                raise FileNotFoundError(key)
            return int(resp.get("ContentLength", 0))

    async def list_prefix(self, prefix: str) -> list[str]:
        keys: list[str] = []
        async with self._session.client(**self._client_kwargs()) as s3:
            paginator = s3.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix.lstrip("/")):
                for obj in page.get("Contents", []) or []:
                    keys.append(obj["Key"])
        return keys
