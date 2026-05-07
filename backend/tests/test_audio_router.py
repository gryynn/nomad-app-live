"""Integration test for the /api/audio/{session_id} router via FastAPI TestClient.

We use the local FS driver and seed it with a fake audio file. We bypass the
DB by monkey-patching `_resolve_storage_key` (which normally hits Supabase REST).
"""
import os
import shutil
import tempfile

import pytest

# Set env before any app import
TEST_DIR = tempfile.mkdtemp(prefix="nomad_audio_router_")
os.environ["STORAGE_DRIVER"] = "local"
os.environ["STORAGE_LOCAL_PATH"] = TEST_DIR
os.environ["SUPABASE_URL"] = "http://stub"
os.environ["SUPABASE_SERVICE_KEY"] = "stub"
os.environ["SUPABASE_ANON_KEY"] = "stub"
os.environ["APP_JWT_SECRET"] = "test-secret-for-pytest-32-chars-min!"
os.environ["AUDIO_TOKEN_REQUIRED"] = "false"

from fastapi.testclient import TestClient
from app.main import app
from app.routers import audio as audio_router
from app.services.storage.factory import reset_storage_backend_for_tests, get_storage_backend


@pytest.fixture(scope="module")
def client():
    reset_storage_backend_for_tests()
    yield TestClient(app)
    reset_storage_backend_for_tests()
    shutil.rmtree(TEST_DIR, ignore_errors=True)


@pytest.fixture(scope="module")
def seeded_session(client):
    """Seed an audio file on the local backend and stub _resolve_storage_key."""
    import asyncio

    backend = get_storage_backend()
    sid = "11111111-1111-1111-1111-111111111111"
    key = f"audio/test-user/{sid}.webm"
    data = bytes(range(256)) * 100  # 25.6 KB of predictable bytes
    asyncio.get_event_loop().run_until_complete(backend.upload(key, data, "audio/webm"))

    async def fake_resolve(session_id: str):
        return key if session_id == sid else None

    audio_router._resolve_storage_key = fake_resolve
    yield sid, data


def test_audio_get_full(client, seeded_session):
    sid, data = seeded_session
    resp = client.get(f"/api/audio/{sid}")
    assert resp.status_code == 200
    assert resp.headers["accept-ranges"] == "bytes"
    assert int(resp.headers["content-length"]) == len(data)
    assert resp.content == data


def test_audio_get_range(client, seeded_session):
    sid, data = seeded_session
    resp = client.get(f"/api/audio/{sid}", headers={"Range": "bytes=100-199"})
    assert resp.status_code == 206
    assert resp.headers["content-range"] == f"bytes 100-199/{len(data)}"
    assert int(resp.headers["content-length"]) == 100
    assert resp.content == data[100:200]


def test_audio_get_404_when_missing(client):
    resp = client.get("/api/audio/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_audio_token_required_blocks_no_token(client, seeded_session, monkeypatch):
    """When AUDIO_TOKEN_REQUIRED=true, anonymous access returns 401."""
    sid, _ = seeded_session
    monkeypatch.setattr("app.routers.audio.AUDIO_TOKEN_REQUIRED", True)
    resp = client.get(f"/api/audio/{sid}")
    assert resp.status_code == 401


def test_audio_token_required_accepts_signed_url(client, seeded_session, monkeypatch):
    """A valid ?token= grants access even when token is required."""
    from app.auth import create_audio_token
    sid, data = seeded_session
    monkeypatch.setattr("app.routers.audio.AUDIO_TOKEN_REQUIRED", True)
    tok = create_audio_token(sid)
    resp = client.get(f"/api/audio/{sid}?token={tok}")
    assert resp.status_code == 200
    assert resp.content == data


def test_audio_token_required_rejects_token_for_other_session(client, seeded_session, monkeypatch):
    """A token signed for session A must not unlock session B."""
    from app.auth import create_audio_token
    sid, _ = seeded_session
    monkeypatch.setattr("app.routers.audio.AUDIO_TOKEN_REQUIRED", True)
    tok = create_audio_token("00000000-0000-0000-0000-000000000000")
    resp = client.get(f"/api/audio/{sid}?token={tok}")
    assert resp.status_code == 401
