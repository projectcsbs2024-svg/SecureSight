from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Detection, Camera
from app.routes.auth import get_current_user
from datetime import datetime
import os
import shutil

router = APIRouter(prefix="/detections", tags=["Detections"])

UPLOAD_FOLDER = "uploads"
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


@router.post("/{camera_id}/upload")
def add_detection_with_file(
    camera_id: int,
    confidence: float,
    detection_type: str,
    status: str = "active",
    action_file: UploadFile = File(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check camera ownership
    camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Save uploaded file
    file_ext = os.path.splitext(action_file.filename)[1]
    filename = f"{camera_id}_{int(datetime.utcnow().timestamp())}{file_ext}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(action_file.file, buffer)

    # Determine action type
    action_type = "video" if file_ext.lower() in [".mp4", ".mov"] else "photo"

    # Save detection in DB
    detection = Detection(
        camera_id=camera_id,
        user_id=user.id,
        detection_type=detection_type,
        confidence=confidence,
        status=status,
        image_url=file_path,
        timestamp=datetime.utcnow(),
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    return {
        "id": detection.id,
        "camera_id": camera_id,
        "detection_type": detection.detection_type,
        "confidence": detection.confidence,
        "status": detection.status,
        "action_type": action_type,
        "file_path": file_path,
        "timestamp": detection.timestamp,
    }


@router.get("/", summary="Fetch all detections for the logged-in user")
def get_detections(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    detections = (
        db.query(Detection, Camera)
        .join(Camera, Detection.camera_id == Camera.id)
        .filter(Camera.user_id == user.id)
        .order_by(Detection.timestamp.desc())
        .all()
    )

    results = []
    for detection, camera in detections:
        results.append({
            "id": detection.id,
            "camera_name": camera.name,
            "camera_id": detection.camera_id,
            "detection_type": detection.detection_type,
            "confidence": detection.confidence,
            "status": detection.status,
            "image_url": detection.image_url,
            "timestamp": detection.timestamp,
        })

    return results
