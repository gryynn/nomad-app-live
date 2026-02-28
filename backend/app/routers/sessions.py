import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.models.schemas import (
    SessionResponse,
    SessionCreate,
    SessionUpdate,
    MarkCreate,
    NoteCreate,
    NoteResponse,
)

# Supabase REST API configuration
HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}

BASE_URL = f"{SUPABASE_URL}/rest/v1"

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse, status_code=201)
async def create_session(session: SessionCreate):
    """Create a new recording session"""
    try:
        session_data = {
            "input_mode": session.input_mode,
            "status": "pending",
        }

        if session.title is not None:
            session_data["title"] = session.title
        if session.duration_seconds is not None:
            session_data["duration_seconds"] = session.duration_seconds
        if session.audio_url is not None:
            session_data["audio_url"] = session.audio_url
        if session.original_filename is not None:
            session_data["original_filename"] = session.original_filename
        if session.file_size_bytes is not None:
            session_data["file_size_bytes"] = session.file_size_bytes
        if session.mix_mode != "mono":
            session_data["mix_mode"] = session.mix_mode
        if session.language != "fr":
            session_data["language"] = session.language
        if session.engine_used is not None:
            session_data["engine_used"] = session.engine_used
        if session.offline_created:
            session_data["offline_created"] = True

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/sessions",
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
        params = {
            "select": "*",
            "order": "created_at.desc",
            "limit": limit,
            "offset": offset,
        }

        if status:
            params["status"] = f"eq.{status}"
        if search:
            params["title"] = f"ilike.*{search}*"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/sessions",
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
    """Get session detail with embedded tags and notes"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/sessions",
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

            # Fetch related tags via junction table
            try:
                tags_response = await client.get(
                    f"{BASE_URL}/session_tags",
                    headers=HEADERS,
                    params={
                        "session_id": f"eq.{session_id}",
                        "select": "tag:tags(*)",
                    },
                )
                if tags_response.status_code == 200:
                    tag_data = tags_response.json()
                    session["tags"] = [item["tag"] for item in tag_data if item.get("tag")]
                else:
                    session["tags"] = []
            except Exception:
                session["tags"] = []

            # Fetch related notes
            try:
                notes_response = await client.get(
                    f"{BASE_URL}/notes",
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

            # marks is already a JSONB column on sessions — no separate fetch needed

            return session
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch session")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: str, session_update: SessionUpdate):
    """Update session fields"""
    try:
        update_data = session_update.model_dump(exclude_none=True)

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{BASE_URL}/sessions",
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
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str):
    """Soft-delete a session (set deleted_at)"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if session exists
            check_response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            # Soft delete: set deleted_at timestamp
            response = await client.patch(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}"},
                json={"deleted_at": "now()"},
            )
            response.raise_for_status()

            return None
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to delete session")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{session_id}/marks", status_code=201)
async def add_mark_to_session(session_id: str, mark: MarkCreate):
    """Add a timestamp mark to a session (appends to JSONB marks array)"""
    try:
        async with httpx.AsyncClient() as client:
            # Fetch current session to get existing marks
            response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={
                    "id": f"eq.{session_id}",
                    "select": "id,marks",
                },
            )
            response.raise_for_status()
            sessions = response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            current_marks = sessions[0].get("marks") or []

            # Append new mark to JSONB array
            new_mark = {"time": mark.time}
            if mark.label is not None:
                new_mark["label"] = mark.label
            current_marks.append(new_mark)

            # Update session with new marks array
            update_response = await client.patch(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}"},
                json={"marks": current_marks},
            )
            update_response.raise_for_status()

            return new_mark
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to add mark")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{session_id}/notes", response_model=NoteResponse, status_code=201)
async def add_note_to_session(session_id: str, note: NoteCreate):
    """Add a text note to a session"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if session exists
            check_response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()

            if not sessions or len(sessions) == 0:
                raise HTTPException(status_code=404, detail="Session not found")

            note_data = {
                "session_id": session_id,
                "content": note.content,
            }

            response = await client.post(
                f"{BASE_URL}/notes",
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
        raise HTTPException(status_code=e.response.status_code, detail="Failed to create note")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
