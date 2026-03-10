import { useEffect, useMemo, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import SectionCard from "../components/ui/SectionCard";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { useLocation } from "react-router-dom";
import { Doughnut } from "react-chartjs-2";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const DONUT_DEFS = [
  { key: "adminLogin", label: "Admin Login", matcher: (type) => type.includes("ADMIN_LOGIN") },
  { key: "userLogin", label: "User Login", matcher: (type) => type.includes("LOGIN_") && !type.includes("ADMIN_LOGIN") },
  { key: "registration", label: "Registration", matcher: (type) => type.includes("REGISTER") },
  {
    key: "logoutDelete",
    label: "Logout/Delete",
    matcher: (type) => type.includes("LOGOUT") || type.includes("ACCOUNT_DELETED") || type.includes("DELETE"),
  },
  {
    key: "others",
    label: "Other Events",
    matcher: (type) =>
      !(
        type.includes("ADMIN_LOGIN") ||
        (type.includes("LOGIN_") && !type.includes("ADMIN_LOGIN")) ||
        type.includes("REGISTER") ||
        type.includes("LOGOUT") ||
        type.includes("ACCOUNT_DELETED") ||
        type.includes("DELETE")
      ),
  },
];

function Logs() {
  const { API, token } = useContext(AuthContext);
  const location = useLocation();
  const [logs, setLogs] = useState([]);
  const [summaryLogs, setSummaryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({
    eventType: "",
    ipAddress: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [roleScope, setRoleScope] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState("");
  const importSessionId = useMemo(
    () => new URLSearchParams(location.search).get("importSessionId") || "",
    [location.search]
  );

  const fetchLogs = async () => {
    setLoading(true);
    setFetchError("");
    try {
      const query = new URLSearchParams({
        page,
        limit: 25,
        scope: roleScope,
        ...(importSessionId ? { importSessionId } : {}),
        ...filters,
      }).toString();

      const { data } = await API.get(`/api/events/admin/all?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
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

  const fetchSummaryLogs = async () => {
    try {
      const pageSize = 500;
      let nextPage = 1;
      let nextTotalPages = 1;
      const merged = [];

      while (nextPage <= nextTotalPages) {
        const query = new URLSearchParams({
          page: nextPage,
          limit: pageSize,
          scope: roleScope,
          ...(importSessionId ? { importSessionId } : {}),
          ...filters,
        }).toString();

        const { data } = await API.get(`/api/events/admin/all?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const chunk = Array.isArray(data?.events) ? data.events : [];
        merged.push(...chunk);
        nextTotalPages = Math.max(1, Number(data?.totalPages) || 1);
        nextPage += 1;
      }

      setSummaryLogs(merged);
    } catch (error) {
      console.error("Failed to fetch summary logs", error);
      setSummaryLogs([]);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, filters, roleScope, importSessionId]);

  useEffect(() => {
    fetchSummaryLogs();
  }, [filters, roleScope, importSessionId]);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
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

  const normalizedLogs = useMemo(
    () =>
      logs.map((log) => {
        const eventType = String(log.eventType || "UNKNOWN_EVENT").toUpperCase();
        const user = log.userName || log.userId?.name || log.userId || "System";
        const failed = eventType.includes("FAILED");
        return {
          ...log,
          _eventType: eventType,
          _user: String(user),
          _status: failed ? "Failed" : "Success",
        };
      }),
    [logs]
  );

  const normalizedSummaryLogs = useMemo(
    () =>
      summaryLogs.map((log) => {
        const eventType = String(log.eventType || "UNKNOWN_EVENT").toUpperCase();
        const user = log.userName || log.userId?.name || log.userId || "System";
        const failed = eventType.includes("FAILED");
        return {
          ...log,
          _eventType: eventType,
          _user: String(user),
          _status: failed ? "Failed" : "Success",
        };
      }),
    [summaryLogs]
  );

  const logsForDonutSummary = useMemo(
    () => (normalizedSummaryLogs.length > 0 ? normalizedSummaryLogs : normalizedLogs),
    [normalizedSummaryLogs, normalizedLogs]
  );

  const donutSummaries = useMemo(() => {
    return DONUT_DEFS.map((def) => {
      const subset = logsForDonutSummary.filter((log) => def.matcher(log._eventType));
      const success = subset.filter((log) => log._status === "Success").length;
      const failed = subset.filter((log) => log._status === "Failed").length;
      return {
        ...def,
        total: success + failed,
        success,
        failed,
      };
    });
  }, [logsForDonutSummary]);

  const selectedUserDetails = useMemo(() => {
    if (!selectedUser) return [];
    return normalizedLogs.filter((log) => log._user === selectedUser).slice(0, 8);
  }, [normalizedLogs, selectedUser]);

  const handleExportSelectedCsv = () => {
    if (!selectedUserDetails.length) return;
    const header = ["event_type", "ip_address", "location", "date", "status"];
    const rows = selectedUserDetails.map((item) => [
      item._eventType,
      item.ipAddress || "",
      item.geoLocation?.country || item.country || "LOCAL",
      new Date(item.createdAt).toISOString(),
      item._status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `selected_user_${selectedUser || "logs"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <SectionCard className="audit-logs-redesign">
      <div className="audit-layout-grid">

        <section className="audit-donut-summary">
          <div className="audit-donut-row">
            {donutSummaries.map((item) => (
              <AuditDonut key={item.key} item={item} />
            ))}
            <div className="audit-donut-legend">
              <div className="audit-donut-legend-item">
                <span className="dot success" /> Success
              </div>
              <div className="audit-donut-legend-item">
                <span className="dot failed" /> Failed
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSearch} className="audit-filter-row">
          <input
            type="text"
            name="eventType"
            placeholder="Event Type"
            value={filters.eventType}
            onChange={handleFilterChange}
            className="form-input compact-input"
          />
          <input
            type="text"
            name="ipAddress"
            placeholder="IP Address"
            value={filters.ipAddress}
            onChange={handleFilterChange}
            className="form-input compact-input"
          />
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
            className="form-input compact-input"
          />
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
            className="form-input compact-input"
          />
          <button type="submit" className="btn-secondary compact-btn">
            Filter Logs
          </button>
          <button type="button" onClick={handleExportCsv} disabled={exporting} className="btn-secondary compact-btn">
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </form>

        <div className="audit-scope-tabs">
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

        {loading ? (
          <LoadingSpinner label="Loading logs" className="audit-inline-loader" />
        ) : fetchError ? (
          <div className="error-msg" style={{ marginBottom: 0 }}>{fetchError}</div>
        ) : (
          <>
            <div className="table-container audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Event Type</th>
                    <th>User</th>
                    <th>IP Address</th>
                    <th>Location</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedLogs.length > 0 ? (
                    normalizedLogs.map((log) => (
                      <tr key={log._id}>
                        <td>{log._eventType}</td>
                        <td>
                          <button
                            type="button"
                            className="audit-user-link"
                            onClick={() => setSelectedUser(log._user)}
                            title="Show user details flow"
                          >
                            {log._user}
                          </button>
                        </td>
                        <td>
                          <span className="audit-ip-pill">{log.ipAddress}</span>
                        </td>
                        <td>{log.geoLocation?.country || log.country || "LOCAL"}</td>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <span className={`audit-status ${log._status === "Failed" ? "failed" : "success"}`}>{log._status}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="audit-empty-row">No logs found for this selection.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="audit-pagination-row">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary compact-btn"
                style={{ opacity: page <= 1 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span className="audit-page-meta">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-secondary compact-btn"
                style={{ opacity: page >= totalPages ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          </>
        )}

        <section className="audit-user-flow">
          <div className="audit-selected-user-header">
            <div className="audit-selected-user-label">Selected User</div>
            <div className="audit-selected-user-pill">{selectedUser || "No user selected"}</div>
          </div>
          <div className="audit-selected-actions">
            <button type="button" className="btn-secondary compact-btn" onClick={handleExportSelectedCsv} disabled={!selectedUserDetails.length}>
              Export Selected CSV
            </button>
          </div>
          <div className="table-container audit-selected-table-wrap">
            <table className="audit-table compact">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedUserDetails.length ? (
                  selectedUserDetails.map((item) => (
                    <tr key={`detail-${item._id}`}>
                      <td>{item._eventType}</td>
                      <td><span className="audit-ip-pill">{item.ipAddress}</span></td>
                      <td>{item.geoLocation?.country || item.country || "LOCAL"}</td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <span className={`audit-status ${item._status === "Failed" ? "failed" : "success"}`}>{item._status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="audit-empty-row">Click a username above to view details.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SectionCard>
  );
}

function AuditDonut({ item }) {
  const centerTextPlugin = {
    id: `auditDonutCenter-${item.key}`,
    beforeDraw: (chart) => {
      const { width, height, ctx } = chart;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const liveTotal = values.reduce((sum, value) => sum + Number(value || 0), 0);
      ctx.save();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 18px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(liveTotal), width / 2, height / 2 - 3);
      ctx.font = "500 10px Inter, sans-serif";
      ctx.fillStyle = "#9db2da";
      ctx.fillText("Total", width / 2, height / 2 + 13);
      ctx.restore();
    },
  };

  const data = {
    labels: ["Success", "Failed"],
    datasets: [
      {
        data: [item.success, item.failed],
        backgroundColor: ["#22c55e", "#ef4444"],
        borderWidth: 0,
      },
    ],
  };

  return (
    <article className="audit-donut-item">
      <div className="audit-donut-canvas">
        <Doughnut
          data={data}
          plugins={[centerTextPlugin]}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
          }}
        />
      </div>
      <div className="audit-donut-label">{item.label}</div>
    </article>
  );
}

export default Logs;
