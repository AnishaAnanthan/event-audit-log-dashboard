import { useState, useEffect, useContext } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function StackedBarChart({ dateRange }) {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch events with a high limit to perform frontend aggregation
        // Since we cannot modify backend aggregation logic, we fetch raw data
        const query = new URLSearchParams({
          startDate: dateRange.start,
          endDate: dateRange.end,
          limit: 2000 // Fetch enough data for the view
        }).toString();
        
        const { data } = await API.get(`/api/events/admin/all?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const events = data.events || [];
        
        // Process data
        const dateMap = {};
        
        // Initialize dates in range
        let currentDate = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        while (currentDate <= end) {
          const dateStr = currentDate.toISOString().split('T')[0];
          dateMap[dateStr] = { LOGIN_SUCCESS: 0, LOGIN_FAILED: 0, ADMIN_ACTION: 0, OTHER_EVENTS: 0 };
          currentDate.setDate(currentDate.getDate() + 1);
        }

        events.forEach(event => {
          const dateStr = new Date(event.createdAt).toISOString().split('T')[0];
          if (dateMap[dateStr]) {
            const type = event.eventType;
            if (type.includes('LOGIN_SUCCESS')) dateMap[dateStr].LOGIN_SUCCESS++;
            else if (type.includes('LOGIN_FAILED')) dateMap[dateStr].LOGIN_FAILED++;
            else if (type.includes('ADMIN')) dateMap[dateStr].ADMIN_ACTION++;
            else dateMap[dateStr].OTHER_EVENTS++;
          }
        });

        const labels = Object.keys(dateMap).sort();
        
        setChartData({
          labels,
          datasets: [
            {
              label: 'Login Success',
              data: labels.map(d => dateMap[d].LOGIN_SUCCESS),
              backgroundColor: '#3b82f6', // Primary Blue
            },
            {
              label: 'Login Failed',
              data: labels.map(d => dateMap[d].LOGIN_FAILED),
              backgroundColor: '#ef4444', // Danger Red
            },
            {
              label: 'Admin Actions',
              data: labels.map(d => dateMap[d].ADMIN_ACTION),
              backgroundColor: '#8b5cf6', // Purple
            },
            {
              label: 'Other Events',
              data: labels.map(d => dateMap[d].OTHER_EVENTS),
              backgroundColor: '#94a3b8', // Gray
            },
          ],
        });
      } catch (error) {
        console.error("Failed to fetch stacked chart data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [API, token, dateRange]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          boxWidth: 14,
          boxHeight: 10,
          padding: 12,
          color: '#475569',
          font: { size: 12, weight: '500' },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1e293b',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { maxRotation: 25, minRotation: 0, color: '#64748b' },
      },
      y: { stacked: true, grid: { color: '#f1f5f9' }, beginAtZero: true },
    },
  };

  return (
    <div className="stacked-bar-wrap">
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          Loading data...
        </div>
      ) : chartData ? (
        <Bar options={options} data={chartData} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No data</div>
      )}
    </div>
  );
}

export default StackedBarChart;
