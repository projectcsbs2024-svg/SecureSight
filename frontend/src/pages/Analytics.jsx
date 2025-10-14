// src/pages/Analytics.jsx
import React, { useState } from "react";
import { BarChart2, Activity, Monitor } from "lucide-react";

export default function Analytics({ sidebarWidth = 60, navbarHeight = 64 }) {
  const [summaryData] = useState([
    { title: "Total Cameras", value: 12, color: "green", icon: <Monitor className="text-green-500" size={24} /> },
    { title: "Active Alerts", value: 5, color: "red", icon: <Activity className="text-red-500" size={24} /> },
    { title: "Resolved Alerts", value: 7, color: "blue", icon: <BarChart2 className="text-blue-500" size={24} /> },
  ]);

  const [chartData] = useState([
    { id: 1, title: "Camera Activity", description: "Shows camera activity over time" },
    { id: 2, title: "Alert Distribution", description: "Pie chart of active vs resolved alerts" },
    { id: 3, title: "Crowd Density", description: "Heatmap or graph of crowd density" },
  ]);

  return (
    <div
      className="flex-1 overflow-auto bg-gray-800 text-white transition-all duration-300"
      style={{
        marginLeft: sidebarWidth-10,
        paddingTop: navbarHeight+10,
        paddingRight: 24,
        paddingLeft: 24,
      }}
    >
      {/* Page Header */}
      <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        {summaryData.map((item, idx) => (
          <div key={idx} className={`bg-gray-700 rounded-xl p-4 flex items-center gap-3 shadow-md border-l-4 border-${item.color}-500`}>
            {item.icon}
            <div>
              <p className="text-sm text-gray-300">{item.title}</p>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts/Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {chartData.map((chart) => (
          <div key={chart.id} className="bg-gray-700 rounded-xl p-4 shadow-md flex flex-col justify-between">
            <h2 className="font-semibold text-lg text-white">{chart.title}</h2>
            <p className="text-gray-300 text-sm mt-2">{chart.description}</p>

            {/* Placeholder for charts */}
            <div className="mt-4 h-32 bg-gray-600 rounded-lg flex items-center justify-center text-gray-400 text-sm">
              Chart placeholder
            </div>
          </div>
        ))}
      </div>

      {/* Optional Detailed Analytics */}
      <div className="mt-6 bg-gray-700 p-4 rounded-xl shadow-md">
        <h2 className="text-xl font-semibold mb-2">Detailed Insights</h2>
        <p className="text-gray-300 text-sm">
          Here you can add more detailed graphs, tables, or heatmaps for analytics.
        </p>
      </div>
    </div>
  );
}
