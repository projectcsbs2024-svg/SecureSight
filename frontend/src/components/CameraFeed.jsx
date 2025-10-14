export const CameraFeed = ({ src, name, status, onDelete }) => {
  const statusColor = status === "online" ? "bg-green-500" : "bg-red-500";

  return (
    <div className="relative rounded-xl shadow-lg transition-all overflow-hidden group w-full">
      {src ? (
        <div className="relative w-full aspect-video">
          <video
            src={src}
            controls
            autoPlay
            loop
            muted
            className="rounded-xl w-full h-full object-cover"
          />

          {/* Status indicator (circle) top-left */}
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={status === "online" ? "Online" : "Offline"}
          />

          {/* Camera name top-right (hide on hover) */}
          <span
            className="absolute top-2 right-2 mr-8 px-2 py-1 bg-transparent text-white text-sm font-semibold z-10 transition-opacity duration-200 group-hover:opacity-0"
          >
            {name}
          </span>

          {/* Delete Button (show on hover) */}
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 text-red-900/400 hover:text-red-500 text-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            title="Remove camera"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="aspect-video bg-gray-700 flex items-center justify-center rounded-lg relative w-full">
          <span className="text-gray-400">No camera feed</span>

          {/* Status indicator */}
          <div
            className={`absolute top-2 left-2 w-3 h-3 rounded-full ${statusColor}`}
            title={status === "online" ? "Online" : "Offline"}
          />

          {/* Camera name */}
          <span className="absolute top-2 right-2 px-2 py-1 rounded bg-transparent bg-opacity-30 text-white text-sm ">
            {name}
          </span>
        </div>
      )}
    </div>
  );
};
