import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import SectionCard from "../components/ui/SectionCard";

function Alerts() {
  const { API, token } = useContext(AuthContext);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ status: "", severity: "", search: "" });
  const [triagingId, setTriagingId] = useState(null);
  const [triageById, setTriageById] = useState({});

  const fetchAlerts = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const { data } = await API.get(`/api/alerts?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(data);
    } catch (error) {
      console.error("Failed to fetch alerts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filters]);

  const handleResolve = async (id) => {
    try {
      await API.put(`/api/alerts/${id}/resolve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value !== "")
      ).toString();

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

  return (
    <SectionCard
      title="Security Alerts"
      right={
        <div className="alerts-toolbar">
          <select
            className="form-input compact-input"
            style={{ width: "auto" }}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select
            className="form-input compact-input"
            style={{ width: "auto" }}
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
            style={{ width: "200px" }}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="btn-ghost compact-btn"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
          Loading alerts...
        </div>
      ) : (
        <div className="table-container">
          <table>
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
              {alerts.length > 0 ? (
                alerts.map((alert) => (
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
                              ? "#fef2f2"
                              : alert.severity === "HIGH"
                              ? "#fff7ed"
                              : "#eff6ff",
                          color:
                            alert.severity === "CRITICAL"
                              ? "#b91c1c"
                              : alert.severity === "HIGH"
                              ? "#9a3412"
                              : "#1d4ed8",
                        }}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: "500" }}>{alert.type}</td>
                    <td>{alert.email || alert.ipAddress}</td>
                    <td style={{ textAlign: "center" }}>{alert.occurrenceCount}</td>
                    <td style={{ maxWidth: "300px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {alert.message}
                    </td>
                    <td>{new Date(alert.createdAt).toLocaleString()}</td>
                    <td>
                      <span
                        style={{
                          fontWeight: "600",
                          color: alert.status === "ACTIVE" ? "var(--danger-color)" : "var(--success-color)",
                        }}
                      >
                        {alert.status}
                      </span>
                    </td>
                    <td>
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
                        <div
                          style={{
                            marginTop: "0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            maxWidth: "320px",
                          }}
                        >
                          <strong style={{ color: "var(--text-primary)" }}>
                            {triageById[alert._id].triage.severity_classification}
                          </strong>
                          {" • "}
                          {triageById[alert._id].triage.recommended_action}
                        </div>
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
    </SectionCard>
  );
}

export default Alerts;
