# app/services/weapon_worker.py

import cv2
from threading import Thread
from app.database import SessionLocal
from app.models import Camera
from app.services.scuffle_detection import ScuffleSequenceDetector
from app.services.stampede_detection import StampedeDetector
from app.services.weapon_detection import detect_weapons_from_frame
import time
import asyncio
from urllib.parse import urlparse
from app.services.ws_manager import ws_manager


SCUFFLE_ALIASES = {"scuffle", "choking", "strangulation", "strangle"}


def _normalize_enabled_detectors(enabled_detectors):
    normalized = set()
    for detector in enabled_detectors or []:
        key = str(detector or "").strip().lower()
        if key == "weapon":
            normalized.add("weapon")
        elif key in SCUFFLE_ALIASES:
            normalized.add("scuffle")
        elif key == "stampede":
            normalized.add("stampede")
    return normalized


class CameraStreamWorker:
    def __init__(self, camera: Camera, manager):
        self.camera = camera
        self.manager = manager  # reference to WeaponDetectionManager
        self.running = False
        self.thread = None
        enabled_detectors = _normalize_enabled_detectors(camera.detections_enabled)
        self.weapon_enabled = "weapon" in enabled_detectors
        self.scuffle_enabled = "scuffle" in enabled_detectors
        self.stampede_enabled = "stampede" in enabled_detectors
        self.scuffle_detector = ScuffleSequenceDetector() if self.scuffle_enabled else None
        self.stampede_detector = StampedeDetector() if self.stampede_enabled else None
        if self.scuffle_detector and not self.scuffle_detector.ready and self.scuffle_detector.error:
            print(f"[WeaponWorker] Scuffle detector unavailable for camera {camera.id}: {self.scuffle_detector.error}")
        if self.stampede_detector and not self.stampede_detector.ready:
            print(
                f"[WeaponWorker] Stampede detector unavailable for camera {camera.id}: "
                f"{self.stampede_detector.error or 'unknown error'}"
            )

        # initial skip config
        self.frame_skip = 1
        self._frame_counter = 0
        self._avg_proc_ms = 40  # rolling average of detection time
        self.frame_skip_target = 80  # desired processing time (ms per frame)
        self.last_detection_time = 0
        self.last_payload_had_detections = False
        self._playback_wall_start = None
        self._playback_media_start_ms = None

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
        source_kind = self._classify_stream_source(self.camera.stream_url)
        is_seekable_media = source_kind in {"file", "youtube", "media_url"}
        cap = cv2.VideoCapture(resolved_stream_url)
        if source_kind == "live":
            try:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except Exception:
                pass

        if not cap.isOpened():
            print(
                f"[WeaponWorker] Failed to open camera stream: {self.camera.id} "
                f"(original={self.camera.stream_url}, resolved={resolved_stream_url})"
            )
            self.manager.mark_stream_state(
                self.camera.id,
                current_time_ms=0,
                ended=False,
                source_kind=source_kind,
            )
            self.manager.worker_finished(self.camera.id)
            db.close()
            return

        self.manager.mark_stream_state(
            self.camera.id,
            current_time_ms=0,
            ended=False,
            source_kind=source_kind,
        )

        try:
            while self.running:
                ret, frame = self._read_current_frame(cap, is_seekable_media)
                if not ret or frame is None:
                    if is_seekable_media:
                        last_pos = self.manager.current_positions.get(self.camera.id, 0)
                        self.manager.mark_stream_state(
                            self.camera.id,
                            current_time_ms=last_pos,
                            ended=True,
                            source_kind=source_kind,
                        )
                        print(f"[WeaponWorker] Stream ended for camera {self.camera.id}")
                        break

                    # for live streams, avoid tight loop on failed reads
                    time.sleep(0.05)
                    continue

                # capture timestamp for file-based videos
                try:
                    frame_time_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
                    if is_seekable_media:
                        self._pace_seekable_media(frame_time_ms)
                        self.manager.mark_stream_state(
                            self.camera.id,
                            current_time_ms=frame_time_ms or 0,
                            ended=False,
                            source_kind=source_kind,
                        )
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
                    if self.stampede_detector:
                        detections.extend(self.stampede_detector.process_frame(frame, self.camera.id, frame_time_ms))
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

                    # Broadcast detections, and explicitly clear stale live overlays when detections disappear.
                    if detections or self.last_payload_had_detections:
                        emitted_at_ms = int(time.time() * 1000)
                        payload = {
                            "camera_id": self.camera.id,
                            "event_id": self.manager.next_event_id(self.camera.id),
                            "processing_ms": processing_ms,
                            "emitted_at_ms": emitted_at_ms,
                            "frame_time_ms": frame_time_ms,
                            "source_kind": source_kind,
                            "detections": detections,
                        }
                        self.last_payload_had_detections = bool(detections)
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
        finally:
            cap.release()
            db.close()
            self.running = False
            self.manager.worker_finished(self.camera.id)

    def _pace_seekable_media(self, frame_time_ms: float | None):
        if frame_time_ms is None or frame_time_ms < 0:
            return

        now = time.perf_counter()
        if self._playback_wall_start is None or self._playback_media_start_ms is None:
            self._playback_wall_start = now
            self._playback_media_start_ms = float(frame_time_ms)
            return

        target_elapsed = max(0.0, (float(frame_time_ms) - self._playback_media_start_ms) / 1000.0)
        actual_elapsed = max(0.0, now - self._playback_wall_start)
        sleep_for = target_elapsed - actual_elapsed
        if sleep_for > 0.003:
            time.sleep(sleep_for)

    def _read_current_frame(self, cap, is_seekable_media: bool):
        if is_seekable_media:
            return cap.read()

        # Drain buffered live frames so inference stays close to real time.
        latest_grabs = max(0, min(self.frame_skip + 1, 4))
        for _ in range(latest_grabs):
            if not cap.grab():
                break
        return cap.retrieve()

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
    def _classify_stream_source(stream_url: str) -> str:
        if not stream_url:
            return "unknown"

        try:
            parsed = urlparse(stream_url)
            scheme = (parsed.scheme or "").lower()
            host = (parsed.hostname or "").lower()
            path = (parsed.path or "").lower()
        except Exception:
            return "unknown"

        if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}:
            return "youtube"

        if scheme in {"rtsp", "rtsps", "rtmp", "rtmps", "udp", "tcp"}:
            return "live"

        if path.startswith("/videos/") or path.startswith("/uploads/"):
            return "file"

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
        if path.endswith(file_extensions):
            return "media_url"

        if scheme in {"http", "https"}:
            return "live"

        return "unknown"

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
        self.stream_states = {}  # camera_id -> metadata used by the frontend player
        self.event_counters = {}  # camera_id -> monotonic websocket event ids

    def mark_stream_state(
        self,
        camera_id: str,
        current_time_ms: float | int | None = None,
        ended: bool | None = None,
        source_kind: str | None = None,
    ):
        state = self.stream_states.setdefault(
            camera_id,
            {"current_time_ms": 0, "ended": False, "source_kind": "unknown"},
        )
        if current_time_ms is not None:
            state["current_time_ms"] = int(current_time_ms or 0)
            self.current_positions[camera_id] = int(current_time_ms or 0)
        if ended is not None:
            state["ended"] = ended
        if source_kind is not None:
            state["source_kind"] = source_kind

    def worker_finished(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker and not worker.running:
            self.workers.pop(camera_id, None)

    def next_event_id(self, camera_id: str) -> int:
        next_id = self.event_counters.get(camera_id, 0) + 1
        self.event_counters[camera_id] = next_id
        return next_id

    def start_worker(self, camera_id: str):
        existing_worker = self.workers.get(camera_id)
        if existing_worker:
            if existing_worker.running:
                print(f"[WeaponManager] Weapon detection already running for camera {camera_id}")
                return
            self.workers.pop(camera_id, None)

        db = SessionLocal()
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        db.close()

        if not camera:
            print(f"[WeaponManager] Camera {camera_id} not found.")
            return

        enabled_detectors = _normalize_enabled_detectors(camera.detections_enabled)
        if not any(det in enabled_detectors for det in ["weapon", "scuffle", "stampede"]):
            print(f"[WeaponManager] No stream detection enabled for camera {camera_id}. Skipping.")
            return

        source_kind = CameraStreamWorker._classify_stream_source(camera.stream_url)
        self.mark_stream_state(camera_id, current_time_ms=0, ended=False, source_kind=source_kind)
        worker = CameraStreamWorker(camera, self)
        worker.start()
        self.workers[camera_id] = worker

    def stop_worker(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            self.workers.pop(camera_id, None)
            if camera_id in self.current_positions:
                del self.current_positions[camera_id]
        self.stream_states.pop(camera_id, None)
        self.event_counters.pop(camera_id, None)

    def replay_worker(self, camera_id: str):
        self.stop_worker(camera_id)
        self.mark_stream_state(camera_id, current_time_ms=0, ended=False, source_kind="unknown")
        self.start_worker(camera_id)

    def start_all(self):
        db = SessionLocal()
        cameras = db.query(Camera).all()
        db.close()

        for cam in cameras:
            enabled_detectors = _normalize_enabled_detectors(cam.detections_enabled)
            if cam.stream_url and any(det in enabled_detectors for det in ["weapon", "scuffle", "stampede"]):
                self.start_worker(cam.id)

        print(f"[WeaponManager] Started {len(self.workers)} camera stream workers.")

    def stop_all(self):
        for worker in list(self.workers.values()):
            worker.stop()
        self.workers.clear()
        self.current_positions.clear()
        self.stream_states.clear()
        print("[WeaponManager] All camera stream workers stopped.")


# Singleton instance to be imported in other modules
weapon_manager = WeaponDetectionManager()
