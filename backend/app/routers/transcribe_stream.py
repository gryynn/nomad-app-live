"""WebSocket proxy: client <-> backend <-> Deepgram nova-2 real-time STT.

Client opens `ws://nomad-api/api/transcribe/stream/{session_id}` with the
usual Bearer auth (passed as query string `?token=…` since browsers can't set
WebSocket headers natively). The backend opens a parallel WS to Deepgram and
bridges frames in both directions:

  Client → backend  : raw binary audio (PCM16 16 kHz mono recommended) +
                      optional control messages (type=close, type=keepalive).
  Backend → Deepgram: same binary frames untouched (Deepgram auto-detects
                      the format from query params).
  Deepgram → backend: JSON `Results` / `SpeechStarted` / `UtteranceEnd` /
                      `Metadata` frames.
  Backend → client  : same JSON forwarded verbatim so the client can render
                      `is_final=false` as live preview and append
                      `is_final=true` segments to the session transcript.

When the client disconnects we flush Deepgram and store the concatenated
final transcript on `app_nomad.sessions.transcript` via Supabase REST, so a
LIVE recording that survives the round-trip ends up with a transcript even
if the client crashed mid-stream.

Gated behind `STREAMING_ENABLED=true` in backend/.env until the client side
encoders are shipped.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Optional

import httpx
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import APP_JWT_SECRET
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.routers.preferences import resolve_api_key
import jwt


router = APIRouter(prefix="/transcribe", tags=["streaming"])

STREAMING_ENABLED = os.environ.get("STREAMING_ENABLED", "false").lower() == "true"
DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2"
    "&language=fr"
    "&punctuate=true"
    "&interim_results=true"
    "&smart_format=true"
    "&encoding=linear16"
    "&sample_rate=16000"
    "&channels=1"
)

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}


def _verify_token(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        return jwt.decode(token, APP_JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        pass
    # Fall back to Supabase JWT secret (mobile Bearer = Supabase access_token).
    supabase_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    if supabase_secret:
        try:
            return jwt.decode(
                token, supabase_secret, algorithms=["HS256"], audience="authenticated"
            )
        except jwt.InvalidTokenError:
            pass
    return None


async def _persist_transcript(session_id: str, text: str) -> None:
    if not text.strip():
        return
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/sessions?id=eq.{session_id}",
                headers=SUPABASE_HEADERS,
                json={
                    "transcript": text.strip(),
                    "status": "transcribed",
                    "engine_used": "deepgram-stream",
                },
            )
        except Exception as e:
            print(f"[STREAM] persist failed for {session_id}: {e}")


@router.websocket("/stream/{session_id}")
async def stream(websocket: WebSocket, session_id: str):
    # Auth via query string — browsers can't set headers on the WS handshake.
    token = websocket.query_params.get("token")
    user = _verify_token(token)
    if not user:
        await websocket.close(code=4401)
        return

    await websocket.accept()

    if not STREAMING_ENABLED:
        await websocket.send_json({
            "type": "error",
            "code": "streaming_disabled",
            "detail": "Set STREAMING_ENABLED=true in backend/.env",
        })
        await websocket.close(code=1011)
        return

    # Resolve the caller's Deepgram key (user-stored DB key → env fallback).
    user_id = user.get("sub") or user.get("id")
    deepgram_key = await resolve_api_key(user_id, "deepgram") if user_id else None
    if not deepgram_key:
        await websocket.send_json({
            "type": "error",
            "code": "deepgram_key_missing",
            "detail": "No Deepgram API key configured (DB user_settings or DEEPGRAM_API_KEY env)",
        })
        await websocket.close(code=1011)
        return

    finals: list[str] = []

    try:
        async with websockets.connect(
            DEEPGRAM_WS_URL,
            additional_headers={"Authorization": f"Token {deepgram_key}"},
            max_size=2**24,
        ) as dg:
            async def client_to_dg():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in msg and msg["bytes"]:
                            await dg.send(msg["bytes"])
                        elif "text" in msg and msg["text"]:
                            # Control messages from the client (e.g. flush).
                            try:
                                payload = json.loads(msg["text"])
                                if payload.get("type") == "close":
                                    break
                            except Exception:
                                pass
                except WebSocketDisconnect:
                    pass
                finally:
                    # Tell Deepgram we're done so it returns any final frames.
                    try:
                        await dg.send(json.dumps({"type": "CloseStream"}))
                    except Exception:
                        pass

            async def dg_to_client():
                async for raw in dg:
                    try:
                        payload = json.loads(raw)
                    except Exception:
                        continue
                    alt = (
                        payload.get("channel", {})
                        .get("alternatives", [{}])[0]
                        .get("transcript")
                    )
                    if payload.get("is_final") and alt:
                        finals.append(alt)
                    try:
                        await websocket.send_json(payload)
                    except Exception:
                        return

            await asyncio.gather(client_to_dg(), dg_to_client())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "detail": str(e)})
        except Exception:
            pass
    finally:
        # Persist whatever we got, even on early disconnect.
        await _persist_transcript(session_id, " ".join(finals))
        try:
            await websocket.close()
        except Exception:
            pass
