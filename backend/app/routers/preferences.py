"""User-scoped preferences: auto-transcribe toggle, transcription API keys,
preferred engine. Keys are stored in `app_nomad.user_settings.api_keys`
(JSONB, RLS owner-only). The backend reads DB first, falls back to env
vars for self-hosted deployments where a single .env powers everything.
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


router = APIRouter(prefix="/preferences", tags=["preferences"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"

# Keys we accept under user_settings.api_keys. The set is intentionally
# narrow to avoid users storing random secrets in this table.
ALLOWED_KEY_NAMES = {"groq", "deepgram", "openai"}


class Preferences(BaseModel):
    # Default OFF for new users (open-instance friendliness). Existing users
    # keep whatever they had — this default only applies when no row exists.
    auto_transcribe: bool = False
    preferred_engine: str = "auto"
    wynona_endpoint: Optional[str] = None
    # api_keys is **write-only** from the client. Reads never include the
    # plaintext values — we only expose `api_keys_set` (a list of names)
    # so the UI can show "Groq ✓" without revealing the key.
    api_keys: dict[str, str] = Field(default_factory=dict)


class PreferencesPublicView(BaseModel):
    auto_transcribe: bool = False
    preferred_engine: str = "auto"
    wynona_endpoint: Optional[str] = None
    api_keys_set: list[str] = Field(default_factory=list)


async def _read_row(user_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/user_settings",
            headers=HEADERS,
            params={
                "user_id": f"eq.{user_id}",
                "select": "auto_transcribe,preferred_engine,wynona_endpoint,api_keys",
            },
        )
        if resp.status_code != 200:
            return {}
        rows = resp.json()
        return rows[0] if rows else {}


async def get_user_preferences(user_id: str) -> Preferences:
    """Internal accessor — returns plaintext keys for transcribe.py / others
    to use. Not exposed via HTTP."""
    row = await _read_row(user_id)
    return Preferences(
        # Absent row → False (open-instance default). Existing rows keep
        # whatever the user persisted, including legacy `true` values.
        auto_transcribe=row.get("auto_transcribe", False),
        preferred_engine=row.get("preferred_engine") or "auto",
        wynona_endpoint=row.get("wynona_endpoint"),
        api_keys=row.get("api_keys") or {},
    )


async def resolve_api_key(user_id: str, vendor: str) -> Optional[str]:
    """Look up a vendor's API key. Prefers the user's DB-stored value, falls
    back to the host env (so self-hosted single-tenant setups stay zero-config)."""
    prefs = await get_user_preferences(user_id)
    if vendor in prefs.api_keys and prefs.api_keys[vendor]:
        return prefs.api_keys[vendor]
    env_name = {
        "groq": "GROQ_API_KEY",
        "deepgram": "DEEPGRAM_API_KEY",
        "openai": "OPENAI_API_KEY",
    }.get(vendor)
    return os.environ.get(env_name, "") if env_name else None


@router.get("", response_model=PreferencesPublicView)
async def read_preferences(user=Depends(get_current_user)):
    prefs = await get_user_preferences(user["id"])
    return PreferencesPublicView(
        auto_transcribe=prefs.auto_transcribe,
        preferred_engine=prefs.preferred_engine,
        wynona_endpoint=prefs.wynona_endpoint,
        api_keys_set=sorted([k for k, v in prefs.api_keys.items() if v]),
    )


@router.put("")
async def update_preferences(prefs: Preferences, user=Depends(get_current_user)):
    """PUT merges into the existing row. Only the keys the client sends get
    overwritten; existing api_keys not in the payload survive. To delete a
    single key, send `{"api_keys": {"groq": ""}}` — empty values are pruned."""
    user_id = user["id"]
    existing = await _read_row(user_id)
    merged_keys = {**(existing.get("api_keys") or {})}
    for k, v in (prefs.api_keys or {}).items():
        if k not in ALLOWED_KEY_NAMES:
            continue
        if v == "":
            merged_keys.pop(k, None)
        else:
            merged_keys[k] = v

    body = {
        "user_id": user_id,
        "auto_transcribe": prefs.auto_transcribe,
        "preferred_engine": prefs.preferred_engine,
        "wynona_endpoint": prefs.wynona_endpoint,
        "api_keys": merged_keys,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{BASE_URL}/user_settings",
            headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=body,
        )
        if resp.status_code not in (200, 201, 204):
            raise HTTPException(status_code=500, detail=f"Upsert failed: {resp.text[:200]}")
    return PreferencesPublicView(
        auto_transcribe=prefs.auto_transcribe,
        preferred_engine=prefs.preferred_engine,
        wynona_endpoint=prefs.wynona_endpoint,
        api_keys_set=sorted(merged_keys.keys()),
    )
