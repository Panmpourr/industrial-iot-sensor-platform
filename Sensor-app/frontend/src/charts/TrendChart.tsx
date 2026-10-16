import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
    type ChartData, type ChartDataset, type ChartOptions,
} from 'chart.js';
import type { Reading, Sensor } from '../types';
import { numericValue } from '../types';
import { gridColor, statusColors, trendColor } from '../theme';
import { unitOf } from '../status';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const axisText = '#9ba1a9';
const humidityColor = '#9d8cd6';

const series = (label: string, data: (number | null)[], color: string, yAxisID: string, fill = false): ChartDataset<'line'> => ({
    label,
    data,
    yAxisID,
    borderColor: color,
    backgroundColor: `${color}1f`,
    borderWidth: 1.75,
    fill,
    tension: 0.25,
    pointRadius: 0,
    pointHoverRadius: 3,
    spanGaps: true,
});

/** Horizontal dashed line for a threshold limit. */
const limitLine = (label: string, value: number, length: number, color: string): ChartDataset<'line'> => ({
    label,
    data: Array(length).fill(value),
    yAxisID: 'y',
    borderColor: color,
    borderWidth: 1,
    borderDash: [6, 4],
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: false,
});

interface TrendChartProps {
    sensor: Sensor;
    readings: Reading[];
}

/** Process trend with warning/critical limits drawn as dashed lines. */
const TrendChart = ({ sensor, readings }: TrendChartProps) => {
    const weather = sensor.type === 'WeatherApi';
    const unit = unitOf(sensor);
    const { warning, critical } = sensor.details.threshold ?? {};
    const length = readings.length;

    const datasets: ChartDataset<'line'>[] = weather
        ? [
            series('Temperature', readings.map(r => r.temp ?? null), trendColor, 'y', true),
            series('Humidity', readings.map(r => r.humidity ?? null), humidityColor, 'y1'),
        ]
        : [series(sensor.name, readings.map(r => numericValue(r) ?? null), trendColor, 'y', true)];

    if (warning !== undefined) datasets.push(limitLine('Warning limit', warning, length, statusColors.warning));
    if (critical !== undefined) datasets.push(limitLine('Critical limit', critical, length, statusColors.critical));

    const data: ChartData<'line'> = {
        labels: readings.map(r => new Date(r.timestamp).toLocaleTimeString()),
        datasets,
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // live data: redraw instantly instead of animating every update
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: { color: axisText, boxWidth: 14, boxHeight: 2, font: { size: 11 } },
            },
            tooltip: {
                backgroundColor: '#24282d',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#e6e8eb',
                bodyColor: '#c9cdd2',
                callbacks: {
                    label: (ctx) => {
                        const y = ctx.parsed.y;
                        if (y === null) return '';
                        const suffix = ctx.dataset.yAxisID === 'y1' ? '%' : unit;
                        return `${ctx.dataset.label}: ${y.toFixed(2)}${suffix ? ` ${suffix}` : ''}`;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: gridColor },
                ticks: { color: axisText, maxTicksLimit: 8, maxRotation: 0, font: { size: 11 } },
            },
            y: {
                position: 'left',
                grid: { color: gridColor },
                ticks: { color: axisText, font: { size: 11 } },
                title: { display: !!unit, text: unit, color: axisText },
            },
            ...(weather ? {
                y1: {
                    position: 'right' as const,
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: { color: axisText, font: { size: 11 } },
                    title: { display: true, text: '%', color: axisText },
                },
            } : {}),
        },
    };

    return <Line data={data} options={options} />;
};

export default TrendChart;
