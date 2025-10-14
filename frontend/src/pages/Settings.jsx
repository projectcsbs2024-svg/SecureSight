// src/pages/Settings.jsx
import React, { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { Trash2 } from "lucide-react";

export default function Settings({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Alert recipients
  const [alertEmails, setAlertEmails] = useState([]);

  // Detection thresholds (0-100)
  const [thresholds, setThresholds] = useState({
    weapon: 50,
    scuffle: 50,
    stampede: 50,
  });

  // Add new email
  const addAlertEmail = () => {
    setAlertEmails([...alertEmails, ""]);
  };

  // Update email
  const updateAlertEmail = (index, value) => {
    const updated = [...alertEmails];
    updated[index] = value;
    setAlertEmails(updated);
  };

  // Delete email
  const deleteAlertEmail = (index) => {
    const updated = alertEmails.filter((_, i) => i !== index);
    setAlertEmails(updated);
  };

  // Update detection threshold
  const updateThreshold = (type, value) => {
    setThresholds({ ...thresholds, [type]: parseInt(value) });
  };

  // Save settings (placeholder)
  const handleSaveSettings = () => {
    console.log("Alert Emails:", alertEmails);
    console.log("Detection Thresholds:", thresholds);
    alert("Settings saved!");
  };

  if (!user)
    return <div className="flex justify-center items-center h-screen text-gray-400">Loading...</div>;

  const sidebarCurrentWidth = sidebarExpanded ? 160 : 60;

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-200">
      <Sidebar
        setActivePage={() => {}}
        activePage="settings"
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

        <div
          className="flex-1 flex flex-col p-6 overflow-auto"
          style={{ marginTop: `${navbarHeight}px` }}
        >
          <h1 className="text-2xl font-semibold mb-6 text-white">Settings</h1>

          {/* Alert Message Settings */}
          <div className="bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Alert Message Settings</h2>
            {alertEmails.map((email, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateAlertEmail(index, e.target.value)}
                  className="border rounded px-2 py-1 flex-1 bg-gray-700 text-white placeholder-gray-400"
                  placeholder="Enter email address"
                />
                <button onClick={() => deleteAlertEmail(index)} className="p-1 hover:text-red-500">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button
              onClick={addAlertEmail}
              className="bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-2 mt-2 hover:bg-blue-700"
            >
              Add Email
            </button>
          </div>

          {/* Detection Model Sensitivity */}
          <div className="bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-white">Detection Model Sensitivity</h2>
            {["weapon", "scuffle", "stampede"].map((type) => (
              <div key={type} className="flex items-center gap-4 mb-4">
                <label className="w-40 capitalize text-gray-300">{type} threshold</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={thresholds[type]}
                  onChange={(e) => updateThreshold(type, e.target.value)}
                  className="flex-1"
                />
                <span className="text-gray-400 w-12 text-right">{thresholds[type]}%</span>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
