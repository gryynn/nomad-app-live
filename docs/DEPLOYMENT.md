# Deployment — NOMAD PWA

## Production Setup (GREEN-LAB)

### Prerequisites

- Docker + Docker Compose
- Traefik reverse proxy (already running)
- Cloudflare Tunnel to `nomad.mgdesign.cloud`
- Tailscale for WYNONA access

### Deploy

```bash
# On GREEN-LAB
cd ~/docker/nomad
git pull
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d
```

Auto-deploy: `auto-deploy.sh` runs via cron every minute, pulls latest and rebuilds if changed.

### Environment Variables

Backend env in `backend/.env`:

```bash
cp .env.example backend/.env
nano backend/.env
```

Required:
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY`
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `WYNONA_HOST` (Tailscale IP)
- `WYNONA_WOL_MAC` (for Wake-on-LAN)

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are passed as build args to the frontend Docker build via `--env-file backend/.env`.

### Traefik Labels

The root `docker-compose.yml` includes Traefik labels for automatic routing:

- Frontend: `nomad.green-lab.local` (local HTTPS) + `nomad.mgdesign.cloud` (public HTTP)
- API: `nomad-api.green-lab.local` (local HTTPS) + `nomad-api.mgdesign.cloud` (public HTTP)

### Cloudflare Tunnel

Ensure the tunnel config includes:

```yaml
ingress:
  - hostname: nomad.mgdesign.cloud
    service: http://traefik:80
  - hostname: nomad-api.mgdesign.cloud
    service: http://traefik:80
```

### Docker Rules

- **ONE** `docker-compose.yml` at repo root — never create alternatives
- Always use `--env-file backend/.env` for build args
- Domain = `nomad.mgdesign.cloud` — never use `recorder.mgdesign.cloud`

---

## WYNONA Setup (Local GPU)

### Prerequisites

- Docker Desktop with NVIDIA Container Toolkit
- RTX 4070 Super (or any CUDA GPU)
- Tailscale connected

### Container

The WhisperX container runs on WYNONA independently. It exposes:

- `GET /health` — readiness check
- `POST /transcribe` — batch transcription
- `WS /ws/transcribe` — streaming transcription

```bash
# On WYNONA
cd ~/docker/whisperx-stream
docker compose up -d
```

The container uses `restart: unless-stopped` so it auto-starts with Docker Desktop.

Model loading takes ~15s after container start.

---

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8400
```

### Both (concurrent)

```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && uvicorn app.main:app --reload --port 8400
```

---

## Monitoring

- Traefik dashboard: `https://traefik.mgdesign.cloud`
- Supabase dashboard: `https://supabase.com/dashboard/project/gabiryokeepqpatsfogs`
- WYNONA health: `http://100.x.x.x:8765/health` (Tailscale)
