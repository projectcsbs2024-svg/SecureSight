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
    def __init__(self, camera: Camera, manager):
        self.camera = camera
        self.manager = manager  # reference to WeaponDetectionManager
        self.running = False
        self.thread = None

        # initial skip config
        self.frame_skip = 1
        self._frame_counter = 0
        self._avg_proc_ms = 40  # rolling average of detection time
        self.frame_skip_target = 80  # desired processing time (ms per frame)
        self.last_detection_time = 0

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
                self.thread.join(timeout=2.0)
                print(f"[WeaponWorker] Stopped weapon detection for camera {self.camera.id}")

    def run(self):
        """
        Runs the camera stream and logs weapon detections.
        Each thread uses its own DB session.
        """
        db = SessionLocal()
        cap = cv2.VideoCapture(self.camera.stream_url)

        if not cap.isOpened():
            print(f"[WeaponWorker] Failed to open camera stream: {self.camera.id} ({self.camera.stream_url})")
            db.close()
            return

        # Detect if this is RTSP/IP camera or local file
        is_rtsp_like = False
        try:
            src = (self.camera.stream_url or "").lower()
            if src.startswith("rtsp://") or src.startswith("rtmp://") or (src.startswith("http://") and "live" in src):
                is_rtsp_like = True
        except Exception:
            is_rtsp_like = False

        while self.running:
            ret, frame = cap.read()
            if not ret or frame is None:
                # for live streams, avoid tight loop on failed reads
                time.sleep(0.05)
                continue

            # capture timestamp for file-based videos
            try:
                frame_time_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if not is_rtsp_like:
                    self.manager.current_positions[self.camera.id] = frame_time_ms or 0
            except Exception:
                frame_time_ms = None

            # ------------------------------------------
            # Dynamic frame skipping logic
            # ------------------------------------------
            self._frame_counter += 1

            # skip frames based on self.frame_skip (adaptive)
            if self._frame_counter % (self.frame_skip + 1) != 0:
                continue

            try:
                start = time.time()
                detections = detect_weapons_from_frame(frame, self.camera.id, frame_time_ms)
                processing_ms = int((time.time() - start) * 1000)

                # update moving average
                alpha = 0.3  # smoothing factor
                self._avg_proc_ms = (1 - alpha) * self._avg_proc_ms + alpha * processing_ms

                # adapt skip dynamically
                if self._avg_proc_ms > self.frame_skip_target * 1.3:
                    self.frame_skip = min(self.frame_skip + 1, 10)
                elif self._avg_proc_ms < self.frame_skip_target * 0.7:
                    self.frame_skip = max(self.frame_skip - 1, 0)

                # print adaptive status occasionally
                if time.time() - self.last_detection_time > 5:
                    print(
                        f"[WeaponWorker] {self.camera.id} avg_proc={self._avg_proc_ms:.1f}ms, skip={self.frame_skip}"
                    )
                    self.last_detection_time = time.time()

                # Broadcast detections if any
                if detections:
                    payload = {
                        "camera_id": self.camera.id,
                        "processing_ms": processing_ms,
                        "detections": detections,
                    }
                    if ws_manager.loop:
                        try:
                            asyncio.run_coroutine_threadsafe(
                                ws_manager.broadcast(self.camera.id, payload),
                                ws_manager.loop,
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
        self.current_positions = {}  # camera_id -> last frame time in ms (for file-based streams)

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

        worker = CameraStreamWorker(camera, self)
        worker.start()
        self.workers[camera_id] = worker

    def stop_worker(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            del self.workers[camera_id]
            if camera_id in self.current_positions:
                del self.current_positions[camera_id]

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
        self.current_positions.clear()
        print("[WeaponManager] All camera stream workers stopped.")


# Singleton instance to be imported in other modules
weapon_manager = WeaponDetectionManager()
