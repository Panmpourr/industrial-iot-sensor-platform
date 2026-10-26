import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip,
    type ChartData, type ChartOptions, type Plugin,
} from 'chart.js';
import { formatTick, withGaps } from '../history';
import { percentOf, type Span } from '../trends';
import { unitOf } from '../status';
import { gridColor } from '../theme';
import type { HistoryPoint, Sensor } from '../types';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip);

const axisText = '#9ba1a9';

const withUnit = (v: number, unit: string) => `${v.toFixed(2)}${unit ? ` ${unit}` : ''}`;

export interface CompareSeries {
    id: string;
    sensor: Sensor;
    color: string;
    points: HistoryPoint[];
    span: Span | null;
}

interface CompareChartProps {
    series: CompareSeries[];
    from: number;
    to: number;
    bucketMs: number;
    /** "values" draws the sensors' own values (all in `unit`); "percent" draws each as % of its range. */
    scale: 'values' | 'percent';
    unit: string;
}

/** Vertical hairline at the hovered time, so the reader aims at a moment rather than at a line. */
const crosshair: Plugin<'line'> = {
    id: 'crosshair',
    afterDatasetsDraw: chart => {
        const active = chart.tooltip?.getActiveElements();
        if (!active?.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    },
};

/** Average line per sensor on a shared time axis; buckets without data break the line. */
const CompareChart = ({ series, from, to, bucketMs, scale, unit }: CompareChartProps) => {
    const data: ChartData<'line', { x: number; y: number | null }[]> = {
        datasets: series.map(s => ({
            label: s.sensor.name,
            data: withGaps(s.points, bucketMs).map((p, i, all) => (p
                ? { x: p.t, y: scale === 'percent' && s.span ? percentOf(p.avg, s.span) : p.avg }
                : { x: all[i - 1]!.t + bucketMs, y: null })),
            borderColor: s.color,
            backgroundColor: s.color,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBorderWidth: 2,
            pointHoverBorderColor: '#1a1d21',
            tension: 0.2,
        })),
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        spanGaps: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#24282d',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                titleColor: '#e6e8eb',
                bodyColor: '#c9cdd2',
                usePointStyle: true,
                boxWidth: 10,
                boxHeight: 2,
                filter: item => (item.raw as { y: number | null }).y !== null,
                itemSort: (a, b) => (b.raw as { y: number }).y - (a.raw as { y: number }).y,
                callbacks: {
                    title: items => (items[0] ? new Date((items[0].raw as { x: number }).x).toLocaleString() : ''),
                    label: ctx => {
                        const s = series[ctx.datasetIndex];
                        const p = s.points.find(point => point.t === (ctx.raw as { x: number }).x);
                        if (!p) return '';
                        // Values lead, the sensor name follows; "% of range" still shows the real value
                        return scale === 'percent'
                            ? `${(ctx.raw as { y: number }).y.toFixed(1)} %  ${s.sensor.name} (${withUnit(p.avg, unitOf(s.sensor))})`
                            : `${withUnit(p.avg, unit)}  ${s.sensor.name}`;
                    },
                },
            },
        },
        scales: {
            x: {
                type: 'linear',
                min: from,
                max: to,
                grid: { color: gridColor },
                ticks: {
                    color: axisText, maxTicksLimit: 8, maxRotation: 0, autoSkipPadding: 24, font: { size: 11 },
                    callback: value => formatTick(Number(value), to - from),
                },
            },
            y: {
                grid: { color: gridColor },
                ticks: { color: axisText, font: { size: 11 } },
                title: { display: scale === 'percent' || !!unit, text: scale === 'percent' ? '% of range' : unit, color: axisText },
                ...(scale === 'percent' ? { suggestedMin: 0, suggestedMax: 100 } : {}),
            },
        },
    };

    return <Line data={data} options={options} plugins={[crosshair]} />;
};

export default CompareChart;
