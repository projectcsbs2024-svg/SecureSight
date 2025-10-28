# app/services/weapon_worker.py

import cv2
from threading import Thread, Lock
from app.database import SessionLocal
from app.models import Camera
from app.services.weapon_detection import detect_weapons_from_frame
import time


class CameraStreamWorker:
    def __init__(self, camera: Camera):
        self.camera = camera
        self.running = False
        self.thread = None
        self.latest_detections = []  # store last YOLO detections
        self.lock = Lock()  # thread-safe access

    def start(self):
        if not self.running:
            self.running = True
            self.thread = Thread(target=self.run, daemon=True)
            self.thread.start()
            print(f"[WeaponWorker] Started detection for camera {self.camera.id}")

    def stop(self):
        if self.running:
            self.running = False
            if self.thread:
                self.thread.join(timeout=2.0)
            print(f"[WeaponWorker] Stopped detection for camera {self.camera.id}")

    def run(self):
        """
        Runs YOLO detection on camera stream.
        Updates latest_detections continuously.
        """
        db = SessionLocal()
        cap = cv2.VideoCapture(self.camera.stream_url)

        if not cap.isOpened():
            print(f"[WeaponWorker] Failed to open stream for camera {self.camera.id}")
            db.close()
            return

        while self.running:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.1)
                continue

            try:
                detections = detect_weapons_from_frame(frame, self.camera.id)
                # Store the latest detection results (thread-safe)
                with self.lock:
                    self.latest_detections = detections or []
            except Exception as e:
                print(f"[WeaponWorker] Error detecting weapons for {self.camera.id}: {e}")

        cap.release()
        db.close()

    def get_latest_detections(self):
        """Safely return the most recent detections."""
        with self.lock:
            return self.latest_detections.copy()


class WeaponDetectionManager:
    """
    Manages all YOLO workers for each camera.
    """

    def __init__(self):
        self.workers = {}  # camera_id -> CameraStreamWorker

    def start_worker(self, camera_id: str):
        if camera_id in self.workers:
            print(f"[WeaponManager] Detection already running for camera {camera_id}")
            return

        db = SessionLocal()
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        db.close()

        if not camera:
            print(f"[WeaponManager] Camera {camera_id} not found.")
            return

        if "weapon" not in (camera.detections_enabled or []):
            print(f"[WeaponManager] Detection not enabled for camera {camera_id}. Skipping.")
            return

        worker = CameraStreamWorker(camera)
        worker.start()
        self.workers[camera_id] = worker

    def stop_worker(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            del self.workers[camera_id]

    def has_worker(self, camera_id: str):
        """Check if a worker is active."""
        return camera_id in self.workers

    def get_latest_detections(self, camera_id: str):
        """Return the latest detections for a given camera."""
        worker = self.workers.get(camera_id)
        if worker:
            return worker.get_latest_detections()
        return []

    def start_all(self):
        db = SessionLocal()
        cameras = db.query(Camera).all()
        db.close()

        for cam in cameras:
            if cam.stream_url and "weapon" in (cam.detections_enabled or []):
                self.start_worker(cam.id)

        print(f"[WeaponManager] Started {len(self.workers)} camera workers.")

    def stop_all(self):
        for worker in list(self.workers.values()):
            worker.stop()
        self.workers.clear()
        print("[WeaponManager] All workers stopped.")


# ✅ Singleton instance to import elsewhere
weapon_manager = WeaponDetectionManager()
