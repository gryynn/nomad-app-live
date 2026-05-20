# N O M A D

> Self-hosted, multi-source audio capture & transcription.
> Record. Live-transcribe. Import. Sync from your phone's voice recorder. Search later.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Status: alpha](https://img.shields.io/badge/Status-alpha-orange.svg)]()

---

## Why NOMAD?

You want your voice notes, meetings, and brain-dumps **captured anywhere, transcribed automatically, searchable forever — on your own server, with your own keys**.

NOMAD is the glue between the audio sources you already use (phone dictaphone, browser, smartwatch, USB mic) and the storage + transcription stack you control. No vendor lock-in, no "your audio leaves the building" surprise, no monthly fee.

```
┌────────────────────────────────────────────────────────┐
│  Capture                                               │
│  ├─ PWA (browser): REC / LIVE / Import / Paste         │
│  ├─ Android app: REC / LIVE / background sync          │
│  └─ Phone dictaphone → Syncthing → backend watcher     │
└────────────────┬───────────────────────────────────────┘
                 ▼
┌────────────────────────────────────────────────────────┐
│  FastAPI backend                                       │
│  ├─ Storage abstraction: local / nextcloud / s3 / sb   │
│  └─ Transcription dispatcher: Groq / Deepgram / WX     │
└────────────────┬───────────────────────────────────────┘
                 ▼
┌────────────────────────────────────────────────────────┐
│  Postgres (Supabase) + Storage + Auth                  │
│  Tags · notes · marks · RLS per user                   │
└────────────────────────────────────────────────────────┘
```

---

## Features

| Capability | Status | Notes |
|---|---|---|
| Browser PWA recording (REC + LIVE) | ✅ | Service-worker, offline-first, chunks 30 s WebM/Opus |
| LIVE chunk-by-chunk transcription | ✅ | Each 30 s chunk transcribed on the fly via Groq Whisper |
| File import (.m4a / .mp3 / .wav / .webm…) | ✅ | Drag-and-drop or button |
| Paste text-only "session" | ✅ | For when you want the tagging/notes layer without audio |
| Android app (Flutter, sister repo) | ⏳ alpha | Bound to backend, magic-link login, recording end-to-end |
| Background sync from phone dictaphone | ✅ | Watcher tails a folder (Syncthing/SMB) and ingests new files |
| Auto-transcription with **user-scoped opt-out** | ✅ | Pill toggle in the Capture panel; `?auto=true` flag on backend |
| Multi-engine transcription | ✅ | Groq Turbo / Groq Large (cloud) · Deepgram Nova-3 (cloud) · WhisperX via WYNONA (self-hosted GPU) |
| Auto engine selection by file size | ✅ | < 25 MB → Groq, > 25 MB → Deepgram |
| Tags + #hashtag autocomplete | ✅ | Free-form tree, no taxonomy imposed |
| Marks (timestamped points in audio) | ✅ | `[MM:SS]` chips clickable to seek |
| Full transcript editing | ✅ | Three views: text / timestamped / speakers (when Deepgram is used) |
| Pluggable storage backend | ✅ | `local` (default) · `nextcloud` · `s3` (R2/B2/MinIO) · `supabase` (legacy) |
| Row-level security per user | ✅ | Strict `auth.uid()` policies on every table |
| Cloudflare Tunnel friendly | ✅ | HTTPS upstream optional, Traefik default labels |

---

## Quick Start (Docker Compose, ~5 minutes)

**You'll need:**
- Docker + Docker Compose
- A free [Supabase](https://supabase.com) project (database + auth)
- A [Groq API key](https://console.groq.com) (transcription, free tier covers personal use)

**Steps:**

```bash
# 1. Clone the repo
git clone https://github.com/gryynn/nomad-app-live.git
cd nomad-app-live

# 2. Configure your secrets
cp .env.example backend/.env
$EDITOR backend/.env          # fill in SUPABASE_URL, *_KEY, GROQ_API_KEY

# 3. Apply the DB schema to your Supabase project
#    See db/README.md for the SQL to run (schema app_nomad + RLS).

# 4. Start the stack
docker compose --env-file backend/.env up -d

# 5. Open http://localhost in your browser
#    First login: set a password for your user in Supabase Auth dashboard,
#    OR use the magic-link flow once you've whitelisted nomad://login-callback
#    in Supabase > Authentication > URL Configuration > Redirect URLs.
```

> **Production deployment with Traefik / Cloudflare Tunnel / custom domain?**
> See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full recipe, and copy
> `docker-compose.override.example.yml` to `docker-compose.override.yml` to
> swap mount paths, Traefik labels, etc. without touching the tracked file.

---

## Configuration

All configuration lives in `backend/.env`. The example file documents every variable.

### Required

| Variable | What it does |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public anon key — embedded in the frontend bundle, safe to expose |
| `SUPABASE_SERVICE_KEY` | Service-role key — **secret**, backend only |
| `SUPABASE_JWT_SECRET` | Used by the backend to verify Supabase-issued user tokens |
| `APP_JWT_SECRET` | Random 64-char hex — signs backend-issued session JWTs |
| `APP_FRONTEND_URL` | Public URL of the PWA (used in redirects, CORS) |
| `GROQ_API_KEY` | Free tier is plenty for personal use |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_DRIVER` | `local` | One of `local` / `nextcloud` / `s3` / `supabase`. See [docs/STORAGE.md](docs/STORAGE.md). |
| `STORAGE_LOCAL_PATH` | `/data/audio-local` | Where the `local` driver writes files (override the mount in compose) |
| `DEEPGRAM_API_KEY` | — | Enables Deepgram Nova-3 (better for long files > 25 MB) |
| `AUDIO_TOKEN_REQUIRED` | `false` | Set `true` to force every audio download to carry a signed URL |
| `AUDIO_TOKEN_TTL_MINUTES` | `60` | Lifetime of signed audio URLs |
| `OIDC_*` (issuer, client id, secret, redirect_uri) | — | Enables PocketID / any OIDC provider in addition to Supabase Auth |

---

## Authentication

Two auth paths are supported and **can coexist**:

1. **Supabase Auth** (recommended for OSS users)
   - Email + password
   - Magic link (passwordless) — the mobile app handles `nomad://login-callback` deep links
   - Optional: enable OAuth providers (Google, GitHub…) in your Supabase dashboard
2. **OIDC** (optional, for users running a self-hosted identity provider like PocketID, Keycloak, Authelia)
   - Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`
   - Backend verifies via the issuer's JWKS endpoint, mints a short-lived local JWT

Each user gets their own data slice via Postgres RLS — no cross-user reads, even with the same Supabase project.

### Closing the door behind you

Out of the box `auth.signUp` is public — anyone who knows your URL can create an account and start burning your disk + transcription quotas. For a real self-host, close the front door:

1. **Supabase Dashboard → Authentication → Providers → Email**: set "Enable Signups" to **off** (so the public Supabase endpoint can't be used to bypass you).
2. **Backend `.env`** — list who's allowed to create accounts:
   ```env
   # Comma-separated, mix of exact emails and @domain entries (case-insensitive).
   SIGNUP_ALLOWLIST=me@example.com,@my-company.com,partner@another.org
   # Set true ONLY for public demo deployments.
   SIGNUP_OPEN=false
   ```
3. Sign-up requests now hit `POST /api/signup`, get filtered by the allowlist, then call the Supabase Admin API server-side. Existing users keep signing in normally (`/auth/v1/token`); only **new account creation** is gated.

### Per-user API keys (multi-tenant)

When several people share one instance you don't want them all spending the operator's Groq/Deepgram budget. Each user can paste their own keys in **Settings → API keys** (PWA) — they're stored in `app_nomad.user_settings.api_keys` (JSONB, RLS owner-only, **write-only** from the client). At transcription time, `resolve_api_key(user_id, vendor)` looks up the user's key first and falls back to the host env (`GROQ_API_KEY`, `DEEPGRAM_API_KEY`, …) only if none is set. The env keys stay the "default tenant" for single-user installs.

---

## Mobile companion (Android)

A Flutter app lives in a sister repo (to be published alongside the backend in V1.2). It speaks the same `/api/*` surface, supports REC + LIVE + magic-link login + chunk upload + background sync. APK builds are available from CI once the sister repo opens.

The PWA also installs as a standalone app on Android & iOS (Add to Home Screen → fullscreen, offline-capable).

---

## Architecture deep dive

- **Frontend** — React 19 + Vite + plain CSS (no Tailwind in production). Service worker handles offline + cache busting via versioned `CACHE_NAME`.
- **Backend** — FastAPI on Python 3.12, async httpx for all I/O. Routers under `backend/app/routers/` (sessions, tags, engines, upload, transcribe, audio, preferences).
- **Storage abstraction** — `backend/app/services/storage/base.py` defines the contract. Drivers: `local.py`, `nextcloud.py`, `s3.py`, `supabase.py`. Selected at runtime via `STORAGE_DRIVER` env.
- **Transcription engines** — `groq_service.py`, `deepgram_service.py`, `wynona_service.py`. Dispatched by `routers/transcribe.py::resolve_engine()` based on file size and user preference.
- **Database** — Postgres in your own Supabase project. Schema `app_nomad` (sessions, tags, notes, session_tags, session_attachments, user_settings). All tables have RLS enabled with strict owner-only policies. Migrations under `db/`.
- **Auth helpers** — `backend/app/auth.py` accepts three token shapes: Supabase access tokens (`SUPABASE_JWT_SECRET`), backend-minted JWTs (`APP_JWT_SECRET`), and PocketID-issued tokens (JWKS validation).

---

## Roadmap

What's shipped today (alpha):
- Capture (PWA) · Transcription (Groq + Deepgram) · Tags & notes · Storage abstraction · Auto-transcribe toggle

What's in progress / planned:
- Android app released alongside backend (Flutter, V1.2)
- MediaStore observer on Android (instant pickup of phone dictaphone files)
- WorkManager-backed background upload (survive app kill)
- Sync panel persistent across restarts (Drift)
- Optional MCP server for AI agents (Claude / others) to query and act on your sessions

Roadmap items live in the `app_nomad_dev.backlog` table in our Supabase instance. The public-issue version will arrive when this repo opens.

---

## Development

```bash
# Backend live reload (host Python)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8400

# Frontend live reload (host Node ≥ 20)
cd frontend
npm install
npm run dev    # http://localhost:5173

# Tests
cd backend && pytest tests/ -v
```

Pre-commit: `gitleaks` is recommended to keep secrets out of commits.

---

## Contributing

This is an early-alpha project run primarily by one person. Bug reports, PRs welcomed.

- Before opening a non-trivial PR, please open an issue first to discuss approach.
- All contributions must be compatible with the AGPL-3.0 license.
- Style guide: keep PRs small, focused, and tested. Backend follows PEP 8 (`ruff`), frontend follows the repo's existing CSS conventions.

---

## License

NOMAD is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means: anyone can use, modify, and redistribute the code, including running it on a server. **However**, any modification deployed publicly (including SaaS) must be made available under the same license. See [LICENSE](LICENSE) for the full text.

Copyright (C) 2026 Martin Graham
