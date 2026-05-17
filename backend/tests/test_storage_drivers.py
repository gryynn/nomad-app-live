"""Unit tests for storage drivers — local FS in particular.

Run inside the backend container:
    docker compose exec nomad-backend pytest tests/test_storage_drivers.py -v
"""
import os
import shutil
import tempfile

import pytest

from app.services.storage.factory import reset_storage_backend_for_tests, get_storage_backend
from app.services.storage.local import LocalFSBackend


@pytest.fixture
def tmp_storage_dir():
    d = tempfile.mkdtemp(prefix="nomad_test_storage_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def local_backend(tmp_storage_dir):
    return LocalFSBackend(base_dir=tmp_storage_dir)


@pytest.mark.asyncio
async def test_local_upload_download_roundtrip(local_backend):
    data = b"hello nomad" * 1000
    await local_backend.upload("audio/u1/session1.webm", data, "audio/webm")
    got = await local_backend.download("audio/u1/session1.webm")
    assert got == data


@pytest.mark.asyncio
async def test_local_exists_and_size(local_backend):
    data = b"x" * 12345
    await local_backend.upload("audio/u1/s.webm", data)
    assert await local_backend.exists("audio/u1/s.webm") is True
    assert await local_backend.exists("audio/u1/missing.webm") is False
    assert await local_backend.size("audio/u1/s.webm") == 12345


@pytest.mark.asyncio
async def test_local_stream_full(local_backend):
    data = b"abcdefghij" * 5000  # 50 KB
    await local_backend.upload("audio/x.webm", data)
    chunks = [c async for c in local_backend.stream("audio/x.webm")]
    assert b"".join(chunks) == data


@pytest.mark.asyncio
async def test_local_stream_range(local_backend):
    data = bytes(range(256)) * 10  # 2560 bytes, predictable
    await local_backend.upload("audio/r.webm", data)
    chunks = [c async for c in local_backend.stream("audio/r.webm", start=100, end=199)]
    assert b"".join(chunks) == data[100:200]


@pytest.mark.asyncio
async def test_local_delete_idempotent(local_backend):
    await local_backend.upload("audio/d.webm", b"x")
    await local_backend.delete("audio/d.webm")
    assert await local_backend.exists("audio/d.webm") is False
    # Deleting again must not raise
    await local_backend.delete("audio/d.webm")


@pytest.mark.asyncio
async def test_local_list_prefix(local_backend):
    await local_backend.upload("audio/u1/a.webm", b"x")
    await local_backend.upload("audio/u1/b.webm", b"y")
    await local_backend.upload("chunks/s1/c0.webm", b"z")
    keys = await local_backend.list_prefix("audio/u1/")
    assert sorted(keys) == ["audio/u1/a.webm", "audio/u1/b.webm"]


@pytest.mark.asyncio
async def test_local_path_traversal_protection(local_backend):
    with pytest.raises(ValueError):
        await local_backend.upload("../../etc/passwd", b"oops")


@pytest.mark.asyncio
async def test_local_missing_file_raises(local_backend):
    with pytest.raises(FileNotFoundError):
        await local_backend.download("audio/missing.webm")


def test_factory_picks_local(monkeypatch, tmp_storage_dir):
    monkeypatch.setenv("STORAGE_DRIVER", "local")
    monkeypatch.setenv("STORAGE_LOCAL_PATH", tmp_storage_dir)
    reset_storage_backend_for_tests()
    backend = get_storage_backend()
    assert backend.name == "local"
    reset_storage_backend_for_tests()


def test_factory_unknown_driver(monkeypatch):
    monkeypatch.setenv("STORAGE_DRIVER", "totally-fake-driver")
    reset_storage_backend_for_tests()
    with pytest.raises(ValueError):
        get_storage_backend()
    reset_storage_backend_for_tests()
