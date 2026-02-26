import { createContext, useState } from "react";
import axios from "axios";

export const AuthContext = createContext();
const API = axios.create({ baseURL: "http://localhost:5000" }); // Ensure this matches your backend terminal output

const getInitialAdmin = () => {
  try {
    const storedAdmin = localStorage.getItem("admin_user");
    return storedAdmin ? JSON.parse(storedAdmin) : null;
  } catch (e) {
    localStorage.removeItem("admin_user");
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(getInitialAdmin());
  const [token, setToken] = useState(localStorage.getItem("admin_token"));

  const login = (data) => {
    localStorage.setItem("admin_token", data.token);
    localStorage.setItem("admin_user", JSON.stringify(data.user));
    setToken(data.token);
    setAdmin(data.user);
  };

  const logout = async () => {
    try {
      await API.post("/api/auth/logout", {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      console.error("Admin logout log failed", error);
    }
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, token, login, logout, API }}>
      {children}
    </AuthContext.Provider>
  );
};