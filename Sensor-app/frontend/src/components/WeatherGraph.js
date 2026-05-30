import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { LineChart, XAxis, YAxis, Line as RechartsLine } from 'recharts';

// Define colors array for TTN data visualization
const colors = ['#ff6384', '#36a2eb', '#4bc0c0', '#ffcd56', '#c9cbcf'];

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const WeatherGraph = ({ data, type, threshold }) => {
    if (type === 'TTN') {
        return renderTTNData(data, threshold);
    }

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    const getBaseOptions = (label, values, color) => ({
        tension: 0.4,
        fill: true,
        borderColor: color,
        backgroundColor: `${color}20`,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointHoverBackgroundColor: color,
        pointBorderColor: '#fff',
        pointHoverBorderColor: '#fff',
        label: label,
        data: values
    });

    const getChartData = () => {
        const timestamps = data.map(d => formatTime(d.timestamp));
        let datasets = [];

        if (type === 'WeatherApi') {
            datasets = [
                {
                    ...getBaseOptions('Temperature', data.map(d => d.temp), '#ff6384'),
                    yAxisID: 'temperature'
                },
                {
                    ...getBaseOptions('Humidity', data.map(d => d.humidity), '#36a2eb'),
                    yAxisID: 'humidity'
                }
            ];
        } else {
            const values = data.map(d => d.value);
            datasets = [
                {
                    ...getBaseOptions('Value', values, '#4bc0c0'),
                    yAxisID: 'value'
                }
            ];
        }

        return {
            labels: timestamps,
            datasets
        };
    };

    const options = {
        responsive: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 20,
                    color: '#6c757d'
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                titleColor: '#000',
                bodyColor: '#666',
                borderColor: '#ddd',
                borderWidth: 1,
                padding: 10,
                displayColors: true,
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(1);
                            if (type === 'WeatherApi') {
                                label += context.dataset.yAxisID === 'temperature' ? '°C' : '%';
                            } else if (threshold?.unit) {
                                label += threshold.unit;
                            }
                        }
                        return label;
                    }
                }
            }
        },
        scales: type === 'WeatherApi' ? {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: '#6c757d'
                }
            },
            temperature: {
                type: 'linear',
                position: 'left',
                grid: {
                    color: '#e9ecef'
                },
                ticks: {
                    color: '#6c757d'
                },
                title: {
                    display: true,
                    text: 'Temperature (°C)',
                    color: '#6c757d'
                }
            },
            humidity: {
                type: 'linear',
                position: 'right',
                grid: {
                    display: false
                },
                ticks: {
                    color: '#6c757d'
                },
                title: {
                    display: true,
                    text: 'Humidity (%)',
                    color: '#6c757d'
                }
            }
        } : {
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: '#6c757d'
                }
            },
            value: {
                type: 'linear',
                position: 'left',
                grid: {
                    color: '#e9ecef'
                },
                ticks: {
                    color: '#6c757d'
                },
                title: {
                    display: true,
                    text: `Value${threshold?.unit ? ` (${threshold.unit})` : ''}`,
                    color: '#6c757d'
                },
                afterDataLimits: (scale) => {
                    if (threshold) {
                        // Ensure warning and critical thresholds are within visible range
                        if (threshold.warning && threshold.warning > scale.min && threshold.warning < scale.max) {
                            scale.options.grid.color = (context) =>
                                context.tick.value === threshold.warning ? 'orange' : '#e9ecef';
                        }
                        if (threshold.critical && threshold.critical > scale.min && threshold.critical < scale.max) {
                            scale.options.grid.color = (context) =>
                                context.tick.value === threshold.critical ? 'red' :
                                    (threshold.warning && context.tick.value === threshold.warning ? 'orange' : '#e9ecef');
                        }
                    }
                }
            }
        }
    };

    return (
        <div className="weather-graph">
            <Line data={getChartData()} options={options} />
        </div>
    );
};

const renderTTNData = (data, threshold) => {
    if (!data || data.length === 0) return null;

    return (
        <LineChart data={data} height={300}>
            {Object.keys(data[0].raw || {}).map((key, index) => (
                <RechartsLine
                    key={key}
                    type="monotone"
                    dataKey={`raw.${key}`}
                    stroke={colors[index % colors.length]}
                    name={key}
                />
            ))}
            <XAxis
                dataKey="timestamp"
                tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
            />
            <YAxis />
            <Tooltip
                labelFormatter={(timestamp) => new Date(timestamp).toLocaleString()}
            />
            <Legend />
        </LineChart>
    );
};

export default WeatherGraph;
