// src/pages/Security.jsx
import React, { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { FileText, Edit2 } from "lucide-react";
import { AddCameraModal } from "../components/AddCameraModal";
import { EditCameraModal } from "../components/EditCameraModal";
import { jsPDF } from "jspdf";

export default function Security({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null); // state for EditCameraModal
  const [exportFormat, setExportFormat] = useState("csv");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  // Cameras state
  const [cameras, setCameras] = useState([
    { id: 1, name: "Entrance Cam", gps: "28.6139° N, 77.2090° E", detection: { weapon: true, scuffle: true, stampede: false }, createdAt: "2025-10-01" },
    { id: 2, name: "Lobby Cam", gps: "28.6140° N, 77.2085° E", detection: { weapon: true, scuffle: true, stampede: false }, createdAt: "2025-10-05" },
    { id: 3, name: "Parking Lot Cam", gps: "28.6150° N, 77.2070° E", detection: { weapon: true, scuffle: true, stampede: false }, createdAt: "2025-10-07" },
    { id: 4, name: "Backyard Cam", gps: "28.6160° N, 77.2060° E", detection: { weapon: true, scuffle: true, stampede: false }, createdAt: "2025-10-08" },
  ]);

  const totalCameras = cameras.length;
  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  // Add Camera
  const handleAddCamera = (src) => {
    const newCamera = {
      id: cameras.length + 1,
      name: `New Camera`,
      gps: "Unknown",
      detection: { weapon: false, scuffle: false, stampede: false },
      src,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setCameras([...cameras, newCamera]);
  };

  // Edit Camera
  const handleSaveCamera = (updatedCamera) => {
    setCameras(cameras.map(cam => cam.id === updatedCamera.id ? updatedCamera : cam));
    setEditingCamera(null);
  };

  // Filter cameras for export
  const filteredCameras = cameras.filter((cam) => {
    if (!exportStartDate && !exportEndDate) return true;
    const camDate = new Date(cam.createdAt);
    const start = exportStartDate ? new Date(exportStartDate) : null;
    const end = exportEndDate ? new Date(exportEndDate) : null;
    if (start && camDate < start) return false;
    if (end && camDate > end) return false;
    return true;
  });

  // Download function
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
        doc.text(`ID: ${cam.ID}, Name: ${cam.Name}, GPS: ${cam.GPS}, Weapon: ${cam.Weapon}, Scuffle: ${cam.Scuffle}, Stampede: ${cam.Stampede}`, 10, y);
        y += 10;
      });
      doc.save("cameras.pdf");
    }
  };

  if (!user) return <div className="flex justify-center items-center h-screen text-gray-500">Loading...</div>;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        setActivePage={() => {}}
        activePage="security"
        isExpanded={sidebarExpanded}
        setIsExpanded={setSidebarExpanded}
      />

      {/* Main Content */}
      <div
        className="flex-1 flex flex-col transition-all duration-300"
        style={{ marginLeft: sidebarCurrentWidth, height: "100vh" }}
      >
        {/* Navbar */}
        <div className="fixed top-0 left-0 right-0 z-20">
          <Navbar userEmail={user?.email} />
        </div>

        {/* Page Content */}
        <div className="flex-1 flex flex-col p-6 overflow-auto" style={{ marginTop: `${navbarHeight}px` }}>
          {/* Total Cameras + Add Camera */}
          <div className="flex justify-between items-center mb-6">
            <SummaryCard title="Total Cameras" value={totalCameras} color="green" />
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded flex items-center gap-2"
            >
              Add Camera
            </button>
          </div>

          {/* Export / Reports */}
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

          {/* Camera Table */}
          <div className="bg-white rounded-xl shadow-md overflow-auto max-h-[500px]">
            <table className="min-w-full text-sm text-gray-700">
              <thead className="bg-gray-100 sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Camera Name</th>
                  <th className="px-4 py-3 text-left font-semibold">GPS Coordinates</th>
                  <th className="px-4 py-3 text-left font-semibold">Detection</th>
                  <th className="px-4 py-3 text-left font-semibold">Edit</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((cam) => (
                  <tr key={cam.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-900">{cam.name}</td>
                    <td className="px-4 py-3 text-gray-900">{cam.gps}</td>
                    <td className="px-4 py-3 text-gray-900 flex flex-col gap-1">
                      <td className="px-4 py-3 text-gray-900 flex flex-col gap-1">
                        <span>
                            Weapon:{" "}
                            <span className={cam.detection.weapon ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                            {cam.detection.weapon ? "✔" : "✖"}
                            </span>
                        </span>
                        <span>
                            Scuffle:{" "}
                            <span className={cam.detection.scuffle ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                            {cam.detection.scuffle ? "✔" : "✖"}
                            </span>
                        </span>
                        <span>
                            Stampede:{" "}
                            <span className={cam.detection.stampede ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                            {cam.detection.stampede ? "✔" : "✖"}
                            </span>
                        </span>
                        </td>

                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingCamera(cam)}
                        className="bg-blue-500 text-white px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Camera Modal */}
      {showAddModal && (
        <AddCameraModal
          onAdd={handleAddCamera}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Camera Modal */}
      {editingCamera && (
        <EditCameraModal
          camera={editingCamera}
          onSave={handleSaveCamera}
          onClose={() => setEditingCamera(null)}
        />
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
