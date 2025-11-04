// src/pages/Alerts.jsx
import React, { useState, useEffect, useRef } from "react";
import { Navbar } from "../components/Navbar";
import { Sidebar } from "../components/Sidebar";
import DetectionPreview from "../components/DetectionPreview";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Eye,
  Search,
  Filter,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../apiHandle/api";

export default function Alerts({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [timeFilter, setTimeFilter] = useState("All");
  const [selectedAlert, setSelectedAlert] = useState(null);

  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // --------------------------------------------------
  // Fetch alerts and update state smoothly
  // --------------------------------------------------
  const fetchAlerts = async () => {
    try {
      const res = await api.get("/detections/");
      const formatted = res.data.map((d) => {
        const status =
          String(d.status || "active").toLowerCase() === "active"
            ? "Active"
            : "Resolved";
        return {
          id: d.id,
          camera: d.camera_name || d.camera_id || "Unknown Camera",
          type:
            d.type === "weapon"
              ? `Weapon-${d.subtype || "Unknown"}`
              : d.type === "scuffle"
              ? `Scuffle-${d.subtype || "Unknown"}`
              : d.type === "stampede"
              ? "Stampede"
              : d.type || "Detection",
          confidence: d.confidence ? (d.confidence * 100).toFixed(2) : "N/A",
          timestamp: d.timestamp,
          time: d.timestamp
            ? new Date(d.timestamp + "Z").toLocaleString()
            : "N/A",
          status,
          image: d.image_url
            ? `${import.meta.env.VITE_API_URL}${d.image_url}`
            : "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
        };
      });

      // Smooth update: only replace changed alerts
      setAlerts((prev) => {
        const prevMap = new Map(prev.map((a) => [a.id, a]));
        return formatted.map((a) => {
          const old = prevMap.get(a.id);
          if (!old) return a;
          const changed =
            old.status !== a.status ||
            old.type !== a.type ||
            old.confidence !== a.confidence ||
            old.image !== a.image ||
            old.time !== a.time;
          return changed ? a : old;
        });
      });

      setError(null);
    } catch (err) {
      console.error("Error fetching alerts:", err);
      setError("Failed to load alerts. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateAlertStatus = (id, status) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    if (selectedAlert?.id === id)
      setSelectedAlert({ ...selectedAlert, status });
  };

  // --------------------------------------------------
  // Filters
  // --------------------------------------------------
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfWeek);
  endOfLastWeek.setDate(startOfWeek.getDate() - 1);

  const filteredAlerts = alerts.filter((alert) => {
    const cameraName = alert.camera ? alert.camera.toLowerCase() : "";
    const alertType = alert.type ? alert.type.toLowerCase() : "";
    const matchesSearch =
      cameraName.includes(searchTerm.toLowerCase()) ||
      alertType.includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || alert.status === statusFilter;

    let matchesTime = true;
    if (alert.timestamp) {
      const alertDate = new Date(alert.timestamp);
      if (timeFilter === "Today") {
        matchesTime = alertDate.toDateString() === now.toDateString();
      } else if (timeFilter === "Yesterday") {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        matchesTime = alertDate.toDateString() === yesterday.toDateString();
      } else if (timeFilter === "ThisWeek") {
        matchesTime = alertDate >= startOfWeek;
      } else if (timeFilter === "LastWeek") {
        matchesTime = alertDate >= startOfLastWeek && alertDate <= endOfLastWeek;
      }
    }

    return matchesSearch && matchesStatus && matchesTime;
  });

  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.status === "Active").length;
  const resolvedAlerts = alerts.filter((a) => a.status === "Resolved").length;
  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        setActivePage={() => {}}
        activePage="alerts"
        isExpanded={sidebarExpanded}
        setIsExpanded={setSidebarExpanded}
      />
      <div
        className="flex-1 flex flex-col"
        style={{
          marginLeft: sidebarCurrentWidth,
          height: `calc(100vh - ${navbarHeight}px)`,
        }}
      >
        <Navbar userEmail={user?.email} />

        {/* Top Summary & Filter */}
        <div className="flex-shrink-0 pt-5 p-4 mt-13 flex flex-col gap-4 bg-gray-50">
          <div className="grid text-gray-800 grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <SummaryCard
              title="Total Alerts"
              value={totalAlerts}
              color="green"
              icon={<Bell className="text-green-600" size={24} />}
            />
            <SummaryCard
              title="Active Alerts"
              value={activeAlerts}
              color="red"
              icon={<AlertTriangle className="text-red-600" size={24} />}
            />
            <SummaryCard
              title="Resolved Alerts"
              value={resolvedAlerts}
              color="blue"
              icon={<CheckCircle className="text-blue-600" size={24} />}
            />
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

              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="border text-gray-900 border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="All">All Alerts</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="ThisWeek">This Week</option>
                <option value="LastWeek">Last Week</option>
              </select>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            {/* Left buttons */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const ids = filteredAlerts
                    .filter((a) => a.status === "Active")
                    .map((a) => a.id);
                  if (!ids.length) return;
                  try {
                    await api.patch("/detections/bulk_update/", { ids, status: "resolved" });
                    setAlerts((prev) =>
                      prev.map((a) =>
                        ids.includes(a.id) ? { ...a, status: "Resolved" } : a
                      )
                    );
                    if (selectedAlert && ids.includes(selectedAlert.id))
                      setSelectedAlert({ ...selectedAlert, status: "Resolved" });
                  } catch (err) {
                    console.error("Error marking alerts as resolved", err);
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-semibold"
              >
                Mark All as Resolved
              </button>

              <button
                onClick={async () => {
                  const ids = filteredAlerts.map((a) => a.id);
                  if (!ids.length) return;
                  try {
                    await api.delete("/detections/bulk_delete/", { data: { ids } });
                    setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
                    if (selectedAlert && ids.includes(selectedAlert.id))
                      setSelectedAlert(null);
                  } catch (err) {
                    console.error("Error deleting alerts", err);
                  }
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-semibold"
              >
                Delete All
              </button>
            </div>

            {/* Right button */}
            <button
              onClick={() => {
                if (!filteredAlerts.length) return;

                const headers = ["Camera", "Type", "Confidence", "Time", "Status"];
                const rows = filteredAlerts.map(a => [
                  a.camera,
                  a.type,
                  a.confidence,
                  a.time,
                  a.status
                ]);

                let csvContent =
                  "data:text/csv;charset=utf-8," +
                  [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

                const encodedUri = encodeURI(csvContent);

                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `detections_${user?.email || "user"}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-semibold"
            >
              Export Detection Data
            </button>
          </div>

        </div>

        {/* Alerts Table */}
        <div className="flex-1 pt-0 px-6 bg-gray-50">
          <div className="bg-white rounded-xl shadow-md overflow-auto max-h-[300px]">
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
                  <AnimatePresence>
                    {filteredAlerts.length > 0 ? (
                      filteredAlerts.map((alert) => (
                        <motion.tr
                          key={alert.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          layout
                          className="border-b hover:bg-gray-50 transition"
                        >
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
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="6"
                          className="text-center text-gray-400 py-6 italic"
                        >
                          No alerts match your filters
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Detection Preview Modal */}
            {/* Detection Preview Modal */}
      {selectedAlert && (
        <DetectionPreview
          alert={filteredAlerts.find((a) => a.id === selectedAlert.id)}
          onClose={() => setSelectedAlert(null)}
          updateAlertStatus={updateAlertStatus}
          onPrev={() => {
            const currentIndex = filteredAlerts.findIndex(
              (a) => a.id === selectedAlert.id
            );
            if (currentIndex > 0)
              setSelectedAlert(filteredAlerts[currentIndex - 1]);
          }}
          onNext={() => {
            const currentIndex = filteredAlerts.findIndex(
              (a) => a.id === selectedAlert.id
            );
            if (currentIndex < filteredAlerts.length - 1)
              setSelectedAlert(filteredAlerts[currentIndex + 1]);
          }}
        />
      )}

    </div>
  );
}

// Summary Card
const SummaryCard = ({ title, value, color, icon }) => (
  <div
    className={`bg-white rounded-xl shadow-md p-4 flex items-center gap-3 border-l-4 border-${color}-500`}
  >
    {icon}
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  </div>
);
