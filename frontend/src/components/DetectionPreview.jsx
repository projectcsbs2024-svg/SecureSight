// src/components/DetectionPreview.jsx
import React, { useEffect, useState, useRef } from "react";
import { X } from "lucide-react";
import api from "../apiHandle/api";
import { motion, AnimatePresence } from "framer-motion";

export default function DetectionPreview({
  alert,
  onClose,
  updateAlertStatus,
  onPrev,
  onNext,
}) {
  const [isImageFull, setIsImageFull] = useState(false);
  const boxRef = useRef(null);

  const handleResolve = async () => {
    if (!alert) return;
    try {
      updateAlertStatus(alert.id, "Resolved"); // Optimistic UI update
      await api.patch(`/detections/${alert.id}/`, { status: "resolved" });
    } catch (err) {
      console.error("Error marking alert as resolved:", err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowLeft") onPrev && onPrev();
    else if (e.key === "ArrowRight") onNext && onNext();
    else if (e.key === "Enter" && alert?.status === "Active") handleResolve();
    else if (e.key === "Escape") {
      if (isImageFull) setIsImageFull(false);
      else onClose();
    }
  };

  const handleClickOutside = (e) => {
    if (boxRef.current && !boxRef.current.contains(e.target) && !isImageFull) {
      onClose();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  });

  if (!alert) return <></>;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-transparent flex items-center justify-center z-50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Main Alert Box */}
        <motion.div
          ref={boxRef}
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            <X size={20} />
          </button>

          <img
            src={alert.image}
            alt="Alert Snapshot"
            className="w-full h-56 object-cover rounded-t-xl cursor-pointer"
            onClick={() => setIsImageFull(true)}
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
                <span
                  className={
                    alert.status === "Active"
                      ? "text-red-600"
                      : "text-blue-600"
                  }
                >
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
        </motion.div>

        {/* Full-size image preview */}
        <AnimatePresence>
          {isImageFull && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] cursor-zoom-out"
              onClick={() => setIsImageFull(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.img
                src={alert.image}
                alt="Full-size preview"
                className="max-w-5xl max-h-[90vh] rounded-lg"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                transition={{ duration: 0.25 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
