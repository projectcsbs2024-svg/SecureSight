// src/components/CameraFeed.jsx
import { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import api from "../apiHandle/api.jsx";
import {
  isNativeVideoUrl,
  isReplayableSourceKind,
  isYouTubeUrl,
} from "../utils/streamSource";

export const CameraFeed = ({ cameraId, src, name, status, onDelete, onNewDetection }) => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const reactPlayerRef = useRef(null);
  const wsRef = useRef(null);
  const reconAttemptRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const lastSyncTargetRef = useRef(0);
  const processingSamples = useRef([]);

  const [annotations, setAnnotations] = useState([]);
  const [connected, setConnected] = useState(false);
  const [bufferDelay, setBufferDelay] = useState(0.5);
  const [backendState, setBackendState] = useState({
    current_time_ms: 0,
    ended: false,
    source_kind: "unknown",
    worker_running: false,
  });
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  const isYouTube = isYouTubeUrl(src);
  const isNativeVideo = isNativeVideoUrl(src) && !isYouTube;
  const hasPreview = isYouTube || isNativeVideo;
  const isReplayable = isReplayableSourceKind(backendState.source_kind);
  const isStreamFinished = backendState.ended;

  const seekPlayer = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;

    if (isYouTube && reactPlayerRef.current) {
      try {
        reactPlayerRef.current.seekTo(seconds, "seconds");
      } catch {}
      return;
    }

    if (isNativeVideo && videoRef.current) {
      try {
        videoRef.current.currentTime = seconds;
      } catch {}
    }
  };

  const syncFromBackend = async () => {
    try {
      const res = await api.get(`/cameras/${cameraId}/position`);
      const data = res.data || {};
      setBackendState({
        current_time_ms: data.current_time_ms || 0,
        ended: Boolean(data.ended),
        source_kind: data.source_kind || "unknown",
        worker_running: Boolean(data.worker_running),
      });

      if (!isReplayableSourceKind(data.source_kind)) return;

      const backendSeconds = (data.current_time_ms || 0) / 1000;
      if (data.ended) {
        setPlayerCurrentTime(backendSeconds);
        return;
      }

      const current = isYouTube
        ? reactPlayerRef.current?.getCurrentTime?.() || playerCurrentTime || 0
        : videoRef.current?.currentTime || playerCurrentTime || 0;
      const drift = backendSeconds - current;

      if (backendSeconds > 0.5 && drift > 5) {
        const target = Math.max(0, backendSeconds - 1.5);
        if (Math.abs(target - lastSyncTargetRef.current) > 1) {
          seekPlayer(target);
          lastSyncTargetRef.current = target;
          setPlayerCurrentTime(target);
        }
      }
    } catch (e) {
      console.warn("Could not sync video position:", e);
    }
  };

  useEffect(() => {
    let closedByUs = false;
    let reconnectTimer = null;

    const connect = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const apiBase = API_BASE.replace(/^http(s?)/, wsProtocol);
      const wsUrl = `${apiBase.replace(/\/$/, "")}/cameras/ws/${cameraId}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconAttemptRef.current = 0;
          try {
            ws.send(JSON.stringify({ type: "hello", camera_id: cameraId }));
          } catch {}
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);

            if (msg.processing_ms != null) {
              processingSamples.current.push(msg.processing_ms);
              if (processingSamples.current.length > 12) processingSamples.current.shift();
              const avg =
                processingSamples.current.reduce((a, b) => a + b, 0) /
                processingSamples.current.length;
              setBufferDelay(Math.max(0.2, avg / 1000 + 0.25));
            }

            if (Array.isArray(msg.detections) && msg.detections.length > 0) {
              const timestamp = Date.now();
              if (onNewDetection) onNewDetection(cameraId, msg.detections);

              setAnnotations((prev) => [
                ...prev,
                ...msg.detections.map((det) => ({
                  id: det.detection_id ?? `${timestamp}_${Math.random()}`,
                  bbox: det.bbox || [0, 0, 0, 0],
                  type: det.type || "weapon",
                  subtype: det.subtype,
                  confidence: det.confidence,
                  frameTime: det.frame_time_ms ? det.frame_time_ms / 1000 : null,
                  receivedAt: timestamp,
                })),
              ]);
            }
          } catch (e) {
            console.error("WS message parse error:", e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (!closedByUs) scheduleReconnect();
        };

        ws.onerror = (e) => {
          console.error("WS error for camera", cameraId, e);
        };
      } catch (e) {
        console.error("WS connect exception:", e);
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      reconAttemptRef.current += 1;
      const delay = Math.min(5000, 500 * Math.pow(1.6, reconAttemptRef.current));
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, [cameraId, API_BASE, onNewDetection]);

  useEffect(() => {
    playbackStartedRef.current = false;
    lastSyncTargetRef.current = 0;
    setPlayerCurrentTime(0);
    syncFromBackend();
    const interval = setInterval(syncFromBackend, 4000);
    return () => clearInterval(interval);
  }, [cameraId, src]);

  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setAnnotations((prev) => prev.filter((a) => now - a.receivedAt < 30000));
    };
    const id = setInterval(cleanup, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isNativeVideo || !videoRef.current) return;
    const v = videoRef.current;
    v.muted = true;
    v.playsInline = true;
    v.disablePictureInPicture = true;

    const onTimeUpdate = () => {
      setPlayerCurrentTime(v.currentTime || 0);
    };

    const onEnded = () => {
      setBackendState((prev) => ({ ...prev, ended: true }));
    };

    const onPause = () => {
      if (!backendState.ended) {
        v.play().catch(() => {});
      }
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    v.addEventListener("pause", onPause);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("pause", onPause);
    };
  }, [isNativeVideo, backendState.ended]);

  useEffect(() => {
    if (!isNativeVideo || !videoRef.current || !connected || !src || isStreamFinished) return;
    if (playbackStartedRef.current) return;

    playbackStartedRef.current = true;
    const timer = setTimeout(() => {
      videoRef.current?.play?.().catch(() => {
        console.warn("Autoplay blocked; user interaction may be required.");
      });
    }, Math.round((bufferDelay + 0.2) * 1000));

    return () => clearTimeout(timer);
  }, [isNativeVideo, connected, src, isStreamFinished, bufferDelay]);

  const handleReplay = async () => {
    try {
      setReplaying(true);
      await api.post(`/cameras/${cameraId}/replay`);
      setAnnotations([]);
      setBackendState((prev) => ({
        ...prev,
        current_time_ms: 0,
        ended: false,
        worker_running: true,
      }));
      setPlayerCurrentTime(0);
      lastSyncTargetRef.current = 0;
      playbackStartedRef.current = false;
      seekPlayer(0);
      if (isNativeVideo && videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error("Failed to replay camera stream:", err);
      alert("Failed to replay stream");
    } finally {
      setReplaying(false);
    }
  };

  const renderOverlays = () => {
    const stage = stageRef.current;
    if (!stage) return null;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const current = isReplayable
      ? (backendState.current_time_ms || 0) / 1000
      : playerCurrentTime || 0;
    const overlayTolerance = isReplayable
      ? Math.max(0.2, Math.min(0.45, bufferDelay * 0.45))
      : 0.18;

    return annotations
      .filter((a) => {
        if (a.frameTime != null && isReplayable) {
          return Math.abs(current - a.frameTime) < overlayTolerance;
        }
        return Date.now() - a.receivedAt < 900;
      })
      .map((a) => {
        const [nx1, ny1, nx2, ny2] = a.bbox || [0, 0, 0, 0];
        const x = nx1 * width;
        const y = ny1 * height;
        const w = Math.max(2, (nx2 - nx1) * width);
        const h = Math.max(2, (ny2 - ny1) * height);
        const borderColor =
          a.type === "scuffle"
            ? "rgba(255,165,0,0.95)"
            : a.subtype === "knife"
            ? "rgba(255,0,0,0.9)"
            : "rgba(0,255,0,0.9)";
        const fillColor =
          a.type === "scuffle" ? "rgba(255,165,0,0.10)" : "rgba(0,255,0,0.05)";
        const glowColor =
          a.type === "scuffle" ? "rgba(255,165,0,0.35)" : "rgba(0,255,0,0.3)";
        const label =
          a.type === "scuffle"
            ? `scuffle${a.subtype ? ` (${a.subtype})` : ""} ${a.confidence ? a.confidence.toFixed(2) : ""}`.trim()
            : `${a.subtype ?? "weapon"} ${a.confidence ? a.confidence.toFixed(2) : ""}`.trim();

        return (
          <div
            key={a.id}
            style={{
              position: "absolute",
              left: `${x}px`,
              top: `${y}px`,
              width: `${w}px`,
              height: `${h}px`,
              border: `2px solid ${borderColor}`,
              borderRadius: "6px",
              background: fillColor,
              boxShadow: `0 0 10px ${glowColor}`,
              pointerEvents: "none",
              zIndex: 40,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -22,
                left: 0,
                background: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: 12,
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          </div>
        );
      });
  };

  const statusColor =
    (backendState.worker_running || connected) && !isStreamFinished && status === "online"
      ? "bg-green-500"
      : "bg-red-500";

  return (
    <div
      ref={containerRef}
      onDoubleClick={() => {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen?.();
        } else {
          document.exitFullscreen();
        }
      }}
      className="relative rounded-xl shadow-lg overflow-hidden group w-full"
    >
      {src ? (
        <div ref={stageRef} className="relative w-full aspect-video">
          {hasPreview ? (
            isYouTube ? (
              <ReactPlayer
                ref={reactPlayerRef}
                url={src}
                width="100%"
                height="100%"
                muted
                controls={false}
                playing={connected && !isStreamFinished}
                onProgress={({ playedSeconds }) => setPlayerCurrentTime(playedSeconds || 0)}
                onEnded={() => setBackendState((prev) => ({ ...prev, ended: true }))}
                config={{
                  youtube: {
                    playerVars: {
                      modestbranding: 1,
                      rel: 0,
                      controls: 0,
                      disablekb: 1,
                    },
                  },
                }}
              />
            ) : (
              <video
                ref={videoRef}
                src={src}
                muted
                playsInline
                loop={false}
                className="rounded-xl w-full h-full object-cover select-none bg-black"
                style={{ display: "block" }}
              />
            )
          ) : (
            <div className="rounded-xl w-full h-full bg-gray-900 text-gray-200 flex items-center justify-center text-center px-6">
              <div>
                <div className="text-sm font-semibold">{name}</div>
                <div className="mt-2 text-xs text-gray-400">
                  This stream source is being processed by the backend detector.
                </div>
                <div className="mt-1 text-xs text-gray-500 break-all">{src}</div>
              </div>
            </div>
          )}

          {hasPreview && <div className="absolute inset-0 pointer-events-none">{renderOverlays()}</div>}

          {isStreamFinished && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white text-xl font-semibold z-40"
              style={{ transition: "opacity 0.6s ease-in" }}
            >
              <span>Stream Finished</span>
              <button
                onClick={handleReplay}
                disabled={replaying}
                className="mt-4 px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm shadow-md transition disabled:bg-gray-500"
              >
                {replaying ? "Restarting..." : "Replay And Restart Detection"}
              </button>
              <button
                onClick={onDelete}
                className="mt-3 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm shadow-md transition"
              >
                Close Camera
              </button>
            </div>
          )}

          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={backendState.worker_running ? "Detection running" : connected ? "Connected" : "Offline"}
          />

          <span
            className="absolute top-2 right-2 mr-8 px-2 py-1 bg-transparent text-white text-sm font-semibold z-10"
            style={{ textShadow: "0 0 6px rgba(0,0,0,0.6)" }}
          >
            {name}
          </span>

          {!isStreamFinished && (
            <button
              onClick={onDelete}
              className="absolute top-2 right-2 text-red-900/40 hover:text-red-500 text-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              title="Remove camera"
              style={{ pointerEvents: "auto", marginRight: 8 }}
            >
              x
            </button>
          )}

        </div>
      ) : (
        <div className="aspect-video bg-gray-700 flex items-center justify-center rounded-lg relative w-full">
          <span className="text-gray-400">No camera feed</span>
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={backendState.worker_running ? "Detection running" : "Offline"}
          />
          <span className="absolute top-2 right-2 px-2 py-1 rounded bg-transparent bg-opacity-30 text-white text-sm ">
            {name}
          </span>
        </div>
      )}
    </div>
  );
};
