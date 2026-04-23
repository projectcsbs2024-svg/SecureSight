import { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

import api from "../apiHandle/api.jsx";
import {
  isNativeVideoUrl,
  isReplayableSourceKind,
  isYouTubeUrl,
} from "../utils/streamSource";

const REPLAY_SYNC_POLL_MS = 800;
const GENERAL_SYNC_POLL_MS = 4000;
const MAX_REPLAY_BUFFER = 140;

export const CameraFeed = ({ cameraId, src, name, status, onDelete, onNewDetection }) => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const reactPlayerRef = useRef(null);
  const wsRef = useRef(null);
  const reconAttemptRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const lastSyncTargetRef = useRef(0);
  const latestEventIdRef = useRef(0);
  const processingSamplesRef = useRef([]);
  const backendClockRef = useRef({
    currentTimeMs: 0,
    observedAtMs: 0,
    workerRunning: false,
    ended: false,
    sourceKind: "unknown",
  });

  const [annotations, setAnnotations] = useState([]);
  const [connected, setConnected] = useState(false);
  const [bufferDelay, setBufferDelay] = useState(0.5);
  const [backendState, setBackendState] = useState({
    current_time_ms: 0,
    observed_at_ms: 0,
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

  const getCurrentPlayerTime = () => {
    if (isYouTube) {
      return reactPlayerRef.current?.getCurrentTime?.() || 0;
    }
    if (isNativeVideo) {
      return videoRef.current?.currentTime || 0;
    }
    return playerCurrentTime || 0;
  };

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

  const getEstimatedBackendSeconds = () => {
    const snapshot = backendClockRef.current;
    const baseSeconds = (snapshot.currentTimeMs || 0) / 1000;

    if (!isReplayableSourceKind(snapshot.sourceKind) || snapshot.ended || !snapshot.workerRunning) {
      return baseSeconds;
    }

    const elapsedSeconds = Math.max(0, Date.now() - (snapshot.observedAtMs || 0)) / 1000;
    return baseSeconds + elapsedSeconds;
  };

  const applyBackendSnapshot = (data = {}) => {
    const nextState = {
      current_time_ms: data.current_time_ms || 0,
      observed_at_ms: data.observed_at_ms || Date.now(),
      ended: Boolean(data.ended),
      source_kind: data.source_kind || "unknown",
      worker_running: Boolean(data.worker_running),
    };

    backendClockRef.current = {
      currentTimeMs: nextState.current_time_ms,
      observedAtMs: nextState.observed_at_ms,
      workerRunning: nextState.worker_running,
      ended: nextState.ended,
      sourceKind: nextState.source_kind,
    };

    setBackendState(nextState);
    return nextState;
  };

  const syncFromBackend = async () => {
    try {
      const res = await api.get(`/cameras/${cameraId}/position`);
      const nextState = applyBackendSnapshot(res.data || {});
      if (!isReplayableSourceKind(nextState.source_kind)) return;

      const backendSeconds = getEstimatedBackendSeconds();
      if (nextState.ended) {
        setPlayerCurrentTime(backendSeconds);
        return;
      }

      const current = getCurrentPlayerTime();
      const drift = backendSeconds - current;
      const seekLead = Math.max(0.08, Math.min(0.32, bufferDelay * 0.3));

      if (backendSeconds > 0.2 && Math.abs(drift) > 1.1) {
        const target = Math.max(0, backendSeconds - seekLead);
        if (Math.abs(target - lastSyncTargetRef.current) > 0.35) {
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
            const eventId = Number(msg.event_id || 0);
            if (eventId && eventId < latestEventIdRef.current) return;
            if (eventId) latestEventIdRef.current = eventId;

            if (msg.source_kind) {
              backendClockRef.current = {
                ...backendClockRef.current,
                sourceKind: msg.source_kind,
              };
              setBackendState((prev) => ({
                ...prev,
                source_kind: msg.source_kind,
              }));
            }

            if (msg.processing_ms != null) {
              processingSamplesRef.current.push(msg.processing_ms);
              if (processingSamplesRef.current.length > 12) {
                processingSamplesRef.current.shift();
              }
              const avg =
                processingSamplesRef.current.reduce((sum, sample) => sum + sample, 0) /
                processingSamplesRef.current.length;
              setBufferDelay(Math.max(0.2, avg / 1000 + 0.22));
            }

            if (!Array.isArray(msg.detections)) return;

            const timestamp = Date.now();
            if (msg.detections.length > 0 && onNewDetection) {
              onNewDetection(cameraId, msg.detections);
            }

            const nextAnnotations = msg.detections.flatMap((det) => {
              const frameTime =
                det.frame_time_ms != null
                  ? det.frame_time_ms / 1000
                  : msg.frame_time_ms != null
                  ? msg.frame_time_ms / 1000
                  : null;

              if (det.type === "stampede" && Array.isArray(det.overlay_boxes) && det.overlay_boxes.length > 0) {
                const personAnnotations = det.overlay_boxes.map((box, index) => ({
                  id: `${det.detection_id ?? timestamp}_${index}`,
                  bbox: box.bbox || [0, 0, 0, 0],
                  type: det.type || "stampede",
                  subtype: box.label || "person",
                  confidence: box.confidence,
                  people_count: det.people_count,
                  allowed_people: det.allowed_people,
                  frameTime,
                  receivedAt: timestamp,
                  eventId,
                }));

                personAnnotations.push({
                  id: `${det.detection_id ?? timestamp}_summary`,
                  bbox: det.bbox || [0, 0, 0, 0],
                  type: det.type || "stampede",
                  subtype: "summary",
                  confidence: det.confidence,
                  people_count: det.people_count,
                  allowed_people: det.allowed_people,
                  frameTime,
                  receivedAt: timestamp,
                  eventId,
                });
                return personAnnotations;
              }

              return [
                {
                  id: det.detection_id ?? `${timestamp}_${Math.random()}`,
                  bbox: det.bbox || [0, 0, 0, 0],
                  type: det.type || "weapon",
                  subtype: det.subtype,
                  confidence: det.confidence,
                  people_count: det.people_count,
                  allowed_people: det.allowed_people,
                  frameTime,
                  receivedAt: timestamp,
                  eventId,
                },
              ];
            });

            setAnnotations((prev) => {
              const replayable = isReplayableSourceKind(msg.source_kind || backendClockRef.current.sourceKind);
              if (!replayable) {
                return nextAnnotations;
              }

              const merged = [...prev, ...nextAnnotations];
              merged.sort((a, b) => {
                const aTime = a.frameTime ?? 0;
                const bTime = b.frameTime ?? 0;
                if (aTime !== bTime) return aTime - bTime;
                return (a.eventId || 0) - (b.eventId || 0);
              });
              return merged.slice(-MAX_REPLAY_BUFFER);
            });
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
    latestEventIdRef.current = 0;
    setPlayerCurrentTime(0);
    setAnnotations([]);
    backendClockRef.current = {
      currentTimeMs: 0,
      observedAtMs: Date.now(),
      workerRunning: false,
      ended: false,
      sourceKind: "unknown",
    };

    syncFromBackend();

    const interval = setInterval(() => {
      const replayableNow = isReplayableSourceKind(backendClockRef.current.sourceKind);
      if (replayableNow) {
        syncFromBackend();
      }
    }, REPLAY_SYNC_POLL_MS);

    const slowInterval = setInterval(syncFromBackend, GENERAL_SYNC_POLL_MS);

    return () => {
      clearInterval(interval);
      clearInterval(slowInterval);
    };
  }, [cameraId, src]);

  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const playbackTime = getCurrentPlayerTime();
      setAnnotations((prev) =>
        prev.filter((a) => {
          if (a.frameTime != null) {
            return a.frameTime >= playbackTime - 4 && a.frameTime <= playbackTime + 10;
          }
          return now - a.receivedAt < 1200;
        })
      );
    };
    const id = setInterval(cleanup, 5000);
    return () => clearInterval(id);
  }, [isNativeVideo, isYouTube]);

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
      v.playbackRate = 1;
    };
  }, [isNativeVideo, backendState.ended]);

  useEffect(() => {
    if (!isReplayable || isStreamFinished) return;

    let rafId = 0;
    const tick = () => {
      const backendSeconds = getEstimatedBackendSeconds();
      const current = getCurrentPlayerTime();
      setPlayerCurrentTime(current);

      const drift = backendSeconds - current;
      const absDrift = Math.abs(drift);

      if (isNativeVideo && videoRef.current) {
        if (absDrift > 0.2 && absDrift < 1.1) {
          videoRef.current.playbackRate = drift > 0 ? 1.08 : 0.94;
        } else if (videoRef.current.playbackRate !== 1) {
          videoRef.current.playbackRate = 1;
        }
      }

      if (absDrift > 1.35) {
        const seekLead = Math.max(0.08, Math.min(0.32, bufferDelay * 0.3));
        const target = Math.max(0, backendSeconds - seekLead);
        if (Math.abs(target - lastSyncTargetRef.current) > 0.35) {
          seekPlayer(target);
          lastSyncTargetRef.current = target;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (videoRef.current) videoRef.current.playbackRate = 1;
    };
  }, [isReplayable, isStreamFinished, bufferDelay, isNativeVideo, isYouTube]);

  useEffect(() => {
    if (!isNativeVideo || !videoRef.current || !connected || !src || isStreamFinished) return;
    if (playbackStartedRef.current) return;

    playbackStartedRef.current = true;
    const timer = setTimeout(() => {
      videoRef.current?.play?.().catch(() => {
        console.warn("Autoplay blocked; user interaction may be required.");
      });
    }, Math.round((bufferDelay + 0.18) * 1000));

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
        observed_at_ms: Date.now(),
        ended: false,
        worker_running: true,
      }));
      backendClockRef.current = {
        currentTimeMs: 0,
        observedAtMs: Date.now(),
        workerRunning: true,
        ended: false,
        sourceKind: backendClockRef.current.sourceKind,
      };
      setPlayerCurrentTime(0);
      lastSyncTargetRef.current = 0;
      latestEventIdRef.current = 0;
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
    const current = hasPreview ? getCurrentPlayerTime() : getEstimatedBackendSeconds();
    const overlayTolerance = isReplayable
      ? Math.max(0.14, Math.min(0.3, bufferDelay * 0.25 + 0.08))
      : Math.max(0.18, Math.min(0.6, bufferDelay * 0.55));

    return annotations
      .filter((a) => {
        if (a.frameTime != null && isReplayable) {
          return Math.abs(current - a.frameTime) <= overlayTolerance;
        }
        return Date.now() - a.receivedAt < Math.max(220, Math.min(600, bufferDelay * 1000));
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
            : a.type === "stampede"
            ? "rgba(255,0,0,0.95)"
            : a.subtype === "knife"
            ? "rgba(255,0,0,0.9)"
            : "rgba(0,255,0,0.9)";
        const fillColor =
          a.type === "scuffle"
            ? "rgba(255,165,0,0.10)"
            : a.type === "stampede"
            ? "rgba(255,0,0,0.08)"
            : "rgba(0,255,0,0.05)";
        const glowColor =
          a.type === "scuffle"
            ? "rgba(255,165,0,0.35)"
            : a.type === "stampede"
            ? "rgba(255,0,0,0.35)"
            : "rgba(0,255,0,0.3)";
        const label =
          a.type === "scuffle"
            ? `scuffle${a.subtype ? ` (${a.subtype})` : ""} ${a.confidence ? a.confidence.toFixed(2) : ""}`.trim()
            : a.type === "stampede"
            ? (a.subtype && a.subtype !== "summary"
                ? `${a.subtype}${a.confidence ? ` ${a.confidence.toFixed(2)}` : ""}`.trim()
                : `stampede ${a.people_count ?? 0}/${a.allowed_people ?? "?"}`.trim())
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
