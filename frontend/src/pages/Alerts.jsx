// src/pages/Alerts.jsx
import React, { useState, useEffect } from "react";
import { Navbar } from "../components/Navbar";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, CheckCircle, Eye, Search, Filter, X, Loader2 } from "lucide-react";
import api from "../apiHandle/api"; // ✅ Import your API instance

export default function Alerts({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // ✅ Fetch alerts from backend
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        const res = await api.get("/detections/");
        // Expecting an array like:
        // [{ id, camera_id, confidence, status, action, time, image_url }]
        const formatted = res.data.map((d) => ({
          id: d.id,
          camera: d.camera_name || d.camera_id,
          type: d.action || "Detection",
          confidence: d.confidence || 0,
          time: new Date(d.time).toLocaleString(),
          status: d.status === "active" ? "Active" : "Resolved",
          image: d.image_url
            ? `${import.meta.env.VITE_API_URL}/${d.image_url}`
            : "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
        }));
        setAlerts(formatted);
      } catch (err) {
        console.error("Error fetching alerts:", err);
        setError("Failed to load alerts. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchAlerts();
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.camera.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || alert.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.status === "Active").length;
  const resolvedAlerts = alerts.filter((a) => a.status === "Resolved").length;

  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        setActivePage={() => {}}
        activePage="alerts"
        isExpanded={sidebarExpanded}
        setIsExpanded={setSidebarExpanded}
      />

      {/* Main Content */}
      <div
        className="flex-1 flex flex-col"
        style={{
          marginLeft: sidebarCurrentWidth,
          height: `calc(100vh - ${navbarHeight}px)`,
        }}
      >
        {/* Navbar */}
        <Navbar userEmail={user?.email} />

        {/* Fixed Top Section: Summary + Filter */}
        <div className="flex-shrink-0 p-6 mt-13 flex flex-col gap-4 bg-gray-50">
          <div className="grid text-gray-800 grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <SummaryCard title="Total Alerts" value={totalAlerts} color="green" icon={<Bell className="text-green-600" size={24} />} />
            <SummaryCard title="Active Alerts" value={activeAlerts} color="red" icon={<AlertTriangle className="text-red-600" size={24} />} />
            <SummaryCard title="Resolved Alerts" value={resolvedAlerts} color="blue" icon={<CheckCircle className="text-blue-600" size={24} />} />
          </div>

          {/* Filter */}
          <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-1/2">
              <Search className="text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Search by camera or alert type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border text-gray-900 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="text-gray-500" size={18} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border text-gray-900 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="flex-1 p-6 bg-gray-50">
          <div className="bg-white rounded-xl shadow-md overflow-auto max-h-[360px]">
            {loading ? (
              <div className="flex justify-center items-center h-48 text-gray-500">
                <Loader2 className="animate-spin mr-2" size={20} />
                Loading alerts...
              </div>
            ) : error ? (
              <div className="text-center text-red-600 py-6">{error}</div>
            ) : (
              <table className="min-w-full text-sm text-gray-700">
                <thead className="bg-gray-100 sticky top-0 z-20">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Camera</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                    <th className="px-4 py-3 text-left font-semibold">Time</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.length > 0 ? (
                    filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b hover:bg-gray-50 transition">
                        <td className="px-4 py-3">{alert.camera}</td>
                        <td className="px-4 py-3">{alert.type}</td>
                        <td className="px-4 py-3">{alert.confidence}%</td>
                        <td className="px-4 py-3">{alert.time}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              alert.status === "Active"
                                ? "bg-red-100 text-red-600"
                                : "bg-blue-100 text-blue-600"
                            }`}
                          >
                            {alert.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedAlert(alert)}
                            className="text-green-600 hover:text-green-800 transition"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center text-gray-400 py-6 italic">
                        No alerts match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Alert Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-transparent bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative">
            <button
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              onClick={() => setSelectedAlert(null)}
            >
              <X size={20} />
            </button>
            <img
              src={selectedAlert.image}
              alt="Alert Snapshot"
              className="w-full h-56 object-cover rounded-t-xl"
            />
            <div className="p-5">
              <h2 className="text-xl font-bold mb-2 text-gray-800">{selectedAlert.type}</h2>
              <p className="text-sm text-gray-600 mb-4">
                Detected on <strong>{selectedAlert.camera}</strong> at {selectedAlert.time}
              </p>
              <div className="space-y-2">
                <p>
                  <strong className="text-gray-800">Confidence:</strong>{" "}
                  <span className="text-green-600">{selectedAlert.confidence}%</span>
                </p>
                <p>
                  <strong className="text-gray-800">Status:</strong>{" "}
                  <span
                    className={
                      selectedAlert.status === "Active" ? "text-red-600" : "text-blue-600"
                    }
                  >
                    {selectedAlert.status}
                  </span>
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Summary Card Component
const SummaryCard = ({ title, value, color, icon }) => (
  <div className={`bg-white rounded-xl shadow-md p-4 flex items-center gap-3 border-l-4 border-${color}-500`}>
    {icon}
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  </div>
);
