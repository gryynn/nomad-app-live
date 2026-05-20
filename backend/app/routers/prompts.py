"""Prompt templates CRUD.

A prompt template is a reusable AI prompt + model choice that the user can
fire manually against a session, or have auto-fired when a session's tags
overlap `auto_trigger_tag_ids`.

Keys are write-only per `preferences.py` pattern; here the rows themselves
are not secret so plain CRUD is fine. RLS owner-only on the table is the
real guard.
"""
from __future__ import annotations

from typing import Optional, List
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY


router = APIRouter(prefix="/prompts", tags=["prompts"])

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "app_nomad",
    "Content-Profile": "app_nomad",
}
BASE_URL = f"{SUPABASE_URL}/rest/v1"

DEFAULT_MODEL = "anthropic/claude-sonnet-4-6"


class PromptTemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    prompt_text: str = Field(min_length=1)
    model: str = DEFAULT_MODEL
    auto_trigger_tag_ids: List[UUID] = Field(default_factory=list)
    enabled: bool = True


class PromptTemplatePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    prompt_text: Optional[str] = Field(default=None, min_length=1)
    model: Optional[str] = None
    auto_trigger_tag_ids: Optional[List[UUID]] = None
    enabled: Optional[bool] = None


class PromptTemplateOut(BaseModel):
    id: UUID
    name: str
    prompt_text: str
    model: str
    auto_trigger_tag_ids: List[UUID]
    enabled: bool
    created_at: str
    updated_at: str


@router.get("", response_model=List[PromptTemplateOut])
async def list_templates(user=Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(
            f"{BASE_URL}/prompt_templates",
            headers=HEADERS,
            params={
                "user_id": f"eq.{user['id']}",
                "select": "*",
                "order": "created_at.desc",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"list failed: {resp.text[:200]}")
        return resp.json()


@router.post("", response_model=PromptTemplateOut, status_code=201)
async def create_template(body: PromptTemplateIn, user=Depends(get_current_user)):
    payload = {
        "user_id": user["id"],
        "name": body.name,
        "prompt_text": body.prompt_text,
        "model": body.model,
        "auto_trigger_tag_ids": [str(t) for t in body.auto_trigger_tag_ids],
        "enabled": body.enabled,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{BASE_URL}/prompt_templates",
            headers=HEADERS,
            json=payload,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"create failed: {resp.text[:200]}")
        rows = resp.json()
        return rows[0] if isinstance(rows, list) else rows


@router.patch("/{template_id}", response_model=PromptTemplateOut)
async def update_template(template_id: UUID, body: PromptTemplatePatch, user=Depends(get_current_user)):
    update: dict = {}
    if body.name is not None:
        update["name"] = body.name
    if body.prompt_text is not None:
        update["prompt_text"] = body.prompt_text
    if body.model is not None:
        update["model"] = body.model
    if body.auto_trigger_tag_ids is not None:
        update["auto_trigger_tag_ids"] = [str(t) for t in body.auto_trigger_tag_ids]
    if body.enabled is not None:
        update["enabled"] = body.enabled
    if not update:
        raise HTTPException(status_code=400, detail="empty patch")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.patch(
            f"{BASE_URL}/prompt_templates",
            headers=HEADERS,
            params={
                "id": f"eq.{template_id}",
                "user_id": f"eq.{user['id']}",
            },
            json=update,
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"update failed: {resp.text[:200]}")
        rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="template not found")
        return rows[0]


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: UUID, user=Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(
            f"{BASE_URL}/prompt_templates",
            headers=HEADERS,
            params={
                "id": f"eq.{template_id}",
                "user_id": f"eq.{user['id']}",
            },
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"delete failed: {resp.text[:200]}")
        return None
