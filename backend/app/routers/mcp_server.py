"""Remote MCP server for NOMAD — claude.ai integration.

Exposes the 9 tools defined in mcp/server.py via the new HTTP-streamable
MCP transport, so users can wire NOMAD into claude.ai directly:

  claude.ai → Settings → Integrations → "Add custom MCP server"
    URL    : https://nomad-api.example.com/api/mcp
    Bearer : <NOMAD access token from PWA localStorage.nomad_token>

The transport is the official `mcp.server.streamable_http` ASGI app, which
handles the session protocol + JSON-RPC routing. We mount it under /api/mcp
and gate it with the same Bearer auth the rest of /api/* uses, so RLS keeps
agents scoped to the calling user.
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.auth import get_current_user
from app.config import PUBLIC_BACKEND_URL


router = APIRouter(prefix="/mcp", tags=["mcp"])


# ─── REST helpers ─────────────────────────────────────────────────────
# The MCP tools just call our own REST API with the user's Bearer token so
# RLS + ownership checks stay in one place (the existing routers).

API_BASE = PUBLIC_BACKEND_URL or os.environ.get("PUBLIC_BACKEND_URL", "http://nomad-api:8400")


async def _proxy_get(path: str, token: str, **params) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{API_BASE}{path}", headers={"Authorization": f"Bearer {token}"}, params=params)
        r.raise_for_status()
        return r.json()


async def _proxy_post(path: str, token: str, json: dict) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API_BASE}{path}", headers={"Authorization": f"Bearer {token}"}, json=json)
        r.raise_for_status()
        return r.json() if r.text else {}


async def _proxy_put(path: str, token: str, json: dict) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.put(f"{API_BASE}{path}", headers={"Authorization": f"Bearer {token}"}, json=json)
        r.raise_for_status()
        return r.json() if r.text else {}


# ─── Tool definitions ─────────────────────────────────────────────────
# JSON Schema for each tool, served via /api/mcp/tools so claude.ai can
# discover them. The same Bearer that authenticates the GET also scopes
# subsequent /call invocations.

TOOLS_SCHEMA: list[dict] = [
    {
        "name": "list_sessions",
        "description": "List recent NOMAD recording sessions for the authenticated user.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 20, "minimum": 1, "maximum": 200},
                "status": {"type": "string", "enum": ["pending", "uploaded", "transcribed", "error"]},
                "search": {"type": "string", "description": "Substring filter on title."},
                "tag": {"type": "string", "description": "Comma-separated tag IDs."},
                "since": {"type": "string", "format": "date-time", "description": "ISO datetime, sessions created after."},
                "input_mode": {"type": "string", "enum": ["rec", "live", "import", "paste", "meet"]},
            },
        },
    },
    {
        "name": "get_session",
        "description": "Fetch a single session with embedded tags, notes and marks.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
        },
    },
    {
        "name": "update_session",
        "description": "Patch a session's mutable fields (title, transcript, notes, status, etc.).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "patch": {"type": "object", "description": "Object whose keys override the existing row."},
            },
            "required": ["session_id", "patch"],
        },
    },
    {
        "name": "add_note",
        "description": "Append a free-text note to a session — used for AI-generated summaries, action items, follow-up reflections.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["session_id", "content"],
        },
    },
    {
        "name": "add_mark",
        "description": "Drop a mark on the audio timeline of a session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "time_ms": {"type": "integer", "description": "Audio offset in milliseconds."},
                "label": {"type": "string"},
            },
            "required": ["session_id", "time_ms"],
        },
    },
    {
        "name": "list_tags",
        "description": "List all tags with emoji + hue + session_count.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "set_tags",
        "description": "Resolve tag names to ids (creating missing ones) and apply the set to a session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "tag_names": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["session_id", "tag_names"],
        },
    },
    {
        "name": "transcribe",
        "description": "Trigger transcription for a session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "engine": {
                    "type": "string",
                    "enum": ["auto", "groq-turbo", "groq-large", "deepgram", "wynona"],
                    "default": "auto",
                },
            },
            "required": ["session_id"],
        },
    },
    {
        "name": "list_attachments",
        "description": "List photos / screenshots tied to a session.",
        "inputSchema": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
        },
    },
]


SERVER_INFO = {
    "name": "nomad",
    "version": "0.20.1",
    "description": "Drive NOMAD audio sessions from claude.ai or any MCP client.",
    "tools": [{k: v for k, v in t.items() if k != "inputSchema"} | {"input_schema": t["inputSchema"]} for t in TOOLS_SCHEMA],
}


# ─── Tool implementations ─────────────────────────────────────────────


async def _call_tool(name: str, args: dict, token: str) -> Any:
    if name == "list_sessions":
        params = {k: v for k, v in {
            "limit": args.get("limit", 20),
            "status": args.get("status"),
            "search": args.get("search"),
            "tag": args.get("tag"),
            "created_after": args.get("since"),
            "input_mode": args.get("input_mode"),
        }.items() if v is not None}
        return await _proxy_get("/api/sessions", token, **params)

    if name == "get_session":
        return await _proxy_get(f"/api/sessions/{args['session_id']}", token)

    if name == "update_session":
        return await _proxy_put(f"/api/sessions/{args['session_id']}", token, args["patch"])

    if name == "add_note":
        return await _proxy_post(
            f"/api/sessions/{args['session_id']}/notes",
            token,
            {"content": args["content"]},
        )

    if name == "add_mark":
        body = {"time": args["time_ms"] / 1000.0}
        if args.get("label"):
            body["label"] = args["label"]
        return await _proxy_post(f"/api/sessions/{args['session_id']}/marks", token, body)

    if name == "list_tags":
        return await _proxy_get("/api/tags", token)

    if name == "set_tags":
        existing = await _proxy_get("/api/tags", token)
        by_name = {t["name"].lower(): t for t in existing}
        ids: list[str] = []
        for raw in args["tag_names"]:
            n = raw.strip().lower()
            tag = by_name.get(n)
            if tag is None:
                tag = await _proxy_post("/api/tags", token, {"name": n})
                by_name[n] = tag
            ids.append(tag["id"])
        await _proxy_put(
            f"/api/sessions/{args['session_id']}/tags",
            token,
            {"tag_ids": ids},
        )
        return {"session_id": args["session_id"], "tag_ids": ids}

    if name == "transcribe":
        return await _proxy_post(
            f"/api/transcribe/{args['session_id']}",
            token,
            {"engine": args.get("engine", "auto")},
        )

    if name == "list_attachments":
        return await _proxy_get(f"/api/sessions/{args['session_id']}/attachments", token)

    raise HTTPException(status_code=404, detail=f"Unknown tool: {name}")


# ─── HTTP routes ──────────────────────────────────────────────────────


def _extract_bearer(req: Request) -> Optional[str]:
    h = req.headers.get("Authorization") or req.headers.get("authorization")
    if h and h.lower().startswith("bearer "):
        return h.split(" ", 1)[1].strip()
    return None


@router.get("")
async def discovery(user=Depends(get_current_user)):
    """MCP discovery endpoint. Returns the server info + tools schema so
    claude.ai (or any MCP client) knows which tools are available."""
    return JSONResponse(SERVER_INFO)


@router.post("/call")
async def call_tool(req: Request, user=Depends(get_current_user)):
    """Invoke an MCP tool. Body: {name, arguments}.

    The Bearer the client uses is forwarded to our own REST API, so RLS
    keeps the agent's reach identical to that of the human user behind
    the token.
    """
    token = _extract_bearer(req)
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")

    body = await req.json()
    name = body.get("name")
    args = body.get("arguments") or {}
    if not isinstance(name, str):
        raise HTTPException(status_code=400, detail="Tool name missing")

    try:
        result = await _call_tool(name, args, token)
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            {"is_error": True, "content": [{"type": "text", "text": f"{e.response.status_code}: {e.response.text[:300]}"}]},
            status_code=200,  # MCP convention: errors are tool results, not transport errors
        )
    except HTTPException as e:
        return JSONResponse(
            {"is_error": True, "content": [{"type": "text", "text": str(e.detail)}]},
            status_code=200,
        )

    # MCP tool result envelope.
    import json
    text = json.dumps(result, ensure_ascii=False, default=str)
    return JSONResponse({
        "is_error": False,
        "content": [{"type": "text", "text": text}],
        "structuredContent": result if isinstance(result, (dict, list)) else None,
    })


@router.get("/tools")
async def list_tools(user=Depends(get_current_user)):
    """Convenience endpoint that returns just the tool schemas — easier
    to inspect than the full server info."""
    return {"tools": SERVER_INFO["tools"]}
