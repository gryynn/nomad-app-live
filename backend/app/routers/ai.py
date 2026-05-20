"""AI processing on sessions via prompt templates.

Endpoints:
- POST /api/ai/process { session_id, template_id } — enqueue manual job
- GET /api/ai/outputs?session_id=… — list outputs for a session
- PATCH /api/ai/outputs/{id} { output_text_edited } — user edits
- DELETE /api/ai/outputs/{id}
- POST /api/ai/outputs/{id}/rerun — re-run with the same template

Auto-trigger from transcribe.py imports `enqueue_ai_for_session(session_id, user_id, trigger_source='auto_tag')`.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional, List
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.routers.preferences import resolve_api_key
from app.services.ai_chat_service import chat, OpenRouterError, OpenRouterMissingKey


router = APIRouter(prefix="/ai", tags=["ai"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"


class ProcessRequest(BaseModel):
    session_id: UUID
    template_id: UUID


class AIOutputOut(BaseModel):
    id: UUID
    session_id: UUID
    template_id: Optional[UUID]
    template_name_snapshot: Optional[str]
    prompt_snapshot: Optional[str]
    model: str
    output_text: Optional[str]
    output_text_edited: Optional[str]
    status: str
    trigger_source: str
    error_message: Optional[str]
    tokens_input: Optional[int]
    tokens_output: Optional[int]
    created_at: str
    updated_at: str
    completed_at: Optional[str]


class AIOutputPatch(BaseModel):
    output_text_edited: Optional[str] = Field(default=None)


def _format_segments(segments: list[dict[str, Any]] | None) -> str:
    """Format diarized segments as 'Speaker X (mm:ss): text' lines."""
    if not segments:
        return ""
    lines: list[str] = []
    last_speaker = None
    for seg in segments:
        speaker = seg.get("speaker")
        start = seg.get("start") or seg.get("start_ts") or 0.0
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        mm = int(start // 60)
        ss = int(start % 60)
        if speaker is not None and speaker != last_speaker:
            lines.append(f"\n**Locuteur {speaker}** ({mm:02d}:{ss:02d})")
            last_speaker = speaker
        lines.append(text)
    return "\n".join(lines).strip()


async def _load_session_context(session_id: str, user_id: str) -> dict[str, Any]:
    """Pull transcript, segments, marks, notes, tags for the AI prompt."""
    async with httpx.AsyncClient(timeout=8.0) as client:
        sess_resp = await client.get(
            f"{BASE_URL}/sessions",
            headers=HEADERS,
            params={
                "id": f"eq.{session_id}",
                "user_id": f"eq.{user_id}",
                "select": "id,title,transcript,transcript_segments,marks,recorded_at,duration_seconds",
            },
        )
        if sess_resp.status_code != 200 or not sess_resp.json():
            raise HTTPException(status_code=404, detail="session not found")
        session = sess_resp.json()[0]

        notes_resp = await client.get(
            f"{BASE_URL}/notes",
            headers=HEADERS,
            params={
                "session_id": f"eq.{session_id}",
                "user_id": f"eq.{user_id}",
                "select": "content,created_at",
                "order": "created_at.asc",
            },
        )
        notes = notes_resp.json() if notes_resp.status_code == 200 else []

    return {"session": session, "notes": notes}


def _build_user_message(prompt_text: str, ctx: dict[str, Any]) -> str:
    session = ctx["session"]
    notes = ctx["notes"]
    parts: list[str] = [prompt_text.strip(), "", "---", ""]

    title = (session.get("title") or "").strip()
    if title:
        parts.append(f"# Session : {title}")
        parts.append("")

    segs = session.get("transcript_segments")
    seg_text = _format_segments(segs)
    if seg_text:
        parts.append("## Transcription (par locuteur)")
        parts.append(seg_text)
        parts.append("")
    else:
        transcript = (session.get("transcript") or "").strip()
        if transcript:
            parts.append("## Transcription")
            parts.append(transcript)
            parts.append("")

    marks = session.get("marks") or []
    if marks:
        parts.append("## Marques")
        for m in marks:
            ts = m.get("time") or m.get("ts") or 0
            label = (m.get("label") or m.get("text") or "").strip()
            mm = int(ts // 60)
            ss = int(ts % 60)
            parts.append(f"- {mm:02d}:{ss:02d} — {label}")
        parts.append("")

    if notes:
        parts.append("## Notes")
        for n in notes:
            parts.append(f"- {(n.get('content') or '').strip()}")
        parts.append("")

    return "\n".join(parts)


async def _update_output(output_id: str, fields: dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.patch(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={"id": f"eq.{output_id}"},
            json=fields,
        )


async def _create_output_row(*, output_id: str, session_id: str, template: dict[str, Any],
                              user_id: str, trigger_source: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            json={
                "id": output_id,
                "session_id": session_id,
                "template_id": template["id"],
                "template_name_snapshot": template.get("name"),
                "prompt_snapshot": template.get("prompt_text"),
                "model": template.get("model"),
                "status": "pending",
                "trigger_source": trigger_source,
                "user_id": user_id,
            },
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"output insert failed: {resp.text[:200]}")


async def _run_ai_job(output_id: str, session_id: str, template: dict[str, Any], user_id: str) -> None:
    """Background task. Owns the lifecycle of one AI output row."""
    try:
        await _update_output(output_id, {"status": "running"})
        ctx = await _load_session_context(session_id, user_id)
        user_message = _build_user_message(template.get("prompt_text") or "", ctx)
        api_key = await resolve_api_key(user_id, "openrouter")
        result = await chat(
            api_key=api_key,
            model=template.get("model") or "anthropic/claude-sonnet-4-6",
            system=None,
            user_message=user_message,
        )
        await _update_output(output_id, {
            "status": "done",
            "output_text": result["text"],
            "tokens_input": result.get("tokens_input"),
            "tokens_output": result.get("tokens_output"),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
    except OpenRouterMissingKey as e:
        await _update_output(output_id, {"status": "error", "error_message": str(e)})
    except OpenRouterError as e:
        await _update_output(output_id, {"status": "error", "error_message": str(e)[:500]})
    except Exception as e:
        await _update_output(output_id, {"status": "error", "error_message": f"{type(e).__name__}: {e}"[:500]})


async def _fetch_template(template_id: str, user_id: str) -> Optional[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/prompt_templates",
            headers=HEADERS,
            params={
                "id": f"eq.{template_id}",
                "user_id": f"eq.{user_id}",
                "select": "id,name,prompt_text,model,auto_trigger_tag_ids,enabled",
            },
        )
        if resp.status_code != 200:
            return None
        rows = resp.json()
        return rows[0] if rows else None


async def enqueue_ai_for_session(
    *, session_id: str, user_id: str, template: dict[str, Any], trigger_source: str = "manual"
) -> str:
    """Public helper used by both the HTTP router and the auto-trigger hook
    in transcribe.py. Returns the new output id."""
    output_id = str(uuid4())
    await _create_output_row(
        output_id=output_id,
        session_id=session_id,
        template=template,
        user_id=user_id,
        trigger_source=trigger_source,
    )
    asyncio.create_task(_run_ai_job(output_id, session_id, template, user_id))
    return output_id


@router.post("/process", response_model=AIOutputOut, status_code=202)
async def process(req: ProcessRequest, user=Depends(get_current_user)):
    template = await _fetch_template(str(req.template_id), user["id"])
    if not template:
        raise HTTPException(status_code=404, detail="template not found")
    if not template.get("enabled", True):
        raise HTTPException(status_code=400, detail="template disabled")
    output_id = await enqueue_ai_for_session(
        session_id=str(req.session_id),
        user_id=user["id"],
        template=template,
        trigger_source="manual",
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={"id": f"eq.{output_id}", "select": "*"},
        )
        return resp.json()[0]


@router.get("/outputs", response_model=List[AIOutputOut])
async def list_outputs(session_id: UUID, user=Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={
                "session_id": f"eq.{session_id}",
                "user_id": f"eq.{user['id']}",
                "select": "*",
                "order": "created_at.desc",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"list failed: {resp.text[:200]}")
        return resp.json()


@router.patch("/outputs/{output_id}", response_model=AIOutputOut)
async def patch_output(output_id: UUID, body: AIOutputPatch, user=Depends(get_current_user)):
    if body.output_text_edited is None:
        raise HTTPException(status_code=400, detail="output_text_edited required")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.patch(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={
                "id": f"eq.{output_id}",
                "user_id": f"eq.{user['id']}",
            },
            json={"output_text_edited": body.output_text_edited},
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"patch failed: {resp.text[:200]}")
        rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="output not found")
        return rows[0]


@router.delete("/outputs/{output_id}", status_code=204)
async def delete_output(output_id: UUID, user=Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={
                "id": f"eq.{output_id}",
                "user_id": f"eq.{user['id']}",
            },
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"delete failed: {resp.text[:200]}")


@router.post("/outputs/{output_id}/rerun", response_model=AIOutputOut, status_code=202)
async def rerun_output(output_id: UUID, user=Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={
                "id": f"eq.{output_id}",
                "user_id": f"eq.{user['id']}",
                "select": "session_id,template_id",
            },
        )
        if resp.status_code != 200 or not resp.json():
            raise HTTPException(status_code=404, detail="output not found")
        row = resp.json()[0]
    template = await _fetch_template(row["template_id"], user["id"]) if row.get("template_id") else None
    if not template:
        raise HTTPException(status_code=400, detail="original template deleted, cannot rerun")
    new_id = await enqueue_ai_for_session(
        session_id=row["session_id"],
        user_id=user["id"],
        template=template,
        trigger_source="manual",
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/session_ai_outputs",
            headers=HEADERS,
            params={"id": f"eq.{new_id}", "select": "*"},
        )
        return resp.json()[0]
