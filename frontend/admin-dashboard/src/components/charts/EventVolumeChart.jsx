import { useState, useEffect, useContext } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function EventVolumeChart({ dateRange }) {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const query = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end
        }).toString();
        const { data } = await API.get(`/api/events/admin/stats/volume?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setChartData({
          labels: data.labels,
          datasets: [
            {
              label: 'Events',
              data: data.data,
              borderColor: '#2563eb',
              backgroundColor: (context) => {
                const ctx = context.chart.ctx;
                const gradient = ctx.createLinearGradient(0, 0, 0, 350);
                gradient.addColorStop(0, 'rgba(37, 99, 235, 0.15)');
                gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');
                return gradient;
              },
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 5,
              pointBackgroundColor: '#ffffff',
              pointBorderColor: '#2563eb',
              pointBorderWidth: 2,
              fill: true,
              tension: 0.4 // Smooth curves
            },
          ],
        });
      } catch (error) {
        console.error('Failed to fetch chart data', error);
      }
    };
    fetchChartData();
  }, [API, token, dateRange]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // Cleaner look without legend for single series
      },
      title: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1e293b',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { size: 13, weight: '600', family: "'Inter', sans-serif" },
        bodyFont: { size: 13, family: "'Inter', sans-serif" },
        callbacks: {
          label: (context) => ` ${context.parsed.y} Events`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { color: '#94a3b8', font: { size: 11, family: "'Inter', sans-serif" }, padding: 10 }
      },
      y: {
        grid: { color: '#f1f5f9', drawBorder: false },
        ticks: { color: '#94a3b8', font: { size: 11, family: "'Inter', sans-serif" }, padding: 10, maxTicksLimit: 5 },
        beginAtZero: true
      }
    },
  };

  return (
    <div style={{ height: '350px', width: '100%', position: 'relative' }}>
      {chartData && chartData.labels.length > 0 ? (
        <Line options={options} data={chartData} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          {chartData ? "No data available" : "Loading chart..."}
        </div>
      )}
    </div>
  );
}

export default EventVolumeChart;