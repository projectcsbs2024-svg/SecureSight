import React, { useState } from "react";
import { auth } from "../firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent! Check your inbox.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-lg w-96">
      <h2 className="text-2xl font-bold text-center mb-6">Reset Password</h2>

      {error && (
        <div className="bg-red-600 text-white text-sm p-2 mb-4 rounded-md text-center">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-green-600 text-white text-sm p-2 mb-4 rounded-md text-center">
          {message}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:outline-none"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-md transition"
        >
          {loading ? "Sending..." : "Send Reset Email"}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-400">
        Remembered your password?{" "}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-blue-400 underline hover:text-blue-500"
        >
          Login
        </button>
      </div>
    </div>
  );
}
