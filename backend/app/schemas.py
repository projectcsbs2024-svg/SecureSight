# app/schemas.py
from pydantic import BaseModel
from typing import Optional

class CameraCreate(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    stream_url: Optional[str] = None
