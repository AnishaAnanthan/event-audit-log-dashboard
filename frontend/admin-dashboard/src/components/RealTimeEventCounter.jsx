import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { getEventCategory } from '../utils/dashboardFilters';

function RealTimeEventCounter({ eventsOverride = null, alertsOverride = null, onMetricFilter }) {
  const { API, token } = useContext(AuthContext);
  const [metrics, setMetrics] = useState({
    recentEvents: 0,
    activeAlerts: 0,
    failedLogins: 0
  });

  const fetchMetrics = async () => {
    try {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60000).toISOString();
      const tenMinAgo = new Date(now.getTime() - 10 * 60000).toISOString();

      // 1. Events in last 5 mins (using limit=1 to get totalPages as count approximation)
      const recentEventsReq = API.get(`/api/events/admin/all?startDate=${fiveMinAgo}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 2. Active Alerts (using admin stats)
      const statsReq = API.get('/api/events/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 3. Failed Logins last 10 mins
      const failedLoginsReq = API.get(`/api/events/admin/all?eventType=LOGIN_FAILED&startDate=${tenMinAgo}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const [recentRes, statsRes, failedRes] = await Promise.all([recentEventsReq, statsReq, failedLoginsReq]);

      setMetrics({
        recentEvents: recentRes.data.totalPages || 0, // Approximation using pagination trick
        activeAlerts: statsRes.data.recentAlerts || 0,
        failedLogins: failedRes.data.totalPages || 0
      });

    } catch (error) {
      console.error("Failed to fetch real-time metrics", error);
    }
  };

  useEffect(() => {
    if (Array.isArray(eventsOverride) && Array.isArray(alertsOverride)) {
      const now = Date.now();
      const fiveMinAgo = now - 5 * 60000;
      const tenMinAgo = now - 10 * 60000;
      const recentEvents = eventsOverride.filter((event) => new Date(event.createdAt).getTime() >= fiveMinAgo).length;
      const failedLogins = eventsOverride.filter((event) => {
        const ts = new Date(event.createdAt).getTime();
        return ts >= tenMinAgo && getEventCategory(event.eventType) === 'LOGIN_FAILED';
      }).length;

      setMetrics({
        recentEvents,
        activeAlerts: alertsOverride.length,
        failedLogins,
      });
      return;
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [API, token, eventsOverride, alertsOverride]);

  return (
    <>
      <MetricItem
        label="Events (5m)"
        value={metrics.recentEvents}
        color="#3b82f6"
        onClick={() =>
          onMetricFilter?.({
            source: "metricCard",
            recentWindowMinutes: 5,
            label: "Events in last 5 minutes",
          })
        }
      />
      <MetricItem
        label="Active Alerts"
        value={metrics.activeAlerts}
        color="#f59e0b"
        onClick={() =>
          onMetricFilter?.({
            source: "metricCard",
            alertsOnly: true,
            label: "Active alerts context",
          })
        }
      />
      <MetricItem
        label="Failed Logins (10m)"
        value={metrics.failedLogins}
        color="#ef4444"
        onClick={() =>
          onMetricFilter?.({
            source: "metricCard",
            eventCategory: "LOGIN_FAILED",
            recentWindowMinutes: 10,
            label: "Failed logins in last 10 minutes",
          })
        }
      />
    </>
  );
}

function MetricItem({ label, value, color, onClick }) {
  return (
    <article
      className="dash-card metric-card"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
    >
      <div className="metric-label">
        {label}
      </div>
      <div className="metric-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
        {value}
      </div>
    </article>
  );
}

export default RealTimeEventCounter;
