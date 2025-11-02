# app/services/weapon_worker.py

import cv2
from threading import Thread
from app.database import SessionLocal
from app.models import Camera
from app.services.weapon_detection import detect_weapons_from_frame
import time
import asyncio
from app.services.ws_manager import ws_manager

class CameraStreamWorker:
    def __init__(self, camera: Camera):
        self.camera = camera
        self.running = False
        self.thread = None

    def start(self):
        if not self.running:
            self.running = True
            self.thread = Thread(target=self.run, daemon=True)
            self.thread.start()
            print(f"[WeaponWorker] Started weapon detection for camera {self.camera.id}")

    def stop(self):
        if self.running:
            self.running = False
            if self.thread:
                self.thread.join()
                print(f"[WeaponWorker] Stopped weapon detection for camera {self.camera.id}")

    def run(self):
        """
        Runs the camera stream and logs weapon detections.
        Each thread uses its own DB session.
        """
        db = SessionLocal()
        cap = cv2.VideoCapture(self.camera.stream_url)

        if not cap.isOpened():
            print(f"[WeaponWorker] Failed to open camera stream: {self.camera.id}")
            db.close()
            return

        while self.running:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.1)
                continue

            try:
                # capture frame time position in ms (useful when reading a file)
                try:
                    frame_time_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                except Exception:
                    frame_time_ms = None

                start = time.time()
                detections = detect_weapons_from_frame(frame, self.camera.id, frame_time_ms)
                processing_ms = int((time.time() - start) * 1000)

                # If any detections, broadcast via websocket manager
                if detections:
                    payload = {
                        "camera_id": self.camera.id,
                        "processing_ms": processing_ms,
                        "detections": detections,
                    }
                    # schedule broadcast in the main event loop
                    if ws_manager.loop:
                        try:
                            asyncio.run_coroutine_threadsafe(
                                ws_manager.broadcast(self.camera.id, payload),
                                ws_manager.loop
                            )
                        except Exception as e:
                            print(f"[WeaponWorker] Failed to schedule WS broadcast: {e}")
                    else:
                        print("[WeaponWorker] ws_manager.loop not set; cannot broadcast")

            except Exception as e:
                print(f"[WeaponWorker] Error detecting weapons for camera {self.camera.id}: {e}")

        cap.release()
        db.close()


class WeaponDetectionManager:
    """
    Manages multiple camera streams and workers for weapon detection.
    """

    def __init__(self):
        self.workers = {}  # camera_id -> CameraStreamWorker

    def start_worker(self, camera_id: str):
        if camera_id in self.workers:
            print(f"[WeaponManager] Weapon detection already running for camera {camera_id}")
            return

        db = SessionLocal()
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        db.close()

        if not camera:
            print(f"[WeaponManager] Camera {camera_id} not found.")
            return

        if "weapon" not in (camera.detections_enabled or []):
            print(f"[WeaponManager] Weapon detection not enabled for camera {camera_id}. Skipping.")
            return

        worker = CameraStreamWorker(camera)
        worker.start()
        self.workers[camera_id] = worker

    def stop_worker(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            del self.workers[camera_id]

    def start_all(self):
        db = SessionLocal()
        cameras = db.query(Camera).all()
        db.close()

        for cam in cameras:
            if cam.stream_url and "weapon" in (cam.detections_enabled or []):
                self.start_worker(cam.id)

        print(f"[WeaponManager] Started {len(self.workers)} camera stream workers.")

    def stop_all(self):
        for worker in list(self.workers.values()):
            worker.stop()
        self.workers.clear()
        print("[WeaponManager] All camera stream workers stopped.")


# Singleton instance to be imported in other modules
weapon_manager = WeaponDetectionManager()
