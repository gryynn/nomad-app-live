"""POST /api/signup — backend-proxied user creation.

Why this exists: Supabase's open `auth.signUp` endpoint lets anybody create
an account, which on a self-hosted instance means random users could fill
your disk and burn your Groq/Deepgram quota. The intended workflow for a
self-hosted NOMAD is:

  1. Operator sets `disable_signup: true` in Supabase Auth settings
     (Dashboard → Authentication → Providers → Email → Enable Signups: off).
  2. Operator sets `SIGNUP_ALLOWLIST` in backend `.env` — comma-separated
     mix of exact emails and `@domain` patterns:

        SIGNUP_ALLOWLIST="jeanne@example.com,@nuagegreen.eu,toto@example.fr"

  3. Frontend sign-up form POSTs to /api/signup. We check the allowlist,
     then call the Supabase admin API (service_role) to create the user
     and finally hand back a real session the frontend can apply.

If `SIGNUP_ALLOWLIST` is unset *and* `SIGNUP_OPEN=true`, the endpoint is
effectively open — useful for the public OSS demo, never for prod.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


router = APIRouter(prefix="/signup", tags=["signup"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class SignupResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    email: str


def _parse_allowlist() -> list[str]:
    raw = os.environ.get("SIGNUP_ALLOWLIST", "") or ""
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def _is_allowed(email: str, allowlist: list[str]) -> bool:
    """An entry matches if it equals the email OR is `@domain` matching the
    email's domain part. Comparison is case-insensitive."""
    email = email.lower().strip()
    if "@" not in email:
        return False
    domain = "@" + email.split("@", 1)[1]
    for entry in allowlist:
        if entry.startswith("@"):
            if entry == domain:
                return True
        elif entry == email:
            return True
    return False


@router.post("", response_model=SignupResponse)
async def signup(req: SignupRequest):
    allowlist = _parse_allowlist()
    signup_open = os.environ.get("SIGNUP_OPEN", "").lower() == "true"

    if not allowlist and not signup_open:
        # No allowlist configured *and* open mode off → effectively closed.
        raise HTTPException(
            status_code=503,
            detail="Sign-up is disabled on this instance. Contact the admin.",
        )

    if allowlist and not _is_allowed(req.email, allowlist):
        raise HTTPException(
            status_code=403,
            detail="This email is not in the sign-up allowlist for this instance.",
        )

    if len(req.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters.",
        )

    # 1. Create the user via Supabase Admin API. email_confirm=true bypasses
    #    the "verify your email" step — admin-created users are pre-trusted.
    admin_headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        create_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=admin_headers,
            json={
                "email": req.email,
                "password": req.password,
                "email_confirm": True,
            },
        )
        if create_resp.status_code == 422:
            # Already registered — fall through to sign-in below so the user
            # gets a usable session instead of a dead-end error.
            pass
        elif create_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=500,
                detail=f"Supabase admin create failed ({create_resp.status_code}): {create_resp.text[:200]}",
            )

        # 2. Sign the new user in to mint an access_token + refresh_token.
        signin_resp = await client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
            },
            json={"email": req.email, "password": req.password},
        )
        if signin_resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Sign-in after sign-up failed ({signin_resp.status_code}): {signin_resp.text[:200]}",
            )
        tokens = signin_resp.json()

    user = tokens.get("user") or {}
    return SignupResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user_id=user.get("id", ""),
        email=user.get("email", req.email),
    )
