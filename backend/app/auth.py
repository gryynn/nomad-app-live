"""
PocketID OIDC + local JWT authentication for NOMAD API.

Flow:
1. /api/auth/login → redirect to PocketID authorize
2. PocketID → /api/auth/callback?code=xxx
3. Backend exchanges code for tokens, validates ID token via JWKS
4. Backend mints a local HS256 JWT (24h expiry)
5. Redirects to frontend with ?oidc_token=xxx
6. Frontend stores token, sends as Bearer on all API calls
"""

import time
import secrets
from datetime import datetime, timezone, timedelta

import jwt
import httpx
from fastapi import Header, HTTPException
from app.config import (
    OIDC_ISSUER_URL,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_REDIRECT_URI,
    APP_JWT_SECRET,
)

# ─── OIDC Discovery cache ────────────────────────────
_oidc_config = None
_jwks_client = None


async def get_oidc_config() -> dict:
    """Fetch and cache OIDC discovery document."""
    global _oidc_config
    if _oidc_config:
        return _oidc_config
    url = f"{OIDC_ISSUER_URL}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        _oidc_config = resp.json()
    return _oidc_config


def get_jwks_client() -> jwt.PyJWKClient:
    """Get or create a JWKS client for PocketID token validation."""
    global _jwks_client
    if _jwks_client:
        return _jwks_client
    jwks_uri = f"{OIDC_ISSUER_URL}/.well-known/jwks.json"
    _jwks_client = jwt.PyJWKClient(jwks_uri)
    return _jwks_client


def validate_id_token(id_token: str) -> dict:
    """Validate a PocketID ID token using JWKS (RS256)."""
    jwks = get_jwks_client()
    signing_key = jwks.get_signing_key_from_jwt(id_token)
    payload = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=OIDC_CLIENT_ID,
        issuer=OIDC_ISSUER_URL,
    )
    return payload


# ─── CSRF state store (in-memory, TTL 5min) ──────────
_pending_states = {}


def create_auth_state() -> str:
    """Generate and store a CSRF state parameter."""
    state = secrets.token_urlsafe(32)
    _pending_states[state] = time.time()
    # Cleanup expired states (> 5 min)
    cutoff = time.time() - 300
    for k in list(_pending_states):
        if _pending_states[k] < cutoff:
            del _pending_states[k]
    return state


def verify_auth_state(state: str) -> bool:
    """Verify and consume a CSRF state parameter."""
    ts = _pending_states.pop(state, None)
    if ts is None:
        return False
    return (time.time() - ts) < 300


# ─── Local JWT (issued by this backend) ──────────────

def create_access_token(user_id: str, email: str, expires_hours: int = 24) -> str:
    """Mint a local HS256 JWT after successful OIDC authentication."""
    payload = {
        "sub": user_id,
        "email": email,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, APP_JWT_SECRET, algorithm="HS256")


async def get_current_user(authorization: str = Header(None)) -> dict:
    """Extract and validate user from local JWT. Raises 401 if invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization[7:]  # strip "Bearer "

    if not APP_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured (missing APP_JWT_SECRET)")

    try:
        payload = jwt.decode(token, APP_JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user ID")

    return {
        "id": user_id,
        "email": payload.get("email", ""),
    }


async def get_optional_user(authorization: str = Header(None)) -> dict | None:
    """Same as get_current_user but returns None instead of 401."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
