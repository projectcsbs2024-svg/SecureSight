// src/pages/Analytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart2, Monitor } from "lucide-react";
import api from "../apiHandle/api";

export default function Analytics({ sidebarWidth = 60, navbarHeight = 64 }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadAnalytics = async () => {
      try {
        const res = await api.get("/detections/analytics/summary");
        if (!isMounted) return;
        setAnalytics(res.data);
        setError("");
      } catch (err) {
        console.error("Failed to load analytics", err);
        if (isMounted) setError("Failed to load analytics data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAnalytics();
    const interval = setInterval(loadAnalytics, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const summaryData = useMemo(() => {
    const summary = analytics?.summary || {};
    return [
      {
        title: "Total Cameras",
        value: summary.total_cameras ?? 0,
        borderClass: "border-green-500",
        icon: <Monitor className="text-green-500" size={24} />,
      },
      {
        title: "Active Alerts",
        value: summary.active_alerts ?? 0,
        borderClass: "border-red-500",
        icon: <AlertTriangle className="text-red-500" size={24} />,
      },
      {
        title: "Resolved Alerts",
        value: summary.resolved_alerts ?? 0,
        borderClass: "border-blue-500",
        icon: <BarChart2 className="text-blue-500" size={24} />,
      },
      {
        title: "Total Alerts",
        value: summary.total_alerts ?? 0,
        borderClass: "border-amber-500",
        icon: <Activity className="text-amber-400" size={24} />,
      },
    ];
  }, [analytics]);

  const trendMax = Math.max(
    ...(analytics?.daily_trend || []).map((item) => item.count),
    1
  );
  const distributionMax = Math.max(
    ...(analytics?.type_distribution || []).map((item) => item.value),
    1
  );
  const cameraMax = Math.max(
    ...(analytics?.camera_activity || []).map((item) => item.value),
    1
  );

  return (
    <div
      className="flex-1 overflow-auto bg-gray-800 text-white transition-all duration-300"
      style={{
        marginLeft: sidebarWidth - 10,
        paddingTop: navbarHeight + 10,
        paddingRight: 24,
        paddingLeft: 24,
      }}
    >
      <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>

      {loading ? (
        <div className="text-gray-300">Loading analytics...</div>
      ) : error ? (
        <div className="rounded-xl bg-red-950/40 border border-red-800 px-4 py-3 text-red-200">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
            {summaryData.map((item) => (
              <div
                key={item.title}
                className={`bg-gray-700 rounded-xl p-4 flex items-center gap-3 shadow-md border-l-4 ${item.borderClass}`}
              >
                {item.icon}
                <div>
                  <p className="text-sm text-gray-300">{item.title}</p>
                  <p className="text-lg font-semibold">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="bg-gray-700 rounded-xl p-5 shadow-md">
              <h2 className="font-semibold text-lg text-white">Alerts Over 7 Days</h2>
              <p className="text-gray-300 text-sm mt-1">
                Daily alert volume from live detection history.
              </p>
              <div className="mt-5 flex items-end gap-3 h-56">
                {(analytics?.daily_trend || []).map((item) => (
                  <div
                    key={item.date}
                    className="flex-1 flex flex-col items-center justify-end gap-2"
                  >
                    <div className="text-xs text-gray-400">{item.count}</div>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-green-500 to-emerald-300"
                      style={{
                        height: `${Math.max(
                          10,
                          (item.count / trendMax) * 160
                        )}px`,
                      }}
                    />
                    <div className="text-[11px] text-gray-400">
                      {new Date(item.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-gray-700 rounded-xl p-5 shadow-md">
              <h2 className="font-semibold text-lg text-white">Alert Distribution</h2>
              <p className="text-gray-300 text-sm mt-1">
                Breakdown by detection type.
              </p>
              <div className="mt-5 space-y-4">
                {(analytics?.type_distribution || []).length > 0 ? (
                  (analytics.type_distribution || []).map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{item.label}</span>
                        <span className="text-gray-300">{item.value}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-600 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300"
                          style={{
                            width: `${Math.max(
                              8,
                              (item.value / distributionMax) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400">No detection data yet.</div>
                )}
              </div>
            </section>

            <section className="bg-gray-700 rounded-xl p-5 shadow-md">
              <h2 className="font-semibold text-lg text-white">Most Active Cameras</h2>
              <p className="text-gray-300 text-sm mt-1">
                Cameras with the most recorded alerts.
              </p>
              <div className="mt-5 space-y-4">
                {(analytics?.camera_activity || []).length > 0 ? (
                  (analytics.camera_activity || []).map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate pr-3">{item.label}</span>
                        <span className="text-gray-300">{item.value}</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-600 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
                          style={{
                            width: `${Math.max(
                              8,
                              (item.value / cameraMax) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-400">
                    No camera activity recorded yet.
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-6 bg-gray-700 p-5 rounded-xl shadow-md">
            <h2 className="text-xl font-semibold mb-4">Recent Alerts</h2>
            {(analytics?.recent_alerts || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-gray-200">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-600">
                      <th className="py-2 pr-4">Camera</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Confidence</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics.recent_alerts || []).map((alert) => (
                      <tr key={alert.id} className="border-b border-gray-700/70">
                        <td className="py-3 pr-4">{alert.camera_name}</td>
                        <td className="py-3 pr-4">
                          {alert.type}
                          {alert.subtype ? ` (${alert.subtype})` : ""}
                        </td>
                        <td className="py-3 pr-4">
                          {alert.confidence != null
                            ? `${(alert.confidence * 100).toFixed(2)}%`
                            : "N/A"}
                        </td>
                        <td className="py-3 pr-4">{alert.status}</td>
                        <td className="py-3">
                          {alert.timestamp
                            ? new Date(`${alert.timestamp}Z`).toLocaleString()
                            : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No alerts have been recorded yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
