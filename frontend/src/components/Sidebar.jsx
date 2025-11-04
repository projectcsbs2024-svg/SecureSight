import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Monitor, BarChart3, Bell, Shield, Settings } from "lucide-react";

export const Sidebar = ({ isExpanded: propExpanded, setIsExpanded: propSetExpanded }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = propExpanded ?? internalExpanded;
  const setIsExpanded = propSetExpanded ?? setInternalExpanded;

  const [activePath, setActivePath] = useState("/live-view");

  useEffect(() => {
    // Automatically set "Live View" as active right after login
    // or when location changes
    if (location.pathname === "/" || location.pathname === "/live-view") {
      setActivePath("/live-view");
    } else {
      setActivePath(location.pathname);
    }
  }, [location.pathname]);

  const menuItems = [
    { id: "live-view", label: "Live View", icon: <Monitor size={20} />, path: "/live-view" },
    { id: "analytics", label: "Analytics", icon: <BarChart3 size={20} />, path: "/analytics" },
    { id: "alerts", label: "Alerts", icon: <Bell size={20} />, path: "/alerts" },
    { id: "security", label: "Security", icon: <Shield size={20} />, path: "/security" },
    { id: "settings", label: "Settings", icon: <Settings size={20} />, path: "/settings" },
  ];

  return (
    <div
      className="bg-gray-800 text-white shadow-left-lg z-40 flex flex-col fixed top-16 left-0 bottom-0 transition-all duration-300 overflow-hidden"
      style={{ width: isExpanded ? 160 : 50 }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {menuItems.map((item) => {
        const isActive = activePath === item.path;

        return (
          <button
            key={item.id}
            onClick={() => {
              navigate(item.path);
              setActivePath(item.path);
            }}
            className={`relative flex items-center gap-2 px-3 py-2 m-1 rounded-md text-sm font-medium transition-all duration-300
              ${isActive ? "bg-green-600 text-white font-bold" : "hover:bg-gray-700 text-gray-300"}`}
          >
            <div className={`flex items-center justify-center ${isActive ? "text-white" : "text-gray-300"}`}>
              {item.icon}
            </div>
            <span
              className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                isExpanded ? "max-w-full opacity-100 ml-2" : "max-w-0 opacity-0 ml-0"
              }`}
            >
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 left-1/4 w-1/2 h-1 bg-green-400 rounded-full md:hidden transition-all duration-300"></span>
            )}
          </button>
        );
      })}
    </div>
  );
};
