import React, { useState } from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // Email login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard"); // redirect to dashboard on login
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Google login
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setError("");
    try {
      await signInWithPopup(auth, provider);
      navigate("/dashboard"); // redirect after Google login
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-gray-800 p-8 rounded-2xl shadow-lg w-96">
      <h2 className="text-2xl font-bold text-center mb-6">Login to SecureSight</h2>

      {error && (
        <div className="bg-red-600 text-white text-sm p-2 mb-4 rounded-md text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:outline-none"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:outline-none"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-md transition"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <div className="mt-6 text-center text-gray-400">or</div>

      <button
        onClick={handleGoogleLogin}
        className="mt-3 w-full bg-white text-gray-800 font-medium py-3 rounded-md flex items-center justify-center gap-2 hover:bg-gray-100 transition"
      >
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google"
          className="w-5 h-5"
        />
        Continue with Google
      </button>

      <div className="mt-6 text-center text-sm text-gray-400">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/signup")}
          className="text-blue-400 underline hover:text-blue-500"
        >
          Sign up
        </button>
        <br />
        <button
          type="button"
          onClick={() => navigate("/forgot-password")}
          className="text-blue-400 underline hover:text-blue-500 mt-2"
        >
          Forgot Password?
        </button>
      </div>
    </div>
  );
}
