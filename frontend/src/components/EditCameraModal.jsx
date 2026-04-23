import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPicker } from "../components/MapPicker";
import ReactPlayer from "react-player";
import { isNativeVideoUrl, isYouTubeUrl } from "../utils/streamSource";

const DETECTION_LABELS = {
  weapon: "Weapon",
  scuffle: "Scuffle",
  stampede: "Stampede",
};

export const EditCameraModal = ({ camera, onSave, onClose }) => {
  const [cameraData, setCameraData] = useState({
    name: "",
    latitude: null,
    longitude: null,
    location: "",
    stream_url: "",
    detections_enabled: ["weapon"],
    stampede_person_limit: "",
  });

  // Prefill all values from backend, including map coordinates
  useEffect(() => {
    if (camera) {
      const detectionsArray =
        camera.detections_enabled?.length > 0
          ? camera.detections_enabled
          : Object.entries(camera.detection || {})
              .filter(([_, enabled]) => enabled)
              .map(([key]) => key);

      setCameraData({
        name: camera.name || "",
        latitude: camera.latitude ?? null,
        longitude: camera.longitude ?? null,
        location: camera.location || "",
        stream_url: camera.stream_url || "",
        detections_enabled: detectionsArray.length ? detectionsArray : ["weapon"],
        stampede_person_limit:
          camera.stampede_person_limit != null ? String(camera.stampede_person_limit) : "",
      });
    }
  }, [camera]);

  const toggleDetection = (type) => {
    setCameraData((prev) => {
      const updated = prev.detections_enabled.includes(type)
        ? prev.detections_enabled.filter((d) => d !== type)
        : [...prev.detections_enabled, type];
      return { ...prev, detections_enabled: updated };
    });
  };

  const handleSave = () => {
    if (!cameraData.name || cameraData.latitude === null || cameraData.longitude === null) {
      alert("Camera name and location are required");
      return;
    }

    if (cameraData.detections_enabled.length === 0) {
      alert("Select at least one detection type");
      return;
    }

    if (cameraData.detections_enabled.includes("stampede")) {
      const parsedLimit = Number(cameraData.stampede_person_limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        alert("Enter a valid allowed person count for stampede detection");
        return;
      }
    }

    onSave({
      id: camera.id,
      ...cameraData,
      stampede_person_limit: cameraData.detections_enabled.includes("stampede")
        ? Number(cameraData.stampede_person_limit)
        : null,
    });
    onClose();
  };

  if (!camera) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 flex justify-center items-end md:items-center z-50 p-2 sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: 200 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 200 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md sm:max-w-2xl md:max-w-3xl flex flex-col md:flex-row overflow-hidden max-h-[85vh] overflow-y-auto"
        >
          {/* Left: Map & Camera Name */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col">
            <h2 className="text-base sm:text-lg font-semibold mb-2 text-center text-primary">
              Edit Camera
            </h2>

            <input
              type="text"
              placeholder="Camera Name"
              value={cameraData.name}
              onChange={(e) =>
                setCameraData({ ...cameraData, name: e.target.value })
              }
              className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex-1 h-[140px] sm:h-[180px] rounded-lg overflow-hidden mb-2">
              <MapPicker
                latitude={cameraData.latitude}
                longitude={cameraData.longitude}
                onLocationChange={(lat, lng, loc) =>
                  setCameraData((prev) => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    location: loc,
                  }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="Latitude"
                value={cameraData.latitude ?? ""}
                readOnly
                className="bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
              />
              <input
                type="text"
                placeholder="Longitude"
                value={cameraData.longitude ?? ""}
                readOnly
                className="bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
              />
            </div>

            <input
              type="text"
              placeholder="Location"
              value={cameraData.location}
              readOnly
              className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
            />
          </div>

          {/* Right: Stream URL, Detections & Buttons */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <label className="block text-gray-200 font-semibold mb-2 text-sm">
                Stream URL
              </label>
              <input
                type="text"
                placeholder="Enter Stream URL or RTSP link"
                value={cameraData.stream_url}
                onChange={(e) =>
                  setCameraData((prev) => ({
                    ...prev,
                    stream_url: e.target.value,
                  }))
                }
                className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mb-4 text-xs text-gray-400">
                Any network source can be saved here and used for detection, including `rtsp://`, `rtmp://`, `http://`, `https://`, and YouTube video links.
              </p>

              {cameraData.stream_url && (isNativeVideoUrl(cameraData.stream_url) || isYouTubeUrl(cameraData.stream_url)) && (
                <div className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-gray-600 mb-4">
                  {isYouTubeUrl(cameraData.stream_url) ? (
                    <ReactPlayer
                      url={cameraData.stream_url}
                      width="100%"
                      height="100%"
                      controls
                      playing={false}
                      config={{
                        youtube: {
                          playerVars: {
                            modestbranding: 1,
                            rel: 0,
                          },
                        },
                      }}
                    />
                  ) : (
                    <video
                      src={cameraData.stream_url}
                      className="w-full h-full object-contain"
                      controls
                    />
                  )}
                </div>
              )}

              {cameraData.stream_url && !isNativeVideoUrl(cameraData.stream_url) && !isYouTubeUrl(cameraData.stream_url) && (
                <div className="w-full rounded-lg border border-dashed border-gray-600 bg-black/20 p-4 text-xs text-gray-300 mb-4">
                  Browser preview is not available for this source, but the backend will still use it for detection.
                </div>
              )}

              <label className="block text-gray-200 font-semibold mb-2 text-sm">
                Detections
              </label>
              <div className="space-y-1 mb-4">
                {["weapon", "scuffle", "stampede"].map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-gray-300 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={cameraData.detections_enabled.includes(type)}
                      onChange={() => toggleDetection(type)}
                      className="accent-primary"
                    />
                    {DETECTION_LABELS[type] || type}
                  </label>
                ))}
              </div>

              {cameraData.detections_enabled.includes("stampede") && (
                <div className="mb-4">
                  <label className="block text-gray-200 font-semibold mb-2 text-sm">
                    Allowed persons for stampede detection
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={cameraData.stampede_person_limit}
                    onChange={(e) =>
                      setCameraData((prev) => ({
                        ...prev,
                        stampede_person_limit: e.target.value,
                      }))
                    }
                    placeholder="Enter allowed persons"
                    className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 mt-3">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-xs sm:text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-teal-600 text-xs sm:text-sm text-white transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
