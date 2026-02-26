import { useEffect, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import SectionCard from "../components/ui/SectionCard";

function Logs() {
  const { API, token } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    eventType: "",
    ipAddress: "",
    startDate: "",
    endDate: ""
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [roleScope, setRoleScope] = useState("ALL");

  const fetchLogs = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const query = new URLSearchParams({
        page,
        limit: 25,
        scope: roleScope,
        ...filters
      }).toString();
      
      const { data } = await API.get(`/api/events/admin/all?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLogs(Array.isArray(data.events) ? data.events : []);
      setTotalPages(Number(data.totalPages) || 1);
    } catch (error) {
      console.error("Failed to fetch logs", error);
      setLogs([]);
      setFetchError(error?.response?.data?.message || "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filters, roleScope]); // Re-fetch when page, filters, or scope changes

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1); // Reset to page 1 on new search
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

      const { data, headers } = await API.get(`/api/export/events?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = getCsvFilename("events_export.csv", headers["content-disposition"]);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export logs CSV", error);
      alert("Failed to export logs CSV");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SectionCard>
      {/* Filters */}
      <form onSubmit={handleSearch} className="logs-filter-row">
        <div className="logs-filter-item">
          <label className="form-label">Event Type</label>
          <input type="text" name="eventType" placeholder="e.g. LOGIN_FAILED" value={filters.eventType} onChange={handleFilterChange} className="form-input compact-input" />
        </div>
        <div className="logs-filter-item">
          <label className="form-label">IP Address</label>
          <input type="text" name="ipAddress" placeholder="127.0.0.1" value={filters.ipAddress} onChange={handleFilterChange} className="form-input compact-input" />
        </div>
        <div className="logs-filter-item">
          <label className="form-label">Start Date</label>
          <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="form-input compact-input" />
        </div>
        <div className="logs-filter-item">
          <label className="form-label">End Date</label>
          <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="form-input compact-input" />
        </div>
        <div className="logs-filter-item logs-filter-action">
          <button type="submit" className="btn-primary compact-btn">Filter Logs</button>
        </div>
        <div className="logs-filter-item logs-filter-action">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="btn-primary compact-btn"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </form>
      <div className="log-scope-toggle">
        <button
          type="button"
          className={`btn-secondary ${roleScope === "ALL" ? "active" : ""}`}
          onClick={() => setRoleScope("ALL")}
        >
          All Logs
        </button>
        <button
          type="button"
          className={`btn-secondary ${roleScope === "ADMIN" ? "active" : ""}`}
          onClick={() => setRoleScope("ADMIN")}
        >
          Admin Logs
        </button>
        <button
          type="button"
          className={`btn-secondary ${roleScope === "USER" ? "active" : ""}`}
          onClick={() => setRoleScope("USER")}
        >
          User Logs
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>Loading logs...</div>
      ) : fetchError ? (
        <div className="error-msg" style={{ marginBottom: 0 }}>{fetchError}</div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>User</th>
                  <th>IP Address</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <tr key={log._id} style={{ verticalAlign: "middle" }}>
                      <td><span style={{ fontWeight: "500", color: "var(--text-primary)" }}>{log.eventType || "UNKNOWN_EVENT"}</span></td>
                      <td>{log.userName || log.userId?.name || log.userId || "System"}</td>
                      <td><span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px", fontSize: "0.8125rem" }}>{log.ipAddress}</span></td>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>
                        {(() => {
                          const isFailed = String(log.eventType || "").includes("FAILED");
                          return (
                        <span style={{
                          padding: "4px 12px",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          backgroundColor: isFailed ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                          color: isFailed ? "var(--danger-color)" : "var(--success-color)"
                        }}>
                          {isFailed ? "Failed" : "Success"}
                        </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>No logs found for this selection.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: 'var(--radius-md)', cursor: 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>Previous</button>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: "500" }}>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={{ padding: '0.5rem 1rem', border: '1px solid var(--border-color)', background: 'white', borderRadius: 'var(--radius-md)', cursor: 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default Logs;
