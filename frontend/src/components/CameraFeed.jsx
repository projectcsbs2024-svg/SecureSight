import { useEffect, useRef, useState } from "react";

export const CameraFeed = ({ src, name, status, onDelete, cameraId }) => {
  const statusColor = status === "online" ? "bg-green-500" : "bg-red-500";
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [detections, setDetections] = useState([]);

  // --- 🔴 Connect to backend EventStream ---
  useEffect(() => {
    if (!cameraId) return;

    const eventSource = new EventSource(
      `http://127.0.0.1:8000/cameras/${cameraId}/detections/`
    );

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setDetections(parsed || []);
      } catch (err) {
        console.error("Invalid detection event:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [cameraId]);

  // --- 🟩 Draw detection boxes ---
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx || !video) return;

    const drawBoxes = () => {
      if (!video.videoWidth || !video.videoHeight) return;

      // Match canvas to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      detections.forEach((det) => {
        const { x1, y1, x2, y2, subtype, confidence } = det;
        const color = "red";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.font = "14px Arial";
        ctx.fillStyle = color;

        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillText(`${subtype} ${(confidence * 100).toFixed(1)}%`, x1 + 4, y1 - 5);
      });

      requestAnimationFrame(drawBoxes);
    };

    drawBoxes();
  }, [detections]);

  return (
    <div className="relative rounded-xl shadow-lg overflow-hidden group w-full">
      <div className="relative w-full aspect-video">
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          loop
          muted
          className="rounded-xl w-full h-full object-cover"
        />

        {/* Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />

        {/* Status indicator (circle) top-left */}
        <div
          className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
          title={status === "online" ? "Online" : "Offline"}
        />

        {/* Camera name top-right */}
        <span className="absolute top-2 right-2 mr-8 px-2 py-1 bg-transparent text-white text-sm font-semibold z-10 group-hover:opacity-0 transition-opacity duration-200">
          {name}
        </span>

        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 text-red-900/400 hover:text-red-500 text-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Remove camera"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
