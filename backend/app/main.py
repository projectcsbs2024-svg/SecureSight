from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Annotated, List, Any
from app import models
from app.database import engine, SessionLocal
from sqlalchemy.orm import Session

app = FastAPI()

# Create tables if they don't exist
models.Base.metadata.create_all(bind=engine)

# Pydantic model for response
class UserResponse(BaseModel):
    user_mail: str
    user_name: str

    class Config:
        orm_mode = True

class UserSettingsResponse(BaseModel):
    user_mail: str
    alert_email: Any | None = None
    weapon_threshold: float | None = 0.65
    scuffle_threshold: float | None = 0.65
    stamped_threshold: float | None = 0.65

    class Config:
        orm_mode = True


# Dependency for database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

db_dependency = Annotated[Session, Depends(get_db)]

# Route to fetch all users
@app.get("/users", response_model=List[UserResponse], status_code=status.HTTP_200_OK)
def get_users(db: db_dependency):
    users = db.query(models.User).all()
    if not users:
        raise HTTPException(status_code=404, detail="No users found")
    return users


@app.get("/user_settings/{user_mail}", response_model=UserSettingsResponse)
def get_user_settings(user_mail: str, db: db_dependency):
    settings = db.query(models.UserSettings).filter(
        models.UserSettings.user_mail == user_mail
    ).first()

    if not settings:
        raise HTTPException(
            status_code=404,
            detail=f"No settings found for user_mail '{user_mail}'"
        )
    return settings