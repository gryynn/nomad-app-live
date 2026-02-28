# Deployment — NOMAD PWA

## Production Setup (GREEN-LAB)

### Prerequisites

- Docker + Docker Compose
- Traefik reverse proxy (already running)
- Cloudflare Tunnel to `recorder.mgdesign.cloud`
- Tailscale for WYNONA access

### Deploy

```bash
# On GREEN-LAB
cd ~/docker/nomad-pwa
git pull
docker compose -f docker/docker-compose.yml up -d --build
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
nano .env
```

Required:
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `WYNONA_HOST` (Tailscale IP)
- `WYNONA_WOL_MAC` (for Wake-on-LAN)

### Traefik Labels

The `docker-compose.yml` includes Traefik labels for automatic routing:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.nomad.rule=Host(`recorder.mgdesign.cloud`)"
  - "traefik.http.routers.nomad.tls=true"
  - "traefik.http.services.nomad.loadbalancer.server.port=8400"
```

### Cloudflare Tunnel

Ensure the tunnel config includes:

```yaml
ingress:
  - hostname: recorder.mgdesign.cloud
    service: http://traefik:443
    originRequest:
      noTLSVerify: true
```

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
