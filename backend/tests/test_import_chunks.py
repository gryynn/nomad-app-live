"""Chunked import: byte slices uploaded one by one, concatenated server-side.

Auth, quota and the Supabase session insert are stubbed; the local FS driver
and the staging directory are real.
"""
import os
import shutil
import tempfile
import uuid

import pytest

TEST_DIR = tempfile.mkdtemp(prefix="nomad_import_")
os.environ["STORAGE_DRIVER"] = "local"
os.environ["STORAGE_LOCAL_PATH"] = TEST_DIR
os.environ.pop("IMPORT_STAGING_DIR", None)

from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user
from app.routers import upload as upload_router
from app.services.storage.factory import reset_storage_backend_for_tests

USER_ID = "00000000-0000-0000-0000-00000000beef"


class _Resp:
    status_code = 201
    text = ""


@pytest.fixture
def client(monkeypatch):
    # Other test modules set STORAGE_LOCAL_PATH at import time too.
    monkeypatch.setenv("STORAGE_DRIVER", "local")
    monkeypatch.setenv("STORAGE_LOCAL_PATH", TEST_DIR)
    reset_storage_backend_for_tests()
    inserted = []

    async def _no_quota(user_id, additional_bytes=0):
        return None

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            inserted.append(json)
            return _Resp()

    monkeypatch.setattr(upload_router, "_enforce_quota", _no_quota)
    monkeypatch.setattr(upload_router.httpx, "AsyncClient", _FakeClient)
    app.dependency_overrides[get_current_user] = lambda: {"id": USER_ID}
    c = TestClient(app)
    c.inserted = inserted
    yield c
    app.dependency_overrides.pop(get_current_user, None)
    reset_storage_backend_for_tests()


def teardown_module():
    shutil.rmtree(TEST_DIR, ignore_errors=True)


def _send(client, sid, idx, data):
    return client.post(
        f"/api/upload/import/chunk/{sid}/{idx}",
        files={"file": (f"chunk_{idx}", data, "application/octet-stream")},
    )


def test_chunks_reassemble_bit_identical(client):
    sid = str(uuid.uuid4())
    payload = os.urandom(3 * 1024 * 1024 + 123)
    size = 1024 * 1024
    chunks = [payload[i:i + size] for i in range(0, len(payload), size)]
    # Out of order, with one chunk sent twice (a retry): must not matter.
    for idx in [2, 0, 1, 1, 3]:
        assert _send(client, sid, idx, chunks[idx]).status_code == 200

    r = client.post("/api/upload/import/complete", json={
        "session_id": sid, "filename": "Entretien 2h.m4a",
        "chunk_count": len(chunks), "size": len(payload),
    })
    assert r.status_code == 200, r.text
    assert r.json()["session_id"] == sid

    row = client.inserted[-1]
    assert row["user_id"] == USER_ID
    assert row["title"] == "Entretien 2h"
    assert row["input_mode"] == "import"
    assert row["file_size_bytes"] == len(payload)
    stored = os.path.join(TEST_DIR, row["storage_key"])
    with open(stored, "rb") as f:
        assert f.read() == payload
    # Staging cleaned up.
    assert not os.path.exists(os.path.join(TEST_DIR, ".import-staging", USER_ID, sid))


def test_missing_chunk_is_rejected(client):
    sid = str(uuid.uuid4())
    _send(client, sid, 0, b"a" * 10)
    r = client.post("/api/upload/import/complete", json={
        "session_id": sid, "filename": "x.mp3", "chunk_count": 2, "size": 20,
    })
    assert r.status_code == 409
    assert "Missing chunks" in r.json()["detail"]


def test_size_mismatch_is_rejected(client):
    sid = str(uuid.uuid4())
    _send(client, sid, 0, b"a" * 10)
    r = client.post("/api/upload/import/complete", json={
        "session_id": sid, "filename": "x.mp3", "chunk_count": 1, "size": 11,
    })
    assert r.status_code == 409


def test_bad_extension_and_session_id(client):
    sid = str(uuid.uuid4())
    _send(client, sid, 0, b"a")
    r = client.post("/api/upload/import/complete", json={
        "session_id": sid, "filename": "x.exe", "chunk_count": 1, "size": 1,
    })
    assert r.status_code == 400
    assert _send(client, "../../etc", 0, b"a").status_code in (400, 404)
