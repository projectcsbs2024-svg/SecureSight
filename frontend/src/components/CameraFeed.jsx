// CameraFeed.jsx
import { useEffect, useRef, useState } from "react";

export const CameraFeed = ({ cameraId, src, name, status, onDelete }) => {
  const statusColor = status === "online" ? "bg-green-500" : "bg-red-500";
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const reconAttemptRef = useRef(0);
  const lastTimeRef = useRef(0);
  const playingRef = useRef(false);
  const [overlays, setOverlays] = useState([]);
  const processingSamples = useRef([]);
  const [bufferDelay, setBufferDelay] = useState(0.5);
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ---- Build WebSocket URL ----
  const buildWsUrl = () => {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const rawApi = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const apiBase = rawApi.replace(/^http(s?)/, wsProtocol);
    return `${apiBase.replace(/\/$/, "")}/cameras/ws/${cameraId}`;
  };

  // ---- WebSocket connection with auto-reconnect ----
  useEffect(() => {
    let closedByUs = false;
    let reconnectTimer = null;

    const connect = () => {
      const wsUrl = buildWsUrl();
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`✅ WS open for camera ${cameraId}`);
          setConnected(true);
          reconAttemptRef.current = 0;
          try { ws.send(JSON.stringify({ type: "hello", camera_id: cameraId })); } catch {}
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);

            if (msg.processing_ms != null) {
              processingSamples.current.push(msg.processing_ms);
              if (processingSamples.current.length > 12) processingSamples.current.shift();
              const avg = processingSamples.current.reduce((a, b) => a + b, 0) / processingSamples.current.length;
              const newBuffer = Math.max(0.2, avg / 1000 + 0.25);
              setBufferDelay(newBuffer);
            }

            if (Array.isArray(msg.detections) && msg.detections.length > 0) {
              const now = performance.now();
              msg.detections.forEach((det) => {
                const frameTime = det.frame_time_ms ? det.frame_time_ms / 1000 : null;
                const current = videoRef.current ? videoRef.current.currentTime : 0;
                const displayAt = frameTime ? frameTime + bufferDelay : current + 0.15;

                const ov = {
                  id: `${det.detection_id}_${now}_${Math.random().toString(36).slice(2, 7)}`,
                  bbox: det.bbox || [0, 0, 0, 0],
                  displayAt,
                  removeAfter: 2.5, // longer visibility window
                  subtype: det.subtype,
                  confidence: det.confidence,
                };

                setOverlays((prev) => [...prev, ov]);
              });
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
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, [cameraId]);

  // ---- Playback control: live-like ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const tryStart = () => {
      if (!playingRef.current) {
        playingRef.current = true;
        const startDelayMs = Math.round((bufferDelay + 0.2) * 1000);
        setTimeout(() => {
          v.play().catch(() => {
            console.warn("Autoplay blocked; user must interact.");
          });
        }, startDelayMs);
      }
    };

    if (connected && src) tryStart();

    const onTimeUpdate = () => (lastTimeRef.current = v.currentTime);
    const onPause = () => v.play().catch(() => {});
    const onSeeking = () => {
      try {
        v.currentTime = Math.max(0, lastTimeRef.current || 0);
      } catch {}
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeeking);
    v.muted = true;
    v.playsInline = true;
    v.disablePictureInPicture = true;

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeeking);
    };
  }, [connected, bufferDelay, src]);

  // ---- Overlay timing cleanup ----
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      const current = v.currentTime || 0;
      setOverlays((prev) =>
        prev.filter(
          (o) =>
            current + 0.1 >= o.displayAt &&
            current <= o.displayAt + o.removeAfter + 0.5
        )
      );
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, []);

  // ---- Double-click fullscreen toggle ----
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.warn("Fullscreen toggle failed:", e);
    }
  };

  // ---- Overlay drawing ----
  const renderOverlays = () => {
    const v = videoRef.current;
    if (!v) return null;

    const rect = v.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    return overlays.map((ov) => {
      const current = v.currentTime || 0;
      if (current + 0.05 < ov.displayAt) return null;
      if (current > ov.displayAt + ov.removeAfter + 0.5) return null;

      const [nx1, ny1, nx2, ny2] = ov.bbox || [0, 0, 0, 0];
      const x = nx1 * width;
      const y = ny1 * height;
      const w = Math.max(2, (nx2 - nx1) * width);
      const h = Math.max(2, (ny2 - ny1) * height);

      const label = `${ov.subtype ?? "weapon"} ${ov.confidence ? ov.confidence.toFixed(2) : ""}`;
      const borderColor = ov.subtype === "knife"
        ? "rgba(255,0,0,0.9)"
        : "rgba(0,255,0,0.9)";

      return (
        <div
          key={ov.id}
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
            transition: "all 0.1s linear",
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
      onDoubleClick={toggleFullscreen}
      className="relative rounded-xl shadow-lg transition-all overflow-hidden group w-full"
    >
      {src ? (
        <div className="relative w-full aspect-video" style={{ position: "relative" }}>
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
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

          {/* Status indicator */}
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={status === "online" ? "Online" : "Offline"}
          />

          {/* Camera name */}
          <span
            className="absolute top-2 right-2 mr-8 px-2 py-1 bg-transparent text-white text-sm font-semibold z-10"
            style={{ textShadow: "0 0 6px rgba(0,0,0,0.6)" }}
          >
            {name}
          </span>

          {/* Delete Button */}
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 text-red-900/400 hover:text-red-500 text-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            title="Remove camera"
            style={{ pointerEvents: "auto", marginRight: 8 }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="aspect-video bg-gray-700 flex items-center justify-center rounded-lg relative w-full">
          <span className="text-gray-400">No camera feed</span>

          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={status === "online" ? "Online" : "Offline"}
          />
          <span className="absolute top-2 right-2 px-2 py-1 rounded bg-transparent bg-opacity-30 text-white text-sm ">
            {name}
          </span>
        </div>
      )}
    </div>
  );
};
