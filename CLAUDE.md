# CLAUDE.md — NOMAD PWA

## Project Overview

NOMAD is a PWA for universal audio capture and transcription. It replaces a 6-step Raspberry Pi pipeline with a single web app accessible from any device.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS v4, in `frontend/`
- **Backend**: FastAPI (Python 3.12), in `backend/`
- **Database**: Supabase PostgreSQL, schema `n8n_transcription`
- **Storage**: Supabase Storage for audio files
- **Transcription**: Groq Whisper, Deepgram Nova-3, WhisperX (local GPU on WYNONA)

## Key Conventions

- Frontend uses JSX (not TSX) — no TypeScript for now
- Tailwind v4 with CSS-first configuration (no tailwind.config.js needed)
- Theme system: OLED (pure black #000) and Light mode, controlled via React context
- Accent color OLED: `#C8FF00` (lime), Light: `#1A1A1A` (near black)
- Branding: "N O M A D" with letter-spacing, not "NOMAD"
- All API calls go through `frontend/src/lib/api.js`
- Supabase client in `frontend/src/lib/supabase.js`
- Multi-user ready: every table has or will have a `user_id` column

## Database

- Schema: `n8n_transcription`
- Existing table: `nomad_sessions` (247 rows, do NOT drop or alter destructively)
- New tables are added via Supabase migrations (use `apply_migration` MCP tool)
- Tags are hierarchical (parent_id self-reference)
- Tags have optional `mirai_item_id` for future Mirai integration

## Frontend Structure

```
frontend/src/
  components/   # Reusable UI components
  hooks/        # Custom React hooks (audio, devices, engine, theme, offline)
  lib/          # API clients, utilities
  pages/        # Route-level components
  styles/       # Theme tokens
```

## Backend Structure

```
backend/app/
  main.py       # FastAPI entry point
  routers/      # Route handlers by domain
  services/     # Business logic (transcription engines, queue)
  models/       # Pydantic schemas
  config.py     # Environment config
```

## Commands

```bash
# Frontend dev
cd frontend && npm run dev

# Backend dev
cd backend && uvicorn app.main:app --reload --port 8400

# Production
docker compose -f docker/docker-compose.yml up -d
```

## Infrastructure

- GREEN-LAB: always-on server hosting the app (Debian 12, Docker, Traefik)
- WYNONA: on-demand GPU server (RTX 4070 Super, WhisperX)
- Cloudflare Tunnel: public access at recorder.mgdesign.cloud
- Tailscale: GREEN-LAB ↔ WYNONA private network

## Important Rules

- Never drop or truncate `nomad_sessions` — it has 247 legacy recordings
- New columns on existing tables use `ADD COLUMN IF NOT EXISTS`
- Audio files go to Supabase Storage, not local filesystem
- Frontend must work offline (Service Worker + IndexedDB)
- Always test with both OLED and Light themes
