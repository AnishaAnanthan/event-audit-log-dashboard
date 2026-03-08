import { useState, useEffect, useContext } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { AuthContext } from "../../context/AuthContext";
import { toUtcDateKey } from "../../utils/dashboardFilters";
import LoadingSpinner from "../ui/LoadingSpinner";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function toTrendData(events = [], dateRange) {
  const dateMap = {};

  if (dateRange?.start && dateRange?.end) {
    let cursor = new Date(`${dateRange.start}T00:00:00.000Z`);
    const end = new Date(`${dateRange.end}T00:00:00.000Z`);
    while (cursor <= end) {
      const key = cursor.toISOString().split("T")[0];
      dateMap[key] = { success: 0, failed: 0 };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const isFailedEvent = (event) => {
    const type = String(event?.eventType || "").toUpperCase();
    const level = String(event?.metadata?.level || "").toUpperCase();
    const status = String(event?.metadata?.status || "").toUpperCase();
    if (
      type.includes("FAILED") ||
      type.includes("ERROR") ||
      type.includes("CRITICAL") ||
      level === "ERROR" ||
      level === "CRITICAL" ||
      status === "FAILED"
    ) {
      return true;
    }
    return false;
  };

  events.forEach((event) => {
    const key = toUtcDateKey(event?.createdAt);
    if (!key) return;
    if (!dateMap[key]) dateMap[key] = { success: 0, failed: 0 };
    if (isFailedEvent(event)) dateMap[key].failed += 1;
    else dateMap[key].success += 1;
  });

  const labels = Object.keys(dateMap).sort((a, b) => a.localeCompare(b));
  const success = labels.map((label) => Number(dateMap[label]?.success || 0));
  const failed = labels.map((label) => Number(dateMap[label]?.failed || 0));

  return {
    labels,
    datasets: [
      {
        label: "Total Success Events",
        data: success,
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.22)",
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2.5,
      },
      {
        label: "Total Failed Events",
        data: failed,
        borderColor: "#ef4444",
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        borderWidth: 2,
        fill: false,
        tension: 0.35,
        pointRadius: 2.5,
      },
    ],
  };
}

function EventTrendLineChart({ dateRange, eventsOverride = null, onFilterSelect }) {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (Array.isArray(eventsOverride)) {
          setChartData(toTrendData(eventsOverride, dateRange));
          return;
        }

        const query = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end,
          limit: 2000,
        }).toString();

        const { data } = await API.get(`/api/events/admin/all?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setChartData(toTrendData(data?.events || [], dateRange));
      } catch (error) {
        console.error("Failed to fetch trend line data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [API, token, dateRange, eventsOverride]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: {
          boxWidth: 14,
          boxHeight: 10,
          padding: 12,
          color: "#475569",
          font: { size: 12, weight: "500" },
        },
      },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        titleColor: "#1e293b",
        bodyColor: "#475569",
        borderColor: "#e2e8f0",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 25, minRotation: 0, color: "#64748b" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "#f1f5f9" },
        ticks: { color: "#64748b" },
      },
    },
    onClick: (_event, elements) => {
      if (!elements.length || !onFilterSelect || !chartData) return;
      const first = elements[0];
      const datasetLabel = chartData.datasets?.[first.datasetIndex]?.label;
      const date = chartData.labels?.[first.index];
      if (!datasetLabel || !date) return;

      if (datasetLabel === "Total Failed Events") {
        onFilterSelect({
          source: "eventTrendLine",
          eventCategory: "LOGIN_FAILED",
          date,
          label: `Failed events on ${date}`,
        });
        return;
      }

      onFilterSelect({
        source: "eventTrendLine",
        date,
        label: `Success events on ${date}`,
      });
    },
  };

  return (
    <div className="trend-line-wrap">
      {loading ? (
        <LoadingSpinner label="Loading trend chart" />
      ) : chartData ? (
        <Line options={options} data={chartData} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>No data</div>
      )}
    </div>
  );
}

export default EventTrendLineChart;
