# N &ensp; O &ensp; M &ensp; A &ensp; D

> Universal audio capture & transcription PWA

**Record anywhere. Transcribe anything. From any device.**

NOMAD replaces fragile hardware pipelines with a single PWA that works on any device — laptop, phone, corporate PC. Plug in your DJI Mic, open the URL, hit record.

---

## Why NOMAD?

The old pipeline:

```
Raspberry Pi → rsync → preprocessing → Nextcloud → Scriberr → Supabase
```

6 steps. 247 files never transcribed. Zero flexibility.

The new pipeline:

```
Open URL → Record → Done.
```

---

## Features

- **4 capture modes** — Record, Live Transcribe, Import files, Paste text
- **Multi-engine transcription** — Groq Whisper ($0.04/h), Deepgram Nova-3 (real-time streaming), WYNONA WhisperX (free, local GPU)
- **Auto engine routing** — WYNONA if available → Groq for batch → Deepgram for live streaming
- **Device selector** — Live VU meter per input, sticky preferences per device fingerprint
- **Works offline** — Record without connection, auto-sync when back online (IndexedDB + Service Worker)
- **Hierarchical tags** — Tags-as-items with sub-tags, notes on tags, and Mirai bridge
- **Timestamp marks** — Mark key moments during recording
- **Transcription queue** — Batch processing with live progress tracking
- **OLED + Light themes** — Pure black (#000) and warm light mode
- **Multi-user ready** — `user_id` on everything from day one

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  PWA Client  │────▶│  FastAPI     │────▶│  Transcription   │
│  (React)     │     │  (GREEN-LAB) │     │  Engines         │
│              │     │              │     │                  │
│  - Record    │     │  - Sessions  │     │  ⚡ Groq API     │
│  - Offline   │     │  - Upload    │     │  🌊 Deepgram API │
│  - Tags      │     │  - Queue     │     │  🖥️ WYNONA local │
│  - Marks     │     │  - WebSocket │     │                  │
└──────┬───────┘     └──────┬───────┘     └──────────────────┘
       │                    │
       │              ┌─────┴──────┐
       └─────────────▶│  Supabase  │
                      │  Storage + │
                      │  Database  │
                      └────────────┘
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite, Tailwind CSS v4, PWA (Service Worker) |
| Backend | FastAPI (Python 3.12) |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| Transcription | Groq, Deepgram, WhisperX (local) |
| Hosting | GREEN-LAB Docker + Cloudflare Tunnel |
| Domain | `recorder.mgdesign.cloud` |

---

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8400
```

### Docker (production)

```bash
docker compose -f docker/docker-compose.yml up -d
```

---

## Database Schema

Schema: `n8n_transcription`

| Table | Description |
|-------|-------------|
| `nomad_sessions` | Recording sessions (247 existing from legacy pipeline) |
| `nomad_tags` | Hierarchical tags with optional Mirai bridge |
| `nomad_session_tags` | N:N session ↔ tag association |
| `nomad_notes` | Multi-notes per session (text, photo, drawing, link) |
| `nomad_tag_notes` | Notes on tags themselves |
| `nomad_device_prefs` | Sticky device config per browser fingerprint |
| `nomad_engine_usage` | Transcription engine usage stats and costs |

---

## API Endpoints

```
POST   /sessions              Create session
GET    /sessions              List + filter + search
GET    /sessions/:id          Detail + tags + notes
PUT    /sessions/:id          Update session
POST   /sessions/:id/tags     Set tags
POST   /sessions/:id/notes    Add note
POST   /sessions/:id/marks    Add timestamp mark
POST   /upload                Import file(s)
POST   /transcribe/:id        Launch transcription (async)
GET    /tags                  List all tags (tree)
POST   /tags                  Create tag
PUT    /tags/:id              Update tag
GET    /engines/status        Engine availability
POST   /engines/wynona/wake   Wake-on-LAN WYNONA
GET    /queue                 Transcription queue status
POST   /queue/pause           Pause queue
WS     /ws/live               Live transcription stream
WS     /ws/queue              Queue progress updates
```

Full API documentation: [docs/API.md](docs/API.md)

---

## Deployment

Deployed on GREEN-LAB (Lenovo ThinkCentre M910q, Debian 12) behind Traefik reverse proxy with Cloudflare Tunnel at `recorder.mgdesign.cloud`.

WYNONA (RTX 4070 Super) provides local GPU transcription via WhisperX, accessible through Tailscale.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full setup instructions.

---

## License

MIT
