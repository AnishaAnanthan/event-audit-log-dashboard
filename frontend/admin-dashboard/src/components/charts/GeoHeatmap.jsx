import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { buildGeoLocations } from "../../utils/dashboardFilters";
import LoadingSpinner from "../ui/LoadingSpinner";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const WORLD_GEO_JSON = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const COUNTRY_ALIASES = {
  USA: "UNITED STATES OF AMERICA",
  "UNITED STATES": "UNITED STATES OF AMERICA",
  US: "UNITED STATES OF AMERICA",
  "U.S.A": "UNITED STATES OF AMERICA",
  "U.S.": "UNITED STATES OF AMERICA",
  UK: "UNITED KINGDOM",
  "U.K.": "UNITED KINGDOM",
  "RUSSIAN FEDERATION": "RUSSIA",
  "KOREA, REPUBLIC OF": "SOUTH KOREA",
  "REPUBLIC OF KOREA": "SOUTH KOREA",
  "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "NORTH KOREA",
  "IRAN, ISLAMIC REPUBLIC OF": "IRAN",
  "VIET NAM": "VIETNAM",
  "SYRIAN ARAB REPUBLIC": "SYRIA",
  "BOLIVIA (PLURINATIONAL STATE OF)": "BOLIVIA",
  "TANZANIA, UNITED REPUBLIC OF": "TANZANIA",
  "MOLDOVA, REPUBLIC OF": "MOLDOVA",
  "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LAOS",
  "CZECHIA": "CZECH REPUBLIC",
};

const normalizeCountry = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const toCanonicalCountry = (value = "") => {
  const normalized = normalizeCountry(value);
  return COUNTRY_ALIASES[normalized] || normalized;
};

const getIntensityColor = (ratio) => {
  const safeRatio = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const alpha = 0.2 + safeRatio * 0.7;
  return `rgba(16, 185, 129, ${alpha.toFixed(3)})`;
};

function GeoHeatmap({ dateRange, eventsOverride = null, onFilterSelect, sortMode = "countDesc", fixedView = "" }) {
  const { API, token } = useContext(AuthContext);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("map");
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 12, y: 12 });

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

  const mapCounts = useMemo(() => {
    const bucket = new Map();
    locations.forEach((item) => {
      const country = String(item?.country || "").trim();
      if (!country || normalizeCountry(country) === "LOCAL" || normalizeCountry(country) === "UNKNOWN") return;
      const canonical = toCanonicalCountry(country);
      const current = bucket.get(canonical) || { count: 0, failedLogins: 0 };
      current.count += Number(item?.count || 0);
      current.failedLogins += Number(item?.failedLogins || 0);
      bucket.set(canonical, current);
    });
    return bucket;
  }, [locations]);

  const topCountries = useMemo(
    () =>
      [...locations]
        .filter((item) => {
          const normalized = normalizeCountry(item?.country || "");
          return normalized && normalized !== "LOCAL" && normalized !== "UNKNOWN";
        })
        .slice(0, 6),
    [locations]
  );

  const activityHeatmap = useMemo(() => {
    if (!Array.isArray(eventsOverride) || !eventsOverride.length) return null;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

    eventsOverride.forEach((event) => {
      const dt = new Date(event?.createdAt);
      if (Number.isNaN(dt.getTime())) return;
      const day = dt.getUTCDay();
      const hour = dt.getUTCHours();
      matrix[day][hour] += 1;
    });

    const max = Math.max(1, ...matrix.flat());
    return { dayNames, hours, matrix, max };
  }, [eventsOverride]);

  const activeView = fixedView || viewMode;

  if (loading) return <LoadingSpinner label="Loading heatmap" />;
  if (!locations.length) return <div style={{ color: "#64748b" }}>No geo data available.</div>;

  return (
    <div className="geo-map-wrap">
      {!fixedView && <div className="geo-view-toggle" role="tablist" aria-label="Geo visualization mode">
        <button
          type="button"
          className={`geo-view-btn ${viewMode === "map" ? "active" : ""}`}
          onClick={() => setViewMode("map")}
        >
          World Map
        </button>
        <button
          type="button"
          className={`geo-view-btn ${viewMode === "grid" ? "active" : ""}`}
          onClick={() => setViewMode("grid")}
        >
          Country Grid
        </button>
        <button
          type="button"
          className={`geo-view-btn ${viewMode === "activity" ? "active" : ""}`}
          onClick={() => setViewMode("activity")}
        >
          Calendar Heatmap
        </button>
      </div>}

      {activeView === "map" ? (
          <div className="geo-world-layout">
            <div className="geo-world-map">
            <ComposableMap
              projection="geoEqualEarth"
              projectionConfig={{
                // Zoom in so the map isn't letterboxed/tiny inside the card.
                scale: 175,
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <Geographies geography={WORLD_GEO_JSON}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const countryName = String(
                      geo?.properties?.NAME ||
                      geo?.properties?.name ||
                      geo?.properties?.ADMIN ||
                      ""
                    );
                    const canonical = toCanonicalCountry(countryName);
                    const match = mapCounts.get(canonical);
                    const count = Number(match?.count || 0);
                    const failedLogins = Number(match?.failedLogins || 0);
                    const ratio = maxCount ? count / maxCount : 0;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        style={{
                          default: {
                            fill: count > 0 ? getIntensityColor(ratio) : "rgba(71, 85, 105, 0.22)",
                            stroke: "rgba(148, 163, 184, 0.35)",
                            strokeWidth: 0.4,
                            outline: "none",
                            cursor: onFilterSelect && count > 0 ? "pointer" : "default",
                          },
                          hover: {
                            fill: count > 0 ? "rgba(16, 185, 129, 0.92)" : "rgba(148, 163, 184, 0.2)",
                            stroke: "rgba(191, 219, 254, 0.8)",
                            strokeWidth: 0.8,
                            outline: "none",
                          },
                          pressed: {
                            fill: count > 0 ? "rgba(37, 99, 235, 0.95)" : "rgba(148, 163, 184, 0.2)",
                            outline: "none",
                          },
                        }}
                        onMouseEnter={() => {
                          if (!count) return;
                          setHoveredCountry({ country: countryName, count, failedLogins });
                        }}
                        onMouseMove={(event) => {
                          if (!count) return;
                          const rect = event?.currentTarget?.ownerSVGElement?.getBoundingClientRect?.();
                          if (!rect) return;
                          setTooltipPos({
                            x: Math.max(8, event.clientX - rect.left + 10),
                            y: Math.max(8, event.clientY - rect.top + 10),
                          });
                        }}
                        onMouseLeave={() => setHoveredCountry(null)}
                        title={count > 0 ? `${countryName}: ${count} events` : countryName}
                        onClick={() => {
                          if (!count) return;
                          onFilterSelect?.({
                            source: "geoHeatmap",
                            country: countryName,
                            label: countryName,
                          });
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
            {hoveredCountry && (
              <div
                className="geo-hover-tooltip"
                style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px`, bottom: "auto" }}
              >
                <strong>{hoveredCountry.country}</strong>
                <span>{hoveredCountry.count} events</span>
                <span>{hoveredCountry.failedLogins} failed logins</span>
              </div>
            )}
          </div>

          <div className="geo-top-list">
            <div className="geo-top-title">Top Locations</div>
            {topCountries.length ? (
              topCountries.map((item) => (
                <button
                  type="button"
                  key={`top-${item.country}`}
                  className="geo-top-row"
                  onClick={() =>
                    onFilterSelect?.({
                      source: "geoHeatmap",
                      country: item.country,
                      label: item.country,
                    })
                  }
                >
                  <span>{item.country}</span>
                  <strong>{item.count}</strong>
                </button>
              ))
            ) : (
              <div className="geo-top-empty">No mapped country data.</div>
            )}
          </div>
        </div>
      ) : activeView === "activity" ? (
        activityHeatmap ? (
          <div className="activity-heatmap-wrap">
            <div className="activity-heatmap-grid-matrix full-width">
              <div className="activity-heatmap-corner" />
              {activityHeatmap.hours.map((hour) => (
                <div key={`hour-${hour}`} className="activity-heatmap-hour-head">
                  {String(hour).padStart(2, "0")}
                </div>
              ))}
              {activityHeatmap.dayNames.map((dayName, dayIndex) => (
                <Fragment key={`matrix-row-${dayName}`}>
                  <div className="activity-heatmap-row-head">{dayName}</div>
                  {activityHeatmap.hours.map((hour) => {
                    const count = activityHeatmap.matrix[dayIndex][hour];
                    const alpha = count ? 0.18 + (count / activityHeatmap.max) * 0.82 : 0.06;
                    return (
                      <div
                        key={`cell-${dayName}-${hour}`}
                        className="activity-heatmap-matrix-cell"
                        style={{
                          background: `rgba(16, 185, 129, ${alpha.toFixed(3)})`,
                          borderColor: count ? "rgba(52, 211, 153, 0.44)" : "rgba(71, 85, 105, 0.18)",
                        }}
                        title={`${dayName} ${String(hour).padStart(2, "0")}:00 UTC | ${count} events`}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className="activity-heatmap-legend">Darker cells = higher event concentration by day/hour (UTC)</div>
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: "0.84rem" }}>
            Time insights are available when event-level data is loaded.
          </div>
        )
      ) : (
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
      )}
    </div>
  );
}

export default GeoHeatmap;
