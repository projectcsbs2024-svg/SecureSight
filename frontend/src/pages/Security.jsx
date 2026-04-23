import React, { useEffect, useState } from "react";
import { Edit2, Trash2 } from "lucide-react";

import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { AddCameraModal } from "../components/AddCameraModal";
import { EditCameraModal } from "../components/EditCameraModal";
import api from "../apiHandle/api";

const DETECTION_LABELS = {
  weapon: "Weapon",
  scuffle: "Strangulation",
  stampede: "Stampede",
};

export default function Security({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  const formatCamera = (cam) => {
    const detections = cam.detections_enabled || [];
    return {
      ...cam,
      gps: cam.location || `${cam.latitude ?? "?"}, ${cam.longitude ?? "?"}`,
      detection: {
        weapon: detections.includes("weapon"),
        scuffle: detections.includes("scuffle"),
        stampede: detections.includes("stampede"),
      },
      stampede_person_limit: cam.stampede_person_limit,
      detections_enabled: detections,
      rawCamera: cam,
    };
  };

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await api.get("/cameras/");
        setCameras(res.data.map(formatCamera));
      } catch (err) {
        console.error("Error fetching cameras:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchCameras();
  }, [user]);

  const handleAddCamera = (camera) => {
    setCameras((prev) => [...prev, formatCamera(camera)]);
    setShowAddModal(false);
  };

  const handleSaveCamera = async (updatedCamera) => {
    try {
      const detections = updatedCamera.detections_enabled || [];
      const body = {
        name: updatedCamera.name,
        latitude: updatedCamera.latitude,
        longitude: updatedCamera.longitude,
        location: updatedCamera.location,
        stream_url: updatedCamera.stream_url?.trim() || null,
        detections_enabled: detections,
        stampede_person_limit: detections.includes("stampede")
          ? updatedCamera.stampede_person_limit
          : null,
      };

      const res = await api.put(`/cameras/${updatedCamera.id}`, body);
      const cam = res.data;

      setCameras((prev) => prev.map((c) => (c.id === cam.id ? formatCamera(cam) : c)));
      setEditingCamera(null);
    } catch (err) {
      console.error("Error updating camera:", err);
      alert("Failed to update camera");
    }
  };

  const handleDeleteCamera = async (id) => {
    if (!window.confirm("Are you sure you want to delete this camera?")) return;
    try {
      await api.delete(`/cameras/${id}`);
      setCameras((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Error deleting camera:", err);
      alert("Failed to delete camera");
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get("/cameras/export/", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "cameras.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export cameras");
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen text-gray-500">Loading cameras...</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        setActivePage={() => {}}
        activePage="security"
        isExpanded={sidebarExpanded}
        setIsExpanded={setSidebarExpanded}
      />

      <div
        className="flex-1 flex flex-col transition-all duration-300"
        style={{ marginLeft: sidebarCurrentWidth, height: "100vh" }}
      >
        <div className="fixed top-0 left-0 right-0 z-20">
          <Navbar userEmail={user?.email} />
        </div>

        <div className="flex-1 flex flex-col p-6 overflow-auto" style={{ marginTop: `${navbarHeight}px` }}>
          <div className="flex justify-between items-center mb-6">
            <SummaryCard title="Total Cameras" value={cameras.length} color="green" />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2"
              >
                Add Camera
              </button>
              <button
                onClick={handleExport}
                className="bg-green-500 text-white px-4 py-2 rounded"
              >
                Export Camera Data
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-auto max-h-[500px]">
            <table className="min-w-full text-sm text-gray-700">
              <thead className="bg-gray-100 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Camera Name</th>
                  <th className="px-4 py-3 text-left font-semibold">GPS / Location</th>
                  <th className="px-4 py-3 text-left font-semibold">Detection</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((cam) => (
                  <tr key={cam.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3">{cam.name}</td>
                    <td className="px-4 py-3">{cam.gps}</td>
                    <td className="px-4 py-3">
                      <span>{DETECTION_LABELS.weapon}: <b className={cam.detection.weapon ? "text-green-600" : "text-red-500"}>{cam.detection.weapon ? "Yes" : "No"}</b></span><br />
                      <span>{DETECTION_LABELS.scuffle}: <b className={cam.detection.scuffle ? "text-green-600" : "text-red-500"}>{cam.detection.scuffle ? "Yes" : "No"}</b></span><br />
                      <span>{DETECTION_LABELS.stampede}: <b className={cam.detection.stampede ? "text-green-600" : "text-red-500"}>{cam.detection.stampede ? "Yes" : "No"}</b></span>
                      {cam.detection.stampede && cam.stampede_person_limit ? (
                        <>
                          <br />
                          <span>Allowed Persons: <b className="text-gray-800">{cam.stampede_person_limit}</b></span>
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setEditingCamera(cam.rawCamera || cam)}
                        className="bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(cam.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModal && <AddCameraModal onAdd={handleAddCamera} onClose={() => setShowAddModal(false)} />}

      {editingCamera && (
        <EditCameraModal camera={editingCamera} onSave={handleSaveCamera} onClose={() => setEditingCamera(null)} />
      )}
    </div>
  );
}

const SummaryCard = ({ title, value, color }) => (
  <div className={`bg-white rounded-xl shadow-md p-4 flex items-center gap-3 border-l-4 border-${color}-500`}>
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);
