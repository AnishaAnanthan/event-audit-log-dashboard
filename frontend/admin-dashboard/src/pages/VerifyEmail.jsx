import { useEffect, useMemo, useState, useContext } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { API } = useContext(AuthContext);
  const initialEmail = useMemo(() => String(searchParams.get("email") || "").trim(), [searchParams]);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await API.post("/api/auth/verify-email", { email, otp });
      setMessage({ type: "success", text: data?.message || "Email verified successfully." });
      setTimeout(() => navigate("/login"), 1200);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Verification failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await API.post("/api/auth/resend-otp", { email });
      setMessage({ type: "success", text: data?.message || "OTP resent successfully." });
      setCooldown(60);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.message || "Failed to resend OTP." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-icon-wrap" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M22 8.5V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.5" />
              <path d="M12 2l10 6-10 6L2 8l10-6z" />
            </svg>
          </div>
          <h2 className="auth-title">VERIFY ADMIN EMAIL</h2>

          {message && (
            <div className={message.type === "success" ? "success-msg" : "error-msg"}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleVerify} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="verify-email">Email</label>
              <input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input auth-input"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="otp">OTP</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="form-input auth-input"
                required
              />
            </div>
            <button type="submit" className="btn-primary auth-submit-btn" disabled={busy}>
              {busy ? "Verifying..." : "Verify Email"}
            </button>
          </form>

          <div style={{ marginTop: "12px", display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResend}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
            </button>
            <Link to="/login" className="auth-inline-link">Back to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
