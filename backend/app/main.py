from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Annotated, List, Any
from app import models
from app.database import engine, SessionLocal
from app.firebase import get_uid_from_token  # ✅ import your Firebase helper
from sqlalchemy.orm import Session

app = FastAPI()

origins = [
    "http://localhost:5173",   # Vite dev server
    "http://127.0.0.1:5173",   # sometimes needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)

# ----------------------------------------------------------
# Pydantic models
# ----------------------------------------------------------
class UserResponse(BaseModel):
    user_mail: str
    user_name: str
    uid: str

    class Config:
        orm_mode = True


class UserSettingsRequest(BaseModel):
    alert_email: Any | None = None
    weapon_threshold: float | None = 0.65
    scuffle_threshold: float | None = 0.65
    stamped_threshold: float | None = 0.65


class UserSettingsResponse(UserSettingsRequest):
    uid: str


# ----------------------------------------------------------
# Database dependency
# ----------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

db_dependency = Annotated[Session, Depends(get_db)]

# ----------------------------------------------------------
# Routes
# ----------------------------------------------------------

@app.get("/users", response_model=List[UserResponse], status_code=status.HTTP_200_OK)
def get_users(db: db_dependency):
    users = db.query(models.User).all()
    if not users:
        raise HTTPException(status_code=404, detail="No users found")
    return users


# ✅ Get user settings for logged-in user
@app.get("/user_settings", response_model=UserSettingsResponse)
def get_user_settings(
    uid: str = Depends(get_uid_from_token),
    db: Session = Depends(get_db),
):
    settings = db.query(models.UserSettings).filter(models.UserSettings.uid == uid).first()

    if not settings:
        raise HTTPException(status_code=404, detail=f"No settings found for uid '{uid}'")
    return settings


# ✅ Update or create user settings
@app.post("/user_settings", response_model=UserSettingsResponse)
def save_user_settings(
    settings_data: UserSettingsRequest,
    uid: str = Depends(get_uid_from_token),
    db: Session = Depends(get_db),
):
    settings = db.query(models.UserSettings).filter(models.UserSettings.uid == uid).first()

    if settings:
        settings.alert_email = settings_data.alert_email
        settings.weapon_threshold = settings_data.weapon_threshold
        settings.scuffle_threshold = settings_data.scuffle_threshold
        settings.stamped_threshold = settings_data.stamped_threshold
    else:
        settings = models.UserSettings(
            uid=uid,
            alert_email=settings_data.alert_email,
            weapon_threshold=settings_data.weapon_threshold,
            scuffle_threshold=settings_data.scuffle_threshold,
            stamped_threshold=settings_data.stamped_threshold,
        )
        db.add(settings)

    db.commit()
    db.refresh(settings)
    return settings
