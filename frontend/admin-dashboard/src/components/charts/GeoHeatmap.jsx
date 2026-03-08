import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { buildGeoLocations } from "../../utils/dashboardFilters";
import LoadingSpinner from "../ui/LoadingSpinner";

function GeoHeatmap({ dateRange, eventsOverride = null, onFilterSelect, sortMode = "countDesc" }) {
  const { API, token } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeatmap = async () => {
      setLoading(true);
      try {
        if (Array.isArray(eventsOverride)) {
          setLocations(buildGeoLocations(eventsOverride, sortMode));
          return;
        }

        const query = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end,
        }).toString();

        const { data } = await API.get(`/api/events/admin/stats/heatmap?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setLocations(data.locations || []);
      } catch (error) {
        console.error("Failed to fetch geo heatmap data", error);
        setLocations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHeatmap();
  }, [API, token, dateRange.start, dateRange.end, eventsOverride, sortMode]);

  const maxCount = useMemo(
    () => (locations.length ? Math.max(...locations.map((item) => item.count)) : 1),
    [locations]
  );

  if (loading) return <LoadingSpinner label="Loading heatmap" />;
  if (!locations.length) return <div style={{ color: "#64748b" }}>No geo data available.</div>;

  return (
    <div className="geo-heatmap-grid">
      {locations.map((item) => {
        const intensity = Math.max(0.3, item.count / maxCount);
        return (
          <div
            key={item.country}
            className="geo-heatmap-cell"
            style={{
              background: `linear-gradient(145deg, rgba(59, 130, 246, ${Math.min(0.9, intensity + 0.15)}), rgba(29, 78, 216, ${Math.min(0.95, intensity + 0.25)}))`,
              cursor: onFilterSelect ? "pointer" : "default",
              color: "#f8fafc",
              borderColor: "rgba(147, 197, 253, 0.55)",
            }}
            title={`${item.country}: ${item.count} events, ${item.failedLogins} failed logins`}
            onClick={() =>
              onFilterSelect?.({
                source: "geoHeatmap",
                country: item.country,
                label: item.country,
              })
            }
          >
            <div className="geo-heatmap-country">{item.country}</div>
            <div className="geo-heatmap-count">{item.count}</div>
          </div>
        );
      })}
    </div>
  );
}

export default GeoHeatmap;
