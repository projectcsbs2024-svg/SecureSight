// src/pages/Security.jsx
import React, { useState, useEffect } from "react";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { Edit2, Trash2 } from "lucide-react"; // ✅ added Trash2
import { AddCameraModal } from "../components/AddCameraModal";
import { EditCameraModal } from "../components/EditCameraModal";
import { jsPDF } from "jspdf";
import api from "../apiHandle/api";

export default function Security({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [exportFormat, setExportFormat] = useState("csv");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);

  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const res = await api.get("/cameras/");
        const formatted = res.data.map(cam => ({
          id: cam.id,
          name: cam.name,
          gps: cam.location || `${cam.latitude ?? "?"}, ${cam.longitude ?? "?"}`,
          detection: {
            weapon: cam.detections_enabled?.includes("weapon"),
            scuffle: cam.detections_enabled?.includes("scuffle"),
            stampede: cam.detections_enabled?.includes("stampede"),
          },
          createdAt: cam.created_at?.split("T")[0],
        }));
        setCameras(formatted);
      } catch (err) {
        console.error("Error fetching cameras:", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchCameras();
  }, [user]);

  const handleAddCamera = (camera) => {
    setCameras(prev => [
      ...prev,
      {
        id: camera.id,
        name: camera.name,
        gps: camera.location || `${camera.latitude ?? "?"}, ${camera.longitude ?? "?"}`,
        detection: {
          weapon: camera.detections_enabled?.includes("weapon"),
          scuffle: camera.detections_enabled?.includes("scuffle"),
          stampede: camera.detections_enabled?.includes("stampede"),
        },
        createdAt: camera.created_at?.split("T")[0],
      },
    ]);
    setShowAddModal(false);
  };

  // ✅ Fixed handleSaveCamera
  const handleSaveCamera = async (updatedCamera) => {
    try {
      // Transform detections_enabled array into detection object
      const detectionObj = {
        weapon: updatedCamera.detections_enabled?.includes("weapon") || false,
        scuffle: updatedCamera.detections_enabled?.includes("scuffle") || false,
        stampede: updatedCamera.detections_enabled?.includes("stampede") || false,
      };

      const body = {
        name: updatedCamera.name,
        location: updatedCamera.location || updatedCamera.gps,
        detections_enabled: Object.entries(detectionObj)
          .filter(([k, v]) => v)
          .map(([k]) => k),
      };

      const res = await api.put(`/cameras/${updatedCamera.id}`, body);
      const cam = res.data;

      setCameras(prev =>
        prev.map(c =>
          c.id === cam.id
            ? {
                id: cam.id,
                name: cam.name,
                gps: cam.location,
                detection: {
                  weapon: cam.detections_enabled?.includes("weapon"),
                  scuffle: cam.detections_enabled?.includes("scuffle"),
                  stampede: cam.detections_enabled?.includes("stampede"),
                },
                createdAt: cam.created_at?.split("T")[0],
              }
            : c
        )
      );

      setEditingCamera(null);
    } catch (err) {
      console.error("Error updating camera:", err);
      alert("Failed to update camera");
    }
  };

  // ✅ Delete Camera
  const handleDeleteCamera = async (id) => {
    if (!window.confirm("Are you sure you want to delete this camera?")) return;
    try {
      await api.delete(`/cameras/${id}`);
      setCameras(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting camera:", err);
      alert("Failed to delete camera");
    }
  };

  const filteredCameras = cameras.filter((cam) => {
    if (!exportStartDate && !exportEndDate) return true;
    const camDate = new Date(cam.createdAt);
    const start = exportStartDate ? new Date(exportStartDate) : null;
    const end = exportEndDate ? new Date(exportEndDate) : null;
    if (start && camDate < start) return false;
    if (end && camDate > end) return false;
    return true;
  });

  const handleDownload = (format) => {
    if (!filteredCameras.length) return;
    const data = filteredCameras.map(cam => ({
      ID: cam.id,
      Name: cam.name,
      GPS: cam.gps,
      Weapon: cam.detection.weapon ? "✔" : "✖",
      Scuffle: cam.detection.scuffle ? "✔" : "✖",
      Stampede: cam.detection.stampede ? "✔" : "✖",
    }));

    if (format === "csv" || format === "excel") {
      const headers = Object.keys(data[0]).join(",");
      const rows = data.map(cam => Object.values(cam).join(",")).join("\n");
      const csvContent = `${headers}\n${rows}`;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `cameras.${format === "excel" ? "xlsx" : "csv"}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    if (format === "pdf") {
      const doc = new jsPDF();
      let y = 10;
      data.forEach(cam => {
        doc.text(
          `ID: ${cam.ID}, Name: ${cam.Name}, GPS: ${cam.GPS}, Weapon: ${cam.Weapon}, Scuffle: ${cam.Scuffle}, Stampede: ${cam.Stampede}`,
          10,
          y
        );
        y += 10;
      });
      doc.save("cameras.pdf");
    }
  };

  if (loading)
    return <div className="flex justify-center items-center h-screen text-gray-500">Loading cameras...</div>;

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
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2"
            >
              Add Camera
            </button>
          </div>

          <div className="bg-white text-gray-800 shadow-md rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-center gap-2">
            <input type="date" className="border rounded px-2 py-1" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} />
            <input type="date" className="border rounded px-2 py-1" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} />
            <select className="border rounded px-2 py-1" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
            <button className="bg-green-500 text-white px-3 py-1 rounded" onClick={() => handleDownload(exportFormat)}>Download</button>
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
                      <span>Weapon: <b className={cam.detection.weapon ? "text-green-600" : "text-red-500"}>{cam.detection.weapon ? "✔" : "✖"}</b></span><br />
                      <span>Scuffle: <b className={cam.detection.scuffle ? "text-green-600" : "text-red-500"}>{cam.detection.scuffle ? "✔" : "✖"}</b></span><br />
                      <span>Stampede: <b className={cam.detection.stampede ? "text-green-600" : "text-red-500"}>{cam.detection.stampede ? "✔" : "✖"}</b></span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => setEditingCamera(cam)}
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

      {showAddModal && (
        <AddCameraModal onAdd={handleAddCamera} onClose={() => setShowAddModal(false)} />
      )}

      {editingCamera && (
        <EditCameraModal camera={editingCamera} onSave={handleSaveCamera} onClose={() => setEditingCamera(null)} />
      )}
    </div>
  );
}

// Summary Card Component
const SummaryCard = ({ title, value, color }) => (
  <div className={`bg-white rounded-xl shadow-md p-4 flex items-center gap-3 border-l-4 border-${color}-500`}>
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);
