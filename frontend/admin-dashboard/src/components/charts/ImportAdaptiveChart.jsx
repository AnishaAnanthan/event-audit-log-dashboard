import { useMemo } from "react";
import { Bar, Doughnut, Pie } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const BAR_COLOR = "rgba(96, 165, 250, 0.78)";
const BAR_BORDER = "#60a5fa";
const STATUS_COLORS = {
  SUCCESS: "#22c55e",
  FAILED: "#ef4444",
};

function toDataset(field, topValuesByField) {
  const rows = Array.isArray(topValuesByField?.[field]) ? topValuesByField[field] : [];
  const labels = rows.map((item) => item.value);
  const data = rows.map((item) => Number(item.count || 0));
  return { labels, data };
}

function ImportAdaptiveChart({ profile }) {
  const recommendation = profile?.chartRecommendations?.[0] || null;

  const statusData = useMemo(() => toDataset("status", profile?.topValuesByField), [profile]);
  const processData = useMemo(() => toDataset("processName", profile?.topValuesByField), [profile]);
  const hostData = useMemo(() => toDataset("host", profile?.topValuesByField), [profile]);
  const eventTypeData = useMemo(() => toDataset("eventType", profile?.topValuesByField), [profile]);

  if (!recommendation || recommendation.chartType === "empty") {
    return <div className="import-adaptive-empty">No adaptive chart data for this import session.</div>;
  }

  if (recommendation.id === "status-split") {
    const colors = statusData.labels.map((label) => STATUS_COLORS[String(label).toUpperCase()] || "#60a5fa");
    return (
      <div className="import-adaptive-chart-wrap">
        <Doughnut
          data={{
            labels: statusData.labels,
            datasets: [{ data: statusData.data, backgroundColor: colors, borderWidth: 0 }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#c8dcfb" } } },
            cutout: "68%",
          }}
        />
      </div>
    );
  }

  if (recommendation.id === "event-type-distribution") {
    return (
      <div className="import-adaptive-chart-wrap">
        <Pie
          data={{
            labels: eventTypeData.labels,
            datasets: [
              {
                data: eventTypeData.data,
                backgroundColor: ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8", "#f472b6"],
                borderWidth: 0,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#c8dcfb" } } },
          }}
        />
      </div>
    );
  }

  const source = recommendation.id === "top-host" ? hostData : processData;
  return (
    <div className="import-adaptive-chart-wrap">
      <Bar
        data={{
          labels: source.labels,
          datasets: [{ label: "Events", data: source.data, backgroundColor: BAR_COLOR, borderColor: BAR_BORDER, borderWidth: 1 }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: "#c8dcfb" }, grid: { color: "rgba(156,193,241,0.14)" } },
            y: { beginAtZero: true, ticks: { color: "#c8dcfb" }, grid: { color: "rgba(156,193,241,0.14)" } },
          },
        }}
      />
    </div>
  );
}

export default ImportAdaptiveChart;
