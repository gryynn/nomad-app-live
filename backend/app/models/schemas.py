from pydantic import BaseModel
from typing import Optional
from datetime import datetime


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


class NoteCreate(BaseModel):
    content: str
    type: str = "text"


class MarkCreate(BaseModel):
    time: int
    label: Optional[str] = None


class TranscribeRequest(BaseModel):
    engine: str = "auto"
