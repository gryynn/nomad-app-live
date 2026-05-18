from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx
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


class Preferences(BaseModel):
    auto_transcribe: bool = True


async def get_user_preferences(user_id: str) -> Preferences:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{BASE_URL}/user_settings",
                headers=HEADERS,
                params={"user_id": f"eq.{user_id}", "select": "auto_transcribe"},
            )
            if resp.status_code == 200:
                rows = resp.json()
                if rows:
                    return Preferences(auto_transcribe=rows[0].get("auto_transcribe", True))
    except Exception as e:
        print(f"[PREFS] read failed for {user_id}: {e}")
    return Preferences()


@router.get("")
async def read_preferences(user=Depends(get_current_user)):
    return (await get_user_preferences(user["id"])).model_dump()


@router.put("")
async def update_preferences(prefs: Preferences, user=Depends(get_current_user)):
    user_id = user["id"]
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{BASE_URL}/user_settings",
            headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
            json={"user_id": user_id, "auto_transcribe": prefs.auto_transcribe},
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"Upsert failed: {resp.text[:200]}")
    return prefs.model_dump()
