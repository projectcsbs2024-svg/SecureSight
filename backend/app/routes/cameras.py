from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Camera
from app.routes.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models import UserSetting
from app.routes.auth import get_current_user


router = APIRouter(prefix="/cameras", tags=["Cameras"])

@router.post("/")
def add_camera(name: str, latitude: float, longitude: float,
               user=Depends(get_current_user), db: Session = Depends(get_db)):
    # Generate camera_id like CAM001
    last_camera = db.query(Camera).filter(Camera.user_id == user.id).order_by(Camera.id.desc()).first()
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
        user_id=user.id
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera

@router.get("/")
def get_cameras(user=Depends(get_current_user), db: Session = Depends(get_db)):
    cameras = db.query(Camera).filter(Camera.user_id == user.id).all()
    return cameras

@router.put("/{camera_id}")
def update_camera(camera_id: str, name: str = None, latitude: float = None,
                  longitude: float = None, status: str = None,
                  user=Depends(get_current_user), db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if name: camera.name = name
    if latitude: camera.latitude = latitude
    if longitude: camera.longitude = longitude
    if status: camera.status = status

    db.commit()
    db.refresh(camera)
    return camera

@router.delete("/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user), db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id, Camera.user_id == user.id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    db.delete(camera)
    db.commit()
    return {"detail": "Camera deleted successfully"}
