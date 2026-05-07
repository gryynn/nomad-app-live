"""pytest config — sets sane defaults for all tests."""
import asyncio
import os

# Ensure required env vars before any app import
os.environ.setdefault("APP_JWT_SECRET", "test-secret-for-pytest-32-chars-min!")
os.environ.setdefault("SUPABASE_URL", "http://stub")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "stub")
os.environ.setdefault("SUPABASE_ANON_KEY", "stub")
os.environ.setdefault("STORAGE_DRIVER", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/nomad_pytest_storage")

import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Module-scoped event loop so async fixtures share state."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
