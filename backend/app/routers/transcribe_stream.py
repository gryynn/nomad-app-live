"""WebSocket proxy for true-streaming transcription (Deepgram nova-2).

Status: V0 scaffold — accepts a client WS, forwards binary audio frames to
Deepgram's WS endpoint, forwards interim + final JSON results back. The full
LIVE pipeline integration (Flutter / PWA send raw PCM frames, recover from
disconnect, merge interim with final, store session.transcript on close)
lives in follow-up commits.

Design notes:
  - Client opens  ws://nomad-api/api/transcribe/stream/{session_id}
  - Server side  : connect to wss://api.deepgram.com/v1/listen with the keys
                   from DEEPGRAM_API_KEY env var (already present).
  - Audio frame  : raw PCM16 16kHz mono, ~100ms buffers. Encoder side TBD
                   (PWA = MediaRecorder('audio/webm') needs PCM extraction,
                   Flutter = `record` can output PCM directly).
  - Result frame : forward Deepgram JSON verbatim. The client renders
                   `is_final=false` as live preview, `is_final=true` as
                   committed segments.

The placeholder below proves the routing wiring; the Deepgram fan-out is
gated behind `STREAMING_ENABLED=true` until the encoder side is ready.
"""
from __future__ import annotations

import os
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect


router = APIRouter(prefix="/transcribe", tags=["streaming"])

STREAMING_ENABLED = os.environ.get("STREAMING_ENABLED", "false").lower() == "true"


@router.websocket("/stream/{session_id}")
async def stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if not STREAMING_ENABLED:
        await websocket.send_json({
            "type": "error",
            "code": "streaming_disabled",
            "detail": "Deepgram WS proxy is opt-in. Set STREAMING_ENABLED=true in backend/.env once the encoder side is ready.",
        })
        await websocket.close(code=1011)
        return

    try:
        # TODO(deepgram-fanout): open wss://api.deepgram.com/v1/listen and
        # bridge frames in both directions. This first version just echoes
        # so we can exercise the wiring + auth from the clients.
        while True:
            msg = await websocket.receive()
            if "bytes" in msg and msg["bytes"]:
                await websocket.send_json({
                    "type": "echo_binary",
                    "size": len(msg["bytes"]),
                    "session_id": session_id,
                })
            elif "text" in msg and msg["text"]:
                try:
                    payload = json.loads(msg["text"])
                except Exception:
                    payload = {"raw": msg["text"]}
                await websocket.send_json({"type": "echo_text", "payload": payload})
    except WebSocketDisconnect:
        return
