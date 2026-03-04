# Architecture — NOMAD PWA (v0.6.0)

## Infrastructure Overview

```
Internet
    │
    │  Cloudflare Tunnel (HTTP)
    ▼
GREEN-LAB (always on)
    ├── Traefik reverse proxy
    │     ├── nomad.mgdesign.cloud     → nomad-frontend (nginx:80)
    │     └── nomad-api.mgdesign.cloud → nomad-api (FastAPI:8400)
    │
    ├── nomad-frontend container
    │     ├── nginx serves static PWA files
    │     └── /api/* proxied to nomad-api:8400 (internal)
    │
    ├── nomad-api container
    │     ├── FastAPI backend (port 8400)
    │     ├── Groq / Deepgram API calls
    │     └── Supabase REST + Storage API calls
    │
    │  Tailscale (100.x.x.x)
    ▼
WYNONA (on-demand)
    └── whisperx-stream container
          ├── WhisperX + pyannote (RTX 4070 Super)
          └── /health endpoint
```

### Machines

| Machine | Role | Specs | Network |
|---------|------|-------|---------|
| GREEN-LAB | Docker host, reverse proxy | Lenovo M910q, Debian 12 | 192.168.1.26 / Tailscale |
| WYNONA | Local GPU transcription | RTX 4070 Super, Windows 11 | Tailscale only |
| Supabase | Database + Storage | Cloud (gabiryokeepqpatsfogs) | Public API |

### Domain routing

| Domain | Entrypoint | Target |
|--------|-----------|--------|
| `nomad.mgdesign.cloud` | Cloudflare Tunnel → Traefik HTTP | nomad-frontend |
| `nomad-api.mgdesign.cloud` | Cloudflare Tunnel → Traefik HTTP | nomad-api |
| `nomad.green-lab.local` | Traefik HTTPS (local) | nomad-frontend |
| `nomad-api.green-lab.local` | Traefik HTTPS (local) | nomad-api |

Frontend nginx also proxies `/api/*` internally to `nomad-api:8400` within the Docker network.

---

## Upload Flow (v0.6.0)

Three strategies with cascading fallback:

```
Browser selects file
    │
    ├─ Strategy 1: Direct XHR → Supabase Storage
    │    ├── XHR POST to {SUPABASE_URL}/storage/v1/object/nomad-audio/{path}
    │    ├── Auth: Bearer {ANON_KEY}
    │    ├── Progress tracking via xhr.upload.onprogress
    │    └── On success → POST /api/upload/complete (create session record)
    │
    ├─ Strategy 2: Supabase JS client (fallback if XHR CORS fails)
    │    ├── supabase.storage.from('nomad-audio').upload(path, file)
    │    ├── No progress tracking (indeterminate spinner)
    │    └── On success → POST /api/upload/complete
    │
    └─ Strategy 3: Backend proxy (last resort)
         ├── XHR POST multipart/form-data → /api/upload
         ├── Backend reads file into memory, uploads to Supabase Storage
         ├── Progress tracking via xhr.upload.onprogress
         └── Timeout: 10 min (600s nginx proxy)
```

**Requirements for Strategy 1 & 2:**
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` baked at frontend build time
- Supabase Storage RLS policy allowing INSERT on `nomad-audio` bucket
- File size limit set to >= 500 MB in Supabase Dashboard → Storage → Settings

---

## Transcription Flow

```
POST /api/transcribe/:session_id { engine: "auto" }
    │
    ├── Auto-engine resolution:
    │     File < 25 MB  → groq-turbo (Whisper Large V3 Turbo)
    │     File >= 25 MB → deepgram (Nova-3, URL-based, no size limit)
    │     User override  → use specified engine
    │
    ├── Background task:
    │     1. Update session status → "processing"
    │     2. Download audio (Groq) or send URL (Deepgram)
    │     3. Call transcription API
    │     4. Store transcript + segments + word count
    │     5. Update session status → "transcribed"
    │
    └── On error: status → "error", error_message stored
```

### Engines

| Engine | ID | How it works | Limit | Cost |
|--------|----|-------------|-------|------|
| Groq Whisper Turbo | `groq-turbo` | Download audio, POST file to Groq API | 25 MB | ~$0.01/h |
| Groq Whisper Large | `groq-large` | Same, higher quality | 25 MB | ~$0.02/h |
| Deepgram Nova-3 | `deepgram` | Send audio URL, Deepgram downloads | No limit | ~$0.25/h |
| WhisperX (WYNONA) | `wynona` | Local GPU, not yet implemented | No limit | Free |

---

## Database Schema (Supabase, schema `app_nomad`)

### Tables

```
sessions ──────┬── session_tags ──── tags (self-ref parent_id)
               │                        └── mirai_item_id (FK future)
               └── notes
```

### sessions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| user_id | TEXT | Default: "martun" |
| title | TEXT | User-provided title |
| status | TEXT | pending, uploaded, processing, transcribed, error |
| input_mode | TEXT | rec, live, import, paste |
| duration_seconds | INT | Recording duration |
| audio_url | TEXT | Supabase Storage public URL |
| original_filename | TEXT | Original file name |
| file_size_bytes | INT | File size |
| transcript | TEXT | Full transcription text |
| transcript_segments | JSONB | Array of {start, end, text, speaker?} |
| transcript_words | INT | Word count |
| engine_used | TEXT | groq-turbo, deepgram, etc. |
| language | TEXT | Default: "fr" |
| marks | JSONB | Array of {time, label?} |
| summary | TEXT | AI-generated summary (future) |
| error_message | TEXT | Error details if status=error |
| created_at | TIMESTAMPTZ | Auto |
| updated_at | TIMESTAMPTZ | Auto |

### tags

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| name | TEXT | Tag name |
| emoji | TEXT | Default: "🏷️" |
| hue | TEXT | Color hex |
| parent_id | UUID (FK) | Self-reference for hierarchy |
| mirai_item_id | UUID | Future Mirai bridge |
| user_id | TEXT | Default: "martun" |

### session_tags (junction)

| Column | Type |
|--------|------|
| session_id | UUID (FK → sessions) |
| tag_id | UUID (FK → tags) |

### notes

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | Auto-generated |
| session_id | UUID (FK) | Parent session |
| content | TEXT | Note text |
| user_id | TEXT | Default: "martun" |
| created_at | TIMESTAMPTZ | Auto |

---

## Offline Strategy

### Service Worker

- Caches all static assets (HTML, JS, CSS, fonts)
- Intercepts navigation requests → serve cached shell
- Does NOT cache API responses (dynamic data)

### IndexedDB (via `idb` library)

- Stores pending recordings when offline
- Schema: `{ id, blob, filename, mode, title, notes, duration, engine, savedAt }`
- Synced when back online

---

## Supabase Storage Configuration

Bucket `nomad-audio` requires:

1. **File size limit**: Set to >= 500 MB in Dashboard → Storage → Settings
2. **RLS policy** for direct uploads:
   ```sql
   CREATE POLICY "Allow audio uploads"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'nomad-audio');
   ```
3. Public read access (for audio playback and transcription engine downloads)
