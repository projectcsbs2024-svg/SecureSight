import { useState } from "react";
import api from "../apiHandle/api.jsx";

export const AddCameraModal = ({ onAdd, onClose }) => {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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

        const res = await api.post("/cameras/upload/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        // Use the permanent backend URL
        streamUrl = `http://127.0.0.1:8000${res.data.url}`;
      } catch (err) {
        console.error("File upload failed:", err);
        alert("Failed to upload file");
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    // Add camera using backend
    const newCamera = {
      name: `Camera ${Math.floor(Math.random() * 1000)}`,
      latitude: 22.57,
      longitude: 88.36,
      src: streamUrl,
    };

    onAdd(newCamera);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-transparent backdrop-brightness-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center text-primary">
          Add Camera Feed
        </h2>

        {/* Mode Toggle */}
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

        {/* Input Fields */}
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
            disabled={uploading || ((mode === "file" && !file) || (mode === "url" && !url))}
            className={`px-4 py-2 rounded-lg ${
              uploading || ((mode === "file" && !file) || (mode === "url" && !url))
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
