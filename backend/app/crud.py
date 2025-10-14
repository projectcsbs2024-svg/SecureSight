# backend/crud.py

from sqlalchemy.orm import Session
from .models import User, Camera, Detection, UserSetting
from datetime import datetime
from typing import Optional

# -------------------- USER --------------------
def get_user_by_firebase_uid(db: Session, firebase_uid: str):
    return db.query(User).filter(User.firebase_uid == firebase_uid).first()

def create_user(db: Session, firebase_uid: str, email: str):
    user = User(firebase_uid=firebase_uid, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# -------------------- CAMERA --------------------
def get_cameras_by_user(db: Session, user_id: int):
    return db.query(Camera).filter(Camera.user_id == user_id).all()

def get_camera(db: Session, camera_id: str, user_id: int):
    return db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user_id).first()

def create_camera(db: Session, user_id: int, name: str, latitude: float, longitude: float, status: str = "active"):
    # Generate camera_id like CAM001
    last_camera = db.query(Camera).filter(Camera.user_id == user_id).order_by(Camera.id.desc()).first()
    if last_camera:
        last_id = int(last_camera.id.replace("CAM", ""))
        new_id = f"CAM{last_id + 1:03d}"
    else:
        new_id = "CAM001"

    camera = Camera(
        id=new_id,
        name=name,
        latitude=latitude,
        longitude=longitude,
        status=status,
        user_id=user_id
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera

def update_camera(db: Session, camera_id: str, user_id: int, name: Optional[str] = None,
                  latitude: Optional[float] = None, longitude: Optional[float] = None,
                  status: Optional[str] = None, weapon: Optional[bool] = None,
                  scuffle: Optional[bool] = None, stampede: Optional[bool] = None):
    camera = get_camera(db, camera_id, user_id)
    if not camera:
        return None
    if name: camera.name = name
    if latitude: camera.latitude = latitude
    if longitude: camera.longitude = longitude
    if status: camera.status = status
    if weapon is not None: camera.weapon = weapon
    if scuffle is not None: camera.scuffle = scuffle
    if stampede is not None: camera.stampede = stampede

    db.commit()
    db.refresh(camera)
    return camera

def delete_camera(db: Session, camera_id: str, user_id: int):
    camera = get_camera(db, camera_id, user_id)
    if not camera:
        return False
    db.delete(camera)
    db.commit()
    return True

# -------------------- DETECTION --------------------
def get_detections_by_camera(db: Session, camera_id: str):
    return db.query(Detection).filter(Detection.camera_id == camera_id).all()

def create_detection(db: Session, camera_id: str, confidence: float,
                     status: str = "active", action: str = "photo"):
    # Generate detection ID like CAM001_1
    last_detection = db.query(Detection).filter(Detection.camera_id == camera_id).order_by(Detection.id.desc()).first()
    if last_detection:
        last_num = int(last_detection.id.split("_")[1])
        detection_id = f"{camera_id}_{last_num + 1}"
    else:
        detection_id = f"{camera_id}_1"

    detection = Detection(
        id=detection_id,
        camera_id=camera_id,
        confidence=confidence,
        status=status,
        action=action,
        time=datetime.utcnow()
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)
    return detection

# -------------------- USER SETTINGS --------------------
def get_user_settings(db: Session, user_id: int):
    return db.query(UserSetting).filter(UserSetting.user_id == user_id).first()

def create_or_update_user_settings(db: Session, user_id: int, alert_emails: str,
                                   weapon_threshold: float = 0.8,
                                   scuffle_threshold: float = 0.7,
                                   stampede_threshold: float = 0.75):
    settings = get_user_settings(db, user_id)
    if not settings:
        settings = UserSetting(
            user_id=user_id,
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
