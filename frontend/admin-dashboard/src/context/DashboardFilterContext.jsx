import { createContext, useContext, useMemo, useState } from "react";

const DashboardFilterContext = createContext(null);

const FILTER_KEYS = [
  "eventType",
  "eventCategory",
  "date",
  "severity",
  "country",
  "alertsOnly",
  "recentWindowMinutes",
  "hasUser",
];

const buildComparable = (condition) => {
  if (!condition) return null;
  return FILTER_KEYS.reduce((acc, key) => {
    if (condition[key] !== undefined && condition[key] !== null && condition[key] !== "") acc[key] = condition[key];
    return acc;
  }, {});
};

const normalizeLogic = (conditions) =>
  conditions.map((condition, index) => ({
    ...condition,
    logic: index === 0 ? "AND" : (condition.logic || "AND"),
  }));

const toCondition = (rawFilter) => {
  if (!rawFilter || typeof rawFilter !== "object") return null;
  for (const key of FILTER_KEYS) {
    if (rawFilter[key] !== undefined && rawFilter[key] !== null && rawFilter[key] !== "") {
      return {
        field: key,
        operator: "=",
        value: rawFilter[key],
        label: rawFilter.label || `${key}: ${rawFilter[key]}`,
      };
    }
  }
  return null;
};

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date("2026-02-20T00:00:00");

  const formatDate = (d) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split("T")[0];
  };

  return { start: formatDate(start), end: formatDate(end) };
};

export function DashboardFilterProvider({ children }) {
  const [filterConditions, setFilterConditions] = useState([]);
  const [pendingLogic, setPendingLogic] = useState(null);
  const [dateRange, setDateRange] = useState(getDefaultDateRange);

  const setOrToggleFilter = (nextFilter) => {
    const condition = toCondition(nextFilter);
    if (!condition) {
      setFilterConditions([]);
      setPendingLogic(null);
      return;
    }
    setFilterConditions((prev) => {
      const nextComparable = buildComparable({ [condition.field]: condition.value });
      const existingIndex = prev.findIndex(
        (item) => JSON.stringify(buildComparable({ [item.field]: item.value })) === JSON.stringify(nextComparable)
      );

      if (existingIndex >= 0 && !pendingLogic) {
        const removed = prev.filter((_, index) => index !== existingIndex);
        return normalizeLogic(removed);
      }

      const logic = prev.length === 0 ? "AND" : (pendingLogic || "AND");
      const appended = [...prev, { ...condition, logic }];
      return normalizeLogic(appended);
    });
    setPendingLogic(null);
  };

  const removeFilterCondition = (indexToRemove) => {
    setFilterConditions((prev) => normalizeLogic(prev.filter((_, index) => index !== indexToRemove)));
  };

  const queueLogicOperator = (logic) => {
    const normalized = String(logic || "").toUpperCase();
    if (!["AND", "OR"].includes(normalized)) return;
    setPendingLogic(normalized);
  };

  const clearPendingLogic = () => setPendingLogic(null);

  const clearFilter = () => {
    setFilterConditions([]);
    setPendingLogic(null);
  };

  const value = useMemo(
    () => ({
      filterConditions,
      filter: filterConditions[0] || null,
      dateRange,
      pendingLogic,
      hasActiveFilter: filterConditions.length > 0,
      setOrToggleFilter,
      removeFilterCondition,
      queueLogicOperator,
      clearPendingLogic,
      clearFilter,
      setDateRange,
    }),
    [filterConditions, dateRange, pendingLogic]
  );

  return <DashboardFilterContext.Provider value={value}>{children}</DashboardFilterContext.Provider>;
}

export function useDashboardFilter() {
  const context = useContext(DashboardFilterContext);
  if (!context) {
    throw new Error("useDashboardFilter must be used within DashboardFilterProvider");
  }
  return context;
}
