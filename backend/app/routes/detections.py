import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import Detection, User, Camera
from app.routes.auth import get_current_user
from typing import List

router = APIRouter(prefix="/detections", tags=["Detections"])

# ---------------------------------------------
# CONFIG: Detection image storage folder
# ---------------------------------------------
DETECTION_FOLDER = os.path.join("app", "static", "detections")
if not os.path.exists(DETECTION_FOLDER):
    os.makedirs(DETECTION_FOLDER)


# -------------------------------------------------------
# Pydantic model for PATCH update
# -------------------------------------------------------
class DetectionUpdate(BaseModel):
    status: str  # Expecting "Active" or "Resolved"


# -------------------------------------------------------
# Helper function to save uploaded detection image
# -------------------------------------------------------
def save_detection_image(file: UploadFile, camera_id: str) -> str:
    """Save uploaded detection image and return relative URL."""
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{camera_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{file_ext}"
    file_path = os.path.join(DETECTION_FOLDER, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return URL relative to API base
    relative_url = f"/static/detections/{filename}"
    return relative_url


# -------------------------------------------------------
# Route: Upload Detection Result (manual or from backend)
# -------------------------------------------------------
@router.post("/upload")
async def upload_detection(
    camera_id: str = Form(...),
    detection_type: str = Form(...),
    confidence: float = Form(...),
    subtype: str = Form(None),
    people_count: int = Form(0),
    status: str = Form("Active"),
    action_file: UploadFile = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload a detection entry — either from backend (YOLO, LSTM, etc.)
    or a manual test upload.
    """
    # Validate camera
    camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Save detection image (if provided)
    relative_url = None
    if action_file:
        relative_url = save_detection_image(action_file, camera_id)

    # Save detection record to DB
    detection = Detection(
        camera_id=camera_id,
        user_id=user.id,
        type=detection_type,
        subtype=subtype,
        confidence=confidence,
        people_count=people_count,
        status=status,
        image_url=relative_url,
        timestamp=datetime.utcnow(),
    )

    db.add(detection)
    db.commit()
    db.refresh(detection)

    return {
        "message": "Detection uploaded successfully",
        "detection_id": detection.id,
        "image_url": relative_url,
    }


# -------------------------------------------------------
# Route: Get All Detections (per user)
# -------------------------------------------------------
@router.get("/")
def get_detections(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Retrieve all detections belonging to the current user.
    """
    detections = (
        db.query(Detection)
        .filter(Detection.user_id == user.id)
        .order_by(Detection.timestamp.desc())
        .all()
    )

    return [
        {
            "id": det.id,
            "camera_id": det.camera_id,
            "camera_name": det.camera.name if det.camera else str(det.camera_id),
            "type": det.type,
            "subtype": det.subtype,
            "confidence": det.confidence,
            "people_count": det.people_count,
            "status": det.status,
            "timestamp": det.timestamp,
            "image_url": det.image_url,
        }
        for det in detections
    ]


# -------------------------------------------------------
# Route: Detection Stats (Safe, No 422)
# -------------------------------------------------------
from fastapi import Request
from datetime import datetime

@router.get("/stats")
def get_detection_stats(request: Request, db: Session = Depends(get_db)):
    """
    Return live detection statistics for dashboard.

    Always returns 200 OK — never raises auth errors.
    Used by LiveView.jsx to show 'Total Alerts Today' and 'Current Alerts'.
    """
    try:
        from app.routes.auth import get_current_user
        user = get_current_user(request=request, db=db)
    except Exception as e:
        print(f"[Stats] Auth skipped due to: {e}")
        user = None

    # Base query (optionally filtered by user)
    query = db.query(Detection)
    if user:
        query = query.filter(Detection.user_id == user.id)

    today = datetime.utcnow().date()
    start_of_day = datetime.combine(today, datetime.min.time())

    total_today = query.filter(Detection.timestamp >= start_of_day).count()
    active = query.filter(Detection.status.ilike("active")).count()
    resolved = query.filter(Detection.status.ilike("resolved")).count()

    return {
        "total_today": total_today,
        "active": active,
        "resolved": resolved
    }


# -------------------------------------------------------
# Route: Get Single Detection
# -------------------------------------------------------
@router.get("/{detection_id}")
def get_detection(
    detection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Retrieve a single detection by ID.
    """
    detection = (
        db.query(Detection)
        .filter(Detection.id == detection_id, Detection.user_id == user.id)
        .first()
    )

    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    return {
        "id": detection.id,
        "camera_id": detection.camera_id,
        "type": detection.type,
        "subtype": detection.subtype,
        "confidence": detection.confidence,
        "people_count": detection.people_count,
        "status": detection.status,
        "timestamp": detection.timestamp,
        "image_url": detection.image_url,
    }


# -------------------------------------------------------
# Route: Delete Detection
# -------------------------------------------------------
@router.delete("/{detection_id}")
def delete_detection(
    detection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Delete a detection and optionally its associated image.
    """
    detection = (
        db.query(Detection)
        .filter(Detection.id == detection_id, Detection.user_id == user.id)
        .first()
    )

    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    # Delete image if exists
    if detection.image_url:
        image_path = detection.image_url.replace("/static", "app/static")
        if os.path.exists(image_path):
            os.remove(image_path)

    db.delete(detection)
    db.commit()

    return {"message": "Detection deleted successfully"}


# -------------------------------------------------------
# Route: Update Detection Status (Active / Resolved)
# -------------------------------------------------------
@router.patch("/{detection_id}")
def update_detection_status(
    detection_id: int,
    update: DetectionUpdate,  # FastAPI parses JSON { "status": "Resolved" }
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Update detection status (Active / Resolved)
    """
    detection = db.query(Detection).filter(
        Detection.id == detection_id, Detection.user_id == user.id
    ).first()

    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    detection.status = update.status
    db.commit()
    db.refresh(detection)

    return {"id": detection.id, "status": detection.status}


# -------------------------------------------------------
# Route: Bulk Delete Detection
# -------------------------------------------------------
class BulkDeleteRequest(BaseModel):
    ids: List[int]

@router.delete("/bulk_delete/")
def bulk_delete_alerts(request: BulkDeleteRequest, db: Session = Depends(get_db)):
    """
    Bulk delete detections by IDs. Also deletes associated images.
    """
    deleted_count = 0
    for alert_id in request.ids:
        alert = db.query(Detection).filter(Detection.id == alert_id).first()
        if alert:
            # Delete the image file if it exists
            if alert.image_url:
                file_path = alert.image_url.replace("/static", "app/static")
                if os.path.exists(file_path):
                    os.remove(file_path)
            db.delete(alert)
            deleted_count += 1
    db.commit()
    return {"deleted": deleted_count}


# -------------------------------------------------------
# Route: Bulk update Detection
# -------------------------------------------------------
class BulkUpdateRequest(BaseModel):
    ids: List[int]
    status: str  # "active" or "resolved"

@router.patch("/bulk_update/")
def bulk_update_detections(
    request: BulkUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Bulk update detection status.
    """
    updated_count = 0
    for det_id in request.ids:
        detection = db.query(Detection).filter(Detection.id == det_id, Detection.user_id == user.id).first()
        if detection:
            detection.status = request.status.lower()  # normalize to lowercase
            updated_count += 1
    db.commit()
    return {"updated": updated_count}


