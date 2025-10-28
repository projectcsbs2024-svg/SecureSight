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
os.makedirs(DETECTION_FOLDER, exist_ok=True)

# ----------------------------------------------------
# Load YOLO model globally
# ----------------------------------------------------
WEAPON_MODEL_PATH = os.path.join(BASE_DIR, "models", "weapon.pt")
model = YOLO(WEAPON_MODEL_PATH)

# ----------------------------------------------------
# Weapon class mapping
# ----------------------------------------------------
WEAPON_CLASSES = {
    0: "knife",
    1: "pistol",
    2: "rifle",
}


# ----------------------------------------------------
# Detection function
# ----------------------------------------------------
def detect_weapons_from_frame(frame, camera_id: str):
    """
    Detect weapons in a frame using YOLOv8 and store detections.
    Saves annotated detection images in app/static/detections/
    and logs them into the database.
    """
    detections_logged = []
    db = SessionLocal()

    try:
        camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
        if not camera:
            print(f"[WeaponDetection] Camera {camera_id} not found in DB.")
            return detections_logged

        user_id = camera.user_id
        timestamp = datetime.now(timezone.utc)

        # -----------------------------
        # Run YOLO model prediction
        # -----------------------------
        results = model.predict(frame, verbose=False)
        annotated_frame = frame.copy()  # draw all boxes here
        any_detection = False

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                if cls_id not in WEAPON_CLASSES:
                    continue

                any_detection = True
                subtype = WEAPON_CLASSES[cls_id]
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                # Draw bounding box + label
                color = (0, 255, 0)
                label = f"{subtype} {conf:.2f}"
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    annotated_frame,
                    label,
                    (x1, max(y1 - 10, 20)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    color,
                    2,
                )

                # Save detection record
                try:
                    detection = Detection(
                        camera_id=camera.id,
                        user_id=user_id,
                        type="weapon",
                        subtype=subtype,
                        confidence=conf,
                        image_url="",  # filled after saving image
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
                        "confidence": conf,
                        "timestamp": timestamp.isoformat()
                    })

                    print(f"[WeaponDetection] ✅ Logged detection {detection.id} ({subtype})")

                except Exception as e:
                    db.rollback()
                    print(f"[WeaponDetection] ❌ Failed to save detection: {e}")

        # -----------------------------
        # Save annotated image (if any detection found)
        # -----------------------------
        if any_detection:
            filename = f"{camera_id}_{timestamp.strftime('%Y%m%d%H%M%S%f')}.jpg"
            save_path = os.path.join(DETECTION_FOLDER, filename)
            cv2.imwrite(save_path, annotated_frame)

            relative_url = f"/static/detections/{filename}"

            # Update image_url for all detections in this frame
            for det in detections_logged:
                db.query(Detection).filter(Detection.id == det["detection_id"]).update(
                    {"image_url": relative_url}
                )
            db.commit()

            print(f"[WeaponDetection] 💾 Saved annotated frame {filename}")

    except Exception as e:
        print(f"[WeaponDetection] ❌ Error running detection: {e}")

    finally:
        db.close()

    return detections_logged
