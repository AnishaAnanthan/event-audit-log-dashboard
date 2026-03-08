import { useEffect, useState, useContext, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import SectionCard from "../components/ui/SectionCard";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { useLocation, useNavigate } from "react-router-dom";
import { Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

function Alerts() {
  const { API, token, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [importEvents, setImportEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ status: "", severity: "", search: "" });
  const [triagingId, setTriagingId] = useState(null);
  const [triageById, setTriageById] = useState({});
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const pageSize = 15;
  const importSessionId = useMemo(
    () => new URLSearchParams(location.search).get("importSessionId") || "",
    [location.search]
  );
  const CATEGORY_KEYS = ["NEW_DEVICE_LOGIN", "GEO_ANOMALY", "FAILED_LOGIN_THRESHOLD", "IP_BRUTE_FORCE", "OTHER_ALERTS"];
  const CATEGORY_COLORS = {
    NEW_DEVICE_LOGIN: "#4f86ff",
    GEO_ANOMALY: "#2f6bcc",
    FAILED_LOGIN_THRESHOLD: "#f0ab28",
    IP_BRUTE_FORCE: "#f97316",
    OTHER_ALERTS: "#cf5a7a",
  };

  const getAlertCategory = (typeValue) => {
    const type = String(typeValue || "").toUpperCase();
    if (type.includes("NEW_DEVICE_LOGIN")) return "NEW_DEVICE_LOGIN";
    if (type.includes("GEO_ANOMALY")) return "GEO_ANOMALY";
    if (type.includes("FAILED_LOGIN_THRESHOLD")) return "FAILED_LOGIN_THRESHOLD";
    if (type.includes("IP_BRUTE_FORCE")) return "IP_BRUTE_FORCE";
    return "OTHER_ALERTS";
  };

  const fetchAlerts = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const { data } = await API.get(`/api/alerts?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch alerts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filters]);

  useEffect(() => {
    const fetchImportEvents = async () => {
      if (!importSessionId) {
        setImportEvents([]);
        return;
      }

      try {
        const pageSizeLocal = 500;
        let page = 1;
        let totalPages = 1;
        const merged = [];

        while (page <= totalPages) {
          const query = new URLSearchParams({
            importSessionId,
            limit: pageSizeLocal,
            page,
          }).toString();
          const { data } = await API.get(`/api/events/admin/all?${query}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const chunk = Array.isArray(data?.events) ? data.events : [];
          merged.push(...chunk);
          totalPages = Math.max(1, Number(data?.totalPages) || 1);
          page += 1;
        }

        setImportEvents(merged);
      } catch (error) {
        console.error("Failed to fetch imported events for alerts", error);
        setImportEvents([]);
      }
    };

    fetchImportEvents();
  }, [API, token, importSessionId]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const derivedAlertsFromImport = useMemo(() => {
    if (!importSessionId || alerts.length > 0) return [];
    return importEvents.map((event, index) => {
      const eventType = String(event?.eventType || "").toUpperCase();
      const rawLevel = String(event?.metadata?.level || "").toUpperCase();
      const severity =
        rawLevel === "CRITICAL" || eventType.includes("CRITICAL")
          ? "CRITICAL"
          : rawLevel === "HIGH" || eventType.includes("FAILED") || eventType.includes("ERROR")
            ? "HIGH"
            : rawLevel === "MEDIUM" || eventType.includes("WARN")
              ? "MEDIUM"
              : "LOW";

      let type = "OTHER_ALERTS";
      if (eventType.includes("NEW_DEVICE")) type = "NEW_DEVICE_LOGIN";
      else if (eventType.includes("GEO")) type = "GEO_ANOMALY";
      else if (eventType.includes("BRUTE")) type = "IP_BRUTE_FORCE";
      else if (eventType.includes("FAILED") || eventType.includes("LOGIN")) type = "FAILED_LOGIN_THRESHOLD";

      return {
        _id: `import-${event?._id || index}`,
        severity,
        type,
        email: event?.metadata?.email || "",
        ipAddress: event?.ipAddress || "",
        occurrenceCount: 1,
        message: event?.metadata?.message || event?.metadata?.rawLine || eventType || "Imported event",
        createdAt: event?.createdAt || new Date().toISOString(),
        status: "IMPORTED",
        _imported: true,
      };
    });
  }, [alerts.length, importEvents, importSessionId]);

  const sourceAlerts = useMemo(
    () => (derivedAlertsFromImport.length ? derivedAlertsFromImport : alerts),
    [alerts, derivedAlertsFromImport]
  );

  const filteredSourceAlerts = useMemo(() => {
    const q = String(filters.search || "").toLowerCase().trim();
    return sourceAlerts.filter((item) => {
      const statusOk = !filters.status || String(item.status || "").toUpperCase() === String(filters.status).toUpperCase();
      const severityOk = !filters.severity || String(item.severity || "").toUpperCase() === String(filters.severity).toUpperCase();
      const searchOk =
        !q ||
        String(item.email || "").toLowerCase().includes(q) ||
        String(item.ipAddress || "").toLowerCase().includes(q) ||
        String(item.type || "").toLowerCase().includes(q) ||
        String(item.message || "").toLowerCase().includes(q);
      return statusOk && severityOk && searchOk;
    });
  }, [filters.search, filters.severity, filters.status, sourceAlerts]);

  const totalPages = Math.max(1, Math.ceil(filteredSourceAlerts.length / pageSize));
  const pagedAlerts = filteredSourceAlerts.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleResolve = async (id) => {
    try {
      await API.put(
        `/api/alerts/${id}/resolve`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      fetchAlerts();
    } catch (error) {
      console.error("Failed to resolve alert", error);
    }
  };

  const handleAiTriage = async (id, approveResolution = false) => {
    setTriagingId(`${id}:${approveResolution ? "resolve" : "triage"}`);
    try {
      const { data } = await API.post(
        `/api/ai/triage-alert/${id}`,
        { approveResolution },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTriageById((prev) => ({ ...prev, [id]: data }));
      if (approveResolution) {
        await fetchAlerts();
      }
    } catch (error) {
      alert(error?.response?.data?.message || "AI triage failed");
    } finally {
      setTriagingId(null);
    }
  };

  const getCsvFilename = (fallback, disposition) => {
    if (!disposition) return fallback;
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return match?.[1] || fallback;
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString();

      const { data, headers } = await API.get(`/api/export/alerts?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = getCsvFilename("alerts_export.csv", headers["content-disposition"]);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export alerts CSV", error);
      alert("Failed to export alerts CSV");
    } finally {
      setExporting(false);
    }
  };

  const categorySummary = useMemo(() => {
    const counts = {
      NEW_DEVICE_LOGIN: 0,
      GEO_ANOMALY: 0,
      FAILED_LOGIN_THRESHOLD: 0,
      IP_BRUTE_FORCE: 0,
      OTHER_ALERTS: 0,
    };
    filteredSourceAlerts.forEach((item) => {
      const key = getAlertCategory(item?.type);
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return counts;
  }, [filteredSourceAlerts]);

  const categoryRows = useMemo(
    () =>
      CATEGORY_KEYS.map((key) => ({
        key,
        label: key.replaceAll("_", " "),
        count: Number(categorySummary[key] || 0),
        color: CATEGORY_COLORS[key],
      })),
    [categorySummary]
  );

  const donutData = useMemo(
    () => ({
      labels: categoryRows.map((item) => item.label),
      datasets: [
        {
          data: categoryRows.map((item) => item.count),
          backgroundColor: categoryRows.map((item) => item.color),
          borderWidth: 0,
        },
      ],
    }),
    [categoryRows]
  );

  const rateChartData = useMemo(() => {
    const byDay = new Map();
    filteredSourceAlerts.forEach((item) => {
      const key = new Date(item.createdAt || Date.now()).toISOString().split("T")[0];
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });
    const labels = Array.from(byDay.keys()).sort((a, b) => a.localeCompare(b));
    return {
      labels,
      datasets: [
        {
          label: "Alert Rate",
          data: labels.map((d) => byDay.get(d) || 0),
          borderColor: "#7dd3fc",
          backgroundColor: "rgba(125, 211, 252, 0.28)",
          fill: true,
          pointRadius: 2,
          tension: 0.35,
        },
      ],
    };
  }, [filteredSourceAlerts]);

  const donutCenterPlugin = {
    id: "alertsDonutCenter",
    beforeDraw: (chart) => {
      const { width, height, ctx } = chart;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
      ctx.save();
      ctx.fillStyle = "#f8fbff";
      ctx.font = "700 28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(total), width / 2, height / 2 - 8);
      ctx.font = "500 12px Inter, sans-serif";
      ctx.fillStyle = "#b7cdf0";
      ctx.fillText("Total Alerts", width / 2, height / 2 + 14);
      ctx.restore();
    },
  };

  return (
    <SectionCard className="alerts-redesign">
      <div className="alerts-layout-grid">
        <div className="dashboard-top-shell alerts-top-shell">
          <button type="button" className="dashboard-menu-icon fixed-top-left" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            {"\u2630"}
          </button>
        </div>

        {menuOpen && (
          <>
            <div className="dashboard-menu-backdrop" onClick={() => { setMenuOpen(false); }} />
            <aside className="dashboard-floating-menu">
              <div className="dashboard-floating-menu-title">Menu</div>
              <button type="button" className="dashboard-floating-menu-item" onClick={() => { navigate("/"); setMenuOpen(false); }}>
                Dashboard
              </button>
              <button type="button" className="dashboard-floating-menu-item" onClick={() => { navigate("/logs"); setMenuOpen(false); }}>
                Audit Logs
              </button>
              <button type="button" className="dashboard-floating-menu-item" onClick={() => { navigate("/alerts"); setMenuOpen(false); }}>
                Alerts
              </button>
              <button
                type="button"
                className="dashboard-floating-menu-item"
                onClick={() => { navigate("/log-import"); setMenuOpen(false); }}
              >
                Log Import
              </button>
              <button type="button" className="dashboard-floating-menu-item danger" onClick={logout}>
                Logout
              </button>
            </aside>
          </>
        )}

        <section className="alerts-top-charts">
          <article className="alerts-summary-card">
            <div className="alerts-donut-wrap">
              <Doughnut
                data={donutData}
                plugins={[donutCenterPlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "70%",
                  plugins: { legend: { display: false } },
                }}
              />
            </div>
            <div className="alerts-type-list">
              {categoryRows.map((row) => (
                <div key={row.key} className="alerts-type-row">
                  <span className="alerts-type-name">
                    <span className="alerts-type-dot" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </span>
                  <span className="alerts-type-count">{row.count}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="alerts-rate-card">
            <div className="alerts-rate-title">Rate Chart</div>
            <div className="alerts-rate-wrap">
              <Line
                data={rateChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: "#c8dcfb" }, grid: { color: "rgba(156, 193, 241, 0.12)" } },
                    y: { ticks: { color: "#c8dcfb" }, grid: { color: "rgba(156, 193, 241, 0.12)" }, beginAtZero: true },
                  },
                }}
              />
            </div>
          </article>
        </section>

        <div className="alerts-toolbar alerts-toolbar-row">
          <select
            className="form-input compact-input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select
            className="form-input compact-input"
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <input
            type="text"
            placeholder="Search Email/IP"
            className="form-input compact-input"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <button type="button" onClick={handleExportCsv} disabled={exporting} className="btn-secondary compact-btn">
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading alerts" className="alerts-inline-loader" />
        ) : (
          <div className="table-container alerts-table-wrap">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Count</th>
                  <th>Message</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedAlerts.length > 0 ? (
                  pagedAlerts.map((alert) => (
                    <tr key={alert._id}>
                      <td>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            fontWeight: "700",
                            backgroundColor:
                              alert.severity === "CRITICAL"
                                ? "rgba(239, 68, 68, 0.18)"
                                : alert.severity === "HIGH"
                                  ? "rgba(249, 115, 22, 0.18)"
                                  : alert.severity === "MEDIUM"
                                    ? "rgba(234, 179, 8, 0.18)"
                                    : "rgba(34, 197, 94, 0.18)",
                            color:
                              alert.severity === "CRITICAL"
                                ? "#fda4af"
                                : alert.severity === "HIGH"
                                  ? "#fdba74"
                                  : alert.severity === "MEDIUM"
                                    ? "#fde68a"
                                    : "#86efac",
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td className="alerts-cell-strong">{alert.type}</td>
      <td>{alert.email || alert.ipAddress}</td>
                      <td>{alert.occurrenceCount}</td>
                      <td className="alerts-cell-message">{alert.message}</td>
                      <td>{new Date(alert.createdAt).toLocaleString()}</td>
                      <td>
                        <span className={`audit-status ${alert.status === "ACTIVE" ? "failed" : "success"}`}>{alert.status}</span>
                      </td>
                      <td>
                        {alert._imported ? (
                          <span style={{ color: "#9fb8de" }}>-</span>
                        ) : (
                          <>
                            <div className="action-btn-stack">
                              {alert.status === "ACTIVE" && (
                                <button onClick={() => handleResolve(alert._id)} className="action-btn action-btn-resolve">
                                  Resolve
                                </button>
                              )}
                              <button
                                onClick={() => handleAiTriage(alert._id, false)}
                                disabled={triagingId !== null}
                                className="action-btn action-btn-ai"
                              >
                                {triagingId === `${alert._id}:triage` ? "Triaging..." : "AI Triage"}
                              </button>
                              {alert.status === "ACTIVE" && (
                                <button
                                  onClick={() => handleAiTriage(alert._id, true)}
                                  disabled={triagingId !== null}
                                  className="action-btn action-btn-ai-resolve"
                                >
                                  {triagingId === `${alert._id}:resolve` ? "Processing..." : "AI + Resolve"}
                                </button>
                              )}
                            </div>
                            {triageById[alert._id]?.triage && (
                              <div className="alerts-triage-note">
                                <strong>{triageById[alert._id].triage.severity_classification}</strong>
                                {" • "}
                                {triageById[alert._id].triage.recommended_action}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                      No alerts found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredSourceAlerts.length > 0 && (
          <div className="audit-pagination-row">
            <div className="audit-page-meta">
              Page {page} of {totalPages} ({filteredSourceAlerts.length} alerts)
            </div>
            <div className="dashboard-pagination-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export default Alerts;
