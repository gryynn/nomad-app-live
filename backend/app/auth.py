"""
Supabase Auth — JWT validation for NOMAD API.

Provides FastAPI dependencies to extract the authenticated user
from a Supabase-issued JWT in the Authorization header.
"""

import jwt
from fastapi import Header, HTTPException
from app.config import SUPABASE_JWT_SECRET


async def get_current_user(authorization: str = Header(None)) -> dict:
    """Extract and validate user from Supabase JWT. Raises 401 if invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization[7:]  # strip "Bearer "

    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured (missing JWT secret)")

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
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
    """Same as get_current_user but returns None instead of 401.
    Useful for endpoints that work with or without auth (transition period)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
