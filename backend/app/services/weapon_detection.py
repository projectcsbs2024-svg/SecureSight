# app/services/weapon_detection.py

import os
import cv2
from datetime import datetime, timezone
from ultralytics import YOLO
from app.database import SessionLocal
from app.models import Detection, Camera, UserSetting
from app.services.email_service import notify_detection_async

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
def detect_weapons_from_frame(frame, camera_id: str, frame_time_ms: float | None = None):
    """
    Detect weapons in a frame using YOLOv8 and store detections.
    Only detections with confidence >= user's weapon_threshold are saved.
    Saves annotated detection images in app/static/detections/
    and logs them into the database.

    Returns:
        detections_logged: list of detection dicts with normalized coords and timestamps:
            {
                "detection_id": int,
                "camera_id": camera_id,
                "subtype": subtype,
                "confidence": conf,
                "timestamp": isoformat,
                "bbox": [x1_norm, y1_norm, x2_norm, y2_norm],
                "frame_time_ms": frame_time_ms (may be None)
            }
    """
    detections_logged = []
    db = SessionLocal()

    try:
        camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
        if not camera:
            return detections_logged

        user_id = camera.user_id
        camera_name = camera.name or str(camera.id)

        # ----------------------------------------------------
        # Get user's threshold (default 0.8 if not set)
        # ----------------------------------------------------
        settings = db.query(UserSetting).filter(UserSetting.user_id == user_id).first()
        weapon_threshold = settings.weapon_threshold if settings else 0.8
        recipients = []
        if settings and settings.alert_emails:
            recipients = [email.strip() for email in settings.alert_emails.split(",") if email.strip()]
        elif camera.user and camera.user.email:
            recipients = [camera.user.email]

        timestamp = datetime.now(timezone.utc)

        # -----------------------------
        # Run YOLO model prediction
        # -----------------------------
        results = model.predict(frame, verbose=False)
        annotated_frame = frame.copy()
        any_detection = False

        h, w = frame.shape[:2]

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())

                # Skip if not a known weapon
                if cls_id not in WEAPON_CLASSES:
                    continue

                subtype = WEAPON_CLASSES[cls_id]

                # Skip detections below threshold
                if conf < weapon_threshold:
                    continue

                any_detection = True
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                # Draw bounding box + label for storage image
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

                # normalized bbox coordinates (0..1)
                nx1 = max(0.0, min(1.0, x1 / w))
                ny1 = max(0.0, min(1.0, y1 / h))
                nx2 = max(0.0, min(1.0, x2 / w))
                ny2 = max(0.0, min(1.0, y2 / h))

                # Save detection record
                try:
                    detection = Detection(
                        camera_id=camera.id,
                        user_id=user_id,
                        type="weapon",
                        subtype=subtype,
                        confidence=conf,
                        image_url="",
                        timestamp=timestamp,
                        status="Active",
                    )
                    db.add(detection)
                    db.commit()
                    db.refresh(detection)

                    detections_logged.append({
                        "detection_id": detection.id,
                        "camera_id": camera.id,
                        "type": "weapon",
                        "subtype": subtype,
                        "confidence": conf,
                        "timestamp": timestamp.isoformat(),
                        "bbox": [nx1, ny1, nx2, ny2],
                        "frame_time_ms": frame_time_ms
                    })

                    # Only print actual detection logs
                    print(f"[WeaponDetection] Detected {subtype} with {conf:.2f} confidence")

                except Exception:
                    db.rollback()

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
                det["image_url"] = relative_url
            db.commit()

            for det in detections_logged:
                notify_detection_async(
                    recipients=recipients,
                    camera_name=camera_name,
                    detection_type="weapon",
                    subtype=det["subtype"],
                    confidence=det["confidence"],
                    timestamp=det["timestamp"],
                    image_url=det.get("image_url"),
                )

    except Exception as e:
        print(f"[WeaponDetection] Error running detection: {e}")

    finally:
        db.close()

    return detections_logged
