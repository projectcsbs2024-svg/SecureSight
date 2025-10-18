from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import Camera
from typing import Optional, List
from app.routes.auth import get_current_user
import shutil
import os

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
    # Return a URL that can be accessed via browser
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
    last_camera = db.query(Camera).filter(Camera.user_id == user.id).order_by(Camera.id.desc()).first()
    new_id = str(int(last_camera.id) + 1) if last_camera else "1"  # numeric ID only

    new_camera = Camera(
        id=new_id,
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
def update_camera(camera_id: str, camera: CameraUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    for field in ["name", "latitude", "longitude", "location", "status", "stream_url", "detections_enabled"]:
        value = getattr(camera, field)
        if value is not None:
            setattr(db_camera, field, value)

    db.commit()
    db.r

# ----------------------
# Delete camera
# ----------------------
@router.delete("/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Optional: remove uploaded video file if exists
    if db_camera.stream_url and db_camera.stream_url.startswith("/videos/"):
        file_path = os.path.join("uploads", os.path.basename(db_camera.stream_url))
        if os.path.exists(file_path):
            os.remove(file_path)
    
    db.delete(db_camera)
    db.commit()
    return {"message": "Camera deleted successfully"}
