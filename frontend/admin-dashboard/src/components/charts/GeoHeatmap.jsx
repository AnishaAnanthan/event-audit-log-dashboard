import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";

function GeoHeatmap({ dateRange }) {
  const { API, token } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeatmap = async () => {
      setLoading(true);
      try {
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
  }, [API, token, dateRange.start, dateRange.end]);

  const maxCount = useMemo(
    () => (locations.length ? Math.max(...locations.map((item) => item.count)) : 1),
    [locations]
  );

  if (loading) return <div style={{ color: "#64748b" }}>Loading heatmap...</div>;
  if (!locations.length) return <div style={{ color: "#64748b" }}>No geo data available.</div>;

  return (
    <div className="geo-heatmap-grid">
      {locations.map((item) => {
        const intensity = Math.max(0.15, item.count / maxCount);
        return (
          <div
            key={item.country}
            className="geo-heatmap-cell"
            style={{ background: `rgba(37, 99, 235, ${intensity})` }}
            title={`${item.country}: ${item.count} events, ${item.failedLogins} failed logins`}
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
