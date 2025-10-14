from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from app import models, schemas
from app.database import get_db  # Your DB session dependency

app = FastAPI()

@app.get("/settings/{user_mail}", response_model=schemas.UserSettingsSchema)
def get_user_settings(user_mail: str, db: Session = Depends(get_db)):
    # Query the user settings from the database
    user_settings = db.query(models.UserSettings).filter(models.UserSettings.user_mail == user_mail).first()
    
    if not user_settings:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user_settings
