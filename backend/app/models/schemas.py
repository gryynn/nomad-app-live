from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


# Request schemas (Create/Update)
class SessionCreate(BaseModel):
    duration: int
    input_mode: str = "record"
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None
    transcribe: Optional[bool] = None
    engine: Optional[str] = "auto"


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None


class TagCreate(BaseModel):
    name: str
    emoji: str = "🏷️"
    color: str = "#6B7280"
    transcribe: bool = False
    parent_id: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    transcribe: Optional[bool] = None
    parent_id: Optional[str] = None


class NoteCreate(BaseModel):
    content: str
    type: str = "text"


class MarkCreate(BaseModel):
    time: int
    label: Optional[str] = None


class TranscribeRequest(BaseModel):
    engine: str = "auto"


class TagAssociation(BaseModel):
    tag_ids: list[str]


# Response schemas
class MarkResponse(BaseModel):
    id: str
    session_id: str
    time: int
    label: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NoteResponse(BaseModel):
    id: str
    session_id: str
    content: str
    type: str
    created_at: datetime

    class Config:
        from_attributes = True


class TagResponse(BaseModel):
    id: str
    name: str
    emoji: str
    color: str
    transcribe: bool
    parent_id: Optional[str] = None
    mirai_item_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    session_count: Optional[int] = None

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    title: Optional[str] = None
    status: str
    duration: int
    input_mode: str
    content: Optional[str] = None
    device_info: Optional[Any] = None
    browser_info: Optional[Any] = None
    audio_path: Optional[str] = None
    transcription: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    user_id: Optional[str] = None
    tags: Optional[list[TagResponse]] = None
    notes: Optional[list[NoteResponse]] = None
    marks: Optional[list[MarkResponse]] = None

    class Config:
        from_attributes = True
