import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
WYNONA_HOST = os.getenv("WYNONA_HOST", "")
WYNONA_WOL_MAC = os.getenv("WYNONA_WOL_MAC", "")

# OIDC (PocketID)
OIDC_ISSUER_URL = os.getenv("OIDC_ISSUER_URL", "")
OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID", "")
OIDC_CLIENT_SECRET = os.getenv("OIDC_CLIENT_SECRET", "")
OIDC_REDIRECT_URI = os.getenv("OIDC_REDIRECT_URI", "")
APP_JWT_SECRET = os.getenv("APP_JWT_SECRET", "")
APP_FRONTEND_URL = os.getenv("APP_FRONTEND_URL", "https://nomad.mgdesign.cloud")

# Storage backend (local | nextcloud | s3 | supabase)
STORAGE_DRIVER = os.getenv("STORAGE_DRIVER", "supabase").strip().lower()

# Public URL of this backend, used to construct audio_url that external services
# (Groq, Deepgram) can reach. Required when STORAGE_DRIVER != "supabase".
PUBLIC_BACKEND_URL = os.getenv("PUBLIC_BACKEND_URL", "https://nomad-api.mgdesign.cloud").rstrip("/")

# Require a signed JWT token (?token=...) on /api/audio/{id} requests.
# When false, the endpoint falls back to security-through-obscurity (UUIDv4 = 122 bits).
# Recommended: true for prod, false for dev with browser tools that can't sign URLs.
AUDIO_TOKEN_REQUIRED = os.getenv("AUDIO_TOKEN_REQUIRED", "false").lower() == "true"

# Audio token TTL in minutes — should be short enough to reduce leak risk
# but long enough for a user to start playback / for transcription to download.
AUDIO_TOKEN_TTL_MINUTES = int(os.getenv("AUDIO_TOKEN_TTL_MINUTES", "60"))
