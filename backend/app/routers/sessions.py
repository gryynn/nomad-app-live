import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Depends, Response
from typing import Optional, List
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, PUBLIC_BACKEND_URL
from app.auth import get_current_user
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


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(session: SessionCreate, user=Depends(get_current_user)):
    """Create a new recording session"""
    try:
        session_data = {
            "input_mode": session.input_mode,
            "status": "pending",
            "user_id": user["id"],
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
        if session.recorded_at is not None:
            session_data["recorded_at"] = session.recorded_at
        if session.transcript is not None:
            session_data["transcript"] = session.transcript
            session_data["transcript_words"] = len(session.transcript.split())
            session_data["status"] = "transcribed"

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
        print(f"Supabase error: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Failed to create session: {e.response.text}")
    except Exception as e:
        print(f"Create session error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    input_mode: Optional[str] = None,
    created_after: Optional[str] = None,
    created_before: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    resp: Response = None,
    user=Depends(get_current_user),
):
    """List sessions with optional filters"""
    try:
        params = {
            "select": "*",
            # Sort by `recorded_at` (when the audio was actually recorded) instead of
            # `created_at` (when the DB row was inserted, which can lag for S26 imports).
            # `nullslast` keeps the 3 sessions missing a recorded_at at the bottom.
            "order": "recorded_at.desc.nullslast,created_at.desc",
            "limit": limit,
            "offset": offset,
            "user_id": f"eq.{user['id']}",
        }

        if status:
            params["status"] = f"eq.{status}"
        if search:
            params["title"] = f"ilike.*{search}*"
        if input_mode:
            params["input_mode"] = f"eq.{input_mode}"
        if created_after and created_before:
            params["and"] = f"(created_at.gte.{created_after},created_at.lte.{created_before})"
        elif created_after:
            params["created_at"] = f"gte.{created_after}"
        elif created_before:
            params["created_at"] = f"lte.{created_before}"

        async with httpx.AsyncClient() as client:
            # Tag filter. Two forms:
            #   * `tag=__none__` — reserved value: sessions with NO row in
            #     session_tags (the "untagged backlog" filter).
            #   * `tag=<id>[,<id>…]` — the existing positive filter.
            if tag == "__none__":
                tag_resp = await client.get(
                    f"{BASE_URL}/session_tags",
                    headers=HEADERS,
                    params={"select": "session_id"},
                )
                tag_resp.raise_for_status()
                tagged_ids = sorted({r["session_id"] for r in tag_resp.json()})
                if tagged_ids:
                    params["id"] = f"not.in.({','.join(tagged_ids)})"
                # No tagged sessions → every session is untagged, no id filter.
            elif tag:
                tag_ids = [t.strip() for t in tag.split(",")]
                tag_param = f"eq.{tag_ids[0]}" if len(tag_ids) == 1 else f"in.({','.join(tag_ids)})"
                tag_resp = await client.get(
                    f"{BASE_URL}/session_tags",
                    headers=HEADERS,
                    params={"tag_id": tag_param, "select": "session_id"},
                )
                tag_resp.raise_for_status()
                ids = list(set(r["session_id"] for r in tag_resp.json()))
                if not ids:
                    if resp is not None:
                        resp.headers["X-Total-Count"] = "0"
                    return []
                params["id"] = f"in.({','.join(ids)})"

            # Total matching count (for the "N résultats" indicator). Same
            # filters, minus pagination, via PostgREST's count=exact header.
            if resp is not None:
                try:
                    count_params = {
                        k: v for k, v in params.items()
                        if k not in ("limit", "offset", "order", "select")
                    }
                    count_params["select"] = "id"
                    count_resp = await client.get(
                        f"{BASE_URL}/sessions",
                        headers={**HEADERS, "Prefer": "count=exact"},
                        params=count_params,
                    )
                    content_range = count_resp.headers.get("Content-Range", "")
                    if "/" in content_range:
                        resp.headers["X-Total-Count"] = content_range.split("/")[1]
                except Exception:
                    pass  # count is best-effort; never break the list

            response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params=params,
            )
            response.raise_for_status()
            sessions = response.json()

            # Batch-fetch tags for all returned sessions
            if sessions:
                session_ids = [s["id"] for s in sessions]
                ids_param = ",".join(session_ids)
                tags_resp = await client.get(
                    f"{BASE_URL}/session_tags",
                    headers=HEADERS,
                    params={
                        "session_id": f"in.({ids_param})",
                        "select": "session_id,tag:tags(*)",
                    },
                )
                if tags_resp.status_code == 200:
                    tag_map = {}
                    for item in tags_resp.json():
                        sid = item["session_id"]
                        if item.get("tag"):
                            tag_map.setdefault(sid, []).append(item["tag"])
                    for s in sessions:
                        s["tags"] = tag_map.get(s["id"], [])

            # Compute a virtual audio_url for sessions that only have a
            # storage_key (post-2026-05-19 backfill + watcher-ingested rows).
            # Clients still consume `audio_url` as-is, no change required.
            for s in sessions:
                if not s.get("audio_url") and s.get("storage_key"):
                    s["audio_url"] = f"{PUBLIC_BACKEND_URL}/api/audio/{s['id']}"

            return sessions
    except httpx.HTTPStatusError as e:
        print(f"List sessions Supabase error: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Failed to fetch sessions: {e.response.text}")
    except httpx.ConnectError:
        print("List sessions: cannot connect to Supabase")
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        print(f"List sessions error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {type(e).__name__}: {str(e)}")


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, user=Depends(get_current_user)):
    """Get session detail with embedded tags and notes"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={
                    "id": f"eq.{session_id}",
                    "user_id": f"eq.{user['id']}",
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

            # Virtual audio_url for sessions with storage_key only (see list_sessions).
            if not session.get("audio_url") and session.get("storage_key"):
                session["audio_url"] = f"{PUBLIC_BACKEND_URL}/api/audio/{session['id']}"

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
async def update_session(session_id: str, session_update: SessionUpdate, user=Depends(get_current_user)):
    """Update session fields"""
    try:
        update_data = session_update.model_dump(exclude_none=True)

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user['id']}"},
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
async def delete_session(session_id: str, user=Depends(get_current_user)):
    """Delete a session (hard delete for MVP)"""
    try:
        async with httpx.AsyncClient() as client:
            # Verify ownership before deleting
            check = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user['id']}", "select": "id"},
            )
            if not check.json():
                raise HTTPException(status_code=404, detail="Session not found")
            # Delete session_tags first (junction table)
            await client.delete(
                f"{BASE_URL}/session_tags",
                headers=HEADERS,
                params={"session_id": f"eq.{session_id}"},
            )

            # Delete notes
            await client.delete(
                f"{BASE_URL}/notes",
                headers=HEADERS,
                params={"session_id": f"eq.{session_id}"},
            )

            # Delete session
            response = await client.delete(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}"},
            )
            response.raise_for_status()

            return None
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        print(f"Delete error: {e.response.status_code} {e.response.text}")
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Session not found")
        raise HTTPException(status_code=e.response.status_code, detail=f"Failed to delete session: {e.response.text}")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        print(f"Delete exception: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{session_id}/marks", status_code=201)
async def add_mark_to_session(session_id: str, mark: MarkCreate, user=Depends(get_current_user)):
    """Add a timestamp mark to a session (appends to JSONB marks array)"""
    try:
        async with httpx.AsyncClient() as client:
            # Fetch current session to get existing marks (with ownership check)
            response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={
                    "id": f"eq.{session_id}",
                    "user_id": f"eq.{user['id']}",
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
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user['id']}"},
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
async def add_note_to_session(session_id: str, note: NoteCreate, user=Depends(get_current_user)):
    """Add a text note to a session"""
    try:
        async with httpx.AsyncClient() as client:
            check_response = await client.get(
                f"{BASE_URL}/sessions",
                headers=HEADERS,
                params={"id": f"eq.{session_id}", "user_id": f"eq.{user['id']}", "select": "id"},
            )
            check_response.raise_for_status()
            sessions = check_response.json()
            if not sessions:
                raise HTTPException(status_code=404, detail="Session not found")

            response = await client.post(
                f"{BASE_URL}/notes",
                headers=HEADERS,
                json={"session_id": session_id, "user_id": user["id"], "content": note.content},
            )
            response.raise_for_status()
            created_note = response.json()
            if isinstance(created_note, list) and len(created_note) > 0:
                created_note = created_note[0]
            return created_note
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{session_id}/notes", response_model=NoteResponse)
async def replace_notes(session_id: str, note: NoteCreate, user=Depends(get_current_user)):
    """Replace all notes for a session with a single note"""
    try:
        async with httpx.AsyncClient() as client:
            # Delete existing notes (scoped to session owned by user)
            await client.delete(
                f"{BASE_URL}/notes",
                headers=HEADERS,
                params={"session_id": f"eq.{session_id}"},
            )
            # Create single new note
            response = await client.post(
                f"{BASE_URL}/notes",
                headers=HEADERS,
                json={"session_id": session_id, "user_id": user["id"], "content": note.content},
            )
            response.raise_for_status()
            created_note = response.json()
            if isinstance(created_note, list) and len(created_note) > 0:
                created_note = created_note[0]
            return created_note
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")
