import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.models.schemas import (
    TagResponse,
    TagCreate,
    TagUpdate,
    TagAssociation,
)

# Supabase REST API configuration
HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "n8n_transcription",
    "Content-Profile": "n8n_transcription",
}

BASE_URL = f"{SUPABASE_URL}/rest/v1"

router = APIRouter(prefix="/api/tags", tags=["tags"])
