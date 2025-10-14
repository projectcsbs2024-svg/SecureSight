import React, { useState } from "react";

const VideoUpload = () => {
  const [file, setFile] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setDetections([]);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please choose a video first!");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/upload_video/`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      console.log("Detection Results:", data);

      setDetections(data.detections);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold mb-4 text-green-600">SecureSight Video Detection</h1>

      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="mb-4"
      />

      <button
        onClick={handleUpload}
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
      >
        {loading ? "Processing..." : "Upload & Detect"}
      </button>

      {error && <p className="text-red-500 mt-3">{error}</p>}

      {detections.length > 0 && (
        <div className="mt-5 bg-gray-100 rounded-lg p-4 w-full max-w-xl text-left">
          <h2 className="font-bold mb-2 text-lg text-gray-700">Detections:</h2>
          <ul className="max-h-60 overflow-y-auto text-sm">
            {detections.slice(0, 10).map((det, i) => (
              <li key={i} className="mb-1">
                Frame: {det.frame}, Class: {det.class_id}, Confidence: {det.confidence}
              </li>
            ))}
          </ul>
          {detections.length > 10 && (
            <p className="text-gray-500 mt-2 text-xs">
              Showing first 10 detections only
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoUpload;
