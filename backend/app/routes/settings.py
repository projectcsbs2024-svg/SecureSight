# app/routes/settings.py
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import UserSetting
from app.routes.auth import get_current_user
from app.services.email_service import email_service_ready, send_detection_alert_email

router = APIRouter(prefix="/settings", tags=["Settings"])

class SettingsRequest(BaseModel):
    alert_emails: list[str]
    weapon_threshold: float = 0.8
    scuffle_threshold: float = 0.7
    stampede_threshold: float = 0.75

class SettingsResponse(BaseModel):
    alert_emails: list[str]
    weapon_threshold: float
    scuffle_threshold: float
    stampede_threshold: float

@router.get("/", response_model=SettingsResponse)
def get_settings_safe(user=Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(UserSetting).filter(UserSetting.user_id == user.id).first()
    if not settings:
        return SettingsResponse(
            alert_emails=["test@example.com"],
            weapon_threshold=0.8,
            scuffle_threshold=0.7,
            stampede_threshold=0.75
        )
    alert_emails = settings.alert_emails.split(",") if settings.alert_emails else []
    return SettingsResponse(
        alert_emails=alert_emails,
        weapon_threshold=settings.weapon_threshold,
        scuffle_threshold=settings.scuffle_threshold,
        stampede_threshold=settings.stampede_threshold
    )

@router.post("/", response_model=SettingsResponse)
def create_or_update_settings_safe(req: SettingsRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(UserSetting).filter(UserSetting.user_id == user.id).first()
    if not settings:
        settings = UserSetting(
            user_id=user.id,
            alert_emails=",".join(req.alert_emails),
            weapon_threshold=req.weapon_threshold,
            scuffle_threshold=req.scuffle_threshold,
            stampede_threshold=req.stampede_threshold
        )
        db.add(settings)
    else:
        settings.alert_emails = ",".join(req.alert_emails)
        settings.weapon_threshold = req.weapon_threshold
        settings.scuffle_threshold = req.scuffle_threshold
        settings.stampede_threshold = req.stampede_threshold

    db.commit()
    db.refresh(settings)
    return SettingsResponse(
        alert_emails=req.alert_emails,
        weapon_threshold=settings.weapon_threshold,
        scuffle_threshold=settings.scuffle_threshold,
        stampede_threshold=settings.stampede_threshold
    )


@router.post("/test_email")
def send_test_email(user=Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(UserSetting).filter(UserSetting.user_id == user.id).first()
    recipients = []
    if settings and settings.alert_emails:
        recipients = [email.strip() for email in settings.alert_emails.split(",") if email.strip()]
    elif user.email:
        recipients = [user.email]

    if not recipients:
        raise HTTPException(status_code=400, detail="No alert recipient emails configured")

    ready, reason = email_service_ready()
    if not ready:
        raise HTTPException(status_code=400, detail=f"Email service not configured: {reason}")

    success, error = send_detection_alert_email(
        recipients=recipients,
        camera_name="SecureSight Test Camera",
        detection_type="test-alert",
        subtype="settings-check",
        confidence=1.0,
        timestamp=datetime.now(timezone.utc).isoformat(),
        image_url=None,
    )
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to send email: {error}")

    return {"message": f"Test email sent to {len(recipients)} recipient(s)"}
