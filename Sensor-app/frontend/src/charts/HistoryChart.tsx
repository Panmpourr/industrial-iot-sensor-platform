import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
    type ChartData, type ChartDataset, type ChartOptions,
} from 'chart.js';
import type { History, Sensor } from '../types';
import { formatTick, withGaps } from '../history';
import { gridColor, statusColors, statusLabels, trendColor } from '../theme';
import { unitOf } from '../status';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const axisText = '#9ba1a9';

interface HistoryChartProps {
    sensor: Sensor;
    history: History;
    rangeMs: number;
}

/**
 * Historian-style trend: average line with a shaded min–max band, so short peaks stay visible
 * even when one point stands for hours of readings. Buckets that went out of limits get a marker.
 */
const HistoryChart = ({ sensor, history, rangeMs }: HistoryChartProps) => {
    const unit = unitOf(sensor);
    const { warning, critical } = sensor.details.threshold ?? {};
    const points = withGaps(history.points, history.bucketSeconds * 1000);
    const values = (pick: (p: NonNullable<(typeof points)[number]>) => number) => points.map(p => (p ? pick(p) : null));

    const datasets: ChartDataset<'line'>[] = [
        {
            label: 'Max',
            data: values(p => p.max),
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
        },
        {
            label: 'Min–max',
            data: values(p => p.min),
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            backgroundColor: `${trendColor}59`,
            borderColor: `${trendColor}59`,
            fill: '-1',
        },
        {
            label: 'Average',
            data: values(p => p.avg),
            borderColor: trendColor,
            borderWidth: 1.75,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.2,
            fill: false,
        },
        {
            label: 'Out of limits',
            data: values(p => (p.status === 'normal' ? NaN : p.max)),
            showLine: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: points.map(p => (p && p.status !== 'normal' ? statusColors[p.status] : 'transparent')),
            pointBorderWidth: 0,
            borderColor: statusColors.critical,
            backgroundColor: statusColors.critical,
        },
    ];

    const limitLine = (label: string, value: number, color: string): ChartDataset<'line'> => ({
        label,
        data: Array(points.length).fill(value),
        borderColor: color,
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
    });
    if (warning !== undefined) datasets.push(limitLine('Warning limit', warning, statusColors.warning));
    if (critical !== undefined) datasets.push(limitLine('Critical limit', critical, statusColors.critical));

    const data: ChartData<'line'> = {
        labels: points.map(p => (p ? formatTick(p.t, rangeMs) : '')),
        datasets,
    };

    const withUnit = (v: number) => `${v.toFixed(2)}${unit ? ` ${unit}` : ''}`;

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        spanGaps: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: {
                    color: axisText,
                    boxWidth: 14,
                    boxHeight: 2,
                    font: { size: 11 },
                    filter: item => item.text !== 'Max' && item.text !== 'Out of limits',
                },
            },
            tooltip: {
                backgroundColor: '#24282d',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#e6e8eb',
                bodyColor: '#c9cdd2',
                filter: item => !String(item.dataset.label).endsWith('limit') && Number.isFinite(item.parsed.y),
                callbacks: {
                    title: items => {
                        const p = points[items[0]?.dataIndex ?? -1];
                        return p ? new Date(p.t).toLocaleString() : '';
                    },
                    label: ctx => {
                        const p = points[ctx.dataIndex];
                        if (!p) return '';
                        switch (ctx.dataset.label) {
                            case 'Average': return `Average: ${withUnit(p.avg)}  (${p.count} readings)`;
                            case 'Max': return `Max: ${withUnit(p.max)}`;
                            case 'Min–max': return `Min: ${withUnit(p.min)}`;
                            default: return `${statusLabels[p.status]} reached`;
                        }
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: gridColor },
                ticks: { color: axisText, maxTicksLimit: 8, maxRotation: 0, autoSkip: true, autoSkipPadding: 24, font: { size: 11 } },
            },
            y: {
                grid: { color: gridColor },
                ticks: { color: axisText, font: { size: 11 } },
                title: { display: !!unit, text: unit, color: axisText },
            },
        },
    };

    return <Line data={data} options={options} />;
};

export default HistoryChart;
