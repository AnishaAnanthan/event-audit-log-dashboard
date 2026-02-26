/* eslint-disable react-refresh/only-export-components */
import { createContext, useState } from "react";
import API from "../api/axios";

export const AuthContext = createContext();

// Helper to safely parse user from localStorage on initial load
const getInitialUser = () => {
  try {
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  } catch (e) {
    console.error("Failed to parse user from localStorage", e);
    localStorage.removeItem("user"); // Clear corrupted data
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getInitialUser());
  const [token, setToken] = useState(localStorage.getItem("token"));

  const login = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      // Send token for the backend to log the event with the correct user
      await API.post("/api/auth/logout", {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      console.error("Logout log failed", error);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
