import os
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import datetime, timezone

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision.models.video import mc3_18

from app.database import SessionLocal
from app.models import Camera, Detection, UserSetting
from app.services.email_service import notify_detection_async

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETECTION_FOLDER = os.path.join(BASE_DIR, "static", "detections")
SCUFFLE_MODEL_PATH = os.path.join(BASE_DIR, "models", "model_16_m3_0.8888.pth")

os.makedirs(DETECTION_FOLDER, exist_ok=True)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
FRAME_SKIP = 2
CLIP_LENGTH = 16
CLIP_STRIDE = 4
FRAME_SIZE = 112
DEFAULT_THRESHOLD = 0.45
LOG_COOLDOWN_SECONDS = 8
KINETICS_MEAN = torch.tensor([0.43216, 0.394666, 0.37645], dtype=torch.float32).view(3, 1, 1)
KINETICS_STD = torch.tensor([0.22803, 0.22145, 0.216989], dtype=torch.float32).view(3, 1, 1)


@dataclass
class ScuffleArtifacts:
    model: nn.Module | None
    ready: bool
    num_classes: int = 2
    positive_class_index: int = 1
    clip_length: int = CLIP_LENGTH
    error: str | None = None


@dataclass
class ScuffleInferenceResult:
    confidence: float
    predicted_positive: bool


def _safe_torch_load(path: str):
    try:
        return torch.load(path, map_location=DEVICE, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=DEVICE)


def _extract_state_dict(checkpoint) -> OrderedDict:
    if isinstance(checkpoint, OrderedDict):
        return checkpoint
    if isinstance(checkpoint, dict):
        for key in ("model_state_dict", "state_dict"):
            value = checkpoint.get(key)
            if isinstance(value, OrderedDict):
                return value
    raise ValueError("Unsupported fight model checkpoint format")


def _build_fight_model(num_classes: int) -> nn.Module:
    model = mc3_18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def _load_artifacts() -> ScuffleArtifacts:
    if not os.path.exists(SCUFFLE_MODEL_PATH):
        return ScuffleArtifacts(model=None, ready=False, error="Missing fight model checkpoint")

    try:
        checkpoint = _safe_torch_load(SCUFFLE_MODEL_PATH)
        state_dict = _extract_state_dict(checkpoint)

        fc_weight = state_dict.get("fc.weight")
        if fc_weight is None or len(fc_weight.shape) != 2:
            raise ValueError("Checkpoint is missing fc.weight")

        num_classes = int(fc_weight.shape[0])
        positive_class_index = 1 if num_classes > 1 else 0

        model = _build_fight_model(num_classes).to(DEVICE)
        model.load_state_dict(state_dict)
        model.eval()

        print(f"[ScuffleDetection] Loaded fight model from {SCUFFLE_MODEL_PATH}")
        return ScuffleArtifacts(
            model=model,
            ready=True,
            num_classes=num_classes,
            positive_class_index=positive_class_index,
            clip_length=CLIP_LENGTH,
        )
    except Exception as exc:
        print(f"[ScuffleDetection] Failed to load fight model: {exc}")
        return ScuffleArtifacts(model=None, ready=False, error=str(exc))


ARTIFACTS = _load_artifacts()


def _prepare_frame(frame: np.ndarray) -> torch.Tensor:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LINEAR)
    tensor = torch.from_numpy(resized).permute(2, 0, 1).float() / 255.0
    tensor = (tensor - KINETICS_MEAN) / KINETICS_STD
    return tensor


def _infer_scuffle_clip(model: nn.Module, clip_tensor: torch.Tensor, positive_class_index: int) -> ScuffleInferenceResult:
    with torch.no_grad():
        logits = model(clip_tensor)
        probs = torch.softmax(logits, dim=1)[0]
        confidence = float(probs[positive_class_index].item())

    return ScuffleInferenceResult(
        confidence=confidence,
        predicted_positive=confidence >= 0.5,
    )


def _save_scuffle_detection(
    frame,
    camera_id: str,
    bbox: list[float],
    confidence: float,
    frame_time_ms: float | None,
    subtype: str = "fight",
):
    detections_logged = []
    db = SessionLocal()

    try:
        camera = db.query(Camera).filter(Camera.id == str(camera_id)).first()
        if not camera:
            return detections_logged

        settings = db.query(UserSetting).filter(UserSetting.user_id == camera.user_id).first()
        scuffle_threshold = settings.scuffle_threshold if settings else DEFAULT_THRESHOLD
        recipients = []
        email_alerts_enabled = bool(getattr(settings, "email_alerts_enabled", True)) if settings else True
        if email_alerts_enabled and settings and settings.alert_emails:
            recipients = [email.strip() for email in settings.alert_emails.split(",") if email.strip()]
        elif email_alerts_enabled and camera.user and camera.user.email:
            recipients = [camera.user.email]
        if confidence < scuffle_threshold:
            return detections_logged

        timestamp = datetime.now(timezone.utc)
        detection = Detection(
            camera_id=camera.id,
            user_id=camera.user_id,
            type="scuffle",
            subtype=subtype,
            confidence=confidence,
            image_url="",
            timestamp=timestamp,
            status="Active",
        )
        db.add(detection)
        db.commit()
        db.refresh(detection)

        annotated_frame = frame.copy()
        h, w = frame.shape[:2]
        x1 = int(bbox[0] * w)
        y1 = int(bbox[1] * h)
        x2 = int(bbox[2] * w)
        y2 = int(bbox[3] * h)

        color = (0, 165, 255)
        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            annotated_frame,
            f"scuffle-{subtype} {confidence:.2f}",
            (max(x1, 10), max(y1 - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

        filename = f"{camera_id}_{timestamp.strftime('%Y%m%d%H%M%S%f')}_scuffle.jpg"
        save_path = os.path.join(DETECTION_FOLDER, filename)
        cv2.imwrite(save_path, annotated_frame)
        relative_url = f"/static/detections/{filename}"

        db.query(Detection).filter(Detection.id == detection.id).update({"image_url": relative_url})
        db.commit()

        detections_logged.append(
            {
                "detection_id": detection.id,
                "camera_id": camera.id,
                "type": "scuffle",
                "subtype": subtype,
                "confidence": confidence,
                "timestamp": timestamp.isoformat(),
                "bbox": bbox,
                "frame_time_ms": frame_time_ms,
            }
        )
        notify_detection_async(
            recipients=recipients,
            camera_name=camera.name or str(camera.id),
            detection_type="scuffle",
            subtype=subtype,
            confidence=confidence,
            timestamp=timestamp.isoformat(),
            image_url=relative_url,
        )
        print(f"[ScuffleDetection] Detected {subtype} with {confidence:.2f} confidence")
    except Exception as exc:
        db.rollback()
        print(f"[ScuffleDetection] Error storing detection: {exc}")
    finally:
        db.close()

    return detections_logged


class ScuffleSequenceDetector:
    def __init__(self):
        self.ready = ARTIFACTS.ready
        self.error = ARTIFACTS.error
        self.model = ARTIFACTS.model
        self.clip_length = ARTIFACTS.clip_length
        self.positive_class_index = ARTIFACTS.positive_class_index
        self.clip_frames: deque[torch.Tensor] = deque(maxlen=self.clip_length)
        self.frame_index = 0
        self.clip_counter = 0
        self.last_logged_at = 0.0

    def process_frame(self, frame, camera_id: str, frame_time_ms: float | None = None):
        if not self.ready or self.model is None:
            return []

        self.frame_index += 1
        if self.frame_index % FRAME_SKIP != 0:
            return []

        try:
            self.clip_frames.append(_prepare_frame(frame))
        except Exception as exc:
            print(f"[ScuffleDetection] Frame preprocessing failed: {exc}")
            return []

        if len(self.clip_frames) < self.clip_length:
            return []

        self.clip_counter += 1
        if self.clip_counter % CLIP_STRIDE != 0:
            return []

        clip_tensor = torch.stack(list(self.clip_frames), dim=1).unsqueeze(0).to(DEVICE)

        try:
            inference = _infer_scuffle_clip(self.model, clip_tensor, self.positive_class_index)
        except Exception as exc:
            print(f"[ScuffleDetection] Fight inference failed: {exc}")
            return []

        if not inference.predicted_positive:
            return []

        now = time.time()
        if now - self.last_logged_at < LOG_COOLDOWN_SECONDS:
            return []

        self.last_logged_at = now
        return _save_scuffle_detection(
            frame,
            camera_id,
            [0.0, 0.0, 1.0, 1.0],
            inference.confidence,
            frame_time_ms,
            subtype="fight",
        )
