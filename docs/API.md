# API Reference — NOMAD PWA (v0.6.0)

Base URL: `https://nomad.mgdesign.cloud/api` (production) / `http://localhost:8400/api` (dev)

All endpoints are prefixed with `/api`. Requests and responses are JSON unless noted.

---

## Health

### `GET /api/health`

```json
{ "status": "ok", "service": "nomad-api" }
```

---

## Sessions

### `POST /api/sessions`

Create a new session.

**Request** (JSON):
```json
{
  "input_mode": "rec",
  "title": "Réunion Q3",
  "duration_seconds": 2712,
  "audio_url": "https://...",
  "original_filename": "reunion.m4a",
  "file_size_bytes": 35000000,
  "language": "fr",
  "engine_used": "groq-turbo",
  "transcript": null
}
```

All fields except `input_mode` are optional. Allowed `input_mode`: `rec`, `live`, `import`, `paste`.

---

### `GET /api/sessions`

List sessions with filters.

**Query params**:

| Param | Type | Description |
|-------|------|-------------|
| status | string | `pending` \| `uploaded` \| `processing` \| `transcribed` \| `error` |
| tag | string | Tag ID(s), comma-separated for multi-select |
| search | string | Filter by title (ilike) |
| input_mode | string | `rec` \| `live` \| `import` \| `paste` |
| created_after | ISO datetime | Start date filter |
| created_before | ISO datetime | End date filter |
| limit | int | Page size (default: 50, max: 200) |
| offset | int | Pagination offset |

**Response** `200`: Array of session objects with embedded `tags[]`.

---

### `GET /api/sessions/:id`

Full session detail with embedded `tags[]` and `notes[]`.

---

### `PUT /api/sessions/:id`

Update session fields (title, status, transcript, marks, etc.).

**Request** (JSON): Any subset of `SessionUpdate` fields.

---

### `DELETE /api/sessions/:id`

Hard delete session + associated tags and notes. Returns `204`.

---

### `POST /api/sessions/:id/tags`

Set tags for a session (replaces existing).

```json
{ "tag_ids": ["uuid1", "uuid2"] }
```

---

### `POST /api/sessions/:id/notes`

Add a note. Returns created note.

```json
{ "content": "Penser à relancer Marc" }
```

---

### `PUT /api/sessions/:id/notes`

Replace all notes with a single note.

```json
{ "content": "Updated notes content" }
```

---

### `POST /api/sessions/:id/marks`

Add a timestamp mark (appends to JSONB array).

```json
{ "time": 754, "label": "Action items" }
```

---

## Upload

Three strategies (frontend cascades through them):

### Strategy 1 & 2: Direct to Supabase Storage

Frontend uploads directly to Supabase Storage (XHR or JS client), then calls:

### `POST /api/upload/complete`

Create session record after direct upload.

```json
{
  "session_id": "uuid",
  "storage_path": "martun/uuid.m4a",
  "filename": "reunion.m4a",
  "size": 35000000
}
```

**Response** `200`:
```json
{
  "session_id": "uuid",
  "audio_url": "https://gabiryokeepqpatsfogs.supabase.co/storage/v1/object/public/nomad-audio/martun/uuid.m4a"
}
```

### `POST /api/upload/init`

Get a signed upload URL (for XHR direct upload strategy).

```json
{ "filename": "reunion.m4a", "size": 35000000 }
```

### Strategy 3: `POST /api/upload`

Legacy backend proxy. Upload via `multipart/form-data` with field `file`.
Slowest — file goes through Cloudflare Tunnel + backend + Supabase Storage.

**Response** `200`:
```json
{ "session_id": "uuid", "audio_url": "https://..." }
```

---

## Tags

### `GET /api/tags`

List all tags (flat list with `parent_id` for hierarchy).

### `POST /api/tags`

Create a new tag.

```json
{
  "name": "Sprint Review",
  "emoji": "🔄",
  "hue": "#6366F1",
  "parent_id": null
}
```

---

## Transcription

### `POST /api/transcribe/:session_id`

Launch async background transcription.

```json
{ "engine": "auto" }
```

Valid engines: `auto`, `groq-turbo`, `groq-large`, `deepgram`, `wynona`.

**Auto mode**: Groq for files < 25 MB, Deepgram for larger files.

**Response** `200`:
```json
{
  "job_id": "uuid",
  "status": "queued",
  "session_id": "uuid",
  "engine": "auto"
}
```

### `GET /api/transcribe/queue`

Current transcription queue.

```json
{
  "jobs": [...],
  "total": 3
}
```

---

## Engines

### `GET /api/engines/status`

Check availability of all transcription engines.
