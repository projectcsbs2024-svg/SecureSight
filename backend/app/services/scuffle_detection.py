import os
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone

import cv2
import numpy as np
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler  # noqa: F401
from ultralytics import YOLO

from app.database import SessionLocal
from app.models import Camera, Detection, UserSetting
from app.services.email_service import notify_detection_async

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETECTION_FOLDER = os.path.join(BASE_DIR, "static", "detections")
SCUFFLE_MODEL_PATH = os.path.join(BASE_DIR, "models", "ACO_choking_BiLSTM.pt")
POSE_MODEL_PATH = os.path.join(BASE_DIR, "models", "yolo11m-pose.pt")

os.makedirs(DETECTION_FOLDER, exist_ok=True)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
FRAME_SKIP = 2
CONTACT_THRESHOLD = 0.08
MAX_PERSONS = 2
NUM_KPTS = 17
MC_RUNS = 20
DEFAULT_THRESHOLD = 0.45
LOG_COOLDOWN_SECONDS = 8

IDX_LEFT_SHOULDER = 5
IDX_RIGHT_SHOULDER = 6
IDX_LEFT_ELBOW = 7
IDX_RIGHT_ELBOW = 8
IDX_LEFT_WRIST = 9
IDX_RIGHT_WRIST = 10


class ChokingBiLSTM(nn.Module):
    def __init__(self, input_dim: int, hidden_size: int, dropout: float):
        super().__init__()
        self.lstm = nn.LSTM(
            input_dim,
            hidden_size,
            num_layers=3,
            dropout=dropout,
            batch_first=True,
            bidirectional=True,
        )
        self.fc = nn.Linear(hidden_size * 2, 1)

    def forward(self, x):
        _, (hidden_state, _) = self.lstm(x)
        h_forward = hidden_state[-2]
        h_backward = hidden_state[-1]
        h_combined = torch.cat((h_forward, h_backward), dim=1)
        return self.fc(h_combined)


@dataclass
class ScuffleArtifacts:
    model: ChokingBiLSTM | None
    pose_model: YOLO | None
    scaler: object | None
    window_size: int
    stride: int
    input_dim: int
    ready: bool
    error: str | None = None


@dataclass
class ScuffleInferenceResult:
    confidence: float
    positive_votes: int
    predicted_positive: bool


def _safe_torch_load(path: str):
    try:
        return torch.load(path, map_location=DEVICE, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=DEVICE)


def _load_artifacts() -> ScuffleArtifacts:
    if not os.path.exists(SCUFFLE_MODEL_PATH):
        return ScuffleArtifacts(None, None, None, 20, 10, 82, False, "Missing BiLSTM checkpoint")
    if not os.path.exists(POSE_MODEL_PATH):
        return ScuffleArtifacts(None, None, None, 20, 10, 82, False, "Missing pose model checkpoint")

    try:
        checkpoint = _safe_torch_load(SCUFFLE_MODEL_PATH)
        input_dim = int(checkpoint["input_dim"])
        hidden_size = int(checkpoint["hidden_size"])
        dropout = float(checkpoint["dropout"])

        model = ChokingBiLSTM(input_dim, hidden_size, dropout).to(DEVICE)
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        pose_model = YOLO(POSE_MODEL_PATH)
        if hasattr(pose_model, "to"):
            pose_model.to(str(DEVICE))

        return ScuffleArtifacts(
            model=model,
            pose_model=pose_model,
            scaler=checkpoint.get("scaler"),
            window_size=int(checkpoint.get("window_size", 20)),
            stride=int(checkpoint.get("stride", 10)),
            input_dim=input_dim,
            ready=True,
        )
    except Exception as exc:
        return ScuffleArtifacts(None, None, None, 20, 10, 82, False, str(exc))


ARTIFACTS = _load_artifacts()


def euclidean(p1, p2) -> float:
    return float(np.linalg.norm(p1 - p2))


def compute_neck(kpts):
    return (kpts[IDX_LEFT_SHOULDER] + kpts[IDX_RIGHT_SHOULDER]) / 2


def angle(a, b, c) -> float:
    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    return float(np.arccos(cos_angle))


def _extract_persons_from_result(frame, result) -> list[np.ndarray]:
    if result is None or result.keypoints is None or result.keypoints.xy is None:
        return []

    pts = result.keypoints.xy
    if pts is None or len(pts) == 0:
        return []

    pts = pts.cpu().numpy()
    order = np.argsort(np.mean(pts[:, :, 0], axis=1))
    pts = pts[order]

    height, width = frame.shape[:2]
    persons = []
    for person in pts[:MAX_PERSONS]:
        person = person.copy()
        person[:, 0] /= max(width, 1)
        person[:, 1] /= max(height, 1)
        persons.append(person)
    return persons


def _build_feature_vector(persons: list[np.ndarray], prev_wrists: dict[int, tuple[np.ndarray, np.ndarray]]) -> np.ndarray:
    persons = sorted(persons, key=lambda p: np.mean(p[:, 0]))[:MAX_PERSONS]
    while len(persons) < MAX_PERSONS:
        persons.append(np.zeros((NUM_KPTS, 2), dtype=np.float32))

    raw_pose_flat = np.concatenate(persons, axis=0).flatten()

    min_cross_dist = []
    avg_cross_dist = []
    velocities = []
    contacts = []
    elbow_angles = []
    wrist_heights = []
    num_persons = sum(1 for person in persons if np.sum(person) > 0)

    for index, person_i in enumerate(persons):
        if np.sum(person_i) == 0:
            continue

        neck_i = compute_neck(person_i)
        wl = person_i[IDX_LEFT_WRIST]
        wr = person_i[IDX_RIGHT_WRIST]
        sl = person_i[IDX_LEFT_SHOULDER]
        sr = person_i[IDX_RIGHT_SHOULDER]
        el = person_i[IDX_LEFT_ELBOW]
        er = person_i[IDX_RIGHT_ELBOW]

        if index in prev_wrists:
            v_l = euclidean(wl, prev_wrists[index][0])
            v_r = euclidean(wr, prev_wrists[index][1])
        else:
            v_l = v_r = 0.0

        velocities.append((v_l + v_r) / 2)

        elbow_angles.extend([angle(sl, el, wl), angle(sr, er, wr)])
        wrist_heights.extend([abs(wl[1] - neck_i[1]), abs(wr[1] - neck_i[1])])

        for other_index, person_j in enumerate(persons):
            if index == other_index or np.sum(person_j) == 0:
                continue
            neck_j = compute_neck(person_j)
            d_l = euclidean(wl, neck_j)
            d_r = euclidean(wr, neck_j)
            d_min = min(d_l, d_r)
            min_cross_dist.append(d_min)
            avg_cross_dist.append((d_l + d_r) / 2)
            contacts.append(1 if d_min < CONTACT_THRESHOLD else 0)

        prev_wrists[index] = (wl.copy(), wr.copy())

    engineered = np.array(
        [
            np.min(min_cross_dist) if min_cross_dist else 0,
            np.mean(avg_cross_dist) if avg_cross_dist else 0,
            np.mean(velocities) if velocities else 0,
            np.std(velocities) if velocities else 0,
            np.sum(contacts),
            np.sum(contacts) / max(num_persons, 1),
            num_persons,
            0,
            0,
            np.mean(elbow_angles) if elbow_angles else 0,
            np.std(elbow_angles) if elbow_angles else 0,
            np.mean(wrist_heights) if wrist_heights else 0,
            0,
            1 if np.sum(contacts) > 0 else 0,
        ],
        dtype=np.float32,
    )

    return np.concatenate([raw_pose_flat, engineered]).astype(np.float32)


def _persons_bbox(persons: list[np.ndarray]) -> list[float]:
    valid_points = []
    for person in persons[:MAX_PERSONS]:
        if np.sum(person) <= 0:
            continue
        mask = np.any(person > 0, axis=1)
        if np.any(mask):
            valid_points.append(person[mask])

    if not valid_points:
        return [0.0, 0.0, 1.0, 1.0]

    points = np.concatenate(valid_points, axis=0)
    x1 = float(np.clip(np.min(points[:, 0]), 0.0, 1.0))
    y1 = float(np.clip(np.min(points[:, 1]), 0.0, 1.0))
    x2 = float(np.clip(np.max(points[:, 0]), 0.0, 1.0))
    y2 = float(np.clip(np.max(points[:, 1]), 0.0, 1.0))

    if x2 <= x1 or y2 <= y1:
        return [0.0, 0.0, 1.0, 1.0]
    return [x1, y1, x2, y2]


def _infer_scuffle_window(model: ChokingBiLSTM, input_tensor: torch.Tensor) -> ScuffleInferenceResult:
    probs = []
    with torch.no_grad():
        for _ in range(MC_RUNS):
            logits = model(input_tensor).squeeze(-1)
            probs.append(float(torch.sigmoid(logits).item()))

    confidence = float(np.mean(probs))
    positive_votes = sum(1 for prob in probs if prob >= DEFAULT_THRESHOLD)
    predicted_positive = positive_votes >= (MC_RUNS / 2)

    return ScuffleInferenceResult(
        confidence=confidence,
        positive_votes=positive_votes,
        predicted_positive=predicted_positive,
    )


def _save_scuffle_detection(
    frame,
    camera_id: str,
    bbox: list[float],
    confidence: float,
    frame_time_ms: float | None,
    subtype: str = "choking",
    positive_votes: int | None = None,
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
            (x1, max(y1 - 10, 20)),
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
                "positive_votes": positive_votes,
                "mc_runs": MC_RUNS,
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
        self.pose_model = ARTIFACTS.pose_model
        self.model = ARTIFACTS.model
        self.scaler = ARTIFACTS.scaler
        self.window_size = ARTIFACTS.window_size
        self.stride = max(1, ARTIFACTS.stride)
        self.input_dim = ARTIFACTS.input_dim
        self.prev_wrists: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        self.feature_window: deque[np.ndarray] = deque(maxlen=self.window_size)
        self.frame_index = 0
        self.window_counter = 0
        self.last_logged_at = 0.0

    def process_frame(self, frame, camera_id: str, frame_time_ms: float | None = None):
        if not self.ready or self.pose_model is None or self.model is None or self.scaler is None:
            return []

        self.frame_index += 1
        if self.frame_index % FRAME_SKIP != 0:
            return []

        try:
            results = self.pose_model.predict(frame, verbose=False)
        except Exception as exc:
            print(f"[ScuffleDetection] Pose inference failed: {exc}")
            return []

        if not results:
            return []

        persons = _extract_persons_from_result(frame, results[0])
        if not persons:
            return []

        feature_vector = _build_feature_vector(persons, self.prev_wrists)
        if feature_vector.shape[0] != self.input_dim:
            print(
                f"[ScuffleDetection] Feature mismatch. Expected {self.input_dim}, got {feature_vector.shape[0]}"
            )
            return []

        self.feature_window.append(feature_vector)
        if len(self.feature_window) < self.window_size:
            return []

        self.window_counter += 1
        if self.window_counter % self.stride != 0:
            return []

        sequence = np.array(self.feature_window, dtype=np.float32)
        reshaped = sequence.reshape(-1, self.input_dim)
        scaled = self.scaler.transform(reshaped).reshape(1, self.window_size, self.input_dim)
        input_tensor = torch.tensor(scaled, dtype=torch.float32, device=DEVICE)

        inference = _infer_scuffle_window(self.model, input_tensor)
        if not inference.predicted_positive:
            return []

        now = time.time()
        if now - self.last_logged_at < LOG_COOLDOWN_SECONDS:
            return []

        self.last_logged_at = now
        bbox = _persons_bbox(persons)
        return _save_scuffle_detection(
            frame,
            camera_id,
            bbox,
            inference.confidence,
            frame_time_ms,
            subtype="strangulation",
            positive_votes=inference.positive_votes,
        )
