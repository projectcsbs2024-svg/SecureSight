from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import UserSetting
from ..routes.auth import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("/")
def get_settings(user=Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(UserSetting).filter(UserSetting.user_id == user.id).first()
    return settings

@router.post("/")
def create_or_update_settings(alert_emails: str, weapon_threshold: float = 0.8,
                              scuffle_threshold: float = 0.7, stampede_threshold: float = 0.75,
                              user=Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(UserSetting).filter(UserSetting.user_id == user.id).first()
    if not settings:
        settings = UserSetting(
            user_id=user.id,
            alert_emails=alert_emails,
            weapon_threshold=weapon_threshold,
            scuffle_threshold=scuffle_threshold,
            stampede_threshold=stampede_threshold
        )
        db.add(settings)
    else:
        settings.alert_emails = alert_emails
        settings.weapon_threshold = weapon_threshold
        settings.scuffle_threshold = scuffle_threshold
        settings.stampede_threshold = stampede_threshold

    db.commit()
    db.refresh(settings)
    return settings
