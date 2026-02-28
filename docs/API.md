# API Reference — NOMAD PWA

Base URL: `https://recorder.mgdesign.cloud` (production) / `http://localhost:8400` (dev)

---

## Sessions

### `POST /sessions`

Create a new session from a recording or paste.

**Request** (multipart/form-data):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| audio | File | No | Audio file (webm, m4a, wav, mp3) |
| duration | int | Yes | Duration in seconds |
| input_mode | string | Yes | `record` \| `live` \| `paste` |
| title | string | No | Session title |
| content | string | No | Text content (paste mode) |
| tags | string[] | No | Tag IDs to associate |
| transcribe | bool | No | Launch transcription (default: auto from tags) |
| engine | string | No | Engine override (default: auto) |

**Response** `201`:
```json
{
  "id": "uuid",
  "status": "pending",
  "audio_url": "https://...",
  "created_at": "2026-02-28T14:30:00Z"
}
```

---

### `GET /sessions`

List sessions with filtering and search.

**Query params**:

| Param | Type | Description |
|-------|------|-------------|
| q | string | Full-text search in title + transcription |
| tags | string[] | Filter by tag IDs (AND logic) |
| status | string | `pending` \| `processing` \| `completed` \| `error` |
| source | string | `record` \| `import` \| `live` \| `paste` \| `nomad-pi` |
| from | datetime | Start date filter |
| to | datetime | End date filter |
| limit | int | Page size (default: 20) |
| offset | int | Pagination offset |

**Response** `200`:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "title": "Réunion planning Q3",
      "duration_seconds": 2712,
      "status": "completed",
      "source": "record",
      "input_mode": "live",
      "tags": [
        { "id": "uuid", "name": "Call", "emoji": "📞", "color": "#EF4444" }
      ],
      "notes_count": 2,
      "transcription_preview": "On a décidé de repousser le...",
      "created_at": "2026-02-28T14:30:00Z"
    }
  ],
  "total": 247,
  "limit": 20,
  "offset": 0
}
```

---

### `GET /sessions/:id`

Full session detail with tags, notes, and marks.

**Response** `200`:
```json
{
  "id": "uuid",
  "title": "Réunion planning Q3",
  "duration_seconds": 2712,
  "audio_url": "https://...",
  "transcription": "Full transcription text...",
  "status": "completed",
  "source": "record",
  "input_mode": "live",
  "engine_used": "groq-turbo",
  "marks": [
    { "time": 754, "label": null },
    { "time": 1425, "label": "Action items" }
  ],
  "tags": [
    { "id": "uuid", "name": "Call", "emoji": "📞", "color": "#EF4444" },
    { "id": "uuid", "name": "Travail", "emoji": "💼", "color": "#3B82F6" }
  ],
  "notes": [
    {
      "id": "uuid",
      "content": "Penser à relancer Marc",
      "type": "text",
      "created_at": "2026-02-28T16:00:00Z"
    }
  ],
  "created_at": "2026-02-28T14:30:00Z"
}
```

---

### `PUT /sessions/:id`

Update session metadata.

**Request** (JSON):
```json
{
  "title": "Updated title",
  "status": "completed"
}
```

---

### `POST /sessions/:id/tags`

Set tags for a session (replaces existing).

**Request** (JSON):
```json
{
  "tag_ids": ["uuid1", "uuid2"]
}
```

---

### `POST /sessions/:id/notes`

Add a note to a session.

**Request** (multipart/form-data):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content | string | Yes | Note text |
| type | string | No | `text` \| `photo` \| `drawing` \| `link` (default: text) |
| media | File | No | Media file for photo/drawing types |

---

### `POST /sessions/:id/marks`

Add a timestamp mark.

**Request** (JSON):
```json
{
  "time": 754,
  "label": "Action items"
}
```

---

## Upload / Import

### `POST /upload`

Import one or more audio files.

**Request** (multipart/form-data):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| files | File[] | Yes | Audio files to import |
| tags | string[] | No | Tag IDs to apply to all |
| transcribe | bool | No | Queue transcription for all (default: false) |

**Response** `201`:
```json
{
  "imported": [
    { "id": "uuid", "filename": "reunion.m4a", "duration": 2712 },
    { "id": "uuid", "filename": "memo.wav", "duration": 150 }
  ]
}
```

---

## Tags

### `GET /tags`

List all tags as a tree.

**Response** `200`:
```json
{
  "tags": [
    {
      "id": "uuid",
      "name": "Travail",
      "emoji": "💼",
      "color": "#3B82F6",
      "transcribe": true,
      "parent_id": null,
      "children": [
        { "id": "uuid", "name": "Télétravail", "emoji": "🏠", "parent_id": "..." },
        { "id": "uuid", "name": "Réunion", "emoji": "👥", "parent_id": "..." }
      ],
      "sessions_count": 42
    }
  ]
}
```

### `POST /tags`

Create a new tag.

**Request** (JSON):
```json
{
  "name": "Sprint Review",
  "emoji": "🔄",
  "color": "#6366F1",
  "transcribe": true,
  "parent_id": "uuid-of-travail-tag"
}
```

### `PUT /tags/:id`

Update a tag.

---

## Transcription

### `POST /transcribe/:id`

Launch async transcription for a session.

**Request** (JSON):
```json
{
  "engine": "auto"
}
```

**Response** `202`:
```json
{
  "queued": true,
  "engine": "groq-turbo",
  "estimated_seconds": 8
}
```

---

## Engines

### `GET /engines/status`

Check availability of all transcription engines.

**Response** `200`:
```json
{
  "engines": [
    {
      "id": "groq-turbo",
      "name": "Groq Whisper Turbo",
      "status": "online",
      "latency_ms": 120
    },
    {
      "id": "deepgram-nova3",
      "name": "Deepgram Nova-3",
      "status": "online",
      "latency_ms": 85
    },
    {
      "id": "wynona-whisperx",
      "name": "WYNONA WhisperX",
      "status": "offline",
      "gpu_info": null
    }
  ]
}
```

### `POST /engines/wynona/wake`

Send Wake-on-LAN to WYNONA.

**Response** `202`:
```json
{
  "message": "Wake-on-LAN sent",
  "estimated_boot_seconds": 300
}
```

---

## Queue

### `GET /queue`

Current transcription queue.

**Response** `200`:
```json
{
  "active": [
    { "session_id": "uuid", "progress": 42, "engine": "wynona-whisperx" }
  ],
  "pending": [
    { "session_id": "uuid", "duration": 750, "position": 1 }
  ],
  "stats": {
    "total_processed_today": 18,
    "total_duration_today": 7200,
    "cost_today_usd": 0.48
  }
}
```

### `POST /queue/pause`

Pause/resume the transcription queue.

### `POST /queue/cancel`

Cancel all pending items in the queue.

---

## WebSocket

### `WS /ws/live`

Live transcription streaming. See [ARCHITECTURE.md](ARCHITECTURE.md#websocket-protocols) for protocol details.

### `WS /ws/queue`

Real-time queue progress updates. See [ARCHITECTURE.md](ARCHITECTURE.md#websocket-protocols) for protocol details.
