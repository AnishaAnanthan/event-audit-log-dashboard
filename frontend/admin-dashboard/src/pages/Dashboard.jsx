import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Link } from "react-router-dom";
import StackedBarChart from "../components/charts/StackedBarChart";
import AlertSeverityDonut from "../components/charts/AlertSeverityDonut";
import RealTimeEventCounter from "../components/RealTimeEventCounter";
import EventDistributionChart from "../components/charts/EventDistributionChart";
import GeoHeatmap from "../components/charts/GeoHeatmap";

function Dashboard() {
  const { API, token } = useContext(AuthContext);
  const [stats, setStats] = useState({
    totalEvents: 0,
    loginFailures: 0,
    uniqueUsers: 0,
    recentAlerts: 0
  });
  const [userRiskRows, setUserRiskRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    
    // Use local time for default values to match user's timezone
    const formatDate = (d) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };
    return { start: formatDate(start), end: formatDate(end) };
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, usersRes, alertsRes] = await Promise.all([
          API.get("/api/events/admin/stats", {
            headers: { Authorization: `Bearer ${token}` }
          }),
          API.get("/api/auth/admin/users", {
            headers: { Authorization: `Bearer ${token}` }
          }),
          API.get("/api/alerts", {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        const alerts = Array.isArray(alertsRes?.data) ? alertsRes.data : [];
        setStats({
          ...(statsRes.data || {}),
          recentAlerts: alerts.length,
        });
        const users = Array.isArray(usersRes?.data?.users) ? usersRes.data.users : [];
        setUserRiskRows(
          users
            .map((u) => ({
              _id: u._id,
              name: u.name,
              email: u.email,
              role: u.role,
              riskScore: Number(u.riskScore || 0),
            }))
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 8)
        );
      } catch (error) {
        console.error("Failed to fetch stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [API, token]);

  if (loading) return <div>Loading statistics...</div>;

  return (
    <div>
      {/* KPI Cards */}
      <div className="kpi-row kpi-row-4">
        <StatCard title="Total Events" value={stats.totalEvents} color="#3b82f6" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>} />
        <StatCard title="Failed Logins" value={stats.loginFailures} color="#ef4444" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>} />
        <StatCard title="Unique Users" value={stats.uniqueUsers} color="#10b981" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} />
        <Link to="/alerts" style={{ textDecoration: 'none' }}>
          <StatCard title="Security Alerts" value={stats.recentAlerts} color="#f59e0b" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>} />
        </Link>
      </div>

      <div className="admin-dashboard">
        <section className="dashboard-grid-row1">
          <article className="dash-card row1-activity">
            <div className="dash-card-header">
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>Event Activity</h3>
              <div className="date-range">
                <input type="date" className="form-input date-input"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
                <span>-</span>
                <input type="date" className="form-input date-input"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
              </div>
            </div>
            <div className="chart-area">
              <StackedBarChart dateRange={dateRange} />
            </div>
          </article>

          <article className="dash-card row1-alerts">
            <div className="dash-card-header">
              <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>Alert Severity</h3>
            </div>
            <div className="chart-area">
              <AlertSeverityDonut />
            </div>
          </article>
        </section>

        <section className="dashboard-grid-row2">
          <RealTimeEventCounter />
        </section>

        <section className="dashboard-grid-row3">
          <article className="dash-card row3-distribution">
            <div className="dash-card-header">
              <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>Event Type Distribution</h3>
            </div>
            <div className="chart-area">
              <EventDistributionChart />
            </div>
          </article>
          <article className="dash-card row3-heatmap">
            <div className="dash-card-header">
              <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>Geo Activity Heatmap</h3>
            </div>
            <GeoHeatmap dateRange={dateRange} />
          </article>
        </section>

        <section className="dashboard-grid-row4">
          <article className="dash-card">
            <div className="dash-card-header">
              <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>
                User Risk Scores
              </h3>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Risk Score</th>
                  </tr>
                </thead>
                <tbody>
                  {userRiskRows.length ? userRiskRows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{row.role}</td>
                      <td>
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          background: row.riskScore >= 80 ? "#dcfce7" : row.riskScore >= 60 ? "#fef3c7" : row.riskScore >= 40 ? "#ffedd5" : "#fee2e2",
                          color: row.riskScore >= 80 ? "#166534" : row.riskScore >= 60 ? "#92400e" : row.riskScore >= 40 ? "#9a3412" : "#991b1b",
                        }}>
                          {row.riskScore}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", color: "var(--text-secondary)" }}>No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

      </div>
    </div>
  );
}

function StatCard({ title, value, color, icon }) {
  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
      <div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          {title}
        </div>
        <div style={{ fontSize: "1.875rem", fontWeight: "700", color: "var(--text-primary)", lineHeight: "1" }}>
          {value}
        </div>
      </div>
      <div style={{ color: color, background: `${color}20`, padding: "10px", borderRadius: "var(--radius-md)" }}>
        {icon}
      </div>
    </div>
  );
}

export default Dashboard;
