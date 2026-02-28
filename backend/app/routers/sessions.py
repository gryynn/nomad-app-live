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


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session detail with embedded tags, notes, and marks"""
    try:
        async with httpx.AsyncClient() as client:
            # Fetch session with embedded related data
            response = await client.get(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={
                    "id": f"eq.{session_id}",
                    "select": "*",
                },
            )
            response.raise_for_status()
            sessions = response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            session = sessions[0]

            # Fetch related tags via junction table (handle gracefully if table doesn't exist)
            try:
                tags_response = await client.get(
                    f"{BASE_URL}/nomad_session_tags",
                    headers=HEADERS,
                    params={
                        "session_id": f"eq.{session_id}",
                        "select": "tag:nomad_tags(*)",
                    },
                )
                if tags_response.status_code == 200:
                    tag_data = tags_response.json()
                    session["tags"] = [item["tag"] for item in tag_data if item.get("tag")]
                else:
                    session["tags"] = []
            except Exception:
                session["tags"] = []

            # Fetch related notes (handle gracefully if table doesn't exist)
            try:
                notes_response = await client.get(
                    f"{BASE_URL}/nomad_notes",
                    headers=HEADERS,
                    params={
                        "session_id": f"eq.{session_id}",
                        "select": "*",
                        "order": "created_at.asc",
                    },
                )
                if notes_response.status_code == 200:
                    session["notes"] = notes_response.json()
                else:
                    session["notes"] = []
            except Exception:
                session["notes"] = []

            # Fetch related marks (handle gracefully if table doesn't exist)
            try:
                marks_response = await client.get(
                    f"{BASE_URL}/nomad_marks",
                    headers=HEADERS,
                    params={
                        "session_id": f"eq.{session_id}",
                        "select": "*",
                        "order": "time.asc",
                    },
                )
                if marks_response.status_code == 200:
                    session["marks"] = marks_response.json()
                else:
                    session["marks"] = []
            except Exception:
                session["marks"] = []

            return session
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch session")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, session_update: SessionUpdate):
    """Update session fields"""
    try:
        # Build update data from provided fields
        update_data = {}
        if session_update.title is not None:
            update_data["title"] = session_update.title
        if session_update.status is not None:
            update_data["status"] = session_update.status

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        async with httpx.AsyncClient() as client:
            # Update the session
            response = await client.patch(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}"},
                json=update_data,
            )
            response.raise_for_status()
            updated_sessions = response.json()

            if not updated_sessions or len(updated_sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            return updated_sessions[0]
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to update session")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str):
    """Delete a session"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if session exists first
            check_response = await client.get(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            # Delete the session
            response = await client.delete(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}"},
            )
            response.raise_for_status()

            return None
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to delete session")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{session_id}/marks", response_model=MarkResponse, status_code=201)
async def add_mark_to_session(session_id: str, mark: MarkCreate):
    """Add a timestamp mark to a session"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if session exists first
            check_response = await client.get(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            # Prepare mark data for insertion
            mark_data = {
                "session_id": session_id,
                "time": mark.time,
            }

            # Add optional label if provided
            if mark.label is not None:
                mark_data["label"] = mark.label

            # Insert the mark
            response = await client.post(
                f"{BASE_URL}/nomad_marks",
                headers=HEADERS,
                json=mark_data,
            )
            response.raise_for_status()

            created_mark = response.json()
            if isinstance(created_mark, list) and len(created_mark) > 0:
                created_mark = created_mark[0]

            return created_mark
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to create mark")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{session_id}/notes", response_model=NoteResponse, status_code=201)
async def add_note_to_session(session_id: str, note: NoteCreate):
    """Add a text note to a session"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if session exists first
            check_response = await client.get(
                f"{BASE_URL}/nomad_sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            # Prepare note data for insertion
            note_data = {
                "session_id": session_id,
                "content": note.content,
                "type": note.type,
            }

            # Insert the note
            response = await client.post(
                f"{BASE_URL}/nomad_notes",
                headers=HEADERS,
                json=note_data,
            )
            response.raise_for_status()

            created_note = response.json()
            if isinstance(created_note, list) and len(created_note) > 0:
                created_note = created_note[0]

            return created_note
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to create note")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
