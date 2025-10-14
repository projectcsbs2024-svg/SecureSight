import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export const Navbar = ({ userEmail }) => {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // The auth listener in App.jsx will automatically redirect to Login
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-gray-800 p-4 flex justify-between items-center z-50">
      {/* Branding */}
      <div className="flex items-center gap-3">
        {/* Logo (replace src with your actual logo file) */}
        <img
          src="/logo.png"
          alt="SecureSight Logo"
          className="w-8 h-8 rounded-md object-contain"
        />
        <h1 className="text-2xl font-bold text-green-400 tracking-wide font-sans">
          SecureSight
        </h1>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {userEmail && (
          <span className="text-sm text-gray-300 hidden sm:block">
            {userEmail}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded-lg transition-all font-medium"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
