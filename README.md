# N O M A D

Universal audio capture & intelligent transcription PWA

## Concept

Application PWA pour capturer, transcrire et organiser des enregistrements audio.
4 modes de capture : Record (micro), Live (transcription temps reel), Import (fichier), Paste (texte).
Transcription multi-moteurs : Groq Whisper (cloud), Deepgram (cloud), Scriberr/WYNONA (local GPU).
Tags hierarchiques, marks temporels, notes, recherche full-text.

## Architecture

- **Frontend** : React 19 + Vite + Tailwind v4 (PWA, offline-first)
- **Backend** : FastAPI Python 3.12 (REST API, proxy Supabase)
- **Database** : Supabase PostgreSQL, schema `app_nomad` (7 tables, RLS)
- **Infra** : Docker Compose, Traefik reverse proxy, GREEN-LAB (Debian 12)
- **Acces** : nomad.green-lab.local (LAN) / nomad.mgdesign.cloud (Cloudflare Access)

## Schema DB (app_nomad)

| Table | Description |
|-------|-------------|
| `sessions` | Sessions d'enregistrement audio |
| `tags` | Tags hierarchiques avec bridge Mirai optionnel |
| `session_tags` | Association N:N sessions <> tags |
| `notes` | Multi-notes par session (text, photo, drawing, link) |
| `tag_notes` | Notes sur les tags eux-memes |
| `device_prefs` | Preferences device par fingerprint navigateur |
| `engine_usage` | Stats et couts d'utilisation des moteurs |

RLS active, 24 policies, `user_id = 'martun'` (pre-auth).

## Backend API

| Route | Description |
|-------|-------------|
| `/api/sessions` | CRUD sessions, marks, notes, filtres |
| `/api/tags` | CRUD tags, associations N:N |
| `/api/engines` | Status moteurs, wake WYNONA |
| `/api/upload` | Upload audio vers Supabase Storage |
| `/api/transcribe` | Lancement transcription (background) |
| `/api/health` | Health check |

## Deploiement

```bash
git clone https://github.com/gryynn/nomad-app-live.git
cp .env.example .env
docker compose build
docker compose up -d
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Cle publique Supabase |
| `SUPABASE_SERVICE_KEY` | Cle service Supabase (backend only) |
| `GROQ_API_KEY` | API key Groq (Whisper) |
| `DEEPGRAM_API_KEY` | API key Deepgram (Nova-3) |
| `WYNONA_HOST` | Hostname WYNONA pour transcription locale |

## Design

"Whisper v6" — OLED `#000000` / Light `#F0EFEB`, accent sable `#D8CAA0`, fonts Outfit + JetBrains Mono.

## License

MIT
