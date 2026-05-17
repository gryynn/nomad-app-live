"""Unit tests for the audio access token (signed URL JWT)."""
import os
import time

import pytest

# Ensure auth secret is set BEFORE importing
os.environ.setdefault("APP_JWT_SECRET", "test-secret-for-pytest-32-chars-min!")

from app.auth import create_audio_token, verify_audio_token


def test_audio_token_valid_for_correct_session():
    sid = "abc-123"
    tok = create_audio_token(sid, expires_minutes=5)
    assert verify_audio_token(tok, sid) is True


def test_audio_token_invalid_for_wrong_session():
    tok = create_audio_token("session-A")
    assert verify_audio_token(tok, "session-B") is False


def test_audio_token_invalid_when_garbled():
    assert verify_audio_token("not.a.jwt", "session-A") is False


def test_audio_token_invalid_when_empty():
    assert verify_audio_token("", "session-A") is False


def test_audio_token_does_not_grant_user_access():
    """The audio_token has scope=audio:read; it must NOT be accepted as a user JWT."""
    import jwt
    from app.config import APP_JWT_SECRET
    tok = create_audio_token("sid")
    payload = jwt.decode(tok, APP_JWT_SECRET, algorithms=["HS256"])
    assert payload["scope"] == "audio:read"
    assert "sub" not in payload or payload.get("sub") != "sid"  # no user impersonation
