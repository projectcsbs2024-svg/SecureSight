import { useState, useEffect, useRef } from "react";
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
  const [stats, setStats] = useState({ total_today: 0, current_alerts: 0 });
  const { user } = useAuth();
  const navigate = useNavigate();

  // 🧭 Redirect if not logged in
  useEffect(() => {
    if (!user) navigate("/");
  }, [user, navigate]);

  // 🎥 Fetch cameras when user is available
  useEffect(() => {
    if (!user) return;

    const fetchCameras = async () => {
      setLoading(true);
      try {
        const res = await api.get("/cameras/");
        const data = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.cameras)
          ? res.data.cameras
          : [];
        setCameras(data);
      } catch (err) {
        console.error("Failed to fetch cameras:", err);
        setCameras([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCameras();
  }, [user]);

  // 📊 Fetch detection stats & current alert count
  useEffect(() => {
    if (!user) return; // 👈 wait for Firebase user
    const fetchStats = async () => {
      try {
        const [todayRes, currentRes] = await Promise.all([
          api.get("/detections/stats"),
          api.get("/cameras/active_count"),
        ]);
        setStats({
          total_today: todayRes.data.total_today,
          current_alerts: currentRes.data.current_alerts,
        });
      } catch (err) {
        console.error("Error fetching alert stats:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // ➕ Add new camera
  const handleAddCamera = (newCameraFromBackend) => {
    setCameras((prev) => [...prev, newCameraFromBackend]);
  };

  // ❌ Delete camera
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

  // 🔔 Global Alert Tone Handler
  const lastAlertRef = useRef(0);
  const playAlertTone = () => {
    const now = Date.now();
    // Prevent spamming — play once every 1s max
    if (now - lastAlertRef.current < 1000) return;
    lastAlertRef.current = now;

    const audio = new Audio("/alert.mp3");
    audio.volume = 0.8;
    audio.play().catch(() => {
      console.warn("⚠️ Alert tone blocked by autoplay policy");
    });
  };

  const activeCameras = cameras.length;
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
                  cameraId={cam.id}
                  src={cam.stream_url || ""}
                  name={cam.name}
                  status={cam.status || "online"}
                  onDelete={() => handleDeleteCamera(cam.id)}
                  // 🔔 Hook into detection events for global alert
                  onNewDetection={playAlertTone}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Alert Panel */}
      <AlertCard
        totalAlerts={stats.total_today}
        activeCameras={activeCameras}
        currentAlerts={stats.current_alerts}
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
