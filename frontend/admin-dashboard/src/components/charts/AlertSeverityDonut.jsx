import { useState, useEffect, useContext, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';
import { ThemeContext } from '../../context/ThemeContext';
import { buildAlertSeverityData } from '../../utils/dashboardFilters';
import LoadingSpinner from '../ui/LoadingSpinner';

ChartJS.register(ArcElement, Tooltip, Legend);

function AlertSeverityDonut({ alertsOverride = null, summaryOverride = null, onFilterSelect }) {
  const { API, token } = useContext(AuthContext);
  const { theme } = useContext(ThemeContext);
  const [chartData, setChartData] = useState(null);
  const overrideComputed = useMemo(() => {
    if (summaryOverride?.chartData) return summaryOverride;
    return Array.isArray(alertsOverride) ? buildAlertSeverityData(alertsOverride) : null;
  }, [alertsOverride, summaryOverride]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (overrideComputed) return;

        const { data } = await API.get('/api/alerts', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const next = buildAlertSeverityData(Array.isArray(data) ? data : []);
        setChartData(next.chartData);
      } catch (error) {
        console.error("Failed to fetch alert data", error);
      }
    };
    fetchData();
  }, [API, token, overrideComputed]);

  const effectiveChartData = overrideComputed?.chartData || chartData;
  const severityItems = useMemo(() => {
    if (!effectiveChartData?.labels?.length) return [];
    const labels = effectiveChartData.labels || [];
    const values = effectiveChartData?.datasets?.[0]?.data || [];
    const colors = effectiveChartData?.datasets?.[0]?.backgroundColor || [];
    return labels.map((label, index) => ({
      label,
      value: Number(values[index] || 0),
      color: colors[index] || "#94a3b8",
    }));
  }, [effectiveChartData]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      }
    },
    onClick: (_event, elements) => {
      if (!elements.length || !onFilterSelect || !effectiveChartData) return;
      const index = elements[0].index;
      const severityLabel = effectiveChartData.labels?.[index];
      if (!severityLabel) return;
      onFilterSelect({
        source: 'alertSeverity',
        severity: String(severityLabel).toUpperCase(),
        label: `${severityLabel} severity`,
      });
    },
  };

  // Plugin to draw text in center
  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
      if (chart.config.type !== 'doughnut') return;
      const width = chart.width, height = chart.height, ctx = chart.ctx;
      const values = chart?.data?.datasets?.[0]?.data || [];
      const liveTotal = values.reduce((sum, value) => sum + Number(value || 0), 0);
      const valueColor = theme === 'light' ? '#0f172a' : '#f8fafc';
      const labelColor = theme === 'light' ? '#64748b' : '#9db2da';
      ctx.restore();
      const valueFontSize = Math.max(28, Math.min(44, Math.round(height * 0.13)));
      const labelFontSize = Math.max(11, Math.min(14, Math.round(height * 0.04)));
      ctx.font = `700 ${valueFontSize}px Inter, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = valueColor;
      const text = String(liveTotal);
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = Math.round(height / 2) - 10;
      ctx.fillText(text, textX, textY);
      
      ctx.font = `500 ${labelFontSize}px Inter, sans-serif`;
      ctx.fillStyle = labelColor;
      const label = "Total Alerts";
      const labelX = Math.round((width - ctx.measureText(label).width) / 2);
      const labelY = textY + 28;
      ctx.fillText(label, labelX, labelY);
      ctx.save();
    }
  };

  return (
    <div className="alert-donut-wrap">
      {effectiveChartData ? (
        <div className="alert-donut-layout">
          <div className="alert-donut-canvas">
            <Doughnut data={effectiveChartData} options={options} plugins={[centerTextPlugin]} />
          </div>
          <div className="alert-donut-side-legend">
            <div className="alert-donut-legend-head">
              <span>Category</span>
              <span>Count</span>
            </div>
            {severityItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="alert-donut-legend-row"
                onClick={() =>
                  onFilterSelect?.({
                    source: "alertSeverity",
                    severity: String(item.label).toUpperCase(),
                    label: `${item.label} severity`,
                  })
                }
              >
                <span className="alert-donut-legend-dot" style={{ backgroundColor: item.color }} />
                <span className="alert-donut-legend-label">{item.label}</span>
                <span className="alert-donut-legend-value">{item.value}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <LoadingSpinner label="Loading alerts chart" />
      )}
    </div>
  );
}

export default AlertSeverityDonut;
