import { useEffect, useMemo, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import StackedBarChart from "../components/charts/StackedBarChart";
import EventTrendLineChart from "../components/charts/EventTrendLineChart";
import AlertSeverityDonut from "../components/charts/AlertSeverityDonut";
import EventDistributionChart from "../components/charts/EventDistributionChart";
import ImportAdaptiveChart from "../components/charts/ImportAdaptiveChart";
import GeoHeatmap from "../components/charts/GeoHeatmap";
import FloatingAIAssistant from "../components/ai/FloatingAIAssistant";
import LogImportMenuPopup from "../components/LogImportMenuPopup";
import AISecurity from "./AISecurity";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { DashboardFilterProvider, useDashboardFilter } from "../context/DashboardFilterContext";
import {
  applyGlobalAlertFilter,
  applyGlobalEventFilter,
  buildAlertSeverityData,
  buildScopedStats,
  filterEventsByScopedAlerts,
  filterRiskRowsByEvents,
  toUtcDateKey,
} from "../utils/dashboardFilters";

function Dashboard({ importMode = false }) {
  return (
    <DashboardFilterProvider>
      <DashboardContent importMode={importMode} />
    </DashboardFilterProvider>
  );
}

function DashboardContent({ importMode = false }) {
  const { API, token, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    filterConditions,
    dateRange,
    pendingLogic,
    hasActiveFilter,
    setOrToggleFilter,
    removeFilterCondition,
    queueLogicOperator,
    clearPendingLogic,
    clearFilter,
    setDateRange,
  } = useDashboardFilter();

  const [stats, setStats] = useState({
    totalEvents: 0,
    loginFailures: 0,
    uniqueUsers: 0,
    recentAlerts: 0,
  });
  const [userRiskRows, setUserRiskRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userPage, setUserPage] = useState(1);
  const userPageSize = 5;
  const [userSort, setUserSort] = useState("riskAsc");
  const [activitySort, setActivitySort] = useState("dateAsc");
  const [geoSort, setGeoSort] = useState("countDesc");
  const [aiWidgets, setAiWidgets] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [importProfile, setImportProfile] = useState(null);
  const [importDetailPage, setImportDetailPage] = useState(1);
  const importDetailPageSize = 8;
  const isImportPortal = importMode || location.pathname.startsWith("/log-import");
  const hasImportSession = Boolean(new URLSearchParams(location.search).get("importSessionId"));
  const importSessionId = useMemo(
    () => (isImportPortal ? new URLSearchParams(location.search).get("importSessionId") || "" : ""),
    [isImportPortal, location.search]
  );
  const importStart = useMemo(
    () => (isImportPortal ? new URLSearchParams(location.search).get("importStart") || "" : ""),
    [isImportPortal, location.search]
  );
  const importEnd = useMemo(
    () => (isImportPortal ? new URLSearchParams(location.search).get("importEnd") || "" : ""),
    [isImportPortal, location.search]
  );

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const [statsRes, usersRes, alertsRes] = await Promise.all([
          API.get("/api/events/admin/stats", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          API.get("/api/auth/admin/users", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          API.get("/api/alerts", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const nextAlerts = Array.isArray(alertsRes?.data) ? alertsRes.data : [];
        setAlerts(nextAlerts);
        setStats({
          ...(statsRes.data || {}),
          recentAlerts: nextAlerts.length,
        });

        const users = Array.isArray(usersRes?.data?.users) ? usersRes.data.users : [];
        setUserRiskRows(
          users.map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            riskScore: Number(u.riskScore || 0),
          }))
        );
      } catch (error) {
        console.error("Failed to fetch stats", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, [API, token]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const pageSize = 500;
        let page = 1;
        let totalPages = 1;
        const merged = [];

        while (page <= totalPages) {
          const query = new URLSearchParams({
            startDate: dateRange.start,
            endDate: dateRange.end,
            limit: pageSize,
            page,
            ...(importSessionId ? { importSessionId } : {}),
          }).toString();

          const { data } = await API.get(`/api/events/admin/all?${query}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const chunk = Array.isArray(data?.events) ? data.events : [];
          merged.push(...chunk);
          totalPages = Math.max(1, Number(data?.totalPages) || 1);
          page += 1;
        }

        setAllEvents(merged);
      } catch (error) {
        console.error("Failed to fetch dashboard events", error);
        setAllEvents([]);
      }
    };

    fetchEvents();
  }, [API, token, dateRange.start, dateRange.end, importSessionId]);

  useEffect(() => {
    if (!importStart || !importEnd) return;
    setDateRange((prev) => {
      if (prev.start === importStart && prev.end === importEnd) return prev;
      return { start: importStart, end: importEnd };
    });
  }, [importStart, importEnd, setDateRange]);

  useEffect(() => {
    if (!importSessionId) {
      setUploadSummary(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem("uploadedLogImportResult");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.importSessionId === importSessionId) {
        setUploadSummary(parsed);
      }
    } catch (_error) {
      setUploadSummary(null);
    }
  }, [importSessionId]);

  useEffect(() => {
    const fetchImportProfile = async () => {
      if (!importSessionId) {
        setImportProfile(null);
        return;
      }
      try {
        const query = new URLSearchParams({
          importSessionId,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }).toString();
        const { data } = await API.get(`/api/events/admin/import-profile?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setImportProfile(data || null);
      } catch (error) {
        console.error("Failed to fetch import profile", error);
        setImportProfile(null);
      }
    };

    fetchImportProfile();
  }, [API, token, importSessionId, dateRange.start, dateRange.end]);

  const preFilteredEvents = useMemo(() => applyGlobalEventFilter(allEvents, filterConditions), [allEvents, filterConditions]);

  const alertsInDateRange = useMemo(() => {
    const inRange = (value) => {
      const key = toUtcDateKey(value);
      if (!key) return false;
      return key >= dateRange.start && key <= dateRange.end;
    };

    return alerts.filter((alert) => {
      const createdInRange = inRange(alert?.createdAt);
      const lastTriggeredInRange = inRange(alert?.lastTriggeredAt);
      if (createdInRange || lastTriggeredInRange) return true;

      // Keep records with invalid/missing timestamps rather than dropping them silently.
      return !alert?.createdAt && !alert?.lastTriggeredAt;
    });
  }, [alerts, dateRange.start, dateRange.end]);

  const preFilteredAlerts = useMemo(() => {
    if (!hasActiveFilter) return alertsInDateRange;
    return applyGlobalAlertFilter(alertsInDateRange, filterConditions, preFilteredEvents);
  }, [alertsInDateRange, filterConditions, preFilteredEvents, hasActiveFilter]);

  const filteredEvents = useMemo(() => {
    if (!hasActiveFilter) return allEvents;
    return filterEventsByScopedAlerts(preFilteredEvents, preFilteredAlerts, filterConditions);
  }, [allEvents, preFilteredEvents, preFilteredAlerts, filterConditions, hasActiveFilter]);

  const filteredAlerts = useMemo(() => {
    if (!hasActiveFilter) return alertsInDateRange;
    return applyGlobalAlertFilter(alertsInDateRange, filterConditions, filteredEvents);
  }, [alertsInDateRange, filterConditions, filteredEvents, hasActiveFilter]);

  const importedAlertFallbackSummary = useMemo(() => {
    if (!importSessionId || filteredAlerts.length > 0 || filteredEvents.length === 0) return null;
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };

    filteredEvents.forEach((event) => {
      const rawLevel = String(event?.metadata?.level || "").toUpperCase();
      if (rawLevel === "LOW" || rawLevel === "MEDIUM" || rawLevel === "HIGH" || rawLevel === "CRITICAL") {
        counts[rawLevel] += 1;
        return;
      }

      const eventType = String(event?.eventType || "").toUpperCase();
      if (eventType.includes("CRITICAL") || eventType.includes("FATAL")) counts.CRITICAL += 1;
      else if (eventType.includes("FAILED") || eventType.includes("ERROR")) counts.HIGH += 1;
      else if (eventType.includes("WARN")) counts.MEDIUM += 1;
      else counts.LOW += 1;
    });

    const labels = ["Low", "Medium", "High", "Critical"];
    const data = [counts.LOW, counts.MEDIUM, counts.HIGH, counts.CRITICAL];
    return {
      low: counts.LOW,
      medium: counts.MEDIUM,
      high: counts.HIGH,
      critical: counts.CRITICAL,
      totalAlerts: data.reduce((sum, value) => sum + value, 0),
      chartData: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: ["#3b82f6", "#f59e0b", "#f97316", "#ef4444"],
            borderWidth: 0,
          },
        ],
      },
    };
  }, [importSessionId, filteredAlerts.length, filteredEvents]);

  const effectiveAlertSummary = useMemo(
    () => importedAlertFallbackSummary || buildAlertSeverityData(filteredAlerts),
    [filteredAlerts, importedAlertFallbackSummary]
  );
  const isImportView = Boolean(importSessionId);
  const showImportOnlyUpload = isImportPortal && !hasImportSession;
  const hasEventData = filteredEvents.length > 0;
  const hasGeoData = useMemo(
    () =>
      filteredEvents.some(
        (event) =>
          Boolean(event?.geoLocation?.country) ||
          Boolean(event?.country) ||
          Boolean(event?.metadata?.country)
      ),
    [filteredEvents]
  );
  const hasAlertData = Number(effectiveAlertSummary?.totalAlerts || 0) > 0;
  const showTrendCard = !isImportView || hasEventData;
  const showActivityCard = !isImportView || hasEventData;
  const showUserCard = !isImportView;
  const showAlertCard = !isImportView || hasAlertData;
  const showGeoCard = !isImportView || hasGeoData;
  const showDistributionCard = !isImportView || hasEventData;
  const securityAlertsCount = effectiveAlertSummary.totalAlerts;
  const effectiveStats = useMemo(() => {
    const scoped = buildScopedStats(filteredEvents, filteredAlerts);
    return { ...scoped, recentAlerts: effectiveAlertSummary.totalAlerts };
  }, [filteredEvents, filteredAlerts, effectiveAlertSummary.totalAlerts]);

  const effectiveRiskRows = useMemo(
    () => filterRiskRowsByEvents(userRiskRows, filteredEvents, hasActiveFilter),
    [userRiskRows, filteredEvents, hasActiveFilter]
  );
  const sortedRiskRows = useMemo(() => {
    const rows = [...effectiveRiskRows];
    if (userSort === "riskDesc") rows.sort((a, b) => b.riskScore - a.riskScore);
    else if (userSort === "nameAsc") rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    else if (userSort === "emailAsc") rows.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    else if (userSort === "roleAsc") rows.sort((a, b) => String(a.role || "").localeCompare(String(b.role || "")));
    else rows.sort((a, b) => a.riskScore - b.riskScore);
    return rows;
  }, [effectiveRiskRows, userSort]);
  const userTotalPages = Math.max(1, Math.ceil(sortedRiskRows.length / userPageSize));
  const pagedRiskRows = useMemo(() => {
    const safePage = Math.min(userPage, userTotalPages);
    const start = (safePage - 1) * userPageSize;
    return sortedRiskRows.slice(start, start + userPageSize);
  }, [sortedRiskRows, userPage, userTotalPages]);

  const handleFilterSelect = (nextFilter) => {
    setOrToggleFilter(nextFilter);
  };

  const formatConditionLabel = (condition) => {
    if (condition.label) return condition.label;
    if (condition.field === "eventCategory") {
      const map = {
        LOGIN_SUCCESS: "Login Success",
        LOGIN_FAILED: "Login Failed",
        ADMIN_ACTION: "Admin Actions",
        OTHER_EVENTS: "Other Events",
      };
      return map[condition.value] || String(condition.value);
    }
    if (condition.field === "country") return `Location: ${condition.value}`;
    if (condition.field === "severity") return `Severity: ${condition.value}`;
    if (condition.field === "eventType") return String(condition.value);
    if (condition.field === "recentWindowMinutes") return `Last ${condition.value} min`;
    if (condition.field === "hasUser") return "User linked";
    if (condition.field === "alertsOnly") return "Alerts context";
    return `${condition.field}: ${condition.value}`;
  };

  useEffect(() => {
    setUserPage(1);
  }, [hasActiveFilter, filterConditions, dateRange.start, dateRange.end, userSort]);

  useEffect(() => {
    if (userPage > userTotalPages) setUserPage(userTotalPages);
  }, [userPage, userTotalPages]);

  const userMetaByEmail = useMemo(() => {
    const byEmail = new Map();
    filteredEvents.forEach((event) => {
      const email = String(event?.metadata?.email || event?.userId?.email || "").toLowerCase();
      if (!email) return;
      const prev = byEmail.get(email);
      const currentTs = new Date(event?.createdAt || 0).getTime();
      const prevTs = new Date(prev?.createdAt || 0).getTime();
      if (!prev || currentTs > prevTs) {
        byEmail.set(email, {
          createdAt: event?.createdAt,
          ipAddress: event?.ipAddress || "-",
        });
      }
    });
    return byEmail;
  }, [filteredEvents]);

  const importAttributeStats = useMemo(() => {
    const backendCoverage = Array.isArray(importProfile?.fieldCoverage) ? importProfile.fieldCoverage : [];
    if (backendCoverage.length) {
      return backendCoverage.map((item) => {
        const topValues = Array.isArray(importProfile?.topValuesByField?.[item.field])
          ? importProfile.topValuesByField[item.field].slice(0, 3).map((row) => [row.value, row.count])
          : [];
        return {
          key: item.field,
          count: Number(item.count || 0),
          coverage: Number(item.coverage || 0),
          uniqueValues: Number(item.uniqueValues || 0),
          topValues,
        };
      });
    }

    if (!isImportView || !filteredEvents.length) return [];

    const ignoredKeys = new Set([
      "browser",
      "rawLine",
      "message",
      "imported",
      "importTag",
      "importSessionId",
      "uploadedFileName",
      "sourceFile",
      "sourceSystem",
    ]);

    const byKey = new Map();
    filteredEvents.forEach((event) => {
      const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
      Object.entries(metadata).forEach(([key, value]) => {
        if (!key || ignoredKeys.has(key)) return;
        if (value === null || value === undefined || value === "") return;

        const safeValue = String(value);
        const current = byKey.get(key) || { key, count: 0, values: new Map() };
        current.count += 1;
        current.values.set(safeValue, (current.values.get(safeValue) || 0) + 1);
        byKey.set(key, current);
      });
    });

    return Array.from(byKey.values())
      .map((entry) => {
        const topValues = Array.from(entry.values.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        return {
          key: entry.key,
          count: entry.count,
          coverage: Math.round((entry.count / filteredEvents.length) * 100),
          uniqueValues: entry.values.size,
          topValues,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredEvents, importProfile, isImportView]);

  const importDetailColumns = useMemo(() => {
    if (!importAttributeStats.length) return [];
    const preferredOrder = ["host", "processName", "authUser", "user", "tty", "rhost", "ruser", "uid", "euid"];
    const keys = importAttributeStats.map((item) => item.key);
    const preferred = preferredOrder.filter((key) => keys.includes(key));
    const remaining = keys.filter((key) => !preferred.includes(key));
    return [...preferred, ...remaining].slice(0, 5);
  }, [importAttributeStats]);

  const importDetailRows = useMemo(() => {
    if (!isImportView || !filteredEvents.length) return [];
    return [...filteredEvents]
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
      .slice(0, 200);
  }, [filteredEvents, isImportView]);

  const importDetailTotalPages = Math.max(1, Math.ceil(importDetailRows.length / importDetailPageSize));
  const pagedImportDetailRows = useMemo(() => {
    const safePage = Math.min(importDetailPage, importDetailTotalPages);
    const start = (safePage - 1) * importDetailPageSize;
    return importDetailRows.slice(start, start + importDetailPageSize);
  }, [importDetailPage, importDetailRows, importDetailTotalPages, importDetailPageSize]);

  useEffect(() => {
    setImportDetailPage(1);
  }, [importSessionId, dateRange.start, dateRange.end, filteredEvents.length]);

  useEffect(() => {
    if (importDetailPage > importDetailTotalPages) setImportDetailPage(importDetailTotalPages);
  }, [importDetailPage, importDetailTotalPages]);

  const importPrimaryRecommendation = useMemo(
    () => importProfile?.chartRecommendations?.[0] || null,
    [importProfile]
  );

  const handleAddAiWidget = (feature) => {
    if (!feature) return;
    setAiWidgets((prev) => [...prev, { id: `${feature}-${Date.now()}-${Math.random()}`, feature }]);
  };

  const removeAiWidget = (id) => {
    setAiWidgets((prev) => prev.filter((item) => item.id !== id));
  };

  const handleLogFileVisualized = ({ importSessionId: nextSessionId, importStart: nextStart, importEnd: nextEnd }) => {
    if (!nextSessionId) return;
    const params = new URLSearchParams({
      importSessionId: nextSessionId,
      ...(nextStart ? { importStart: nextStart } : {}),
      ...(nextEnd ? { importEnd: nextEnd } : {}),
    }).toString();

    setMenuOpen(false);
    clearFilter();
    navigate(`/log-import?${params}`);
  };

  const handleKpiFilter = (key) => {
    if (key === "totalEvents") {
      clearFilter();
      return;
    }
    if (key === "failedLogins") {
      setOrToggleFilter({
        source: "kpiCard",
        eventCategory: "LOGIN_FAILED",
        label: "Failed logins",
      });
      return;
    }
    if (key === "uniqueUsers") {
      setOrToggleFilter({
        source: "kpiCard",
        hasUser: true,
        label: "User linked events",
      });
      return;
    }
    if (key === "securityAlerts") {
      setOrToggleFilter({
        source: "kpiCard",
        alertsOnly: true,
        label: "Security alerts context",
      });
    }
  };

  if (loading) return <LoadingSpinner label="Loading dashboard" className="page-loader" />;

  return (
    <div className={`dashboard-page dashboard-redesign ${menuOpen ? "menu-open" : ""}`}>
      <div className="dashboard-top-shell">
        <button type="button" className="dashboard-menu-icon fixed-top-left" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          {"\u2630"}
        </button>
        <div className="dashboard-top-filterbar">
        <div className="dashboard-top-filter-center">
          <div className="dashboard-top-filter-label">Global Filter</div>
          <div className="dashboard-filter-chip-wrap">
            {filterConditions.length === 0 && <div className="dashboard-filter-empty">No filters applied</div>}
            {filterConditions.map((condition, index) => (
              <div key={`${condition.field}-${condition.value}-${index}`} className="dashboard-filter-chip">
                {index > 0 && <span className="dashboard-filter-chip-logic">{condition.logic}</span>}
                <span>{formatConditionLabel(condition)}</span>
                <button
                  type="button"
                  onClick={() => removeFilterCondition(index)}
                  className="dashboard-filter-chip-remove"
                  aria-label={`Remove ${formatConditionLabel(condition)}`}
                >
                  &times;
                </button>
              </div>
            ))}
            {pendingLogic && <div className="dashboard-filter-pending">Next: {pendingLogic}</div>}
          </div>
        </div>
        <div className="dashboard-top-filter-right">
          <div className="date-range">
            <input
              type="date"
              className="form-input date-input"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            />
            <span>-</span>
            <input
              type="date"
              className="form-input date-input"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            />
          </div>
          <div className="dashboard-filterbar-actions compact-icons">
            <button type="button" className="btn btn-secondary icon-btn" onClick={() => queueLogicOperator("AND")} title="AND">
              &
            </button>
            <button type="button" className="btn btn-secondary icon-btn" onClick={() => queueLogicOperator("OR")} title="OR">
              |
            </button>
            {pendingLogic && (
              <button type="button" className="btn btn-secondary icon-btn" onClick={clearPendingLogic} title="Cancel next">
                ×
              </button>
            )}
            <button type="button" className="btn btn-secondary icon-btn" onClick={clearFilter} title="Reset filter">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
        </div>
        </div>
      </div>

      {uploadSummary && (
        <div className="dashboard-upload-summary">
          Imported file: <strong>{uploadSummary.fileName || "uploaded log"}</strong>
          {" | "}
          Events: <strong>{uploadSummary.importedCount || 0}</strong>
          {" | "}
          Skipped: <strong>{uploadSummary.skippedCount || 0}</strong>
        </div>
      )}

      {isImportPortal && !importSessionId && (
        <section className="dash-card log-import-page-upload">
          <div className="dash-card-header">
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600" }}>
              Upload Your Log File
            </h3>
          </div>
          <LogImportMenuPopup onVisualized={handleLogFileVisualized} inline />
        </section>
      )}

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

      {!showImportOnlyUpload && <div className="kpi-row kpi-row-4">
        <StatCard
          title="Total Events"
          value={effectiveStats.totalEvents}
          color="#3b82f6"
          onClick={() => handleKpiFilter("totalEvents")}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          }
        />
        <StatCard
          title="Failed Logins"
          value={effectiveStats.loginFailures}
          color="#ef4444"
          onClick={() => handleKpiFilter("failedLogins")}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          }
        />
        <StatCard
          title="Unique Users"
          value={effectiveStats.uniqueUsers}
          color="#10b981"
          onClick={() => handleKpiFilter("uniqueUsers")}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          }
        />
        <Link to="/alerts" style={{ textDecoration: "none" }} onClick={(e) => e.preventDefault()}>
          <StatCard
            title="Security Alerts"
            value={securityAlertsCount}
            color="#f59e0b"
            onClick={() => handleKpiFilter("securityAlerts")}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            }
          />
        </Link>
      </div>}

      {!showImportOnlyUpload && <div className="admin-dashboard">
        {showTrendCard && (
        <section className="dashboard-grid-row-line">
          <article className="dash-card">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                Event Trend Line Chart
              </h3>
            </div>
            <div className="chart-area">
              <EventTrendLineChart
                dateRange={dateRange}
                eventsOverride={filteredEvents}
                onFilterSelect={handleFilterSelect}
              />
            </div>
          </article>
        </section>
        )}

        {isImportView && showActivityCard && showAlertCard && (
          <section className="dashboard-grid-row-import-main">
            <article className="dash-card row-main-activity">
              <div className="dash-card-header">
                <h3
                  style={{
                    margin: 0,
                    color: "var(--text-primary)",
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Event Activity Bar Chart
                </h3>
                <select
                  className="form-input compact-input dashboard-sort-select"
                  value={activitySort}
                  onChange={(e) => setActivitySort(e.target.value)}
                >
                  <option value="dateAsc">Sort: Date (Old-New)</option>
                  <option value="dateDesc">Sort: Date (New-Old)</option>
                  <option value="countDesc">Sort: Event Count (High-Low)</option>
                  <option value="countAsc">Sort: Event Count (Low-High)</option>
                </select>
              </div>
              <div className="chart-area">
                <StackedBarChart
                  dateRange={dateRange}
                  eventsOverride={filteredEvents}
                  onFilterSelect={handleFilterSelect}
                  sortMode={activitySort}
                />
              </div>
            </article>

            <article className="dash-card row3-alerts">
              <div className="dash-card-header">
                <h3
                  style={{
                    margin: 0,
                    color: "var(--text-primary)",
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Alert Severity
                </h3>
              </div>
              <div className="chart-area">
                <AlertSeverityDonut
                  alertsOverride={filteredAlerts}
                  summaryOverride={effectiveAlertSummary}
                  onFilterSelect={handleFilterSelect}
                />
              </div>
            </article>
          </section>
        )}

        {(!isImportView && (showActivityCard || showUserCard)) && (
        <section className={`dashboard-grid-row-main ${!showUserCard ? "single-column" : ""}`}>
          {showActivityCard && <article className="dash-card row-main-activity">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                Event Activity Bar Chart
              </h3>
              <select
                className="form-input compact-input dashboard-sort-select"
                value={activitySort}
                onChange={(e) => setActivitySort(e.target.value)}
              >
                <option value="dateAsc">Sort: Date (Old-New)</option>
                <option value="dateDesc">Sort: Date (New-Old)</option>
                <option value="countDesc">Sort: Event Count (High-Low)</option>
                <option value="countAsc">Sort: Event Count (Low-High)</option>
              </select>
            </div>
            <div className="chart-area">
              <StackedBarChart
                dateRange={dateRange}
                eventsOverride={filteredEvents}
                onFilterSelect={handleFilterSelect}
                sortMode={activitySort}
              />
            </div>
          </article>}

          {showUserCard && <article className="dash-card row-main-users">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                User Details
              </h3>
              <select
                className="form-input compact-input dashboard-sort-select"
                value={userSort}
                onChange={(e) => setUserSort(e.target.value)}
              >
                <option value="riskAsc">Sort: Risk (Low-High)</option>
                <option value="riskDesc">Sort: Risk (High-Low)</option>
                <option value="nameAsc">Sort: User Name</option>
                <option value="emailAsc">Sort: Email</option>
                <option value="roleAsc">Sort: Role</option>
              </select>
            </div>
            <div className="table-container user-table-compact">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>IP Address</th>
                    <th>Last Activity</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRiskRows.length ? (
                    pagedRiskRows.map((row) => {
                      const meta = userMetaByEmail.get(String(row.email || "").toLowerCase()) || {};
                      return (
                        <tr key={row._id}>
                          <td>{row.name}</td>
                          <td>{meta.ipAddress || "-"}</td>
                          <td>{meta.createdAt ? new Date(meta.createdAt).toLocaleString() : "-"}</td>
                          <td>
                            <span
                              style={{
                                padding: "4px 10px",
                                borderRadius: "9999px",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                background:
                                  row.riskScore >= 80
                                    ? "#1665342b"
                                    : row.riskScore >= 60
                                      ? "#92400e2b"
                                      : row.riskScore >= 40
                                        ? "#9a34122b"
                                        : "#991b1b2b",
                                color:
                                  row.riskScore >= 80
                                    ? "#86efac"
                                    : row.riskScore >= 60
                                      ? "#fcd34d"
                                      : row.riskScore >= 40
                                        ? "#fdba74"
                                        : "#fca5a5",
                              }}
                            >
                              {row.riskScore}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {effectiveRiskRows.length > 0 && (
              <div className="dashboard-pagination">
                <div className="dashboard-pagination-meta">
                  Page {userPage} of {userTotalPages} ({sortedRiskRows.length} users)
                </div>
                <div className="dashboard-pagination-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={userPage >= userTotalPages}
                    onClick={() => setUserPage((prev) => Math.min(userTotalPages, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </article>
          }
        </section>
        )}

        {(!isImportView && (showAlertCard || showGeoCard)) && (
        <section className={`dashboard-grid-row3 ${(!showAlertCard || !showGeoCard) ? "single-column" : ""}`}>
          {showAlertCard && <article className="dash-card row3-alerts">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                Alert Severity
              </h3>
            </div>
            <div className="chart-area">
              <AlertSeverityDonut
                alertsOverride={filteredAlerts}
                summaryOverride={effectiveAlertSummary}
                onFilterSelect={handleFilterSelect}
              />
            </div>
          </article>}
          {showGeoCard && <article className="dash-card row3-heatmap">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                Geo Activity Heatmap
              </h3>
              <select
                className="form-input compact-input dashboard-sort-select"
                value={geoSort}
                onChange={(e) => setGeoSort(e.target.value)}
              >
                <option value="countDesc">Sort: Activity (High-Low)</option>
                <option value="countAsc">Sort: Activity (Low-High)</option>
                <option value="countryAsc">Sort: Location (A-Z)</option>
                <option value="countryDesc">Sort: Location (Z-A)</option>
              </select>
            </div>
            <GeoHeatmap
              dateRange={dateRange}
              eventsOverride={filteredEvents}
              onFilterSelect={handleFilterSelect}
              sortMode={geoSort}
            />
          </article>}
        </section>
        )}

        {!isImportView && showDistributionCard && (
        <section className={`dashboard-grid-row4 ${isImportView ? "import-view" : ""}`}>
          <article className={`dash-card row4-distribution ${isImportView ? "import-distribution-card" : ""}`}>
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                {isImportView && importPrimaryRecommendation?.title
                  ? importPrimaryRecommendation.title
                  : "Event Type Distribution"}
              </h3>
            </div>
            <div className="chart-area distribution-chart-area">
              {isImportView && importPrimaryRecommendation ? (
                <ImportAdaptiveChart profile={importProfile} />
              ) : (
                <EventDistributionChart
                  eventsOverride={filteredEvents}
                  onFilterSelect={handleFilterSelect}
                />
              )}
            </div>
          </article>
        </section>
        )}

        {isImportView && hasEventData && (
          <section className="dashboard-grid-row-import">
            <article className="dash-card import-attr-card">
              <div className="dash-card-header">
                <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>
                  Parsed Log Attributes
                </h3>
              </div>
              <div className="table-container import-attr-summary-wrap">
                <table className="import-attr-summary-table">
                  <thead>
                    <tr>
                      <th>Attribute</th>
                      <th>Coverage</th>
                      <th>Unique Values</th>
                      <th>Top Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importAttributeStats.length ? (
                      importAttributeStats.slice(0, 12).map((item) => (
                        <tr key={item.key}>
                          <td>{item.key}</td>
                          <td>{item.coverage}% ({item.count})</td>
                          <td>{item.uniqueValues}</td>
                          <td>{item.topValues.map(([value, count]) => `${value} (${count})`).join(", ") || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                          No parsed attributes found in this import session.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="dash-card import-attr-card">
              <div className="dash-card-header">
                <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1.125rem", fontWeight: "600", letterSpacing: "-0.01em" }}>
                  Import Event Details
                </h3>
              </div>
              <div className="table-container import-attr-detail-wrap">
                <table className="import-attr-detail-table">
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Timestamp</th>
                      <th>IP</th>
                      {importDetailColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importDetailRows.length ? (
                      pagedImportDetailRows.map((event) => (
                        <tr key={`import-detail-${event._id}`}>
                          <td>{event?.eventType || "-"}</td>
                          <td>{event?.createdAt ? new Date(event.createdAt).toLocaleString() : "-"}</td>
                          <td>{event?.ipAddress || "-"}</td>
                          {importDetailColumns.map((column) => (
                            <td
                              key={`${event._id}-${column}`}
                              className={column === "processName" ? "import-col-process" : ""}
                              title={event?.metadata?.[column] ? String(event.metadata[column]) : ""}
                            >
                              {event?.metadata?.[column] ? String(event.metadata[column]) : "-"}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3 + importDetailColumns.length} style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                          No imported event rows to display.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {importDetailRows.length > 0 && (
                <div className="dashboard-pagination import-detail-pagination">
                  <div className="dashboard-pagination-meta">
                    Page {importDetailPage} of {importDetailTotalPages} ({importDetailRows.length} rows)
                  </div>
                  <div className="dashboard-pagination-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={importDetailPage <= 1}
                      onClick={() => setImportDetailPage((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={importDetailPage >= importDetailTotalPages}
                      onClick={() => setImportDetailPage((prev) => Math.min(importDetailTotalPages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </article>
          </section>
        )}

        {isImportView && showDistributionCard && (
        <section className="dashboard-grid-row4 import-view">
          <article className="dash-card row4-distribution import-distribution-card">
            <div className="dash-card-header">
              <h3
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                  fontSize: "1.125rem",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                }}
              >
                {importPrimaryRecommendation?.title || "Status Split"}
              </h3>
            </div>
            <div className="chart-area distribution-chart-area">
              {importPrimaryRecommendation ? (
                <ImportAdaptiveChart profile={importProfile} />
              ) : (
                <EventDistributionChart
                  eventsOverride={filteredEvents}
                  onFilterSelect={handleFilterSelect}
                />
              )}
            </div>
          </article>
        </section>
        )}

        {aiWidgets.length > 0 && (
          <section className="dashboard-ai-grid">
            {aiWidgets.map((widget) => (
              <article key={widget.id} className="dash-card ai-widget-card">
                <div className="dash-card-header">
                  <h3 style={{ margin: 0, color: "var(--text-primary)", fontSize: "1rem", fontWeight: "600" }}>
                    AI Widget: {widget.feature}
                  </h3>
                  <button type="button" className="btn btn-secondary compact-btn" onClick={() => removeAiWidget(widget.id)}>
                    Remove
                  </button>
                </div>
                <AISecurity mode="widget" activeFeature={widget.feature} />
              </article>
            ))}
          </section>
        )}
      </div>}
      <FloatingAIAssistant onAddWidget={handleAddAiWidget} />
    </div>
  );
}

function StatCard({ title, value, color, icon, onClick }) {
  const sparkline = useMemo(() => {
    const seed = Number(value || 0);
    const points = Array.from({ length: 12 }, (_, idx) => {
      const base = 6 + ((seed + idx * 7) % 10);
      const y = 22 - base;
      return `${idx * 9},${y}`;
    }).join(" ");
    return { points };
  }, [value]);

  return (
    <div
      className="card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "start", cursor: onClick ? "pointer" : "default" }}
    >
      <div>
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.8125rem",
            fontWeight: "500",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.5rem",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "1.875rem", fontWeight: "700", color: "#ffffff", lineHeight: "1" }}>
          {value}
        </div>
        <div className="kpi-sparkline-wrap">
          <svg viewBox="0 0 100 24" className="kpi-sparkline" aria-hidden="true">
            <polyline fill="none" stroke={color} strokeWidth="2" points={sparkline.points} />
          </svg>
        </div>
      </div>
      <div style={{ color: color, background: `${color}20`, padding: "10px", borderRadius: "var(--radius-md)" }}>
        {icon}
      </div>
    </div>
  );
}

export default Dashboard;




