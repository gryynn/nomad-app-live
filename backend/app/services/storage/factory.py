"""
Storage backend factory.

Reads STORAGE_DRIVER env var and returns the matching backend instance
(singleton per process). Falls back to `supabase` for backward compat.
"""
from __future__ import annotations

import os
from threading import Lock

from .base import StorageBackend

_instance: StorageBackend | None = None
_lock = Lock()


def get_storage_backend() -> StorageBackend:
    global _instance
    if _instance is not None:
        return _instance

    with _lock:
        if _instance is not None:
            return _instance

        driver = os.getenv("STORAGE_DRIVER", "supabase").strip().lower()

        if driver == "local":
            from .local import LocalFSBackend
            base_dir = os.getenv("STORAGE_LOCAL_PATH", "./data/audio")
            _instance = LocalFSBackend(base_dir=base_dir)

        elif driver == "nextcloud":
            from .nextcloud import NextcloudBackend
            _instance = NextcloudBackend(
                url=os.getenv("NEXTCLOUD_URL", ""),
                user=os.getenv("NEXTCLOUD_USER", ""),
                password=os.getenv("NEXTCLOUD_PASSWORD", ""),
                base_path=os.getenv("NEXTCLOUD_BASE_PATH", "nomad-audio"),
            )

        elif driver == "s3":
            from .s3 import S3Backend
            _instance = S3Backend(
                bucket=os.getenv("S3_BUCKET", ""),
                access_key=os.getenv("S3_ACCESS_KEY", ""),
                secret_key=os.getenv("S3_SECRET_KEY", ""),
                region=os.getenv("S3_REGION", "auto"),
                endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
                force_path_style=os.getenv("S3_FORCE_PATH_STYLE", "false").lower() == "true",
            )

        elif driver == "supabase":
            from .supabase import SupabaseStorageBackend
            _instance = SupabaseStorageBackend(
                url=os.getenv("SUPABASE_URL", ""),
                service_key=os.getenv("SUPABASE_SERVICE_KEY", ""),
            )

        else:
            raise ValueError(
                f"Unknown STORAGE_DRIVER='{driver}'. "
                f"Allowed: local, nextcloud, s3, supabase"
            )

        return _instance


def reset_storage_backend_for_tests() -> None:
    """Test helper: clears the singleton so tests can rebind env vars."""
    global _instance
    with _lock:
        _instance = None
