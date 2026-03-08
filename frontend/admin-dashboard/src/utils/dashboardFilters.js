const LOGIN_SUCCESS_TYPES = new Set(["LOGIN_SUCCESS", "ADMIN_LOGIN_SUCCESS", "GOOGLE_LOGIN_SUCCESS", "ADMIN_GOOGLE_LOGIN_SUCCESS"]);
const LOGIN_FAILED_TYPES = new Set(["LOGIN_FAILED", "ADMIN_LOGIN_FAILED"]);
const EVENT_FIELDS = new Set(["eventType", "eventCategory", "date", "country", "hasUser", "recentWindowMinutes"]);
const ALERT_FIELDS = new Set(["severity", "date", "recentWindowMinutes"]);

const toConditions = (conditions) => {
  if (!conditions) return [];
  if (Array.isArray(conditions)) return conditions;
  return Object.entries(conditions)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([field, value], index) => ({ field, operator: "=", value, logic: index === 0 ? "AND" : "AND" }));
};

const evaluateWithLogic = (conditions, evaluator) => {
  if (!conditions.length) return true;
  return conditions.reduce((acc, condition, index) => {
    const match = evaluator(condition);
    if (index === 0) return match;
    return condition.logic === "OR" ? (acc || match) : (acc && match);
  }, true);
};

export const toUtcDateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

export const getEventCategory = (eventType = "") => {
  const normalized = String(eventType).toUpperCase();
  if (LOGIN_SUCCESS_TYPES.has(normalized) || normalized.includes("LOGIN_SUCCESS")) return "LOGIN_SUCCESS";
  if (LOGIN_FAILED_TYPES.has(normalized) || normalized.includes("LOGIN_FAILED")) return "LOGIN_FAILED";
  if (normalized.startsWith("ADMIN_") || normalized.includes("ADMIN")) return "ADMIN_ACTION";
  return "OTHER_EVENTS";
};

export const applyGlobalEventFilter = (events = [], conditions = null) => {
  const normalized = toConditions(conditions).filter((condition) => EVENT_FIELDS.has(condition.field));
  if (!normalized.length) return events;
  const now = Date.now();

  return events.filter((event) => {
    const eventType = String(event?.eventType || "").toUpperCase();
    const eventCategory = getEventCategory(eventType);
    const eventDate = toUtcDateKey(event?.createdAt);
    const eventCountry = String(event?.geoLocation?.country || event?.country || "").toUpperCase();
    const hasUserRef = Boolean(event?.userId?._id || event?.userId || event?.metadata?.email || event?.userName);
    const eventTs = new Date(event?.createdAt).getTime();

    return evaluateWithLogic(normalized, (condition) => {
      if (condition.field === "eventType") return eventType === String(condition.value).toUpperCase();
      if (condition.field === "eventCategory") return eventCategory === condition.value;
      if (condition.field === "date") return eventDate === condition.value;
      if (condition.field === "country") return eventCountry === String(condition.value).toUpperCase();
      if (condition.field === "hasUser") return condition.value ? hasUserRef : !hasUserRef;
      if (condition.field === "recentWindowMinutes") {
        const windowMs = Number(condition.value) * 60 * 1000;
        return !Number.isNaN(eventTs) && eventTs >= now - windowMs;
      }
      return true;
    });
  });
};

export const applyGlobalAlertFilter = (alerts = [], conditions = null, scopedEvents = []) => {
  const normalized = toConditions(conditions);
  if (!normalized.length) return alerts;
  const alertConditions = normalized.filter((condition) => ALERT_FIELDS.has(condition.field));
  const relationConditions = normalized.filter((condition) => !ALERT_FIELDS.has(condition.field));
  const now = Date.now();

  const eventEmails = new Set(
    scopedEvents
      .map((event) => String(event?.metadata?.email || event?.userId?.email || "").toLowerCase())
      .filter(Boolean)
  );

  const eventIps = new Set(scopedEvents.map((event) => String(event?.ipAddress || "")).filter(Boolean));

  return alerts.filter((alert) => {
    const severity = String(alert?.severity || "").toUpperCase();
    const alertDate = toUtcDateKey(alert?.createdAt || alert?.lastTriggeredAt);
    const alertTs = new Date(alert?.lastTriggeredAt || alert?.createdAt).getTime();
    const alertEmail = String(alert?.email || "").toLowerCase();
    const alertIp = String(alert?.ipAddress || "");
    const linkedToScopedEvents = scopedEvents.length
      ? (eventEmails.has(alertEmail) || eventIps.has(alertIp))
      : true;

    return evaluateWithLogic(normalized, (condition) => {
      if (condition.field === "severity") return severity === String(condition.value).toUpperCase();
      if (condition.field === "date") return alertDate === condition.value;
      if (condition.field === "recentWindowMinutes") {
        const windowMs = Number(condition.value) * 60 * 1000;
        return !Number.isNaN(alertTs) && alertTs >= now - windowMs;
      }
      if (relationConditions.length) return linkedToScopedEvents;
      return true;
    });
  });
};

export const filterEventsByScopedAlerts = (events = [], alerts = [], conditions = null) => {
  const normalized = toConditions(conditions);
  const needsAlertRelation = normalized.some((condition) => ["severity", "alertsOnly"].includes(condition.field));
  if (!needsAlertRelation) return events;
  if (!alerts.length) return [];

  const alertEmails = new Set(alerts.map((alert) => String(alert?.email || "").toLowerCase()).filter(Boolean));
  const alertIps = new Set(alerts.map((alert) => String(alert?.ipAddress || "")).filter(Boolean));
  const alertDates = new Set(alerts.map((alert) => toUtcDateKey(alert?.createdAt)).filter(Boolean));

  return events.filter((event) => {
    const eventEmail = String(event?.metadata?.email || event?.userId?.email || "").toLowerCase();
    const eventIp = String(event?.ipAddress || "");
    const eventDate = toUtcDateKey(event?.createdAt);
    return alertEmails.has(eventEmail) || alertIps.has(eventIp) || alertDates.has(eventDate);
  });
};

export const buildStackedChartData = (events = [], dateRange, sortMode = "dateAsc") => {
  const dateMap = {};

  if (dateRange?.start && dateRange?.end) {
    let cursor = new Date(`${dateRange.start}T00:00:00.000Z`);
    const end = new Date(`${dateRange.end}T00:00:00.000Z`);

    while (cursor <= end) {
      const key = cursor.toISOString().split("T")[0];
      dateMap[key] = { LOGIN_SUCCESS: 0, LOGIN_FAILED: 0, ADMIN_ACTION: 0, OTHER_EVENTS: 0 };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  events.forEach((event) => {
    const key = toUtcDateKey(event?.createdAt);
    if (!key) return;
    if (!dateMap[key]) dateMap[key] = { LOGIN_SUCCESS: 0, LOGIN_FAILED: 0, ADMIN_ACTION: 0, OTHER_EVENTS: 0 };
    const category = getEventCategory(event?.eventType);
    dateMap[key][category] += 1;
  });

  const entries = Object.entries(dateMap).map(([label, value]) => ({
    label,
    value,
    total: value.LOGIN_SUCCESS + value.LOGIN_FAILED + value.ADMIN_ACTION + value.OTHER_EVENTS,
  }));

  const sortedEntries = [...entries].sort((a, b) => {
    if (sortMode === "dateDesc") return b.label.localeCompare(a.label);
    if (sortMode === "countAsc") return a.total - b.total || a.label.localeCompare(b.label);
    if (sortMode === "countDesc") return b.total - a.total || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });

  const labels = sortedEntries.map((entry) => entry.label);
  const byLabel = new Map(sortedEntries.map((entry) => [entry.label, entry.value]));

  return {
    labels,
    datasets: [
      {
        label: "Login Success",
        data: labels.map((d) => byLabel.get(d).LOGIN_SUCCESS),
        backgroundColor: "#3b82f6",
      },
      {
        label: "Login Failed",
        data: labels.map((d) => byLabel.get(d).LOGIN_FAILED),
        backgroundColor: "#ef4444",
      },
      {
        label: "Admin Actions",
        data: labels.map((d) => byLabel.get(d).ADMIN_ACTION),
        backgroundColor: "#8b5cf6",
      },
      {
        label: "Other Events",
        data: labels.map((d) => byLabel.get(d).OTHER_EVENTS),
        backgroundColor: "#94a3b8",
      },
    ],
  };
};

export const buildEventDistributionData = (events = []) => {
  const counts = new Map();
  events.forEach((event) => {
    const type = String(event?.eventType || "UNKNOWN");
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  const labels = Array.from(counts.keys());
  const data = labels.map((label) => counts.get(label));

  return {
    labels,
    datasets: [
      {
        label: "# of Events",
        data,
        backgroundColor: ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa", "#f472b6"],
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
};

export const buildAlertSeverityData = (alerts = []) => {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  alerts.forEach((alert) => {
    const severity = String(alert?.severity || "").toUpperCase();
    if (counts[severity] !== undefined) counts[severity] += 1;
  });

  return {
    totalAlerts: alerts.length,
    chartData: {
      labels: ["Low", "Medium", "High", "Critical"],
      datasets: [
        {
          data: [counts.LOW, counts.MEDIUM, counts.HIGH, counts.CRITICAL],
          backgroundColor: ["#3b82f6", "#f59e0b", "#f97316", "#ef4444"],
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    },
  };
};

export const buildGeoLocations = (events = [], sortMode = "countDesc") => {
  const bucket = new Map();

  events.forEach((event) => {
    const country = String(event?.geoLocation?.country || event?.country || "").trim();
    if (!country) return;

    const current = bucket.get(country) || { country, count: 0, failedLogins: 0 };
    current.count += 1;
    if (getEventCategory(event?.eventType) === "LOGIN_FAILED") current.failedLogins += 1;
    bucket.set(country, current);
  });

  const sorted = Array.from(bucket.values()).sort((a, b) => {
    if (sortMode === "countAsc") return a.count - b.count || a.country.localeCompare(b.country);
    if (sortMode === "countryAsc") return a.country.localeCompare(b.country);
    if (sortMode === "countryDesc") return b.country.localeCompare(a.country);
    return b.count - a.count || a.country.localeCompare(b.country);
  });

  return sorted.slice(0, 30);
};

export const buildScopedStats = (events = [], alerts = []) => {
  const uniqueUsers = new Set();
  events.forEach((event) => {
    const id = event?.userId?._id || event?.userId || event?.metadata?.email || event?.userName;
    if (id) uniqueUsers.add(String(id));
  });

  return {
    totalEvents: events.length,
    loginFailures: events.filter((event) => getEventCategory(event?.eventType) === "LOGIN_FAILED").length,
    uniqueUsers: uniqueUsers.size,
    recentAlerts: alerts.length,
  };
};

export const filterRiskRowsByEvents = (riskRows = [], events = [], hasActiveFilter = false) => {
  if (!hasActiveFilter) {
    return [...riskRows].sort((a, b) => a.riskScore - b.riskScore).slice(0, 10);
  }
  if (!events.length) return [];

  const userIds = new Set(events.map((event) => String(event?.userId?._id || event?.userId || "")).filter(Boolean));
  const emails = new Set(
    events
      .map((event) => String(event?.userId?.email || event?.metadata?.email || "").toLowerCase())
      .filter(Boolean)
  );

  const names = new Set(events.map((event) => String(event?.userId?.name || event?.userName || "").toLowerCase()).filter(Boolean));

  return riskRows
    .filter((row) => {
      const rowId = String(row?._id || "");
      const rowEmail = String(row?.email || "").toLowerCase();
      const rowName = String(row?.name || "").toLowerCase();
      return userIds.has(rowId) || emails.has(rowEmail) || names.has(rowName);
    })
    .sort((a, b) => a.riskScore - b.riskScore);
};
