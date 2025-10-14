import React from "react";

export const AlertCard = ({
  totalAlerts,
  activeCameras,
  currentAlerts,
  onAddCameraClick,
  collapsed,
  toggleCollapse,
}) => {
  return (
    <div
      className={`fixed top-16 right-0 h-full flex flex-col gap-4 bg-gray-800 p-4 shadow-lg transition-all duration-300 overflow-hidden z-50`}
      style={{ width: collapsed ? "60px" : "150px" }}
    >
      {/* Toggle Button */}
      <button
        onClick={toggleCollapse}
        className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded self-end transition-all"
      >
        {collapsed ? "»" : "«"}
      </button>

      {/* Content - only show when expanded */}
      {!collapsed && (
        <>
          {/* Add Camera Button */}
          <button
            onClick={onAddCameraClick}
            className="mb-2 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold shadow-lg border-2 border-gray-600 transition-all"
          >
            + Add Camera
          </button>

          {/* Total Alerts */}
          <div className="bg-gray-900 w-full h-24 flex flex-col justify-center items-center rounded-xl shadow-lg border-2 border-gray-600 transition-all">
            <span className="text-red-400 text-3xl font-bold">{totalAlerts}</span>
            <span className="px-3 mt-1 text-white text-sm font-semibold">
              Total Alerts Today
            </span>
          </div>

          {/* Active Cameras */}
          <div className="bg-gray-900 w-full h-24 flex flex-col justify-center items-center rounded-xl shadow-lg border-2 border-gray-600 transition-all">
            <span className="text-green-400 text-3xl font-bold">{activeCameras}</span>
            <span className="px-3 mt-1 text-white text-sm font-semibold">
              Active Cameras
            </span>
          </div>

          {/* Current Alerts */}
          <div className="bg-gray-900 w-full h-24 flex flex-col justify-center items-center rounded-xl shadow-lg border-2 border-gray-600 transition-all">
            <span className="text-yellow-400 text-3xl font-bold">{currentAlerts}</span>
            <span className="px-3 mt-1 text-white text-sm font-semibold">
              Current Alerts
            </span>
          </div>
        </>
      )}
    </div>
  );
};
