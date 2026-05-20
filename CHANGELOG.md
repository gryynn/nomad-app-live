# Changelog

All notable changes to NOMAD are tracked here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and dates use
ISO 8601.

## [Unreleased]

### Operations
- `auto-deploy.sh` now retries network operations up to 3× with 15 s
  backoff. Cron occasionally raced Tailscale / conntrack and missed
  pushed commits without it.

## [0.21.0] — 2026-05-20

### Added
- **Sign-up allowlist**: new `POST /api/signup` endpoint enforces the
  `SIGNUP_ALLOWLIST` env (mix of exact emails and `@domain` entries).
  Self-hosters set `disable_signup: true` in Supabase Auth and let the
  backend gate who can create an account. `SIGNUP_OPEN=true` re-opens
  it for public demos.
- Frontend sign-up form now routes through `/api/signup` instead of
  calling `supabase.auth.signUp()` directly.

## [0.20.3] — 2026-05-19

### Fixed
- Auto-transcribe was silently skipped on the assemble path: the PWA
  showed "Transcription dispo plus tard" but never POSTed to
  `/api/transcribe`. Backend now triggers it from
  `_do_assembly_background` after the upload completes, respecting the
  user's `auto_transcribe` pref.

## [0.20.2] — 2026-05-19

### Fixed
- **Recording session ID is now a UUID** (`crypto.randomUUID()` instead
  of `"rec_" + Date.now()`) so `/upload/assemble` no longer 500s when
  Postgres rejects the non-UUID id.
- **`uploadAudio` Strategies 1 & 2** (direct upload to Supabase Storage)
  are now gated on `storage_driver === "supabase"`. With any other
  driver, `/upload/complete` recorded a `local` storage_key for a file
  that actually lived in Supabase → 404 on `/api/audio` later. Fix:
  exposing the driver via new `GET /api/config` and falling back to the
  backend proxy when it's not Supabase.

### Added
- `GET /api/config` — exposes `{storage_driver}` to the frontend.

## [0.20.1] — 2026-05-19

### Added
- **Multi-tenant API keys**: services accept an optional `api_key=`
  param. Routers resolve the caller's key via
  `resolve_api_key(user_id, vendor)` before invocation, with env
  fallback for single-tenant self-hosts. Covers `/transcribe`,
  `/transcribe/chunk`, and the Deepgram WS proxy
  `/transcribe/stream`.
- Settings UI for storing API keys (Groq / Deepgram / OpenAI / WYNONA
  endpoint) per user — write-only, never returned in clear.
- **MCP HTTP for claude.ai**: `/api/mcp` discovery + `/api/mcp/call`
  invocation, 9 tools, Bearer auth, RLS-scoped per user.

### Fixed
- Revert `prettifyTitle` PWA hack — display the raw DB title to avoid
  masking real outliers (one regex fits all → false fallbacks).

## [0.20.0] — 2026-05-19

### Added
- Sign-up form on the login screen (3 modes: magic-link, password,
  sign-up).
- Three-profile docker-compose override examples (HDD bind, Traefik
  upstream, Cloudflare Tunnel sidecar) in
  `docker-compose.override.example.yml`.

## [0.19.x] — 2026-05-18

### Added
- Auto-transcribe toggle in the Capture panel, persisted server-side
  via `app_nomad.user_settings.auto_transcribe`.
- Sort sessions by `recorded_at` instead of `created_at`.
- Persistent SyncPanel queue (SharedPreferences JSON, survives app
  kills).
- Photo attachments tied to a session (full-stack: backend router +
  PWA UI).
- Deepgram WebSocket proxy for live streaming transcripts
  (`/transcribe/stream`, gated behind `STREAMING_ENABLED=true`).
- MCP NOMAD stdio + HTTP server.

## [0.18.0] — 2026-05-18

### Added
- Storage driver `local` validated in prod (mount at
  `recordings/PWA-local/`), `STORAGE_KEY_PREFIX` env var added.
- Default session title from the source filename on legacy uploads.

## [0.17.x] — 2026-05-17

### Added
- **Storage backend abstraction**: `StorageBackend` ABC with 4 drivers
  (`local`, `nextcloud`, `s3`, `supabase`). Choice via `STORAGE_DRIVER`
  env, signed URLs for handing audio to external services.
- **RLS strict** on `app_nomad.sessions/tags/notes/session_tags/
  session_attachments` (`auth.uid()` instead of hard-coded user) and
  on storage buckets.
- AGPL-3.0 LICENSE.

[Unreleased]: https://github.com/gryynn/nomad-app-live/compare/v0.21.0...HEAD
[0.21.0]: https://github.com/gryynn/nomad-app-live/compare/v0.20.3...v0.21.0
[0.20.3]: https://github.com/gryynn/nomad-app-live/compare/v0.20.2...v0.20.3
[0.20.2]: https://github.com/gryynn/nomad-app-live/compare/v0.20.1...v0.20.2
[0.20.1]: https://github.com/gryynn/nomad-app-live/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/gryynn/nomad-app-live/compare/v0.19.3...v0.20.0
