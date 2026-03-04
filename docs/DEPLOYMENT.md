# Deployment — NOMAD PWA (v0.6.0)

## Production Setup (GREEN-LAB)

### Prerequisites

- Docker + Docker Compose v2
- Traefik reverse proxy (already running)
- Cloudflare Tunnel to `nomad.mgdesign.cloud` + `nomad-api.mgdesign.cloud`
- Tailscale for WYNONA access

### Deploy

```bash
# On GREEN-LAB
cd ~/docker/nomad
git pull origin functional-mvp
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d
```

Auto-deploy: `auto-deploy.sh` runs via cron every minute, pulls latest and rebuilds if changed.

```cron
*/1 * * * * cd ~/docker/nomad && ./auto-deploy.sh >> /var/log/nomad-deploy.log 2>&1
```

### Environment Variables

All env vars in `backend/.env`:

```bash
# Copy template
cp .env.example backend/.env
nano backend/.env
```

| Variable | Used by | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | Backend + Frontend (build arg) | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Backend only | Full-access service key |
| `SUPABASE_ANON_KEY` | Backend + Frontend (build arg) | Public anon key |
| `GROQ_API_KEY` | Backend | Groq Whisper API |
| `DEEPGRAM_API_KEY` | Backend | Deepgram Nova-3 API |
| `WYNONA_HOST` | Backend | Tailscale IP of WYNONA |
| `WYNONA_WOL_MAC` | Backend | Wake-on-LAN MAC address |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are passed to the frontend Docker build via `--env-file backend/.env` → docker-compose `build.args`.

### Supabase Configuration

**Storage bucket `nomad-audio`:**

1. File size limit: Dashboard → Storage → Settings → set to **500 MB** (or more)
2. RLS policy for direct uploads:
   ```sql
   CREATE POLICY "Allow audio uploads"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'nomad-audio');
   ```
3. Bucket must have public read access enabled

**Database schema `app_nomad`:**

- Tables: `sessions`, `tags`, `session_tags`, `notes`
- All accessed via Supabase REST API with `Accept-Profile: app_nomad` header
- Never drop or truncate `sessions` (247+ legacy rows)

### Traefik Routing

Root `docker-compose.yml` configures Traefik labels:

| Router | Domain | Target |
|--------|--------|--------|
| `nomad-frontend` | `nomad.green-lab.local` (HTTPS) | Frontend nginx:80 |
| `nomad-frontend-public` | `nomad.mgdesign.cloud` (HTTP) | Frontend nginx:80 |
| `nomad-api` | `nomad-api.green-lab.local` (HTTPS) | FastAPI:8400 |
| `nomad-api-public` | `nomad-api.mgdesign.cloud` (HTTP) | FastAPI:8400 |

### Cloudflare Tunnel

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

```bash
# On WYNONA
cd ~/docker/whisperx-stream
docker compose up -d
```

Endpoints:
- `GET /health` — readiness check
- `POST /transcribe` — batch transcription

Container uses `restart: unless-stopped`. Model loading takes ~15s after start.

---

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

Vite dev server proxies `/api/*` to `http://localhost:8400` automatically.

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
- Deploy logs: `/var/log/nomad-deploy.log` on GREEN-LAB
