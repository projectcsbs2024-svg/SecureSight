from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Detection, Camera
from app.routes.auth import get_current_user
from datetime import datetime
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import UserSetting
from app.routes.auth import get_current_user


router = APIRouter(prefix="/detections", tags=["Detections"])

UPLOAD_FOLDER = "uploads"

# Ensure uploads folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@router.post("/{camera_id}/upload")
def add_detection_with_file(
    camera_id: str,
    confidence: float,
    status: str = "active",
    action_file: UploadFile = File(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check camera ownership
    camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Generate detection ID
    last_detection = db.query(Detection).filter(Detection.camera_id == camera_id).order_by(Detection.id.desc()).first()
    if last_detection:
        last_num = int(last_detection.id.split("_")[1])
        detection_id = f"{camera_id}_{last_num + 1}"
    else:
        detection_id = f"{camera_id}_1"

    # Save uploaded file
    file_ext = os.path.splitext(action_file.filename)[1]
    filename = f"{detection_id}{file_ext}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(action_file.file, buffer)

    # Determine action type
    action_type = "video" if file_ext.lower() in [".mp4", ".mov"] else "photo"

    # Save detection in DB
    detection = Detection(
        id=detection_id,
        camera_id=camera_id,
        confidence=confidence,
        status=status,
        action=action_type,
        time=datetime.utcnow()
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    return {
        "detection_id": detection.id,
        "camera_id": camera_id,
        "action_type": action_type,
        "file_path": file_path
    }
