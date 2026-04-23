import os
import time
from datetime import datetime, timezone
from dataclasses import dataclass

import cv2
from ultralytics import YOLO

from app.database import SessionLocal
from app.models import Camera, Detection, UserSetting
from app.services.email_service import notify_detection_async

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETECTION_FOLDER = os.path.join(BASE_DIR, "static", "detections")
STAMPEDE_MODEL_PATH = os.path.join(BASE_DIR, "models", "my_image_model.pt")
POSE_MODEL_PATH = os.path.join(BASE_DIR, "models", "yolo11m-pose.pt")
DEFAULT_STAMPEDE_THRESHOLD = 0.75
LOG_COOLDOWN_SECONDS = 8
PERSON_LABELS = {"person", "people", "pedestrian", "human"}

os.makedirs(DETECTION_FOLDER, exist_ok=True)


@dataclass
class StampedeArtifacts:
    model: YOLO | None
    source: str | None
    ready: bool
    error: str | None = None


def _load_model():
    candidates = [
        ("stampede", STAMPEDE_MODEL_PATH),
        ("pose-fallback", POSE_MODEL_PATH),
    ]
    errors = []

    for source, path in candidates:
        if not os.path.exists(path):
            errors.append(f"{source}: missing file {path}")
            continue

        try:
            model = YOLO(path)
            print(f"[StampedeDetection] Loaded {source} model from {path}")
            return StampedeArtifacts(model=model, source=source, ready=True)
        except Exception as exc:
            errors.append(f"{source}: {exc}")

    error_message = "; ".join(errors) if errors else "No stampede model candidates available"
    print(f"[StampedeDetection] Failed to load any model: {error_message}")
    return StampedeArtifacts(model=None, source=None, ready=False, error=error_message)


ARTIFACTS = _load_model()
MODEL = ARTIFACTS.model


def _class_name(result, cls_id: int) -> str:
    names = getattr(result, "names", None)
    if names is None and MODEL is not None:
        names = getattr(getattr(MODEL, "model", None), "names", None)

    if isinstance(names, dict):
        value = names.get(cls_id, "")
    elif isinstance(names, list) and 0 <= cls_id < len(names):
        value = names[cls_id]
    else:
        value = ""
    return str(value or "").strip().lower()


def _extract_person_boxes(result, width: int, height: int):
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []

    all_boxes = []
    person_boxes = []

    for box in boxes:
        cls_id = int(box.cls.item()) if getattr(box, "cls", None) is not None else -1
        conf = float(box.conf.item()) if getattr(box, "conf", None) is not None else 0.0
        x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())
        normalized = [
            max(0.0, min(1.0, x1 / max(width, 1))),
            max(0.0, min(1.0, y1 / max(height, 1))),
            max(0.0, min(1.0, x2 / max(width, 1))),
            max(0.0, min(1.0, y2 / max(height, 1))),
        ]
        item = {
            "cls_id": cls_id,
            "conf": conf,
            "label": _class_name(result, cls_id),
            "bbox": normalized,
            "xyxy": [int(x1), int(y1), int(x2), int(y2)],
        }
        all_boxes.append(item)
        if item["label"] in PERSON_LABELS:
            person_boxes.append(item)

    return person_boxes or all_boxes


def _union_bbox(boxes):
    if not boxes:
        return [0.0, 0.0, 1.0, 1.0]

    x1 = min(box["bbox"][0] for box in boxes)
    y1 = min(box["bbox"][1] for box in boxes)
    x2 = max(box["bbox"][2] for box in boxes)
    y2 = max(box["bbox"][3] for box in boxes)
    if x2 <= x1 or y2 <= y1:
        return [0.0, 0.0, 1.0, 1.0]
    return [x1, y1, x2, y2]


def _overlay_boxes(boxes):
    overlays = []
    for item in boxes:
        overlays.append(
            {
                "bbox": item["bbox"],
                "label": item["label"] or "person",
                "confidence": item["conf"],
            }
        )
    return overlays


class StampedeDetector:
    def __init__(self):
        self.model = ARTIFACTS.model
        self.model_source = ARTIFACTS.source
        self.ready = ARTIFACTS.ready
        self.error = ARTIFACTS.error
        self.last_logged_at = 0.0

    def process_frame(self, frame, camera_id: str, frame_time_ms: float | None = None):
        if not self.ready or self.model is None:
            return []

        db = SessionLocal()
        try:
            camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
            if not camera:
                return []

            allowed_people = camera.stampede_person_limit
            if allowed_people is None or allowed_people <= 0:
                return []

            settings = db.query(UserSetting).filter(UserSetting.user_id == camera.user_id).first()
            stampede_threshold = settings.stampede_threshold if settings else DEFAULT_STAMPEDE_THRESHOLD
            recipients = []
            email_alerts_enabled = bool(getattr(settings, "email_alerts_enabled", True)) if settings else True
            if email_alerts_enabled and settings and settings.alert_emails:
                recipients = [email.strip() for email in settings.alert_emails.split(",") if email.strip()]
            elif email_alerts_enabled and camera.user and camera.user.email:
                recipients = [camera.user.email]
        finally:
            db.close()

        try:
            results = self.model.predict(frame, verbose=False, conf=stampede_threshold)
        except Exception as exc:
            print(f"[StampedeDetection] Inference failed for camera {camera_id}: {exc}")
            return []

        if not results:
            return []

        height, width = frame.shape[:2]
        person_boxes = _extract_person_boxes(results[0], width, height)
        people_count = len(person_boxes)

        if people_count <= allowed_people:
            return []

        now = time.time()
        if now - self.last_logged_at < LOG_COOLDOWN_SECONDS:
            return []
        self.last_logged_at = now

        timestamp = datetime.now(timezone.utc)
        annotated_frame = frame.copy()
        for item in person_boxes:
            x1, y1, x2, y2 = item["xyxy"]
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

        summary_label = f"stampede {people_count}/{allowed_people}"
        cv2.putText(
            annotated_frame,
            summary_label,
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            2,
        )

        filename = f"{camera_id}_{timestamp.strftime('%Y%m%d%H%M%S%f')}_stampede.jpg"
        save_path = os.path.join(DETECTION_FOLDER, filename)
        relative_url = f"/static/detections/{filename}"

        write_ok = cv2.imwrite(save_path, annotated_frame)
        if not write_ok:
            relative_url = None

        bbox = _union_bbox(person_boxes)
        overlay_boxes = _overlay_boxes(person_boxes)

        db = SessionLocal()
        try:
            camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
            if not camera:
                return []

            detection = Detection(
                camera_id=camera.id,
                user_id=camera.user_id,
                type="stampede",
                subtype=None,
                confidence=None,
                people_count=people_count,
                image_url=relative_url or "",
                timestamp=timestamp,
                status="Active",
            )
            db.add(detection)
            db.commit()
            db.refresh(detection)

            notify_detection_async(
                recipients=recipients,
                camera_name=camera.name or str(camera.id),
                detection_type="stampede",
                subtype=f"{people_count} people (limit {allowed_people})",
                confidence=None,
                timestamp=timestamp.isoformat(),
                image_url=relative_url,
            )

            print(
                f"[StampedeDetection] Camera {camera.id} exceeded limit: "
                f"{people_count} people detected, allowed {allowed_people}"
            )

            return [
                {
                    "detection_id": detection.id,
                    "camera_id": camera.id,
                    "type": "stampede",
                    "subtype": None,
                    "confidence": None,
                    "people_count": people_count,
                    "allowed_people": allowed_people,
                    "timestamp": timestamp.isoformat(),
                    "bbox": bbox,
                    "overlay_boxes": overlay_boxes,
                    "frame_time_ms": frame_time_ms,
                    "image_url": relative_url,
                }
            ]
        except Exception as exc:
            db.rollback()
            print(f"[StampedeDetection] Failed to store detection for camera {camera_id}: {exc}")
            return []
        finally:
            db.close()
