import { useContext, useMemo, useState, useEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import API from "../api/axios";

const getDeviceLabel = (userAgent = "") => {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "Unknown";
  if (ua.includes("edg")) return "Edge";
  if (ua.includes("chrome")) return "Chrome";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  return "Browser";
};

const toTitle = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

function Dashboard() {
  const { user, token, logout } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState({
    totalLogins: 0,
    failedAttempts: 0,
    lastLogin: "Loading...",
    securityScore: "100%",
  });
  const [activities, setActivities] = useState([]);
  const [securityInsights, setSecurityInsights] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [statsRes, activityRes, insightsRes] = await Promise.allSettled([
          API.get("/api/events/stats", { headers }),
          API.get("/api/events/recent", { headers }),
          API.get("/api/events/security-insights", { headers }),
        ]);

        const recentActivity =
          activityRes.status === "fulfilled" && Array.isArray(activityRes.value.data)
            ? activityRes.value.data
            : [];
        setActivities(recentActivity);

        setSecurityInsights(insightsRes.status === "fulfilled" ? insightsRes.value.data || null : null);

        if (statsRes.status === "fulfilled") {
          const data = statsRes.value.data || {};
          const latestSuccess = recentActivity.find(
            (item) => item?.eventType === "LOGIN_SUCCESS" || item?.eventType === "ADMIN_LOGIN_SUCCESS"
          );
          const parsedLastLogin = data.lastLogin || latestSuccess?.createdAt;
          setStats({
            totalLogins: data.totalLogins ?? data.totalEvents ?? 0,
            failedAttempts: data.failedAttempts ?? data.loginFailures ?? 0,
            lastLogin: parsedLastLogin ? new Date(parsedLastLogin).toLocaleString() : "N/A",
            securityScore: data.securityScore || "100%",
          });
        } else {
          setStats((prev) => ({ ...prev, lastLogin: "N/A" }));
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (!user || loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        Loading Dashboard...
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileView user={user} />;
      case "settings":
        return <SettingsView />;
      case "security-center":
        return <SecurityCenterView insights={securityInsights} />;
      case "logs":
        return <SecurityLogsView activities={activities} insights={securityInsights} />;
      default:
        return (
          <DashboardOverview
            user={user}
            stats={stats}
            activities={activities}
            securityInsights={securityInsights}
            profileOpen={profileOpen}
            setProfileOpen={setProfileOpen}
          />
        );
    }
  };

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>UserDash</div>
        <nav style={styles.nav}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <NavItem label="Dashboard" id="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem label="Profile" id="profile" activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem label="Security Center" id="security-center" activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem label="Security Logs" id="logs" activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem label="Settings" id="settings" activeTab={activeTab} setActiveTab={setActiveTab} />
          </ul>
        </nav>
        <div style={{ padding: "20px" }}>
          <button onClick={logout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </aside>
      <main style={styles.main}>{renderContent()}</main>
    </div>
  );
}

function NavItem({ label, id, activeTab, setActiveTab }) {
  const isActive = activeTab === id;
  return (
    <li
      onClick={() => setActiveTab(id)}
      style={isActive ? { ...styles.navItem, ...styles.navItemActive } : styles.navItem}
    >
      {label}
    </li>
  );
}

function DashboardOverview({ user, stats, activities, securityInsights, profileOpen, setProfileOpen }) {
  const riskScoreValue = Number(securityInsights?.riskScore?.score);
  const securityScoreDisplay = Number.isFinite(riskScoreValue) ? `${riskScoreValue}%` : stats.securityScore;

  const chartRows = useMemo(() => {
    const bucket = {};
    for (const item of activities || []) {
      const key = item?.eventType || "UNKNOWN";
      bucket[key] = (bucket[key] || 0) + 1;
    }
    const rows = Object.entries(bucket)
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const max = rows.length ? Math.max(...rows.map((item) => item.count)) : 1;
    return rows.map((item) => ({ ...item, width: `${Math.max(18, (item.count / max) * 100)}%` }));
  }, [activities]);

  return (
    <>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Overview</h1>
        <div style={styles.profileMenuWrap}>
          <button type="button" style={styles.profileSection} onClick={() => setProfileOpen((v) => !v)}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: "600", color: "#1e293b" }}>{user.name}</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{user.role}</div>
            </div>
            <div style={styles.avatar}>{user.name.charAt(0).toUpperCase()}</div>
          </button>
          {profileOpen && (
            <div style={styles.profilePopover}>
              <div style={styles.profilePopoverTitle}>{user.name}</div>
              <div style={styles.profilePopoverText}>Role: {user.role}</div>
              <div style={styles.profilePopoverText}>Email: {user.email}</div>
            </div>
          )}
        </div>
      </header>

      <div style={styles.cardGrid}>
        <StatCard title="Total Logins" value={stats.totalLogins} color="#3b82f6" />
        <StatCard title="Failed Attempts" value={stats.failedAttempts} color="#ef4444" />
        <StatCard title="Last Successful Login" value={stats.lastLogin} color="#10b981" fontSize="1rem" />
        <StatCard title="Security Score" value={securityScoreDisplay} color="#f59e0b" />
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>My Event Activity Chart</h3>
        {chartRows.length === 0 ? (
          <div style={{ color: "#64748b" }}>No activity data available yet.</div>
        ) : (
          <div style={styles.userChartList}>
            {chartRows.map((item) => (
              <div key={item.eventType} style={styles.userChartRow}>
                <div style={styles.userChartLabel}>{toTitle(item.eventType)}</div>
                <div style={styles.userChartTrack}>
                  <div style={{ ...styles.userChartFill, width: item.width }} />
                </div>
                <div style={styles.userChartCount}>{item.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ProfileView({ user }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>My Profile</h2>
      <div style={styles.profileDetail}>
        <strong>Name:</strong> {user.name}
      </div>
      <div style={styles.profileDetail}>
        <strong>Email:</strong> {user.email}
      </div>
      <div style={styles.profileDetail}>
        <strong>Role:</strong> {user.role}
      </div>
      <div style={styles.profileDetail}>
        <strong>Provider:</strong> {user.provider || "Local"}
      </div>
      <div style={styles.profileDetail}>
        <strong>Account Created:</strong> {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
      </div>
    </div>
  );
}

function SettingsView() {
  const { token, logout } = useContext(AuthContext);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (passwords.new !== passwords.confirm) {
      setMessage({ type: "error", text: "New passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      await API.post(
        "/api/auth/change-password",
        { currentPassword: passwords.current, newPassword: passwords.new },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage({ type: "success", text: "Password updated successfully" });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.message || "Failed to update password" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await API.delete("/api/auth/account", { headers: { Authorization: `Bearer ${token}` } });
      logout();
    } catch {
      alert("Failed to delete account");
    }
  };

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Settings</h2>

      <div style={styles.settingsGroup}>
        <h3 style={styles.subTitle}>Security</h3>
        <form onSubmit={handlePasswordChange} style={{ maxWidth: "420px" }}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Current Password</label>
            <input
              type="password"
              required
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>New Password</label>
            <input
              type="password"
              required
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm New Password</label>
            <input
              type="password"
              required
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              style={styles.input}
            />
          </div>

          {message && (
            <div
              style={{
                ...styles.message,
                backgroundColor: message.type === "success" ? "#dcfce7" : "#fee2e2",
                color: message.type === "success" ? "#166534" : "#991b1b",
              }}
            >
              {message.text}
            </div>
          )}

          <button type="submit" disabled={loading} style={styles.primaryBtn}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>

      <div>
        <h3 style={{ ...styles.subTitle, color: "#ef4444" }}>Danger Zone</h3>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: "15px" }}>
          Once you delete your account, there is no going back. Please be certain.
        </p>

        {!deleteConfirm ? (
          <button onClick={handleDeleteAccount} style={styles.dangerBtnOutline}>
            Delete Account
          </button>
        ) : (
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#ef4444", fontWeight: "bold" }}>Are you sure?</span>
            <button onClick={handleDeleteAccount} style={styles.dangerBtn}>
              Yes, Delete
            </button>
            <button onClick={() => setDeleteConfirm(false)} style={styles.secondaryBtn}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SecurityCenterView({ insights }) {
  const risk = insights?.riskScore || {};
  const summary = insights?.activitySummary7d || {};

  const riskColor =
    risk.level === "LOW" ? "#166534" : risk.level === "MEDIUM" ? "#92400e" : risk.level === "HIGH" ? "#9a3412" : "#991b1b";

  const riskBg =
    risk.level === "LOW" ? "#dcfce7" : risk.level === "MEDIUM" ? "#fef3c7" : risk.level === "HIGH" ? "#ffedd5" : "#fee2e2";

  return (
    <div style={styles.section}>
      <h2 style={styles.securityCenterTitle}>Security Center</h2>
      {!insights ? (
        <div style={{ color: "#64748b" }}>Loading security insights...</div>
      ) : (
        <div style={styles.securityGrid}>
          <div style={styles.securityCard} className="security-hover-card">
            <div style={styles.securityCardLabel}>Personal Security Risk Score</div>
            <div style={styles.securityScoreRow}>
              <div style={styles.securityScoreValue}>{Number(risk.score || 0)} / 100</div>
              <span style={{ ...styles.securityRiskChip, background: riskBg, color: riskColor }}>
                {risk.level || "LOW"} RISK
              </span>
            </div>
            <div style={styles.securityFactors}>
              <div>
                Failed Logins (24h): <strong>{risk?.factors?.failedLogins24h ?? 0}</strong>
              </div>
              <div>
                New Country Login: <strong>{risk?.factors?.newCountryLogin ? "Yes" : "No"}</strong>
              </div>
              <div>
                Multiple IP Usage: <strong>{risk?.factors?.multipleIpUsage ?? 0}</strong>
              </div>
              <div>
                Account Age (days): <strong>{risk?.factors?.accountAgeDays ?? 0}</strong>
              </div>
              <div>
                Unresolved Alerts: <strong>{risk?.factors?.unresolvedAlerts ?? 0}</strong>
              </div>
            </div>
          </div>

          <div style={styles.securityCard} className="security-hover-card">
            <div style={styles.securityCardLabel}>Last 7 Days Activity</div>
            <ul style={styles.activitySummaryList}>
              <li>{summary.successfulLogins || 0} successful logins</li>
              <li>{summary.failedAttempts || 0} failed attempts</li>
              <li>{summary.alertsTriggered || 0} alerts triggered</li>
              <li>{summary.newDevices || 0} new devices</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityLogsView({ activities, insights }) {
  const rowsFromRecent = Array.isArray(activities)
    ? activities.map((item) => ({
        _id: item._id,
        event: toTitle(item.eventType),
        date: item.createdAt ? new Date(item.createdAt).toLocaleString() : "-",
        country: item?.geoLocation?.country || "UNKNOWN",
        device: getDeviceLabel(item?.metadata?.browser),
        ip: item?.ipAddress || "-",
        status: String(item?.eventType || "").includes("FAILED") ? "Failed" : "Normal",
      }))
    : [];

  const timelineRows =
    rowsFromRecent.length > 0
      ? rowsFromRecent
      : Array.isArray(insights?.loginLocationTimeline)
      ? insights.loginLocationTimeline.map((item, idx) => ({
          _id: `${item.timestamp}-${idx}`,
          event: "Login Success",
          date: item.timestamp ? new Date(item.timestamp).toLocaleString() : "-",
          country: item.country || "UNKNOWN",
          device: item.device || "Unknown",
          ip: item.ipAddress || "-",
          status: item.suspicious ? "Suspicious" : "Normal",
        }))
      : [];

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Security Logs</h2>
      {timelineRows.length === 0 ? (
        <div style={{ color: "#64748b" }}>No security logs found.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={styles.th}>Event</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Country</th>
                <th style={styles.th}>Device</th>
                <th style={styles.th}>IP</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((item) => (
                <tr key={item._id}>
                  <td style={styles.timelineCell}>{item.event}</td>
                  <td style={styles.timelineCell}>{item.date}</td>
                  <td style={styles.timelineCell}>{item.country}</td>
                  <td style={styles.timelineCell}>{item.device}</td>
                  <td style={styles.timelineCell}>{item.ip}</td>
                  <td style={styles.timelineCell}>
                    {item.status === "Failed" ? (
                      <span style={{ ...styles.timelineStatus, color: "#991b1b", background: "#fee2e2" }}>Failed</span>
                    ) : item.status === "Suspicious" ? (
                      <span style={{ ...styles.timelineStatus, color: "#9a3412", background: "#ffedd5" }}>Suspicious</span>
                    ) : (
                      <span style={{ ...styles.timelineStatus, color: "#166534", background: "#dcfce7" }}>Normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color, fontSize = "1.8rem" }) {
  return (
    <div style={{ ...styles.card, borderLeft: `5px solid ${color}` }}>
      <div style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>
        {title}
      </div>
      <div style={{ fontSize, fontWeight: "700", color: "#1e293b" }}>{value}</div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    background: "radial-gradient(circle at top left, #fbfcff 0, #f6f7fb 45%, #f2f4fb 100%)",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    color: "#7f8798",
    fontSize: "1.2rem",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #ebeef5",
    borderTop: "4px solid #5b5ce2",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "20px",
  },
  sidebar: {
    width: "254px",
    backgroundColor: "#ffffff",
    color: "#1f2434",
    display: "flex",
    flexDirection: "column",
    boxShadow: "6px 0 22px rgba(28,39,94,0.04)",
    zIndex: 10,
    borderRight: "1px solid #ebeef5",
  },
  sidebarHeader: {
    padding: "24px",
    fontSize: "1.5rem",
    fontWeight: "700",
    borderBottom: "1px solid #ebeef5",
    letterSpacing: "0.4px",
    color: "#1f2434",
  },
  nav: { flex: 1, padding: "20px 0" },
  navItem: {
    margin: "0 10px 6px",
    padding: "12px 14px",
    cursor: "pointer",
    color: "#7f8798",
    borderRadius: "12px",
    transition: "all 0.2s ease",
    fontSize: "0.95rem",
    fontWeight: "600",
  },
  navItemActive: {
    background: "linear-gradient(145deg, #5b5ce2 0%, #6f70ef 100%)",
    color: "#fff",
    fontWeight: "700",
    boxShadow: "0 8px 18px rgba(91,92,226,0.28)",
  },
  logoutBtn: {
    width: "100%",
    padding: "12px",
    background: "#fff5f6",
    color: "#c65467",
    border: "1px solid #f1d1d4",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
    transition: "background 0.2s",
    boxShadow: "none",
  },
  main: { flex: 1, padding: "26px 30px", overflowY: "auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "1px solid #ebeef5",
  },
  headerTitle: { fontSize: "1.62rem", fontWeight: "700", color: "#1f2434", margin: 0 },
  profileMenuWrap: { position: "relative" },
  profileSection: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: "#fff",
    padding: "8px 14px",
    borderRadius: "30px",
    border: "1px solid #ebeef5",
    boxShadow: "0 4px 14px rgba(22,32,72,0.05)",
    cursor: "pointer",
    color: "#1f2434",
  },
  profilePopover: {
    position: "absolute",
    top: "52px",
    right: 0,
    minWidth: "220px",
    background: "#fff",
    border: "1px solid #ebeef5",
    borderRadius: "12px",
    boxShadow: "0 12px 24px rgba(20,29,67,0.12)",
    padding: "10px 12px",
    zIndex: 20,
  },
  profilePopoverTitle: { fontSize: "0.9rem", fontWeight: "700", color: "#1f2434", marginBottom: "4px" },
  profilePopoverText: { fontSize: "0.8rem", color: "#6d7586", lineHeight: 1.4 },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "linear-gradient(145deg, #5b5ce2 0%, #6f70ef 100%)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "1rem",
  },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "24px", marginBottom: "24px" },
  card: {
    backgroundColor: "white",
    padding: "24px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(20, 29, 67, 0.08)",
    border: "1px solid #ebeef5",
  },
  section: {
    backgroundColor: "white",
    padding: "30px",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(20, 29, 67, 0.08)",
    border: "1px solid #ebeef5",
  },
  sectionTitle: { marginTop: 0, marginBottom: "20px", color: "#1f2434", fontSize: "1.25rem", fontWeight: "700" },
  securityCenterTitle: {
    marginTop: 0,
    marginBottom: "22px",
    color: "#1f2434",
    fontSize: "2rem",
    fontWeight: "700",
    textAlign: "center",
  },
  subTitle: { color: "#2f3548", fontSize: "1.1rem", marginBottom: "16px", fontWeight: "600" },
  th: {
    textAlign: "left",
    padding: "14px 16px",
    borderBottom: "2px solid #ebeef5",
    color: "#7f8798",
    fontWeight: "600",
    fontSize: "0.82rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  profileDetail: { padding: "12px 0", borderBottom: "1px solid #f1f4fa", color: "#3e455d" },
  settingsGroup: { marginBottom: "30px", paddingBottom: "20px", borderBottom: "1px solid #f1f4fa" },
  formGroup: { marginBottom: "20px" },
  label: { display: "block", marginBottom: "8px", color: "#59637a", fontWeight: "500", fontSize: "0.9rem" },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #dfe4f2",
    fontSize: "0.95rem",
    transition: "border 0.2s",
    backgroundColor: "#f9fafe",
  },
  primaryBtn: {
    padding: "10px 24px",
    background: "linear-gradient(145deg, #5b5ce2 0%, #6f70ef 100%)",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "0.95rem",
    transition: "background 0.2s",
  },
  dangerBtnOutline: {
    padding: "10px 20px",
    background: "#ffffff",
    color: "#c65467",
    border: "1px solid #f1d1d4",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
    transition: "all 0.2s",
  },
  dangerBtn: {
    padding: "8px 16px",
    backgroundColor: "#d14f63",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  secondaryBtn: {
    padding: "8px 16px",
    backgroundColor: "#8f97ab",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  message: { padding: "12px", marginBottom: "20px", borderRadius: "6px", fontSize: "0.9rem", fontWeight: "500" },
  securityGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "20px" },
  securityCard: {
    border: "1px solid #ebeef5",
    borderRadius: "14px",
    background: "#fff",
    padding: "22px",
    boxShadow: "0 4px 14px rgba(22, 32, 72, 0.05)",
    minHeight: "260px",
  },
  securityCardLabel: {
    color: "#64748b",
    fontSize: "0.82rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: "700",
    marginBottom: "10px",
  },
  securityScoreRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" },
  securityScoreValue: { fontSize: "2rem", fontWeight: 700, color: "#1f2434" },
  securityRiskChip: { borderRadius: "999px", padding: "6px 12px", fontSize: "0.78rem", fontWeight: 700, border: "1px solid rgba(0,0,0,0.05)" },
  securityFactors: { display: "grid", gap: "8px", fontSize: "1.05rem", color: "#3e455d" },
  activitySummaryList: { margin: "6px 0 0", paddingLeft: "22px", color: "#3e455d", lineHeight: 1.95, fontSize: "1.05rem" },
  timelineStatus: { borderRadius: "999px", padding: "4px 10px", fontSize: "0.76rem", fontWeight: 700, display: "inline-block" },
  timelineCell: {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    padding: "12px 10px",
    lineHeight: 1.45,
    verticalAlign: "middle",
    borderBottom: "1px solid #f1f5f9",
  },
  userChartList: { display: "grid", gap: "14px" },
  userChartRow: { display: "grid", gridTemplateColumns: "220px 1fr 52px", gap: "14px", alignItems: "center" },
  userChartLabel: { color: "#334155", fontSize: "0.95rem", fontWeight: 600 },
  userChartTrack: { height: "12px", borderRadius: "999px", background: "#edf1fb", overflow: "hidden" },
  userChartFill: {
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(145deg, #5b5ce2 0%, #6f70ef 100%)",
    transition: "width 0.3s ease",
  },
  userChartCount: { textAlign: "right", color: "#475569", fontWeight: 700, fontSize: "0.9rem" },
};

export default Dashboard;
