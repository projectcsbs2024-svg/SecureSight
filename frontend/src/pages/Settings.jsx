// src/pages/Settings.jsx
import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { Trash2 } from "lucide-react";
import api from "../apiHandle/api";

const THRESHOLD_LABELS = {
  weapon: "Weapon",
  scuffle: "Scuffle",
  stampede: "Stampede",
};

export default function Settings({ sidebarWidth = 60, navbarHeight = 64 }) {
  const { user } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [alertEmails, setAlertEmails] = useState([]);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [thresholds, setThresholds] = useState({
    weapon: 50,
    scuffle: 50,
    stampede: 50,
  });
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  // Load user settings from backend
  useEffect(() => {
    const loadUserSettings = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const token = await user.getIdToken();
        const res = await api.get("/settings/", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data;
        setAlertEmails(data.alert_emails || []);
        setEmailAlertsEnabled(data.email_alerts_enabled ?? true);
        setThresholds({
          weapon: Math.round((data.weapon_threshold || 0.8) * 100),
          scuffle: Math.round((data.scuffle_threshold || 0.45) * 100),
          stampede: Math.round((data.stampede_threshold || 0.75) * 100),
        });
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setLoading(false);
      }
    };
    loadUserSettings();
  }, [user]);

  // Update alert emails
  const addAlertEmail = () => setAlertEmails([...alertEmails, ""]);
  const updateAlertEmail = (i, val) => {
    const updated = [...alertEmails];
    updated[i] = val;
    setAlertEmails(updated);
  };
  const deleteAlertEmail = (i) =>
    setAlertEmails(alertEmails.filter((_, idx) => idx !== i));

  // Update detection thresholds
  const updateThreshold = (type, val) => {
    setThresholds({ ...thresholds, [type]: parseInt(val) });
  };

  // Save settings to backend
  const handleSaveSettings = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const cleanedEmails = alertEmails.map((email) => email.trim()).filter(Boolean);
      setAlertEmails(cleanedEmails);
      await api.post(
        "/settings/",
        {
          alert_emails: cleanedEmails,
          email_alerts_enabled: emailAlertsEnabled,
          weapon_threshold: thresholds.weapon / 100,
          scuffle_threshold: thresholds.scuffle / 100,
          stampede_threshold: thresholds.stampede / 100,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Failed to save settings.");
    }
  };

  const handleSendTestEmail = async () => {
    if (!user) return;
    try {
      setSendingTest(true);
      const token = await user.getIdToken();
      const res = await api.post(
        "/settings/test_email",
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(res.data.message || "Test email sent.");
    } catch (err) {
      console.error("Error sending test email:", err);
      alert(
        err?.response?.data?.detail || "Failed to send test email. Check backend SMTP settings."
      );
    } finally {
      setSendingTest(false);
    }
  };

  if (!user || loading) {
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        Loading user settings...
      </div>
    );
  }

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

          {/* Alert Email Settings */}
          <div className="bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              Alert Recipients
            </h2>
            <div className="flex items-center justify-between gap-4 mb-4 rounded-lg border border-gray-700 bg-gray-850/40 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-white">Email Alerts</div>
                <p className="text-xs text-gray-400 mt-1">
                  Turn email notifications on or off without removing saved recipient addresses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEmailAlertsEnabled((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  emailAlertsEnabled ? "bg-green-600" : "bg-gray-600"
                }`}
                aria-pressed={emailAlertsEnabled}
                aria-label="Toggle email alerts"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    emailAlertsEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {alertEmails.map((email, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateAlertEmail(index, e.target.value)}
                  className="border rounded px-2 py-1 flex-1 bg-gray-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="Enter email address"
                  disabled={!emailAlertsEnabled}
                />
                <button
                  onClick={() => deleteAlertEmail(index)}
                  className="p-1 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!emailAlertsEnabled}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button
              onClick={addAlertEmail}
              disabled={!emailAlertsEnabled}
              className="bg-blue-600 text-white px-3 py-1 rounded mt-2 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              Add Email
            </button>
            <p className="text-xs text-gray-400 mt-3">
              {emailAlertsEnabled
                ? "Alert emails are used for live detection notifications. SMTP must be configured on the backend."
                : "Email alerts are disabled. Saved recipient addresses will be kept until you turn alerts back on."}
            </p>
          </div>

          {/* Detection Sensitivity */}
          <div className="bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-white">
              Detection Model Sensitivity
            </h2>
            {["weapon", "scuffle", "stampede"].map((type) => (
              <div key={type} className="flex items-center gap-4 mb-4">
                <label className="w-40 capitalize text-gray-300">
                  {(THRESHOLD_LABELS[type] || type)} threshold
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={thresholds[type]}
                  onChange={(e) => updateThreshold(type, e.target.value)}
                  className="flex-1"
                />
                <span className="text-gray-400 w-12 text-right">
                  {thresholds[type]}%
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={handleSendTestEmail}
              disabled={sendingTest || !emailAlertsEnabled}
              className={`px-4 py-2 rounded ${
                sendingTest || !emailAlertsEnabled
                  ? "bg-gray-600 cursor-not-allowed text-gray-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {sendingTest ? "Sending Test..." : "Send Test Email"}
            </button>
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
