import { useState, useEffect, useContext } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';
import { buildStackedChartData } from '../../utils/dashboardFilters';
import LoadingSpinner from '../ui/LoadingSpinner';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function StackedBarChart({ dateRange, eventsOverride = null, onFilterSelect, sortMode = "dateAsc" }) {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (Array.isArray(eventsOverride)) {
          setChartData(buildStackedChartData(eventsOverride, dateRange, sortMode));
          return;
        }

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

        setChartData(buildStackedChartData(data.events || [], dateRange, sortMode));
      } catch (error) {
        console.error("Failed to fetch stacked chart data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [API, token, dateRange, eventsOverride, sortMode]);

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
    onClick: (_event, elements) => {
      if (!elements.length || !onFilterSelect || !chartData) return;
      const first = elements[0];
      const datasetLabel = chartData.datasets?.[first.datasetIndex]?.label;
      const date = chartData.labels?.[first.index];
      const categoryMap = {
        'Login Success': 'LOGIN_SUCCESS',
        'Login Failed': 'LOGIN_FAILED',
        'Admin Actions': 'ADMIN_ACTION',
        'Other Events': 'OTHER_EVENTS',
      };

      if (!datasetLabel || !date) return;

      onFilterSelect({
        source: 'eventActivity',
        eventCategory: categoryMap[datasetLabel] || 'OTHER_EVENTS',
        date,
        label: `${datasetLabel} on ${date}`,
      });
    },
  };

  return (
    <div className="stacked-bar-wrap">
      {loading ? (
        <LoadingSpinner label="Loading activity chart" />
      ) : chartData ? (
        <Bar options={options} data={chartData} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No data</div>
      )}
    </div>
  );
}

export default StackedBarChart;
