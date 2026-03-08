import { useState, useEffect, useContext } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { AuthContext } from '../../context/AuthContext';
import { buildEventDistributionData } from '../../utils/dashboardFilters';
import LoadingSpinner from '../ui/LoadingSpinner';

ChartJS.register(ArcElement, Tooltip, Legend);

function EventDistributionChart({ eventsOverride = null, onFilterSelect }) {
  const { API, token } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);

  const mutedPalette = ['#4f7fb8', '#2f9d7a', '#d26767', '#c99a2a', '#7f6bcf', '#af5f94', '#5b84d1', '#5ea8e6'];

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        if (Array.isArray(eventsOverride)) {
          const built = buildEventDistributionData(eventsOverride);
          setChartData({
            ...built,
            datasets: (built.datasets || []).map((dataset) => ({
              ...dataset,
              backgroundColor: (dataset.backgroundColor || []).map((_, index) => mutedPalette[index % mutedPalette.length]),
              borderColor: '#d1def6',
              borderWidth: 1.5,
            })),
          });
          return;
        }

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
                '#4f7fb8',
                '#2f9d7a',
                '#d26767',
                '#c99a2a',
                '#7f6bcf',
                '#af5f94',
              ],
              borderColor: '#d1def6',
              borderWidth: 1.5,
              hoverOffset: 4
            },
          ],
        });
      } catch (error) {
        console.error('Failed to fetch distribution data', error);
      }
    };
    fetchChartData();
  }, [API, token, eventsOverride]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: 10
    },
    plugins: {
      legend: {
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
        displayColors: true,
        boxPadding: 4
      }
    },
    onClick: (_event, elements) => {
      if (!elements.length || !onFilterSelect || !chartData) return;
      const index = elements[0].index;
      const eventType = chartData.labels?.[index];
      if (!eventType) return;
      onFilterSelect({
        source: 'eventDistribution',
        eventType,
        label: String(eventType),
      });
    },
  };

  return (
    <div className="event-distribution-layout">
      {chartData ? (
        <>
          <div className="event-distribution-pie">
            <Pie data={chartData} options={options} />
          </div>
          <div className="event-distribution-legend">
            {(chartData.labels || []).map((label, index) => {
              const color = chartData?.datasets?.[0]?.backgroundColor?.[index] || "#60a5fa";
              const value = chartData?.datasets?.[0]?.data?.[index] ?? 0;
              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  className="event-distribution-legend-item"
                  onClick={() =>
                    onFilterSelect?.({
                      source: "eventDistribution",
                      eventType: label,
                      label: String(label),
                    })
                  }
                >
                  <span className="event-distribution-dot" style={{ background: color }} />
                  <span className="event-distribution-label">{label}</span>
                  <span className="event-distribution-value">{value}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <LoadingSpinner label="Loading distribution chart" />
      )}
    </div>
  );
}

export default EventDistributionChart;
