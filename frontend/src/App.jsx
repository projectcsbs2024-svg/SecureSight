// src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Navbar } from "./components/Navbar";
import LiveView from "./pages/LiveView";
import Analytics from "./pages/Analytics";
import Security from "./pages/Security";
import Settings from "./pages/Settings";
import Alerts from "./pages/Alerts";
import Login from "./components/Login";
import Signup from "./components/Signup";
import ForgotPassword from "./components/ForgotPassword";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

// PrivateRoute component
function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

// PublicRoute component
function PublicRoute({ children }) {
  const { user } = useAuth();
  return !user ? children : <Navigate to="/" replace />;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in
  const [sidebarExpanded, setSidebarExpanded] = useState(false); // Sidebar state
  const navbarHeight = 64; // px

  // Track auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });
    return () => unsubscribe();
  }, []);

  // Loading screen
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        Checking authentication...
      </div>
    );
  }

  const sidebarWidth = sidebarExpanded ? 160 : 60;

  return (
    <AuthProvider>
      {user ? (
        // Logged in → main dashboard layout
        <div className="flex min-h-screen bg-gray-900 text-white">
          {/* Sidebar */}
          <Sidebar
            activePage={window.location.pathname}
            isExpanded={sidebarExpanded}
            setIsExpanded={setSidebarExpanded}
          />

          {/* Main content */}
          <div className="flex-1 flex flex-col transition-all duration-300">
            {/* Navbar */}
            <Navbar
              onLogout={async () => {
                try {
                  await signOut(auth);
                } catch (err) {
                  console.error("Logout failed:", err);
                }
              }}
              userEmail={user?.email || ""}
            />

            {/* Page content */}
            <main className="flex-1 overflow-y-auto transition-all duration-300">
              <Routes>
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <LiveView sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/live-view"
                  element={
                    <PrivateRoute>
                      <LiveView sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <PrivateRoute>
                      <Analytics sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/alerts"
                  element={
                    <PrivateRoute>
                      <Alerts sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />

                <Route
                  path="/security"
                  element={
                    <PrivateRoute>
                      <Security sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />

                 <Route
                  path="/settings"
                  element={
                    <PrivateRoute>
                      <Settings sidebarWidth={sidebarWidth} navbarHeight={navbarHeight} />
                    </PrivateRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      ) : (
        // Not logged in → show login/signup/forgot-password pages
        <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4">
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      )}
    </AuthProvider>
  );
}
