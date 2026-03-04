# CLAUDE.md — NOMAD PWA

## Project Overview

NOMAD is a PWA for universal audio capture and transcription. It replaces a 6-step Raspberry Pi pipeline with a single web app accessible from any device.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS v4, in `frontend/`
- **Backend**: FastAPI (Python 3.12), in `backend/`
- **Database**: Supabase PostgreSQL, schema `app_nomad`
- **Storage**: Supabase Storage, bucket `nomad-audio`
- **Transcription**: Groq Whisper, Deepgram Nova-3, WhisperX (local GPU on WYNONA)

## Key Conventions

- Frontend uses JSX (not TSX) — no TypeScript for now
- Tailwind v4 with CSS-first configuration (no tailwind.config.js needed)
- Theme system: OLED (pure black #000) and Light mode, controlled via React context
- Accent color OLED: `#C8FF00` (lime), Light: `#1A1A1A` (near black)
- Branding: "N O M A D" with letter-spacing, not "NOMAD"
- All API calls go through `frontend/src/lib/api.js`
- Supabase client in `frontend/src/lib/supabase.js`
- Version centralized in `frontend/package.json`, injected via Vite `define` (`__APP_VERSION__`)
- Multi-user ready: every table has a `user_id` column

## Database

- Schema: `app_nomad` (Supabase REST headers: `Accept-Profile: app_nomad`)
- Tables: `sessions`, `tags`, `session_tags`, `notes`
- Existing data: `sessions` has 247+ legacy rows — do NOT drop or alter destructively
- New tables are added via Supabase migrations
- Tags are hierarchical (parent_id self-reference)
- Tags have optional `mirai_item_id` for future Mirai integration

## Supabase Storage

- Bucket: `nomad-audio`
- File size limit: must be set to >= 500 MB in Supabase Dashboard → Storage → Settings
- RLS policy required for direct uploads (anon key):
  ```sql
  CREATE POLICY "Allow audio uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'nomad-audio');
  ```
- Upload strategies (cascading fallback):
  1. Direct XHR to Supabase Storage (with progress, needs anon key)
  2. Supabase JS client (reliable, no progress)
  3. Backend proxy (slowest, goes through Cloudflare Tunnel)

## Frontend Structure

```
frontend/src/
  components/   # Reusable UI components
  hooks/        # Custom React hooks (audio, devices, engine, theme, offline)
  lib/          # API clients (api.js), Supabase client (supabase.js)
  pages/        # Route-level components
  styles/       # Theme tokens, mvp.css
```

## Backend Structure

```
backend/app/
  main.py       # FastAPI entry point, CORS config
  routers/      # sessions, tags, engines, upload, transcribe
  services/     # groq_service, deepgram_service, wynona_service, queue_manager
  models/       # Pydantic schemas
  config.py     # Environment config
```

## Transcription Engines

| Engine | Trigger | File size | Cost |
|--------|---------|-----------|------|
| Groq Whisper Turbo | Auto (< 25 MB) | Max 25 MB | ~$0.01/h |
| Deepgram Nova-3 | Auto (> 25 MB) | No limit | ~$0.25/h |
| WhisperX (WYNONA) | Manual or WYNONA online | No limit | Free (local GPU) |

Auto-engine selection: checks file size via HEAD request, routes to Groq or Deepgram.

## Commands

```bash
# Frontend dev
cd frontend && npm run dev

# Backend dev
cd backend && uvicorn app.main:app --reload --port 8400

# Production (from repo root)
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d
```

## Infrastructure

- GREEN-LAB: always-on server hosting the app (Debian 12, Docker, Traefik)
- WYNONA: on-demand GPU server (RTX 4070 Super, WhisperX)
- Cloudflare Tunnel: public access at nomad.mgdesign.cloud
- Tailscale: GREEN-LAB ↔ WYNONA private network
- Auto-deploy: `auto-deploy.sh` runs via cron every minute on GREEN-LAB

## Docker

- **ONE** `docker-compose.yml` at the **repo root** — never create alternatives
- Always use `--env-file backend/.env` for build args (Supabase keys for frontend)
- Domain prod = `nomad.mgdesign.cloud` (frontend) + `nomad-api.mgdesign.cloud` (API)
- Domain local = `nomad.green-lab.local` + `nomad-api.green-lab.local`
- Never use `recorder.mgdesign.cloud` — that domain does not exist

## Important Rules

- Never drop or truncate `sessions` — it has 247+ legacy recordings
- New columns on existing tables use `ADD COLUMN IF NOT EXISTS`
- Audio files go to Supabase Storage, not local filesystem
- Frontend must work offline (Service Worker + IndexedDB)
- Always test with both OLED and Light themes
