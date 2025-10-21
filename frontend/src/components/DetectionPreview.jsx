// src/components/DetectionPreview.jsx
import React from "react";
import { X } from "lucide-react";
import api from "../apiHandle/api";

export default function DetectionPreview({ alert, onClose, updateAlertStatus }) {
  if (!alert) return null;

  const handleResolve = async () => {
    try {
      // Optimistic UI update
      updateAlertStatus(alert.id, "Resolved");

      // Send lowercase status to backend
      await api.patch(`/detections/${alert.id}/`, { status: "resolved" });
    } catch (err) {
      console.error("Error marking alert as resolved:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative">
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <img
          src={alert.image}
          alt="Alert Snapshot"
          className="w-full h-56 object-cover rounded-t-xl"
        />

        <div className="p-5">
          <h2 className="text-xl font-bold mb-2 text-gray-800">{alert.type}</h2>
          <p className="text-sm text-gray-600 mb-4">
            Detected on <strong>{alert.camera}</strong> at {alert.time}
          </p>

          <div className="space-y-2">
            <p>
              <strong className="text-gray-800">Confidence:</strong>{" "}
              <span className="text-green-600">{alert.confidence}%</span>
            </p>
            <p>
              <strong className="text-gray-800">Status:</strong>{" "}
              <span className={alert.status === "Active" ? "text-red-600" : "text-blue-600"}>
                {alert.status}
              </span>
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            {alert.status === "Active" && (
              <button
                onClick={handleResolve}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-semibold"
              >
                Mark as Resolved
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
