import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CameraFeed } from "../components/CameraFeed";
import { AddCameraModal } from "../components/AddCameraModal";
import { AlertCard } from "../components/AlertCard";
import { useAuth } from "../context/AuthContext";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import api from "../apiHandle/api.jsx";

export default function LiveView() {
  const [cameras, setCameras] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [alertCollapsed, setAlertCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect if not logged in
  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  // Fetch cameras from backend whenever user is available
 useEffect(() => {
  if (!user) return;

  const fetchCameras = async () => {
    setLoading(true);
    try {
      const res = await api.get("/cameras/");
      // ✅ Ensure array
      const data = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.cameras)
        ? res.data.cameras
        : [];
      setCameras(data);
    } catch (err) {
      console.error("Failed to fetch cameras:", err);
      setCameras([]); // avoid undefined
    } finally {
      setLoading(false);
    }
  };

  fetchCameras();
}, [user]);


  // Add new camera (update state immediately)
  const handleAddCamera = (newCameraFromBackend) => {
    setCameras((prev) => [...prev, newCameraFromBackend]);
  };

  // Delete camera
  const handleDeleteCamera = async (id) => {
    if (!window.confirm("Are you sure you want to delete this camera?")) return;
    try {
      await api.delete(`/cameras/${id}`);
      setCameras((prev) => prev.filter((cam) => cam.id !== id));
    } catch (err) {
      console.error("Failed to delete camera:", err);
      alert("Error deleting camera");
    }
  };

  const totalAlerts = 12;
  const activeCameras = cameras.length;
  const currentAlerts = 3;

  const sidebarWidth = sidebarExpanded ? 160 : 60;
  const alertWidth = alertCollapsed ? 64 : 288;
  const navbarHeight = 64;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        setActivePage={() => {}}
        activePage="live-view"
        isExpanded={sidebarExpanded}
        setIsExpanded={setSidebarExpanded}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <Navbar userEmail={user?.email} />
        <div
          className="flex-1 overflow-auto p-4 transition-all duration-300 z-0"
          style={{
            marginLeft: sidebarWidth,
            paddingTop: navbarHeight + 10,
            marginRight: alertWidth,
          }}
        >
          <div
            className="grid gap-6 justify-center"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            {loading ? (
              <div className="col-span-full flex justify-center text-gray-400 italic">
                Loading cameras...
              </div>
            ) : cameras.length === 0 ? (
              <div className="col-span-full flex justify-center text-gray-400 italic">
                No cameras added yet
              </div>
            ) : (
              cameras.map((cam) => (
                <CameraFeed
                  key={cam.id}
                  src={cam.stream_url || ""}
                  name={cam.name}
                  status={cam.status || "online"}
                  cameraId={cam.id}
                  onDelete={() => handleDeleteCamera(cam.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Alert Panel */}
      <AlertCard
        totalAlerts={totalAlerts}
        activeCameras={activeCameras}
        currentAlerts={currentAlerts}
        onAddCameraClick={() => setShowModal(true)}
        collapsed={alertCollapsed}
        toggleCollapse={() => setAlertCollapsed(!alertCollapsed)}
      />

      {/* Add Camera Modal */}
      {showModal && (
        <AddCameraModal
          onAdd={handleAddCamera}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
