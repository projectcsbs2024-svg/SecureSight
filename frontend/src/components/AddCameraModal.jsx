import { useState } from "react";
import api from "../apiHandle/api.jsx";

export const AddCameraModal = ({ onAdd, onClose }) => {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [location, setLocation] = useState("");

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(selected);
  };

  const handleAdd = async () => {
    let streamUrl = url;

    if (mode === "file" && file) {
      try {
        setUploading(true);

        const formData = new FormData();
        formData.append("file", file);

        // Upload video file first
        const resUpload = await api.post("/cameras/upload/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        // Get full URL from backend
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

    if (!name) {
      alert("Camera name is required");
      return;
    }

    const newCamera = {
      name,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      location: location || null,
      stream_url: streamUrl,
      detections_enabled: ["weapon"], // default
    };

    try {
      // Send new camera to backend
      const res = await api.post("/cameras/", newCamera);

      // ✅ Important: Pass backend response to onAdd
      onAdd(res.data);

      onClose();
    } catch (err) {
      console.error("Error adding camera:", err);
      alert("Failed to add camera");
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent backdrop-brightness-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center text-primary">
          Add Camera Feed
        </h2>

        <input
          type="text"
          placeholder="Camera Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Latitude"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Longitude"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-4"
        />

        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => setMode("file")}
            className={`px-3 py-1 rounded-lg ${
              mode === "file" ? "bg-primary" : "bg-gray-700"
            }`}
          >
            Upload File
          </button>
          <button
            onClick={() => setMode("url")}
            className={`px-3 py-1 rounded-lg ${
              mode === "url" ? "bg-primary" : "bg-gray-700"
            }`}
          >
            Stream URL
          </button>
        </div>

        {mode === "file" ? (
          <>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-300 mb-4"
            />
            {file && (
              <video
                src={URL.createObjectURL(file)}
                className="w-full rounded-lg mb-3"
                controls
              />
            )}
          </>
        ) : (
          <input
            type="text"
            placeholder="Enter camera stream URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-4"
          />
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={
              uploading ||
              !name ||
              ((mode === "file" && !file) || (mode === "url" && !url))
            }
            className={`px-4 py-2 rounded-lg ${
              uploading ||
              !name ||
              ((mode === "file" && !file) || (mode === "url" && !url))
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-primary hover:bg-teal-600"
            }`}
          >
            {uploading ? "Uploading..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};
