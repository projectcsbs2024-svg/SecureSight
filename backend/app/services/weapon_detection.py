import os
import cv2
from datetime import datetime, timezone
from ultralytics import YOLO
from app.database import SessionLocal
from app.models import Detection, Camera

# ----------------------------------------------------
# Paths
# ----------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # app/
DETECTION_FOLDER = os.path.join(BASE_DIR, "static", "detections")

# Ensure the detection folder exists
os.makedirs(DETECTION_FOLDER, exist_ok=True)

# ----------------------------------------------------
# Load YOLO model globally (only once)
# ----------------------------------------------------
WEAPON_MODEL_PATH = os.path.join(BASE_DIR, "models", "weapon.pt")
model = YOLO(WEAPON_MODEL_PATH)  # Global model load

# ----------------------------------------------------
# Weapon class mapping (YOLO class_id -> subtype)
# ----------------------------------------------------
WEAPON_CLASSES = {
    0: "gun",
    1: "knife",
    2: "rifle",
    # Add more if your YOLO model detects other types
}

# ----------------------------------------------------
# Detection function
# ----------------------------------------------------
def detect_weapons_from_frame(frame, camera_id: str):
    """
    Detect weapons in a frame using YOLOv8 and store detections.
    Saves detection images in `app/static/detections/`
    and records their relative URLs in the database.
    """
    detections_logged = []
    db = SessionLocal()

    try:
        # Fetch camera record
        camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
        if not camera:
            print(f"[WeaponDetection] Camera {camera_id} not found in DB.")
            return detections_logged

        user_id = camera.user_id
        timestamp = datetime.now(timezone.utc)  # UTC-aware timestamp

        # Run YOLO model prediction
        results = model.predict(frame, verbose=False)

        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                confidence = float(box.conf[0])

                # Skip non-weapon classes
                if cls_id not in WEAPON_CLASSES:
                    continue

                subtype = WEAPON_CLASSES.get(cls_id, "unknown")

                # -----------------------------
                # Save detection image
                # -----------------------------
                filename = f"{camera_id}_{timestamp.strftime('%Y%m%d%H%M%S%f')}.jpg"
                save_path = os.path.join(DETECTION_FOLDER, filename)
                cv2.imwrite(save_path, frame)

                # Generate relative URL for frontend
                relative_url = f"/static/detections/{filename}"

                # -----------------------------
                # Save detection record in DB
                # -----------------------------
                try:
                    detection = Detection(
                        camera_id=camera.id,
                        user_id=user_id,
                        type="weapon",
                        subtype=subtype,
                        confidence=confidence,
                        image_url=relative_url,
                        timestamp=timestamp,
                        status="Active",
                    )
                    db.add(detection)
                    db.commit()
                    db.refresh(detection)

                    detections_logged.append({
                        "detection_id": detection.id,
                        "camera_id": camera.id,
                        "subtype": subtype,
                        "confidence": confidence,
                        "image_url": relative_url,
                        "timestamp": timestamp.isoformat()
                    })

                    print(f"[WeaponDetection] ✅ Saved detection {detection.id} ({subtype}) for camera {camera.id}")
                except Exception as e:
                    db.rollback()
                    print(f"[WeaponDetection] ❌ Failed to save detection: {e}")

    except Exception as e:
        print(f"[WeaponDetection] ❌ Error running detection: {e}")

    finally:
        db.close()

    return detections_logged
