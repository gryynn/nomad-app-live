"""NOMAD MCP server — exposes the REST API as Model Context Protocol tools.

Run with:
  NOMAD_API_URL=https://nomad-api.mgdesign.cloud \
  NOMAD_API_TOKEN=<bearer> \
  uv run python -m mcp.server

Designed to be hosted as a stdio MCP server (Claude Desktop config), the
same way ticktick-mcp / supabase-mcp are wired today.

Tool surface mirrors README.md. Each tool just shapes the REST response so
the calling LLM gets stable JSON.
"""
from __future__ import annotations

import os
import sys
from typing import Any, Optional

import httpx
from mcp.server.fastmcp import FastMCP


API_URL = os.environ.get("NOMAD_API_URL", "https://nomad-api.mgdesign.cloud").rstrip("/")
API_TOKEN = os.environ.get("NOMAD_API_TOKEN", "")
if not API_TOKEN:
    print("NOMAD_API_TOKEN env var required", file=sys.stderr)
    sys.exit(2)

HEADERS = {"Authorization": f"Bearer {API_TOKEN}"}


mcp = FastMCP("nomad")


async def _get(path: str, **params) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{API_URL}{path}", headers=HEADERS, params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, json: dict) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API_URL}{path}", headers=HEADERS, json=json)
        r.raise_for_status()
        return r.json() if r.text else {}


async def _put(path: str, json: dict) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.put(f"{API_URL}{path}", headers=HEADERS, json=json)
        r.raise_for_status()
        return r.json() if r.text else {}


@mcp.tool()
async def list_sessions(
    limit: int = 20,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    since: Optional[str] = None,
    input_mode: Optional[str] = None,
) -> list[dict]:
    """List recent NOMAD sessions. `since` is an ISO date for created_after.
    `tag` accepts comma-separated tag IDs.
    """
    params: dict[str, Any] = {"limit": limit}
    if status:
        params["status"] = status
    if tag:
        params["tag"] = tag
    if search:
        params["search"] = search
    if since:
        params["created_after"] = since
    if input_mode:
        params["input_mode"] = input_mode
    return await _get("/api/sessions", **params)


@mcp.tool()
async def get_session(session_id: str) -> dict:
    """Fetch a single session with embedded tags, notes, marks."""
    return await _get(f"/api/sessions/{session_id}")


@mcp.tool()
async def update_session(session_id: str, patch: dict) -> dict:
    """Patch session fields (title, notes, transcript, status, etc.)."""
    return await _put(f"/api/sessions/{session_id}", patch)


@mcp.tool()
async def add_note(session_id: str, content: str) -> dict:
    """Append a note to a session. Used for AI-generated summaries / action
    items / follow-up reflections from the agent."""
    return await _post(f"/api/sessions/{session_id}/notes", {"content": content})


@mcp.tool()
async def add_mark(session_id: str, time_ms: int, label: Optional[str] = None) -> dict:
    """Drop a mark on the audio timeline. `time_ms` is the audio offset."""
    body = {"time": time_ms / 1000.0}
    if label:
        body["label"] = label
    return await _post(f"/api/sessions/{session_id}/marks", body)


@mcp.tool()
async def list_tags() -> list[dict]:
    """List all tags with emoji, hue, and session_count."""
    return await _get("/api/tags")


@mcp.tool()
async def set_tags(session_id: str, tag_names: list[str]) -> dict:
    """Resolve tag names to ids (create missing ones) and apply them to a
    session, replacing the existing set."""
    existing = await list_tags()
    by_name = {t["name"].lower(): t for t in existing}
    ids: list[str] = []
    async with httpx.AsyncClient(timeout=30) as c:
        for raw in tag_names:
            name = raw.strip().lower()
            tag = by_name.get(name)
            if tag is None:
                r = await c.post(f"{API_URL}/api/tags", headers=HEADERS, json={"name": name})
                r.raise_for_status()
                tag = r.json()
            ids.append(tag["id"])
        r = await c.put(
            f"{API_URL}/api/sessions/{session_id}/tags",
            headers=HEADERS,
            json={"tag_ids": ids},
        )
        r.raise_for_status()
    return {"session_id": session_id, "tag_ids": ids}


@mcp.tool()
async def transcribe(session_id: str, engine: str = "auto") -> dict:
    """Trigger transcription for a session. `engine` ∈ {auto, groq-turbo,
    groq-large, deepgram, wynona}."""
    return await _post(f"/api/transcribe/{session_id}", {"engine": engine})


@mcp.tool()
async def list_attachments(session_id: str) -> list[dict]:
    """List photos / screenshots tied to a session."""
    return await _get(f"/api/sessions/{session_id}/attachments")


if __name__ == "__main__":
    mcp.run()
