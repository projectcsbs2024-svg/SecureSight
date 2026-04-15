import { useState } from "react";
import api from "../apiHandle/api.jsx";
import { MapPicker } from "../components/MapPicker";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { isNativeVideoUrl, isYouTubeUrl } from "../utils/streamSource";

export const AddCameraModal = ({ onAdd, onClose }) => {
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [detectionsEnabled, setDetectionsEnabled] = useState([
    "weapon",
    "scuffle",
  ]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(selected);
  };

  const toggleDetection = (type) => {
    setDetectionsEnabled((prev) =>
      prev.includes(type)
        ? prev.filter((item) => item !== type)
        : [...prev, type]
    );
  };

  const handleAdd = async () => {
    let streamUrl = url.trim();
    if (mode === "file" && file) {
      try {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        const resUpload = await api.post("/cameras/upload/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        streamUrl = `${import.meta.env.VITE_API_URL}${resUpload.data.url}`;
      } catch (err) {
        console.error("File upload failed:", err);
        alert("Failed to upload file");
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    if (!name || latitude === null || longitude === null) {
      alert("Camera name and location are required");
      return;
    }

    if (mode === "url" && !streamUrl) {
      alert("Stream URL is required when using URL mode");
      return;
    }

    if (detectionsEnabled.length === 0) {
      alert("Select at least one detection type");
      return;
    }

    const newCamera = {
      name,
      latitude,
      longitude,
      location,
      stream_url: streamUrl,
      detections_enabled: detectionsEnabled,
    };

    try {
      const res = await api.post("/cameras/", newCamera);
      onAdd(res.data);
      onClose();
    } catch (err) {
      console.error("Error adding camera:", err);
      alert("Failed to add camera");
    }
  };

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
          {/* Left Section — Map + Details */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col">
            <h2 className="text-base sm:text-lg font-semibold mb-2 text-center text-primary">
              Add Camera
            </h2>

            <input
              type="text"
              placeholder="Camera Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex-1 h-[140px] sm:h-[180px] rounded-lg overflow-hidden mb-2">
              <MapPicker
                latitude={latitude}
                longitude={longitude}
                onLocationChange={(lat, lng, loc) => {
                  setLatitude(lat);
                  setLongitude(lng);
                  setLocation(loc);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="Latitude"
                value={latitude ?? ""}
                readOnly
                className="bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
              />
              <input
                type="text"
                placeholder="Longitude"
                value={longitude ?? ""}
                readOnly
                className="bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
              />
            </div>

            <input
              type="text"
              placeholder="Location"
              value={location}
              readOnly
              className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg text-xs sm:text-sm"
            />
          </div>

          {/* Right Section — Upload/Stream + Buttons */}
          <div className="w-full md:w-1/2 p-3 sm:p-4 flex flex-col justify-between">
            <div>
              <div className="mb-4">
                <label className="block text-gray-200 font-semibold mb-2 text-sm">
                  Enabled detections
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {["weapon", "scuffle", "stampede"].map((type) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-xs sm:text-sm text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={detectionsEnabled.includes(type)}
                        onChange={() => toggleDetection(type)}
                        className="accent-primary"
                      />
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  New cameras start with Weapon and Scuffle enabled by default.
                </p>
              </div>

              <div className="flex justify-center space-x-2 mb-3">
                <button
                  onClick={() => setMode("file")}
                  className={`px-2 py-1 rounded-lg text-xs sm:text-sm transition-all ${
                    mode === "file"
                      ? "bg-primary text-white"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setMode("url")}
                  className={`px-2 py-1 rounded-lg text-xs sm:text-sm transition-all ${
                    mode === "url"
                      ? "bg-primary text-white"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  Stream URL
                </button>
              </div>

              {mode === "file" ? (
                <div className="mb-3">
                  <div className="flex items-center space-x-2">
                <button
                  onClick={() => document.getElementById("cameraFileInput").click()}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-xs sm:text-sm hover:bg-teal-600 transition-all"
                    >
                      Choose File
                    </button>
                    <span className="text-gray-300 text-xs sm:text-sm">
                      {file ? file.name : "No file chosen"}
                    </span>
                  </div>
                  <input
                    id="cameraFileInput"
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {file && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-gray-600 mt-2"
                    >
                      <video
                        src={URL.createObjectURL(file)}
                        className="w-full h-full object-contain"
                        controls
                      />
                    </motion.div>
                  )}
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Enter Stream URL or RTSP link"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mb-3 text-xs text-gray-400">
                    Any network source is accepted here, including `rtsp://`, `rtmp://`, `http://`, `https://`, and YouTube video links.
                  </p>
                  {url && (isNativeVideoUrl(url) || isYouTubeUrl(url)) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-gray-600"
                    >
                      {isYouTubeUrl(url) ? (
                        <ReactPlayer
                          url={url}
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
                          src={url}
                          className="w-full h-full object-contain"
                          controls
                        />
                      )}
                    </motion.div>
                  )}
                  {url && !isNativeVideoUrl(url) && !isYouTubeUrl(url) && (
                    <div className="w-full rounded-lg border border-dashed border-gray-600 bg-black/20 p-4 text-xs text-gray-300">
                      Browser preview is not available for this source, but the URL will still be saved and used by the backend detector.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-2 mt-3">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-xs sm:text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={
                  uploading ||
                  !name ||
                  latitude === null ||
                  longitude === null ||
                  (mode === "url" && !url.trim()) ||
                  detectionsEnabled.length === 0
                }
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                  uploading ||
                  !name ||
                  latitude === null ||
                  longitude === null ||
                  (mode === "url" && !url.trim()) ||
                  detectionsEnabled.length === 0
                    ? "bg-gray-500 cursor-not-allowed"
                    : "bg-primary hover:bg-teal-600"
                }`}
              >
                {uploading ? "Uploading..." : "Add"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
