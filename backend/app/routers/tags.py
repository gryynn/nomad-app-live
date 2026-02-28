import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from app.models.schemas import (
    TagResponse,
    TagCreate,
    TagUpdate,
    TagAssociation,
)

# Supabase REST API configuration
HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    "Accept-Profile": "n8n_transcription",
    "Content-Profile": "n8n_transcription",
}

BASE_URL = f"{SUPABASE_URL}/rest/v1"

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/", response_model=List[TagResponse])
async def list_tags(
    parent_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List all tags with optional parent filter"""
    try:
        # Build query parameters
        params = {
            "select": "*",
            "order": "name.asc",
            "limit": limit,
            "offset": offset,
        }

        # Filter by parent_id if provided
        if parent_id is not None:
            if parent_id == "":
                # Root tags only (null parent_id)
                params["parent_id"] = "is.null"
            else:
                params["parent_id"] = f"eq.{parent_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                params=params,
            )
            response.raise_for_status()
            tags = response.json()

            # Optionally add session count for each tag
            for tag in tags:
                try:
                    count_response = await client.get(
                        f"{BASE_URL}/nomad_session_tags",
                        headers=HEADERS,
                        params={
                            "tag_id": f"eq.{tag['id']}",
                            "select": "count",
                        },
                    )
                    if count_response.status_code == 200:
                        count_data = count_response.headers.get("Content-Range", "")
                        if "/" in count_data:
                            tag["session_count"] = int(count_data.split("/")[1])
                        else:
                            tag["session_count"] = 0
                    else:
                        tag["session_count"] = 0
                except Exception:
                    tag["session_count"] = 0

            return tags
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch tags")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/", response_model=TagResponse, status_code=201)
async def create_tag(tag: TagCreate):
    """Create a new tag"""
    try:
        # Prepare tag data for insertion
        tag_data = {
            "name": tag.name,
            "emoji": tag.emoji,
            "color": tag.color,
            "transcribe": tag.transcribe,
        }

        # Add optional parent_id if provided
        if tag.parent_id is not None:
            tag_data["parent_id"] = tag.parent_id

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                json=tag_data,
            )
            response.raise_for_status()

            created_tag = response.json()
            if isinstance(created_tag, list) and len(created_tag) > 0:
                created_tag = created_tag[0]

            return created_tag
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Failed to create tag")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(tag_id: str):
    """Get a single tag by ID"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                params={
                    "id": f"eq.{tag_id}",
                    "select": "*",
                },
            )
            response.raise_for_status()
            tags = response.json()

            if not tags or len(tags) == 0:
                raise HTTPException(status_code=404, detail="Tag not found")

            tag = tags[0]

            # Add session count
            try:
                count_response = await client.get(
                    f"{BASE_URL}/nomad_session_tags",
                    headers=HEADERS,
                    params={
                        "tag_id": f"eq.{tag_id}",
                        "select": "count",
                    },
                )
                if count_response.status_code == 200:
                    count_data = count_response.headers.get("Content-Range", "")
                    if "/" in count_data:
                        tag["session_count"] = int(count_data.split("/")[1])
                    else:
                        tag["session_count"] = 0
                else:
                    tag["session_count"] = 0
            except Exception:
                tag["session_count"] = 0

            return tag
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Tag not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to fetch tag")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: str, tag_update: TagUpdate):
    """Update a tag"""
    try:
        # Build update data from provided fields
        update_data = {}
        if tag_update.name is not None:
            update_data["name"] = tag_update.name
        if tag_update.emoji is not None:
            update_data["emoji"] = tag_update.emoji
        if tag_update.color is not None:
            update_data["color"] = tag_update.color
        if tag_update.transcribe is not None:
            update_data["transcribe"] = tag_update.transcribe
        if tag_update.parent_id is not None:
            update_data["parent_id"] = tag_update.parent_id

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        async with httpx.AsyncClient() as client:
            # Update the tag
            response = await client.patch(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                params={"id": f"eq.{tag_id}"},
                json=update_data,
            )
            response.raise_for_status()
            updated_tags = response.json()

            if not updated_tags or len(updated_tags) == 0:
                raise HTTPException(status_code=404, detail="Tag not found")

            return updated_tags[0]
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Tag not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to update tag")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: str):
    """Delete a tag"""
    try:
        async with httpx.AsyncClient() as client:
            # Check if tag exists first
            check_response = await client.get(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                params={"id": f"eq.{tag_id}", "select": "id"},
            )
            check_response.raise_for_status()
            tags = check_response.json()

            if not tags or len(tags) == 0:
                raise HTTPException(status_code=404, detail="Tag not found")

            # Delete the tag (junction table entries will cascade delete)
            response = await client.delete(
                f"{BASE_URL}/nomad_tags",
                headers=HEADERS,
                params={"id": f"eq.{tag_id}"},
            )
            response.raise_for_status()

            return None
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Tag not found")
        raise HTTPException(status_code=e.response.status_code, detail="Failed to delete tag")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=503, detail="Database connection failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
