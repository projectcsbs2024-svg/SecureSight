import { useState, useEffect } from "react";

export const EditCameraModal = ({ camera, onSave, onClose }) => {
  const [cameraData, setCameraData] = useState({
    name: "",
    latitude: "",
    longitude: "",
    location: "",
    detections_enabled: [],
  });

  useEffect(() => {
    if (camera) {
      // Convert camera.detection object back to array for checkboxes
      const detectionsArray = Object.entries(camera.detection || {})
        .filter(([_, enabled]) => enabled)
        .map(([key]) => key);

      setCameraData({
        name: camera.name || "",
        latitude: camera.latitude || "",
        longitude: camera.longitude || "",
        location: camera.location || "",
        detections_enabled: detectionsArray.length ? detectionsArray : ["weapon"],
      });
    }
  }, [camera]);

  const toggleDetection = (type) => {
    setCameraData((prev) => {
      const detections = prev.detections_enabled.includes(type)
        ? prev.detections_enabled.filter((d) => d !== type)
        : [...prev.detections_enabled, type];
      return { ...prev, detections_enabled: detections };
    });
  };

  const handleSave = () => {
    const payload = {
      id: camera.id,
      ...cameraData,
      latitude: cameraData.latitude ? parseFloat(cameraData.latitude) : null,
      longitude: cameraData.longitude ? parseFloat(cameraData.longitude) : null,
    };
    onSave(payload);
    onClose();
  };

  if (!camera) return null;

  return (
    <div className="fixed inset-0 bg-transparent backdrop-brightness-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center text-primary">
          Edit Camera
        </h2>

        <input
          type="text"
          placeholder="Camera Name"
          value={cameraData.name}
          onChange={(e) => setCameraData({ ...cameraData, name: e.target.value })}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Latitude"
          value={cameraData.latitude}
          onChange={(e) => setCameraData({ ...cameraData, latitude: e.target.value })}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Longitude"
          value={cameraData.longitude}
          onChange={(e) => setCameraData({ ...cameraData, longitude: e.target.value })}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-2"
        />
        <input
          type="text"
          placeholder="Location"
          value={cameraData.location}
          onChange={(e) => setCameraData({ ...cameraData, location: e.target.value })}
          className="w-full bg-gray-700 text-gray-200 p-2 rounded-lg mb-4"
        />

        <div className="text-gray-200 mb-4">
          <label className="block mb-2 font-semibold">Detections</label>
          {["weapon", "scuffle", "stampede"].map((type) => (
            <label key={type} className="flex items-center gap-2 mb-1">
              <input
                type="checkbox"
                checked={cameraData.detections_enabled.includes(type)}
                onChange={() => toggleDetection(type)}
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-teal-600 text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
