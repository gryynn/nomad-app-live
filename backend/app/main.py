from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import httpx
from app.routers import sessions, tags, engines, upload, transcribe, audio, preferences, attachments, transcribe_stream, mcp_server
from app.auth import (
    get_current_user,
    get_oidc_config,
    validate_id_token,
    create_auth_state,
    verify_auth_state,
    create_access_token,
)
from app.config import (
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_REDIRECT_URI,
    APP_FRONTEND_URL,
)

app = FastAPI(
    title="NOMAD API",
    description="Universal audio capture & transcription backend",
    version="0.1.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nomad.mgdesign.cloud",
        "http://nomad.mgdesign.cloud",
        "https://nomad.green-lab.local",
        "https://nomad-api.mgdesign.cloud",
        "http://nomad-api.mgdesign.cloud",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers with /api prefix
app.include_router(sessions.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(tags.sessions_tags_router, prefix="/api")
app.include_router(engines.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(transcribe.router, prefix="/api")
app.include_router(audio.router, prefix="/api")
app.include_router(preferences.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(transcribe_stream.router, prefix="/api")
app.include_router(mcp_server.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "nomad-api"}


@app.get("/api/config")
async def public_config():
    """Public runtime config the frontend needs to know — storage driver name
    so uploadAudio knows whether direct-to-Supabase strategies are usable."""
    from app.services.storage import get_storage_backend
    return {"storage_driver": get_storage_backend().name}


@app.get("/api/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return {"user_id": user["id"], "email": user["email"]}


@app.get("/api/auth/login")
async def auth_login():
    """Initiate OIDC login — redirect to PocketID authorize endpoint."""
    oidc = await get_oidc_config()
    state = create_auth_state()
    authorize_url = oidc["authorization_endpoint"]
    params = (
        f"?client_id={OIDC_CLIENT_ID}"
        f"&redirect_uri={OIDC_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=openid+profile+email"
        f"&state={state}"
    )
    return RedirectResponse(url=f"{authorize_url}{params}", status_code=302)


@app.get("/api/auth/callback")
async def auth_callback(code: str = None, state: str = None, error: str = None):
    """Handle OIDC callback from PocketID."""
    if error:
        return RedirectResponse(url=f"{APP_FRONTEND_URL}?auth_error={error}", status_code=302)

    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    if not verify_auth_state(state):
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    # Exchange code for tokens
    oidc = await get_oidc_config()
    token_url = oidc["token_endpoint"]

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": OIDC_CLIENT_ID,
                "client_secret": OIDC_CLIENT_SECRET,
                "redirect_uri": OIDC_REDIRECT_URI,
                "code": code,
            },
        )
        if resp.status_code != 200:
            print(f"[AUTH] Token exchange failed: {resp.status_code} {resp.text}")
            return RedirectResponse(
                url=f"{APP_FRONTEND_URL}?auth_error=token_exchange_failed",
                status_code=302,
            )
        token_data = resp.json()

    # Validate ID token via JWKS
    id_token = token_data.get("id_token")
    if not id_token:
        return RedirectResponse(
            url=f"{APP_FRONTEND_URL}?auth_error=no_id_token",
            status_code=302,
        )

    try:
        claims = await validate_id_token(id_token)
    except Exception as e:
        print(f"[AUTH] ID token validation failed: {e}")
        return RedirectResponse(
            url=f"{APP_FRONTEND_URL}?auth_error=invalid_id_token",
            status_code=302,
        )

    user_id = claims.get("sub")
    email = claims.get("email", "")
    print(f"[AUTH] OIDC login success: {email} ({user_id})")

    # Mint local JWT
    local_token = create_access_token(user_id, email)

    # Redirect to frontend with token
    return RedirectResponse(
        url=f"{APP_FRONTEND_URL}?oidc_token={local_token}",
        status_code=302,
    )
