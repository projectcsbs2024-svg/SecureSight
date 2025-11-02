# app/routes/cameras.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, WebSocket
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import Camera
from typing import Optional, List
from app.routes.auth import get_current_user
import shutil
import os
import uuid
import csv
from fastapi.responses import StreamingResponse
from io import StringIO

# Import YOLO weapon detection manager singleton
from app.services.weapon_worker import weapon_manager
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/cameras", tags=["Cameras"])

# Directory to store uploaded videos
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ----------------------
# Pydantic models
# ----------------------
class CameraCreate(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location: Optional[str] = None
    stream_url: Optional[str] = None
    detections_enabled: Optional[List[str]] = ["weapon"]  # default to weapon

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location: Optional[str] = None
    status: Optional[str] = None
    stream_url: Optional[str] = None
    detections_enabled: Optional[List[str]] = None

# ----------------------
# Upload video endpoint
# ----------------------
@router.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename, "url": f"/videos/{file.filename}"}

# ----------------------
# Add a new camera
# ----------------------
@router.post("/")
def add_camera(
    camera: CameraCreate,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_camera = Camera(
        id=str(uuid.uuid4()),
        name=camera.name,
        latitude=camera.latitude,
        longitude=camera.longitude,
        location=camera.location,
        stream_url=camera.stream_url,
        user_id=user.id,
        detections_enabled=camera.detections_enabled or ["weapon"]
    )

    db.add(new_camera)
    db.commit()
    db.refresh(new_camera)

    # Start YOLO weapon detection if enabled
    if "weapon" in (new_camera.detections_enabled or []):
        weapon_manager.start_worker(new_camera.id)  # <-- only camera_id now

    return new_camera

# ----------------------
# Get all cameras
# ----------------------
@router.get("/")
def get_cameras(user=Depends(get_current_user), db: Session = Depends(get_db)):
    cameras = db.query(Camera).filter(Camera.user_id == user.id).all()
    return cameras

# ----------------------
# Update camera
# ----------------------
@router.put("/{camera_id}")
def update_camera(
    camera_id: str,
    camera: CameraUpdate,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    for field in ["name", "latitude", "longitude", "location", "status", "stream_url", "detections_enabled"]:
        value = getattr(camera, field)
        if value is not None:
            setattr(db_camera, field, value)

    db.commit()
    db.refresh(db_camera)

    # Start/stop YOLO worker based on detections_enabled
    if "weapon" in (db_camera.detections_enabled or []):
        weapon_manager.stop_worker(db_camera.id)  # stop if already running
        weapon_manager.start_worker(db_camera.id)
    else:
        weapon_manager.stop_worker(db_camera.id)

    return db_camera

# ----------------------
# Delete camera
# ----------------------
@router.delete("/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Stop YOLO worker if running
    weapon_manager.stop_worker(db_camera.id)

    # Optional: remove uploaded video file if exists
    if db_camera.stream_url and db_camera.stream_url.startswith("/videos/"):
        file_path = os.path.join(UPLOAD_DIR, os.path.basename(db_camera.stream_url))
        if os.path.exists(file_path):
            os.remove(file_path)
    
    db.delete(db_camera)
    db.commit()
    return {"message": "Camera deleted successfully"}

# ----------------------
# Export all cameras (CSV)
# ----------------------
@router.get("/export/")
def export_cameras(user=Depends(get_current_user), db: Session = Depends(get_db)):
    cameras = db.query(Camera).filter(Camera.user_id == user.id).all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Name", "Latitude", "Longitude", "Location", "Stream URL", "Detections Enabled", "Status", "Created At"])

    for cam in cameras:
        writer.writerow([
            cam.id,
            cam.name,
            cam.latitude,
            cam.longitude,
            cam.location,
            cam.stream_url,
            ",".join(cam.detections_enabled or []),
            cam.status,
            cam.created_at.strftime("%Y-%m-%d %H:%M:%S") if cam.created_at else ""
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cameras.csv"}
    )

# ----------------------
# WebSocket endpoint for real-time detection boxes
# Frontend should connect to: ws://<host>/cameras/ws/{camera_id}
# ----------------------
@router.websocket("/ws/{camera_id}")
async def camera_ws_endpoint(websocket: WebSocket, camera_id: str):
    """
    Accepts websocket connections from the frontend for a specific camera.
    The ws_manager will broadcast detection messages (as JSON) with keys:
    {
      "camera_id": str,
      "processing_ms": int,
      "detections": [
        {
          "detection_id": int,
          "camera_id": str,
          "subtype": str,
          "confidence": float,
          "timestamp": iso,
          "bbox": [x1_norm, y1_norm, x2_norm, y2_norm],
          "frame_time_ms": float|None
        }, ...
      ]
    }
    """
    await ws_manager.connect(camera_id, websocket)
    try:
        while True:
            # Keep connection alive by receiving (no-op)
            msg = await websocket.receive_text()
            # Optionally, you could use ping/pong or messages from frontend
            # but for now do nothing.
            # If frontend sends "ping" we could respond; skipping for simplicity.
    except Exception:
        pass
    finally:
        ws_manager.disconnect(camera_id, websocket)
