import { useState, useEffect, useContext } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';

ChartJS.register(ArcElement, Tooltip, Legend);

function AlertSeverityDonut() {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);
  const [totalAlerts, setTotalAlerts] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await API.get('/api/alerts', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
        data.forEach(alert => {
          if (counts[alert.severity] !== undefined) {
            counts[alert.severity]++;
          }
        });

        setTotalAlerts(data.length);
        setChartData({
          labels: ['Low', 'Medium', 'High', 'Critical'],
          datasets: [
            {
              data: [counts.LOW, counts.MEDIUM, counts.HIGH, counts.CRITICAL],
              backgroundColor: [
                '#3b82f6', // Low - Blue
                '#f59e0b', // Medium - Amber
                '#f97316', // High - Orange
                '#ef4444', // Critical - Red
              ],
              borderWidth: 0,
              hoverOffset: 4
            },
          ],
        });
      } catch (error) {
        console.error("Failed to fetch alert data", error);
      }
    };
    fetchData();
  }, [API, token]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        align: 'center',
        labels: {
          boxWidth: 10,
          usePointStyle: true,
          padding: 14,
          color: '#64748b',
          font: { size: 12, weight: '500' }
        }
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
  };

  // Plugin to draw text in center
  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
      if (chart.config.type !== 'doughnut') return;
      const width = chart.width, height = chart.height, ctx = chart.ctx;
      ctx.restore();
      const valueFontSize = Math.max(28, Math.min(44, Math.round(height * 0.13)));
      const labelFontSize = Math.max(11, Math.min(14, Math.round(height * 0.04)));
      ctx.font = `700 ${valueFontSize}px Inter, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0f172a";
      const text = totalAlerts.toString();
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = Math.round(height / 2) - 10;
      ctx.fillText(text, textX, textY);
      
      ctx.font = `500 ${labelFontSize}px Inter, sans-serif`;
      ctx.fillStyle = "#64748b";
      const label = "Total Alerts";
      const labelX = Math.round((width - ctx.measureText(label).width) / 2);
      const labelY = textY + 28;
      ctx.fillText(label, labelX, labelY);
      ctx.save();
    }
  };

  return (
    <div className="alert-donut-wrap">
      {chartData ? <Doughnut data={chartData} options={options} plugins={[centerTextPlugin]} /> : <div>Loading...</div>}
    </div>
  );
}

export default AlertSeverityDonut;
