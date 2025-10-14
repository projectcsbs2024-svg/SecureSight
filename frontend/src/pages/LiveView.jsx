import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CameraFeed } from "../components/CameraFeed";
import { AddCameraModal } from "../components/AddCameraModal";
import { AlertCard } from "../components/AlertCard";
import { useAuth } from "../context/AuthContext";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";

export default function LiveView() {
  const [cameras, setCameras] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [alertCollapsed, setAlertCollapsed] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    const saved = localStorage.getItem("cameras");
    if (saved) setCameras(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("cameras", JSON.stringify(cameras));
  }, [cameras]);

  const handleAddCamera = (fileUrl) => {
    const newCam = {
      id: Date.now(),
      src: fileUrl,
      name: `Camera ${cameras.length + 1}`,
      status: Math.random() > 0.2 ? "online" : "offline",
    };
    setCameras((prev) => [...prev, newCam]);
  };

  const handleDeleteCamera = (id) => {
    if (window.confirm("Are you sure you want to delete this camera?")) {
      setCameras((prev) => prev.filter((cam) => cam.id !== id));
    }
  };

  const totalAlerts = 12;
  const activeCameras = cameras.filter((c) => c.status === "online").length;
  const currentAlerts = 3;

  // Sidebar and alert widths
  const sidebarWidth = sidebarExpanded ? 160 : 60;
  const alertWidth = alertCollapsed ? 64 : 288;
  const navbarHeight = 64; // px

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
        {/* Navbar */}
        <Navbar userEmail={user?.email} />

        {/* Camera grid */}
        <div
          className="flex-1 overflow-auto p-4 transition-all duration-300 z-0"
          style={{
            marginLeft: sidebarWidth,
            paddingTop: navbarHeight+10,
            marginRight: alertCollapsed ? 64 : 288, // just a margin to prevent overlap
          }}
        >
          <div
            className="grid gap-6 justify-center"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            {cameras.length === 0 ? (
              <div className="col-span-full flex justify-center text-gray-400 italic">
                No cameras added yet
              </div>
            ) : (
              cameras.map((cam) => (
                <CameraFeed
                  key={cam.id}
                  src={cam.src}
                  name={cam.name}
                  status={cam.status}
                  onDelete={() => handleDeleteCamera(cam.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fixed Right Panel: AlertCard */}
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
