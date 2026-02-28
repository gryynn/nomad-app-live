import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.models.schemas import (
    SessionResponse,
    SessionCreate,
    SessionUpdate,
    MarkCreate,
    MarkResponse,
    NoteCreate,
    NoteResponse,
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

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse, status_code=201)
async def create_session(session: SessionCreate):
    """Create a new recording session"""
    try:
        # Prepare session data for insertion
        session_data = {
            "duration": session.duration,
            "input_mode": session.input_mode,
            "status": "processing",  # Default status for new sessions
        }

        # Add optional fields if provided
        if session.title is not None:
            session_data["title"] = session.title
        if session.content is not None:
            session_data["content"] = session.content
        if session.transcribe is not None:
            session_data["transcribe"] = session.transcribe
        if session.engine is not None:
            session_data["engine"] = session.engine

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                json=session_data,
            )
            response.raise_for_status()

            created_session = response.json()
            if isinstance(created_session, list) and len(created_session) > 0:
                created_session = created_session[0]

            return created_session
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to create session")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/", response_model=List[SessionResponse])
async def list_sessions(
    status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List sessions with optional filters"""
    try:
        # Build query parameters
        params = {
            "select": "*",
            "order": "created_at.desc",
            "limit": limit,
            "offset": offset,
        }

        # Add filters if provided
        if status:
            params["status"] = f"eq.{status}"
        if search:
            params["title"] = f"ilike.*{search}*"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params=params,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch sessions")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
