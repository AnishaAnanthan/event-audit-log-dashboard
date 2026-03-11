import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api/axios";

function Register() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [popup, setPopup] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const strongPassword = (value) =>
    value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.password !== formData.confirmPassword) {
        setPopup({ type: "error", message: "Passwords do not match" });
        setTimeout(() => setPopup(null), 3000);
        return;
      }
      if (!strongPassword(formData.password)) {
        setPopup({
          type: "error",
          message: "Password must be 8+ chars with upper, lower, number, and special character",
        });
        setTimeout(() => setPopup(null), 3500);
        return;
      }
      await API.post("/api/auth/register", formData);
      setPopup({ type: "success", message: "Registration successful. You can now log in." });
      setTimeout(() => navigate("/"), 1200);
    } catch (error) {
      setPopup({ type: "error", message: error.response?.data?.message || "Registration failed" });
      setTimeout(() => setPopup(null), 3000);
    }
  };

  return (
    <div className="auth-screen">
      {popup && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: popup.type === "success" ? "#4caf50" : "#f44336",
            color: "white",
            padding: "10px 20px",
            borderRadius: "8px",
            zIndex: 1000,
            fontSize: "0.92rem",
            fontWeight: 600,
          }}
        >
          {popup.message}
        </div>
      )}

      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-icon-wrap" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </div>
          <h2 className="auth-title">CREATE ACCOUNT</h2>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                name="name"
                placeholder="Enter full name"
                required
                value={formData.name}
                onChange={handleChange}
                className="auth-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email ID</label>
              <input
                id="email"
                type="email"
                name="email"
                placeholder="Enter email"
                required
                value={formData.email}
                onChange={handleChange}
                className="auth-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Enter password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="auth-input"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18"></path>
                      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path>
                      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7-0.64 1.43-1.68 2.73-3 3.82"></path>
                      <path d="M6.61 6.61C4.62 7.89 3.12 9.79 2 12c1.73 3.89 6 7 10 7 1.61 0 3.17-0.36 4.61-1.02"></path>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <div className="password-field">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Re-enter password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="auth-input"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18"></path>
                      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path>
                      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7-0.64 1.43-1.68 2.73-3 3.82"></path>
                      <path d="M6.61 6.61C4.62 7.89 3.12 9.79 2 12c1.73 3.89 6 7 10 7 1.61 0 3.17-0.36 4.61-1.02"></path>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9bb0cf", marginTop: "6px" }}>
                Use 8+ chars with upper, lower, number, and special character.
              </div>
            </div>
            <button type="submit" className="auth-submit-btn">Register</button>
          </form>

          <p className="auth-footnote">
            Already have an account? <Link to="/" className="auth-inline-link">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
