"""Tiny smoke tests for app.services.rate_limit.

Not exhaustive — we mostly want to prove that:
  - the env var actually changes behaviour
  - hitting the limit returns the right retry_after shape
  - per-user state is isolated
  - 0 / unset means "off"
"""
import os
from importlib import reload

import pytest


@pytest.fixture(autouse=True)
def _wipe_state():
    """Reset the in-memory dict before every test so they don't bleed."""
    from app.services import rate_limit
    rate_limit.reset()
    yield
    rate_limit.reset()


def test_zero_limit_means_unlimited(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_TRANSCRIBE_PER_HOUR", "0")
    from app.services import rate_limit
    for _ in range(200):
        ok, retry = rate_limit.check("u1", "transcribe")
        assert ok and retry == 0


def test_hits_block_after_limit(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_TRANSCRIBE_PER_HOUR", "3")
    from app.services import rate_limit
    rate_limit.reset()

    for _ in range(3):
        ok, _ = rate_limit.check("u1", "transcribe")
        assert ok

    blocked, retry = rate_limit.check("u1", "transcribe")
    assert blocked is False
    assert retry > 0


def test_per_user_isolation(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_TRANSCRIBE_PER_HOUR", "1")
    from app.services import rate_limit
    rate_limit.reset()

    ok1, _ = rate_limit.check("u1", "transcribe")
    ok2, _ = rate_limit.check("u2", "transcribe")
    assert ok1 and ok2

    blocked, _ = rate_limit.check("u1", "transcribe")
    assert not blocked
    # u2 still has headroom
    blocked2, _ = rate_limit.check("u2", "transcribe")
    assert not blocked2


def test_different_actions_share_no_bucket(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_TRANSCRIBE_PER_HOUR", "1")
    monkeypatch.setenv("RATE_LIMIT_TRANSCRIBE_CHUNK_PER_HOUR", "1")
    from app.services import rate_limit
    rate_limit.reset()

    ok1, _ = rate_limit.check("u1", "transcribe")
    ok2, _ = rate_limit.check("u1", "transcribe_chunk")
    assert ok1 and ok2


def test_default_values_apply_when_env_missing(monkeypatch):
    monkeypatch.delenv("RATE_LIMIT_TRANSCRIBE_PER_HOUR", raising=False)
    from app.services import rate_limit
    # 60 default → 60 successes, 61st blocks.
    rate_limit.reset()
    for _ in range(60):
        ok, _ = rate_limit.check("u_default", "transcribe")
        assert ok
    blocked, _ = rate_limit.check("u_default", "transcribe")
    assert not blocked
