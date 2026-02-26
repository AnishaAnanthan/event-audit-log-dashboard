import { useContext, useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import SectionCard from "../components/ui/SectionCard";
import { AuthContext } from "../context/AuthContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

function AISecurity() {
  const { API, token } = useContext(AuthContext);

  const [insightQuery, setInsightQuery] = useState("Show risk spikes this week.");
  const [insightResult, setInsightResult] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [showInsightChart, setShowInsightChart] = useState(false);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState("");

  const [alertId, setAlertId] = useState("");
  const [alertOptions, setAlertOptions] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [approveResolution, setApproveResolution] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState("");

  const canSubmitQuery = useMemo(() => query.trim().length > 0 && query.trim().length <= 2000, [query]);
  const canSubmitInsight = useMemo(
    () => insightQuery.trim().length > 0 && insightQuery.trim().length <= 2000,
    [insightQuery]
  );
  const canSubmitTriage = useMemo(() => alertId.trim().length === 24, [alertId]);

  const fetchActiveAlerts = async () => {
    setAlertsLoading(true);
    try {
      const { data } = await API.get("/api/alerts?status=ACTIVE", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlertOptions(Array.isArray(data) ? data : []);
      if (!alertId && Array.isArray(data) && data[0]?._id) {
        setAlertId(data[0]._id);
      }
    } catch (_error) {
      setAlertOptions([]);
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchThreatSummary = async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const { data } = await API.get("/api/ai/threat-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSummary(data);
    } catch (error) {
      setSummaryError(error?.response?.data?.message || "Failed to fetch threat summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchThreatSummary();
    fetchActiveAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateInsights = async (e) => {
    e.preventDefault();
    if (!canSubmitInsight) return;

    setInsightLoading(true);
    setInsightError("");
    setInsightResult(null);
    setShowInsightChart(false);

    try {
      const { data } = await API.post(
        "/api/ai/insight-cards",
        { query: insightQuery.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInsightResult(data);
    } catch (error) {
      setInsightError(error?.response?.data?.message || "Failed to generate insight cards");
    } finally {
      setInsightLoading(false);
    }
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!canSubmitQuery) return;
    setQueryLoading(true);
    setQueryError("");
    setQueryResult(null);
    try {
      const { data } = await API.post(
        "/api/ai/query",
        { query: query.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setQueryResult(data);
    } catch (error) {
      setQueryError(error?.response?.data?.message || "AI query failed");
    } finally {
      setQueryLoading(false);
    }
  };

  const handleTriage = async (e) => {
    e.preventDefault();
    if (!canSubmitTriage) return;
    setTriageLoading(true);
    setTriageError("");
    setTriageResult(null);
    try {
      const { data } = await API.post(
        `/api/ai/triage-alert/${alertId.trim()}`,
        { approveResolution },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTriageResult(data);
    } catch (error) {
      setTriageError(error?.response?.data?.message || "Alert triage failed");
    } finally {
      setTriageLoading(false);
    }
  };

  return (
    <div className="ai-security-grid ai-page ai-cards-grid">
      <div className="ai-card-slot">
      <SectionCard title="AI Insight Cards">
        <form onSubmit={handleGenerateInsights} className="ai-form-grid">
          <textarea
            value={insightQuery}
            onChange={(e) => setInsightQuery(e.target.value)}
            placeholder="Ask: Show risk spikes this week."
            rows={3}
            className="form-input"
            style={{ resize: "vertical", minHeight: 96 }}
          />
          <div className="ai-form-footer">
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              {insightQuery.length}/2000 chars
            </span>
            <button
              type="submit"
              className="btn-primary"
              style={{ maxWidth: 220 }}
              disabled={!canSubmitInsight || insightLoading}
            >
              {insightLoading ? "Analyzing..." : "Get Insights"}
            </button>
          </div>
        </form>
        {insightError && <div className="error-msg" style={{ marginTop: "0.75rem" }}>{insightError}</div>}
        {insightResult && (
          <div className="ai-response-card" style={{ marginTop: "1rem" }}>
            <div className="ai-k">Top Findings</div>
            <ul style={{ margin: "0.5rem 0 0.75rem", paddingLeft: "1.1rem" }}>
              {(insightResult.findings || []).map((finding, idx) => (
                <li key={`${idx}-${finding}`}>{finding}</li>
              ))}
            </ul>

            <div className="ai-k">Suggested Chart</div>
            <p style={{ margin: "0.5rem 0 0.5rem" }}>
              <strong>{insightResult?.suggestedChart?.title || "Risk Trend"}</strong>
              {" - "}
              {String(insightResult?.suggestedChart?.type || "line").toUpperCase()}
            </p>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              {insightResult?.suggestedChart?.reason || "Generated from current audit context."}
            </p>

            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: "0.75rem" }}
              onClick={() => setShowInsightChart((value) => !value)}
            >
              {showInsightChart ? "Hide Chart" : "Generate Chart"}
            </button>

            {showInsightChart && (
              <InsightChartRenderer
                type={insightResult?.suggestedChart?.type}
                chartData={insightResult?.chartData}
              />
            )}

            <ToolUsage tools={insightResult.toolsUsed} />
          </div>
        )}
      </SectionCard>
      </div>

      <div className="ai-card-slot">
      <SectionCard
        title="AI Threat Summary"
        right={
          <button className="btn-secondary" onClick={fetchThreatSummary} disabled={summaryLoading}>
            {summaryLoading ? "Refreshing..." : "Refresh"}
          </button>
        }
      >
        {summaryLoading && (
          <div className="ai-inline-loader-wrap">
            <span className="ai-inline-loader" />
          </div>
        )}
        {summaryError && <div className="error-msg">{summaryError}</div>}
        {!summaryLoading && !summaryError && summary && (
          <div className="ai-response-card">
            <div className="ai-kv">
              <span className="ai-k">Risk Level</span>
              <span className={`risk-chip risk-${String(summary.risk_level || "MEDIUM").toLowerCase()}`}>
                {summary.risk_level}
              </span>
            </div>
            <p style={{ margin: "0.5rem 0 0.75rem", lineHeight: 1.6 }}>{summary.summary}</p>
            <div>
              <div className="ai-k">Recommendations</div>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                {(summary.recommendations || []).map((rec, idx) => (
                  <li key={`${idx}-${rec}`}>{rec}</li>
                ))}
              </ul>
            </div>
            <ToolUsage tools={summary.toolsUsed} />
          </div>
        )}
      </SectionCard>
      </div>

      <div className="ai-card-slot">
      <SectionCard title="AI Log Query Assistant">
        <form onSubmit={handleQuery} className="ai-form-grid">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask: Show failed admin logins in last 48 hours and explain risk."
            rows={4}
            className="form-input"
            style={{ resize: "vertical", minHeight: 110 }}
          />
          <div className="ai-form-footer">
            <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
              {query.length}/2000 chars
            </span>
            <button type="submit" className="btn-primary" style={{ maxWidth: 220 }} disabled={!canSubmitQuery || queryLoading}>
              {queryLoading ? "Analyzing..." : "Run AI Query"}
            </button>
          </div>
        </form>
        {queryError && <div className="error-msg" style={{ marginTop: "0.75rem" }}>{queryError}</div>}
        {queryResult && (
          <div className="ai-response-card" style={{ marginTop: "1rem" }}>
            <div className="ai-k">Response</div>
            <p style={{ marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>{normalizeAiText(queryResult.response)}</p>
            {queryResult.riskInterpretation && (
              <>
                <div className="ai-k">Risk Interpretation</div>
                <p style={{ marginTop: "0.4rem" }}>{queryResult.riskInterpretation}</p>
              </>
            )}
            {queryResult.data && (
              <>
                <div className="ai-k">Data Snapshot</div>
                <QueryDataTable data={queryResult.data} />
              </>
            )}
            <ToolUsage tools={queryResult.toolsUsed} />
          </div>
        )}
      </SectionCard>
      </div>

      <div className="ai-card-slot">
      <SectionCard title="AI Alert Triage">
        <form onSubmit={handleTriage} className="ai-form-grid">
          <select
            value={alertId}
            onChange={(e) => setAlertId(e.target.value)}
            className="form-input ai-triage-select"
          >
            {alertOptions.length === 0 ? (
              <option value="">{alertsLoading ? "Loading active alerts..." : "No active alerts found"}</option>
            ) : (
              alertOptions.map((alert) => (
                <option key={alert._id} value={alert._id}>
                  {formatAlertOptionLabel(alert)}
                </option>
              ))
            )}
          </select>
          <input type="text" value={alertId} readOnly className="form-input" />
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)" }}>
            <input
              type="checkbox"
              checked={approveResolution}
              onChange={(e) => setApproveResolution(e.target.checked)}
            />
            Approve resolution after triage (admin only)
          </label>
          <button type="submit" className="btn-primary" style={{ maxWidth: 240 }} disabled={!canSubmitTriage || triageLoading}>
            {triageLoading ? "Triaging..." : "Run Alert Triage"}
          </button>
        </form>
        {triageError && <div className="error-msg" style={{ marginTop: "0.75rem" }}>{triageError}</div>}
        {triageResult && (
          <div className="ai-response-card" style={{ marginTop: "1rem" }}>
            <div className="ai-k">Classification</div>
            <div style={{ marginBottom: "0.75rem" }}>
              <span className={`risk-chip risk-${String(triageResult?.triage?.severity_classification || "medium").toLowerCase()}`}>
                {triageResult?.triage?.severity_classification}
              </span>
            </div>
            <div className="ai-k">Explanation</div>
            <p style={{ marginTop: "0.4rem" }}>{triageResult?.triage?.explanation}</p>
            <div className="ai-k">Recommended Action</div>
            <p style={{ marginTop: "0.4rem" }}>{triageResult?.triage?.recommended_action}</p>
            {triageResult?.resolved && (
              <div className="success-msg" style={{ marginTop: "0.75rem" }}>
                Alert resolved by AI workflow.
              </div>
            )}
            <ToolUsage tools={triageResult.toolsUsed} />
          </div>
        )}
      </SectionCard>
      </div>
    </div>
  );
}

function InsightChartRenderer({ type, chartData }) {
  const labels = Array.isArray(chartData?.labels) ? chartData.labels : [];
  const dataset = Array.isArray(chartData?.datasets) ? chartData.datasets[0] : null;
  const values = Array.isArray(dataset?.data) ? dataset.data : [];
  if (!labels.length || !values.length) {
    return <div style={{ marginTop: "0.75rem", color: "var(--text-secondary)" }}>No chart data available.</div>;
  }

  const baseData = {
    labels,
    datasets: [
      {
        label: dataset?.label || "Value",
        data: values,
        borderColor: "#2563eb",
        backgroundColor: type === "doughnut" ? [
          "#2563eb",
          "#10b981",
          "#f59e0b",
          "#ef4444",
          "#7c3aed",
          "#0ea5e9",
          "#64748b",
        ] : "rgba(37, 99, 235, 0.2)",
        fill: type === "line",
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: "bottom" } },
  };

  return (
    <div style={{ marginTop: "0.9rem", height: 280 }}>
      {type === "bar" && <Bar data={baseData} options={options} />}
      {type === "doughnut" && <Doughnut data={baseData} options={options} />}
      {type !== "bar" && type !== "doughnut" && <Line data={baseData} options={options} />}
    </div>
  );
}

function QueryDataTable({ data }) {
  const records = Array.isArray(data?.records) ? data.records : [];

  if (!records.length) {
    return <div style={{ marginTop: "0.45rem", color: "var(--text-secondary)" }}>No records found for this query.</div>;
  }

  const getEmail = (row) => {
    const fromMetadata = row?.metadata && typeof row.metadata === "object" ? row.metadata.email : "";
    return fromMetadata || "N/A";
  };

  const getReason = (row) => {
    const fromMetadata =
      row?.metadata && typeof row.metadata === "object" ? row.metadata.reason || row.metadata.message : "";
    return fromMetadata || "-";
  };

  return (
    <div className="table-container" style={{ marginTop: "0.5rem" }}>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Event</th>
            <th>Email</th>
            <th>IP</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 30).map((row) => (
            <tr key={row._id}>
              <td>{row?.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
              <td>{row?.eventType || "-"}</td>
              <td>{getEmail(row)}</td>
              <td>{row?.ipAddress || "-"}</td>
              <td>{getReason(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function normalizeAiText(value) {
  const raw = String(value || "");
  return raw
    .replace(/\*\*/g, "")
    .replace(/^\s*\*\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatAlertOptionLabel(alert) {
  const type = String(alert?.type || "ALERT").replaceAll("_", " ");
  const targetRaw = String(alert?.email || alert?.ipAddress || "Unknown");
  const target = targetRaw.length > 26 ? `${targetRaw.slice(0, 23)}...` : targetRaw;
  const severity = String(alert?.severity || "MEDIUM");
  return `${type} - ${target} - ${severity}`;
}

function ToolUsage({ tools = [] }) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  return (
    <div style={{ marginTop: "0.8rem" }}>
      <div className="ai-k">Tools Used</div>
      <div className="tool-chip-wrap">
        {tools.map((tool, idx) => (
          <span key={`${idx}-${tool.toolName}`} className="tool-chip">
            {tool.toolName}
          </span>
        ))}
      </div>
    </div>
  );
}

export default AISecurity;

