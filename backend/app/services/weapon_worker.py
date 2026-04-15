# app/services/weapon_worker.py

import cv2
from threading import Thread
from app.database import SessionLocal
from app.models import Camera
from app.services.scuffle_detection import ScuffleSequenceDetector
from app.services.weapon_detection import detect_weapons_from_frame
import time
import asyncio
from urllib.parse import urlparse
from app.services.ws_manager import ws_manager


class CameraStreamWorker:
    def __init__(self, camera: Camera, manager):
        self.camera = camera
        self.manager = manager  # reference to WeaponDetectionManager
        self.running = False
        self.thread = None
        enabled_detectors = camera.detections_enabled or []
        self.weapon_enabled = "weapon" in enabled_detectors
        self.scuffle_enabled = "scuffle" in enabled_detectors
        self.scuffle_detector = ScuffleSequenceDetector() if self.scuffle_enabled else None
        if self.scuffle_detector and not self.scuffle_detector.ready and self.scuffle_detector.error:
            print(f"[WeaponWorker] Scuffle detector unavailable for camera {camera.id}: {self.scuffle_detector.error}")

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
        resolved_stream_url = self._resolve_stream_source(self.camera.stream_url)
        cap = cv2.VideoCapture(resolved_stream_url)

        if not cap.isOpened():
            print(
                f"[WeaponWorker] Failed to open camera stream: {self.camera.id} "
                f"(original={self.camera.stream_url}, resolved={resolved_stream_url})"
            )
            db.close()
            return

        # Treat any network URL as a live stream and local/uploads paths as file sources.
        is_live_stream = self._is_live_stream_source(self.camera.stream_url)

        while self.running:
            ret, frame = cap.read()
            if not ret or frame is None:
                # for live streams, avoid tight loop on failed reads
                time.sleep(0.05)
                continue

            # capture timestamp for file-based videos
            try:
                frame_time_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                if not is_live_stream:
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
                detections = []
                if self.weapon_enabled:
                    detections.extend(detect_weapons_from_frame(frame, self.camera.id, frame_time_ms))
                if self.scuffle_detector:
                    detections.extend(self.scuffle_detector.process_frame(frame, self.camera.id, frame_time_ms))
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
                    print(f"[WeaponWorker] {self.camera.id} avg_proc={self._avg_proc_ms:.1f}ms, skip={self.frame_skip}")
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

    @staticmethod
    def _is_live_stream_source(stream_url: str) -> bool:
        if not stream_url:
            return False

        try:
            parsed = urlparse(stream_url)
            scheme = (parsed.scheme or "").lower()

            if scheme in {"rtsp", "rtsps", "rtmp", "rtmps", "udp", "tcp"}:
                return True

            if scheme in {"http", "https"}:
                path = (parsed.path or "").lower()
                file_extensions = (
                    ".mp4",
                    ".mkv",
                    ".avi",
                    ".mov",
                    ".webm",
                    ".m4v",
                    ".mpeg",
                    ".mpg",
                )
                return not path.endswith(file_extensions)
        except Exception:
            return False

        return False

    @staticmethod
    def _resolve_stream_source(stream_url: str) -> str:
        if not stream_url:
            return stream_url

        if not CameraStreamWorker._is_youtube_url(stream_url):
            return stream_url

        try:
            import yt_dlp

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "format": "best[ext=mp4]/best",
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(stream_url, download=False)
                direct_url = info.get("url")
                if direct_url:
                    print(f"[WeaponWorker] Resolved YouTube URL for detection: {stream_url}")
                    return direct_url
        except Exception as e:
            print(f"[WeaponWorker] Failed to resolve YouTube URL {stream_url}: {e}")

        return stream_url

    @staticmethod
    def _is_youtube_url(stream_url: str) -> bool:
        try:
            host = (urlparse(stream_url).hostname or "").lower()
        except Exception:
            return False

        return host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


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

        enabled_detectors = camera.detections_enabled or []
        if "weapon" not in enabled_detectors and "scuffle" not in enabled_detectors:
            print(f"[WeaponManager] No stream detection enabled for camera {camera_id}. Skipping.")
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
            enabled_detectors = cam.detections_enabled or []
            if cam.stream_url and ("weapon" in enabled_detectors or "scuffle" in enabled_detectors):
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
