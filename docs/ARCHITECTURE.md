# Architecture — NOMAD PWA

## Infrastructure Overview

```
Internet (HTTPS)
    │
    │  Cloudflare Tunnel
    ▼
GREEN-LAB (always on)
    ├── Traefik reverse proxy
    ├── recorder.mgdesign.cloud → nomad-api container
    │     ├── FastAPI backend (port 8400)
    │     └── Static PWA files
    │
    │  Tailscale (100.x.x.x)
    ▼
WYNONA (on-demand)
    └── whisperx-stream container
          ├── FastAPI + WebSocket
          ├── WhisperX + pyannote (GPU)
          └── /health endpoint
```

### Machines

| Machine | Role | Specs | Network |
|---------|------|-------|---------|
| GREEN-LAB | API host, reverse proxy | Lenovo M910q, Debian 12, Docker | 192.168.1.26 / Tailscale |
| WYNONA | Local GPU transcription | RTX 4070 Super, Windows 11, Docker Desktop | Tailscale only |
| Supabase | Database + Storage | Cloud (ap-southeast-1) | Public API |

---

## Data Flow

### 1. Capture (instant)

```
Browser (any device)
    │
    │  MediaRecorder API → audio/webm;codecs=opus
    │
    ▼
POST /sessions { audio: Blob, duration: number }
    │
    ├── Upload audio → Supabase Storage (bucket: nomad-audio)
    ├── INSERT nomad_sessions (status: 'pending', source: 'record')
    └── Return session_id
```

### 2. Enrichment (optional, 5-30s)

```
POST /sessions/:id/tags   → associate tags
PUT  /sessions/:id        → set title
POST /sessions/:id/notes  → add note
```

### 3. Transcription (async)

```
POST /transcribe/:id
    │
    ├── Engine selection (Auto mode):
    │     WYNONA online? → WhisperX (free, best FR, diarization)
    │     WYNONA off + mode LIVE? → Deepgram Nova-3 (streaming)
    │     WYNONA off + mode REC? → Groq Whisper Turbo (batch, cheap)
    │
    ├── Send audio to selected engine
    ├── Receive transcription text
    ├── UPDATE nomad_sessions SET transcription, status='completed'
    └── INSERT nomad_engine_usage (stats, cost)
```

### 4. Live Transcription (WebSocket)

```
Browser
    │
    │  WebSocket wss://recorder.mgdesign.cloud/ws/live
    │  → sends audio chunks every 1-2s (MediaRecorder timeslice)
    │
    ▼
FastAPI WebSocket handler
    │
    │  Forward chunks to engine (Groq batch or Deepgram stream)
    │
    ▼
Engine returns text
    │
    │  WebSocket → sends text back to browser
    │  + accumulates full transcription in memory
    │
    ▼
On stop: save full audio + full transcription to Supabase
```

---

## Offline Strategy

### Service Worker

- Caches all static assets (HTML, JS, CSS, fonts)
- Intercepts navigation requests → serve cached shell
- Does NOT cache API responses (dynamic data)

### IndexedDB (via `idb` library)

- Stores pending recordings when offline
- Schema: `{ id, audio: Blob, duration, tags[], title?, createdAt }`
- Max storage: ~500MB (browser dependent)

### Background Sync

```
Online:  Record → POST /sessions → done
Offline: Record → IndexedDB → Service Worker registers sync
         → When online: Background Sync fires → POST each pending session
         → On success: remove from IndexedDB
```

---

## Multi-Source Recording

Using Web Audio API `AudioContext` + `ChannelMergerNode`:

```
DJI Mic (getUserMedia)  ──┐
                           ├── ChannelMerger → MediaRecorder
System Audio (getDisplayMedia) ──┘

Result: stereo file with mic on L, system on R
→ Can be split for separate transcription (diarization hint)
```

Fallback on mobile: single source only (getUserMedia).

---

## Engine Routing Logic

```python
def select_engine(mode: str, wynona_online: bool, user_pref: str) -> str:
    if user_pref != "auto":
        return user_pref

    if wynona_online:
        return "wynona-whisperx"

    if mode == "live":
        return "deepgram-nova3"

    return "groq-turbo"
```

---

## Database Schema

### Entity Relationship

```
nomad_sessions ──┬── nomad_session_tags ──── nomad_tags (self-ref parent_id)
                 │                               │
                 ├── nomad_notes                  ├── nomad_tag_notes
                 │                               │
                 └── nomad_engine_usage           └── mirai_item_id (FK future)

nomad_device_prefs (standalone, keyed by device fingerprint)
```

### nomad_sessions (existing, 247 rows)

Extended with:
- `title TEXT` — user-provided title
- `source TEXT` — 'record' | 'import' | 'live' | 'paste' | 'nomad-pi'
- `input_mode TEXT` — 'record' | 'live' | 'import' | 'paste'
- `engine_used TEXT` — which engine transcribed this
- `marks JSONB` — timestamp marks `[{time: 754, label: null}]`
- `mirai_selection_id INTEGER` — future Mirai bridge

### nomad_tags (new)

Hierarchical tags with:
- `parent_id UUID` — self-reference for sub-tags
- `transcribe BOOLEAN` — auto-enable transcription when tag selected
- `mirai_item_id INTEGER` — optional link to Mirai items tree

### nomad_notes (new)

Multi-type notes per session:
- `type TEXT` — 'text' | 'photo' | 'drawing' | 'link'
- `media_url TEXT` — for non-text types (Supabase Storage)

---

## WebSocket Protocols

### `/ws/live` — Live Transcription

```
Client → Server: binary audio chunk (webm/opus, every 1-2s)
Server → Client: JSON { "type": "transcript", "text": "...", "is_final": bool }
Server → Client: JSON { "type": "error", "message": "..." }
Client → Server: JSON { "type": "mark", "time": 1234 }
Client → Server: JSON { "type": "stop" }
Server → Client: JSON { "type": "done", "session_id": "...", "total_text": "..." }
```

### `/ws/queue` — Queue Progress

```
Server → Client: JSON { "type": "progress", "session_id": "...", "percent": 42 }
Server → Client: JSON { "type": "completed", "session_id": "...", "word_count": 380 }
Server → Client: JSON { "type": "error", "session_id": "...", "message": "..." }
Server → Client: JSON { "type": "queue_stats", "active": 3, "pending": 9, "eta_seconds": 480 }
```
