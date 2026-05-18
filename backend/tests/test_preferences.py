"""Integration tests for /api/preferences and the ?auto=true gate on /api/transcribe.

We use the FastAPI TestClient with the real `get_current_user` dependency
(authenticating via a locally-minted APP_JWT_SECRET-signed token) and stub
out the Supabase REST calls that read/write `app_nomad.user_settings` and
`app_nomad.sessions`.
"""
import os
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock, patch

import pytest

# Env must be set before any app import — conftest.py covers defaults but we
# need the JWT secret to be the same we sign tokens with below.
os.environ["APP_JWT_SECRET"] = "test-secret-for-pytest-32-chars-min!"

from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_USER_EMAIL = "pytest@example.com"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture
def auth_header():
    token = create_access_token(TEST_USER_ID, TEST_USER_EMAIL)
    return {"Authorization": f"Bearer {token}"}


# ── /api/preferences ───────────────────────────────────────────────────


def _fake_httpx_get(rows: Optional[list] = None):
    """Build an AsyncMock that mimics httpx.AsyncClient().get() returning a
    Supabase REST-shaped response."""
    resp = AsyncMock()
    resp.status_code = 200
    resp.json = lambda: rows or []
    return resp


def _fake_httpx_post(status_code: int = 201):
    resp = AsyncMock()
    resp.status_code = status_code
    resp.text = "ok"
    return resp


def test_get_preferences_returns_default_when_no_row(client, auth_header):
    """No user_settings row → default {auto_transcribe: true}."""
    with patch("app.routers.preferences.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        mock_cli.get = AsyncMock(return_value=_fake_httpx_get(rows=[]))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.get("/api/preferences", headers=auth_header)
    assert resp.status_code == 200
    assert resp.json() == {"auto_transcribe": True}


def test_get_preferences_returns_stored_value(client, auth_header):
    with patch("app.routers.preferences.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        mock_cli.get = AsyncMock(return_value=_fake_httpx_get(rows=[{"auto_transcribe": False}]))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.get("/api/preferences", headers=auth_header)
    assert resp.status_code == 200
    assert resp.json() == {"auto_transcribe": False}


def test_put_preferences_upserts(client, auth_header):
    with patch("app.routers.preferences.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        mock_cli.post = AsyncMock(return_value=_fake_httpx_post(status_code=201))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.put(
            "/api/preferences",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"auto_transcribe": False},
        )
    assert resp.status_code == 200
    assert resp.json() == {"auto_transcribe": False}
    mock_cli.post.assert_awaited_once()


def test_put_preferences_500_on_upsert_failure(client, auth_header):
    with patch("app.routers.preferences.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        bad_resp = AsyncMock()
        bad_resp.status_code = 403
        bad_resp.text = "permission denied"
        mock_cli.post = AsyncMock(return_value=bad_resp)
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.put(
            "/api/preferences",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"auto_transcribe": True},
        )
    assert resp.status_code == 500
    assert "permission denied" in resp.json()["detail"]


# ── /api/transcribe ?auto=true respects user pref ─────────────────────


def _patch_user_pref(value: bool):
    """Patch get_user_preferences to return the requested pref value."""
    from app.routers import preferences as prefs_mod
    return patch(
        "app.routers.transcribe.get_user_preferences",
        new=AsyncMock(return_value=prefs_mod.Preferences(auto_transcribe=value)),
    )


def test_transcribe_auto_true_skips_when_pref_off(client, auth_header):
    """auto=true + user pref OFF → 200 + status=skipped, no engine work."""
    sid = "abcabcab-cd12-3456-7890-1234567890ab"
    with _patch_user_pref(False):
        resp = client.post(
            f"/api/transcribe/{sid}?auto=true",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"engine": "auto"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "skipped"
    assert "auto_transcribe disabled" in body["reason"]


def test_transcribe_auto_true_queues_when_pref_on(client, auth_header):
    """auto=true + user pref ON → must reach session lookup → 404 (no session
    in stub DB) confirms we passed the pref gate without skipping."""
    sid = "abcabcab-cd12-3456-7890-1234567890ab"
    with _patch_user_pref(True), \
         patch("app.routers.transcribe.httpx.AsyncClient") as mock_cls:
        # Stub session lookup to return empty (so we get 404, not 200/skipped)
        mock_cli = AsyncMock()
        mock_cli.get = AsyncMock(return_value=_fake_httpx_get(rows=[]))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.post(
            f"/api/transcribe/{sid}?auto=true",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"engine": "auto"},
        )
    # Either 404 (session not found) or 500 (lookup failed) — both prove the
    # pref gate did NOT short-circuit with status=skipped.
    assert resp.status_code in (404, 500)
    if resp.status_code == 404:
        assert "not found" in resp.json()["detail"].lower()


def test_transcribe_without_auto_param_always_runs(client, auth_header):
    """Manual call (no ?auto) must always run regardless of user pref."""
    sid = "abcabcab-cd12-3456-7890-1234567890ab"
    with _patch_user_pref(False), \
         patch("app.routers.transcribe.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        mock_cli.get = AsyncMock(return_value=_fake_httpx_get(rows=[]))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.post(
            f"/api/transcribe/{sid}",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"engine": "auto"},
        )
    # Same as above — anything but {"status":"skipped"} proves we ran.
    assert resp.status_code in (404, 500)


def test_transcribe_auto_false_explicit_runs(client, auth_header):
    """?auto=false (explicit) should also bypass the pref gate."""
    sid = "abcabcab-cd12-3456-7890-1234567890ab"
    with _patch_user_pref(False), \
         patch("app.routers.transcribe.httpx.AsyncClient") as mock_cls:
        mock_cli = AsyncMock()
        mock_cli.get = AsyncMock(return_value=_fake_httpx_get(rows=[]))
        mock_cls.return_value.__aenter__.return_value = mock_cli
        resp = client.post(
            f"/api/transcribe/{sid}?auto=false",
            headers={**auth_header, "Content-Type": "application/json"},
            json={"engine": "auto"},
        )
    assert resp.status_code in (404, 500)


# ── /api/transcribe/chunk/{id}/{seq} ?auto=true respects user pref ─────


def test_transcribe_chunk_auto_skips_when_pref_off(client, auth_header):
    """LIVE chunk auto-trigger should also respect the pref."""
    sid = "abcabcab-cd12-3456-7890-1234567890ab"
    with _patch_user_pref(False):
        resp = client.post(
            f"/api/transcribe/chunk/{sid}/0?auto=true",
            headers=auth_header,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("skipped") is True
    assert body.get("text") == ""
