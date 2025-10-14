// src/components/EditCameraModal.jsx
import { useState, useEffect } from "react";

export const EditCameraModal = ({ camera, onSave, onClose }) => {
  const [cameraData, setCameraData] = useState({
    name: "",
    gps: "",
    detection: { weapon: false, scuffle: false, stampede: false },
  });

  useEffect(() => {
    if (camera) {
      setCameraData(camera);
    }
  }, [camera]);

  const updateField = (field, value) => {
    setCameraData({ ...cameraData, [field]: value });
  };

  const toggleDetection = (type) => {
    setCameraData({
      ...cameraData,
      detection: { ...cameraData.detection, [type]: !cameraData.detection[type] },
    });
  };

  const handleSave = () => {
    onSave(cameraData);
    onClose();
  };

  if (!camera) return null;

  return (
    <div className="fixed inset-0 bg-transparent backdrop-brightness-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4 text-center text-primary">
          Edit Camera
        </h2>

        {/* Camera Name */}
        <div className="mb-3">
          <label className="block text-gray-200 mb-1">Camera Name</label>
          <input
            type="text"
            value={cameraData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="w-full rounded px-2 py-1 bg-gray-700 text-gray-200"
          />
        </div>

        {/* GPS Coordinates */}
        <div className="mb-3">
          <label className="block text-gray-200 mb-1">GPS Coordinates</label>
          <input
            type="text"
            value={cameraData.gps}
            onChange={(e) => updateField("gps", e.target.value)}
            className="w-full rounded px-2 py-1 bg-gray-700 text-gray-200"
          />
        </div>

        {/* Detection Settings */}
        <div className="mb-4 text-gray-200">
          <label className="block mb-1 font-semibold">Detection</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cameraData.detection.weapon}
                onChange={() => toggleDetection("weapon")}
              />
              Weapon
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cameraData.detection.scuffle}
                onChange={() => toggleDetection("scuffle")}
              />
              Scuffle
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cameraData.detection.stampede}
                onChange={() => toggleDetection("stampede")}
              />
              Stampede
            </label>
          </div>
        </div>

        {/* Action Buttons */}
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
