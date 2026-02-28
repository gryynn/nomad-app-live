from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


# Request schemas (Create/Update)
class SessionCreate(BaseModel):
    title: Optional[str] = None
    input_mode: str = "rec"
    duration_seconds: Optional[int] = None
    audio_url: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mix_mode: str = "mono"
    language: str = "fr"
    engine_used: Optional[str] = None
    offline_created: bool = False


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    transcript: Optional[str] = None
    transcript_segments: Optional[Any] = None
    transcript_words: Optional[int] = None
    engine_used: Optional[str] = None
    marks: Optional[list[dict]] = None
    summary: Optional[str] = None
    error_message: Optional[str] = None


class TagCreate(BaseModel):
    name: str
    emoji: str = "🏷️"
    hue: str = "#6B7280"
    parent_id: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    hue: Optional[str] = None
    parent_id: Optional[str] = None


class NoteCreate(BaseModel):
    content: str


class MarkCreate(BaseModel):
    time: int
    label: Optional[str] = None


class TranscribeRequest(BaseModel):
    engine: str = "auto"


class TagAssociation(BaseModel):
    tag_ids: list[str]


# Response schemas
class NoteResponse(BaseModel):
    id: str
    session_id: str
    content: str
    user_id: str = "martun"
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TagResponse(BaseModel):
    id: str
    name: str
    emoji: Optional[str] = "🏷️"
    hue: Optional[str] = "#6B7280"
    parent_id: Optional[str] = None
    mirai_item_id: Optional[str] = None
    user_id: str = "martun"
    created_at: datetime
    updated_at: Optional[datetime] = None
    session_count: Optional[int] = None

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    title: Optional[str] = None
    status: str = "pending"
    input_mode: str = "rec"
    duration_seconds: Optional[int] = None
    audio_url: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mix_mode: Optional[str] = "mono"
    sources: Optional[Any] = None
    transcript: Optional[str] = None
    transcript_segments: Optional[Any] = None
    transcript_words: Optional[int] = None
    language: Optional[str] = "fr"
    engine_used: Optional[str] = None
    marks: Optional[Any] = None
    summary: Optional[str] = None
    offline_created: Optional[bool] = False
    synced_at: Optional[datetime] = None
    user_id: str = "martun"
    error_message: Optional[str] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    tags: Optional[list[TagResponse]] = None
    notes: Optional[list[NoteResponse]] = None

    class Config:
        from_attributes = True
