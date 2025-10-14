# schemas.py
from pydantic import BaseModel
from typing import List, Optional

class UserSettingsSchema(BaseModel):
    user_mail: str
    alert_email: Optional[List[str]] = []
    weapon_threshold: float
    scuffle_threshold: float
    stamped_threshold: float

    class Config:
        orm_mode = True
