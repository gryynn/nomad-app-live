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
