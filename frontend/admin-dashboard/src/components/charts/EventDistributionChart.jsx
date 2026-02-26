import { useState, useEffect, useContext } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';

ChartJS.register(ArcElement, Tooltip, Legend);

function EventDistributionChart() {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const { data } = await API.get('/api/events/admin/stats/distribution', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setChartData({
          labels: data.labels,
          datasets: [
            {
              label: '# of Events',
              data: data.data,
              backgroundColor: [
                '#60a5fa', // Blue 400
                '#34d399', // Emerald 400
                '#f87171', // Red 400
                '#fbbf24', // Amber 400
                '#a78bfa', // Violet 400
                '#f472b6', // Pink 400
              ],
              borderColor: '#ffffff',
              borderWidth: 2,
              hoverOffset: 4
            },
          ],
        });
      } catch (error) {
        console.error('Failed to fetch distribution data', error);
      }
    };
    fetchChartData();
  }, [API, token]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: 10
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          color: '#64748b',
          font: { size: 12, family: "'Inter', sans-serif", weight: '500' },
          boxWidth: 8
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1e293b',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4
      }
    }
  };

  return (
    <div style={{ height: '350px', width: '100%', position: 'relative', display: 'flex', justifyContent: 'center' }}>
      {chartData ? (
        <Pie data={chartData} options={options} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          Loading chart...
        </div>
      )}
    </div>
  );
}

export default EventDistributionChart;