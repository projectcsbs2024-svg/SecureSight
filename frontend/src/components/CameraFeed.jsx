// src/components/CameraFeed.jsx
import { useEffect, useRef, useState } from "react";

export const CameraFeed = ({ cameraId, src, name, status, onDelete, onNewDetection }) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const reconAttemptRef = useRef(0);
  const lastTimeRef = useRef(0);
  const playingRef = useRef(false);

  const [annotations, setAnnotations] = useState([]);
  const [isStreamFinished, setIsStreamFinished] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bufferDelay, setBufferDelay] = useState(0.5);
  const processingSamples = useRef([]);

  const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

  const isVideoFileSrc = (s) => {
    if (!s) return false;
    const lower = s.toLowerCase();
    if (lower.includes("/videos/") || lower.includes("/uploads/")) return true;
    return (
      lower.endsWith(".mp4") ||
      lower.endsWith(".mkv") ||
      lower.endsWith(".avi") ||
      lower.endsWith(".mov") ||
      lower.endsWith(".webm")
    );
  };

  // ---- WebSocket connection ----
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
          console.log(`✅ WS open for camera ${cameraId}`);
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
              if (processingSamples.current.length > 12)
                processingSamples.current.shift();
              const avg =
                processingSamples.current.reduce((a, b) => a + b, 0) /
                processingSamples.current.length;
              setBufferDelay(Math.max(0.2, avg / 1000 + 0.25));
            }

            if (Array.isArray(msg.detections) && msg.detections.length > 0) {
              const timestamp = Date.now();

              // 🔔 Notify parent (global alert tone)
              if (onNewDetection) {
                onNewDetection(cameraId, msg.detections);
              }

              setAnnotations((prev) => [
                ...prev,
                ...msg.detections.map((det) => ({
                  id: det.detection_id ?? `${timestamp}_${Math.random()}`,
                  bbox: det.bbox || [0, 0, 0, 0],
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
          console.warn(`⚠️ WS closed for camera ${cameraId}`);
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
  }, [cameraId]);

  // ---- Periodic backend position sync for file videos ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    if (!isVideoFileSrc(src)) return;

    let aborted = false;
    let lastTarget = 0;

    const syncToBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/cameras/${cameraId}/position`);
        if (!res.ok) return;
        const data = await res.json();
        if (aborted) return;

        const backend_ms = data?.current_time_ms || 0;
        const backend_s = backend_ms / 1000;
        if (backend_s < 0.5) return;

        const drift = backend_s - (v.currentTime || 0);
        if (drift > 5) {
          const target = Math.max(0, backend_s - 1.5);
          if (Math.abs(target - lastTarget) > 1.0) {
            console.log(`[Sync] Moving video to ${target.toFixed(1)}s`);
            v.currentTime = target;
            lastTarget = target;
          }
        }

        if (v.duration && backend_s >= v.duration - 1) {
          console.log(`[Sync] Video end reached for camera ${cameraId}`);
          v.pause();
          playingRef.current = false;
          setIsStreamFinished(true);
          setConnected(false);
        }
      } catch (e) {
        console.warn("Could not sync video position:", e);
      }
    };

    syncToBackend();
    const interval = setInterval(syncToBackend, 4000);
    return () => {
      aborted = true;
      clearInterval(interval);
    };
  }, [cameraId, src]);

  // ---- Playback control ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const tryStart = () => {
      if (!playingRef.current) {
        playingRef.current = true;
        setTimeout(() => {
          v.play().catch(() => {
            console.warn("Autoplay blocked; user must interact.");
          });
        }, Math.round((bufferDelay + 0.2) * 1000));
      }
    };

    if (connected && src) tryStart();
    v.muted = true;
    v.playsInline = true;
    v.disablePictureInPicture = true;

    const onTimeUpdate = () => {
      lastTimeRef.current = v.currentTime;

      if (isVideoFileSrc(src) && v.duration && v.currentTime >= v.duration - 0.5) {
        console.log(`[Playback] Reached end of file for camera ${cameraId}`);
        v.pause();
        playingRef.current = false;
        setIsStreamFinished(true);
        setConnected(false); // 🔴 Mark as disconnected/offline when video ends
      }
    };

    const onPause = () => {
      if (!isVideoFileSrc(src)) {
        v.play().catch(() => {});
      }
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("pause", onPause);
    };
  }, [connected, bufferDelay, src]);

  // ---- Cleanup annotations periodically ----
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setAnnotations((prev) => prev.filter((a) => now - a.receivedAt < 30000));
    };
    const id = setInterval(cleanup, 5000);
    return () => clearInterval(id);
  }, []);

  const statusColor =
    connected && !isStreamFinished && status === "online"
      ? "bg-green-500"
      : "bg-red-500";

  // ---- Draw overlays ----
  const renderOverlays = () => {
    const v = videoRef.current;
    if (!v) return null;
    const rect = v.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const current = v.currentTime || 0;

    return annotations
      .filter((a) => {
        if (a.frameTime != null) {
          return Math.abs(current - a.frameTime) < 0.1;
        } else {
          return Date.now() - a.receivedAt < 3000;
        }
      })
      .map((a) => {
        const [nx1, ny1, nx2, ny2] = a.bbox || [0, 0, 0, 0];
        const x = nx1 * width;
        const y = ny1 * height;
        const w = Math.max(2, (nx2 - nx1) * width);
        const h = Math.max(2, (ny2 - ny1) * height);
        const borderColor =
          a.subtype === "knife"
            ? "rgba(255,0,0,0.9)"
            : "rgba(0,255,0,0.9)";
        const label = `${a.subtype ?? "weapon"} ${
          a.confidence ? a.confidence.toFixed(2) : ""
        }`;

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
              background: "rgba(0,255,0,0.05)",
              boxShadow: "0 0 10px rgba(0,255,0,0.3)",
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
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </div>
          </div>
        );
      });
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={() => {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen?.();
          setIsFullscreen(true);
        } else {
          document.exitFullscreen();
          setIsFullscreen(false);
        }
      }}
      className="relative rounded-xl shadow-lg overflow-hidden group w-full"
    >
      {src ? (
        <div className="relative w-full aspect-video">
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
            loop={false}
            className="rounded-xl w-full h-full object-cover select-none"
            style={{ display: "block" }}
          />

          {/* Overlays */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
            }}
          >
            {renderOverlays()}
          </div>

          {/* Fade-out overlay when stream ends */}
          {isStreamFinished && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white text-xl font-semibold animate-fade-in z-40"
              style={{ transition: "opacity 0.6s ease-in" }}
            >
              <span>Stream Finished</span>

              {/* Keep Close Button over overlay */}
              <button
                onClick={onDelete}
                className="mt-4 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm shadow-md transition"
              >
                ✕ Close Camera
              </button>
            </div>
          )}

          {/* Status indicator */}
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={connected ? "Online" : "Offline"}
          />

          {/* Camera name */}
          <span
            className="absolute top-2 right-2 mr-8 px-2 py-1 bg-transparent text-white text-sm font-semibold z-10"
            style={{ textShadow: "0 0 6px rgba(0,0,0,0.6)" }}
          >
            {name}
          </span>

          {/* Delete Button (visible while playing) */}
          {!isStreamFinished && (
            <button
              onClick={onDelete}
              className="absolute top-2 right-2 text-red-900/400 hover:text-red-500 text-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              title="Remove camera"
              style={{ pointerEvents: "auto", marginRight: 8 }}
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div className="aspect-video bg-gray-700 flex items-center justify-center rounded-lg relative w-full">
          <span className="text-gray-400">No camera feed</span>
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={connected ? "Online" : "Offline"}
          />
          <span className="absolute top-2 right-2 px-2 py-1 rounded bg-transparent bg-opacity-30 text-white text-sm ">
            {name}
          </span>
        </div>
      )}
    </div>
  );
};
